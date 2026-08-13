use super::auth::AuthStore;
use super::dispatch;
use super::protocol::{Envelope, PROTOCOL_VERSION};
use super::session::SessionState;
use crate::db::Database;
use futures_util::{SinkExt, StreamExt};
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::watch;
use tokio_tungstenite::tungstenite::Message;

pub struct BridgeRuntime {
    pub stop_tx: watch::Sender<bool>,
    pub running: Arc<AtomicBool>,
}

pub async fn run_bridge(
    app: AppHandle,
    auth: Arc<AuthStore>,
    session: Arc<SessionState>,
    port: u16,
    mut stop_rx: watch::Receiver<bool>,
    running: Arc<AtomicBool>,
) {
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = match TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[companion] failed to bind {addr}: {e}");
            running.store(false, Ordering::SeqCst);
            emit_ui_state(&app, &auth, &session, false, port);
            return;
        }
    };
    running.store(true, Ordering::SeqCst);
    println!("[companion] listening on {addr}");
    emit_ui_state(&app, &auth, &session, true, port);

    loop {
        tokio::select! {
            _ = stop_rx.changed() => {
                if *stop_rx.borrow() {
                    break;
                }
            }
            accept = listener.accept() => {
                match accept {
                    Ok((stream, peer)) => {
                        let app = app.clone();
                        let auth = auth.clone();
                        let session = session.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) =
                                handle_connection(app, auth, session, stream, peer, port).await
                            {
                                eprintln!("[companion] connection {peer}: {e}");
                            }
                        });
                    }
                    Err(e) => {
                        eprintln!("[companion] accept error: {e}");
                    }
                }
            }
        }
    }

    running.store(false, Ordering::SeqCst);
    session.clear();
    emit_ui_state(&app, &auth, &session, false, port);
    println!("[companion] stopped");
}

async fn handle_connection(
    app: AppHandle,
    auth: Arc<AuthStore>,
    session: Arc<SessionState>,
    stream: TcpStream,
    peer: SocketAddr,
    bridge_port: u16,
) -> Result<(), String> {
    let ws = tokio_tungstenite::accept_async(stream)
        .await
        .map_err(|e| format!("ws handshake: {e}"))?;
    let (mut write, mut read) = ws.split();

    let mut authenticated = false;
    let mut connection_epoch = 0u64;
    let mut device_name = String::from("Tablet");
    let mut hello_seen = false;

    while let Some(msg) = read.next().await {
        let msg = msg.map_err(|e| format!("ws read: {e}"))?;
        if msg.is_close() {
            break;
        }
        let text = match msg {
            Message::Text(t) => t.to_string(),
            Message::Ping(data) => {
                write
                    .send(Message::Pong(data))
                    .await
                    .map_err(|e| format!("pong: {e}"))?;
                continue;
            }
            Message::Pong(_) | Message::Frame(_) | Message::Binary(_) => continue,
            Message::Close(_) => break,
        };

        let env: Envelope = match serde_json::from_str(&text) {
            Ok(e) => e,
            Err(e) => {
                let err = Envelope::error(None, "bad_json", e.to_string());
                send_json(&mut write, &err).await?;
                continue;
            }
        };

        if env.v != PROTOCOL_VERSION {
            let err = Envelope::error(
                env.id.clone(),
                "version_mismatch",
                format!("Expected protocol v{PROTOCOL_VERSION}"),
            );
            send_json(&mut write, &err).await?;
            continue;
        }

        if authenticated && !session.epoch_matches(connection_epoch) {
            let err = Envelope::error(
                env.id.clone(),
                "unauthorized",
                "Session revoked",
            );
            let _ = send_json(&mut write, &err).await;
            break;
        }

        match env.msg_type.as_str() {
            "hello" => {
                hello_seen = true;
                if let Some(name) = env.payload.get("deviceName").and_then(|v| v.as_str()) {
                    if !name.trim().is_empty() {
                        device_name = name.trim().to_string();
                    }
                }
                let host_id = auth.host_id().unwrap_or_default();
                let reply = Envelope::reply(
                    env.id.clone(),
                    "hello.ok",
                    serde_json::json!({
                        "hostId": host_id,
                        "protocolVersion": PROTOCOL_VERSION,
                    }),
                );
                send_json(&mut write, &reply).await?;
            }
            "auth" => {
                if !hello_seen {
                    let err = Envelope::error(env.id.clone(), "protocol", "Send hello before auth");
                    send_json(&mut write, &err).await?;
                    continue;
                }
                match perform_auth(&auth, &env.payload, &device_name) {
                    Ok((device_id, new_credential, name)) => {
                        authenticated = true;
                        device_name = name.clone();
                        connection_epoch = session.set_active(device_id.clone(), name.clone());
                        on_session_active(&app);
                        emit_ui_state(&app, &auth, &session, true, bridge_port);

                        let mut payload = serde_json::json!({
                            "deviceId": device_id,
                            "audioRouting": "tablet",
                            "session": "active",
                        });
                        if let Some(cred) = new_credential {
                            payload
                                .as_object_mut()
                                .expect("payload object")
                                .insert("credential".into(), serde_json::json!(cred));
                        }

                        let reply = Envelope::reply(env.id.clone(), "auth.ok", payload);
                        send_json(&mut write, &reply).await?;
                        let state_evt = Envelope::event(
                            "session.state",
                            serde_json::json!({
                                "active": true,
                                "audioRouting": "tablet",
                                "deviceName": device_name,
                            }),
                        );
                        send_json(&mut write, &state_evt).await?;
                    }
                    Err(e) => {
                        let err = Envelope::reply(
                            env.id.clone(),
                            "auth.err",
                            serde_json::json!({ "message": e }),
                        );
                        send_json(&mut write, &err).await?;
                    }
                }
            }
            "ping" if authenticated => {
                let reply = Envelope::reply(
                    env.id.clone(),
                    "pong",
                    serde_json::json!({ "t": env.payload.get("t") }),
                );
                send_json(&mut write, &reply).await?;
            }
            _ if !authenticated => {
                let err = Envelope::error(env.id.clone(), "unauthorized", "Authenticate first");
                send_json(&mut write, &err).await?;
            }
            _ => {
                let state = app
                    .try_state::<crate::AppState>()
                    .ok_or_else(|| "AppState missing".to_string())?;
                let replies = dispatch_with_db(&app, &state.db, &env);
                for reply in replies {
                    send_json(&mut write, &reply).await?;
                }
            }
        }
    }

    if authenticated && session.epoch_matches(connection_epoch) {
        eprintln!("[companion] session ended from {peer}");
        session.set_reconnecting();
        session.clear();
        on_session_inactive(&app);
        emit_ui_state(&app, &auth, &session, true, bridge_port);
    }

    Ok(())
}

/// Returns (device_id, new_credential_if_first_pair, device_name).
fn perform_auth(
    auth: &AuthStore,
    payload: &serde_json::Value,
    fallback_name: &str,
) -> Result<(String, Option<String>, String), String> {
    let device_name = payload
        .get("deviceName")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(fallback_name)
        .to_string();

    if let Some(token) = payload.get("pairingToken").and_then(|v| v.as_str()) {
        if !token.is_empty() {
            let (device_id, credential) = auth.pair_device(&device_name, token)?;
            return Ok((device_id, Some(credential), device_name));
        }
    }

    let device_id = payload
        .get("deviceId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "deviceId required for credential auth".to_string())?;
    let credential = payload
        .get("credential")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "credential required".to_string())?;
    let device = auth.authenticate_credential(device_id, credential)?;
    Ok((device.device_id, None, device.device_name))
}

fn dispatch_with_db(app: &AppHandle, db: &Database, env: &Envelope) -> Vec<Envelope> {
    dispatch::handle_message(app, db, env)
}

async fn send_json<S>(write: &mut S, env: &Envelope) -> Result<(), String>
where
    S: SinkExt<Message> + Unpin,
    S::Error: std::fmt::Display,
{
    let text = serde_json::to_string(env).map_err(|e| e.to_string())?;
    write
        .send(Message::Text(text.into()))
        .await
        .map_err(|e| format!("ws send: {e}"))
}

pub fn on_session_active(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.minimize();
    }
    let _ = app.emit(
        "companion-session",
        serde_json::json!({ "phase": "active", "minimize": true }),
    );
}

pub fn on_session_inactive(app: &AppHandle) {
    let _ = app.emit(
        "companion-session",
        serde_json::json!({ "phase": "idle", "minimize": false }),
    );
}

pub fn emit_ui_state(
    app: &AppHandle,
    auth: &AuthStore,
    session: &SessionState,
    running: bool,
    port: u16,
) {
    let state = super::protocol::CompanionUiState {
        running,
        port,
        session: session.phase(),
        device_name: session.device_name(),
        device_id: session.device_id(),
        last_rtt_ms: session.last_rtt_ms(),
        audio_routing: session.audio_routing(),
        paired_device_count: auth.paired_count(),
    };
    let _ = app.emit("companion-state", &state);
}
