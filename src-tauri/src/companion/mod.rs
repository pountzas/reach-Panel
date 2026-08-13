//! Local companion bridge: QR pairing, WebSocket auth/session, protocol dispatch.

mod auth;
mod dictation;
mod dispatch;
mod protocol;
mod server;
mod session;

pub use protocol::{
    AudioRouting, CompanionUiState, PairingPayload, DEFAULT_PORT, PROTOCOL_VERSION,
};

pub use dictation::is_active as dictation_is_active;

use auth::{AuthStore, PairedDevice};
use server::{emit_ui_state, BridgeRuntime};
use session::SessionState;
use std::net::UdpSocket;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};

pub struct CompanionBridge {
    auth: Arc<AuthStore>,
    session: Arc<SessionState>,
    runtime: Mutex<Option<BridgeRuntime>>,
    port: Mutex<u16>,
}

impl CompanionBridge {
    pub fn new(app_data_dir: &Path) -> Result<Self, String> {
        Ok(Self {
            auth: Arc::new(AuthStore::open(app_data_dir)?),
            session: Arc::new(SessionState::new()),
            runtime: Mutex::new(None),
            port: Mutex::new(DEFAULT_PORT),
        })
    }

    pub fn is_running(&self) -> bool {
        self.runtime
            .lock()
            .ok()
            .and_then(|g| g.as_ref().map(|r| r.running.load(Ordering::SeqCst)))
            .unwrap_or(false)
    }

    pub fn port(&self) -> u16 {
        *self.port.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn session(&self) -> &Arc<SessionState> {
        &self.session
    }

    pub fn ui_state(&self) -> CompanionUiState {
        CompanionUiState {
            running: self.is_running(),
            port: self.port(),
            session: self.session.phase(),
            device_name: self.session.device_name(),
            device_id: self.session.device_id(),
            last_rtt_ms: self.session.last_rtt_ms(),
            audio_routing: self.session.audio_routing(),
            paired_device_count: self.auth.paired_count(),
        }
    }

    pub fn start(&self, app: AppHandle, port: Option<u16>) -> Result<CompanionUiState, String> {
        let mut runtime_guard = self.runtime.lock().map_err(|_| "lock")?;
        if let Some(rt) = runtime_guard.as_ref() {
            if rt.running.load(Ordering::SeqCst) {
                return Ok(self.ui_state());
            }
        }

        let port = port.unwrap_or(DEFAULT_PORT);
        *self.port.lock().map_err(|_| "lock")? = port;

        let (stop_tx, stop_rx) = tokio::sync::watch::channel(false);
        let running = Arc::new(AtomicBool::new(false));
        let auth = self.auth.clone();
        let session = self.session.clone();
        let running_clone = running.clone();

        tauri::async_runtime::spawn(async move {
            server::run_bridge(app, auth, session, port, stop_rx, running_clone).await;
        });

        *runtime_guard = Some(BridgeRuntime { stop_tx, running });
        // Brief yield so bind can report; UI can also listen for companion-state.
        Ok(CompanionUiState {
            running: true,
            port,
            session: self.session.phase(),
            device_name: self.session.device_name(),
            device_id: self.session.device_id(),
            last_rtt_ms: self.session.last_rtt_ms(),
            audio_routing: self.session.audio_routing(),
            paired_device_count: self.auth.paired_count(),
        })
    }

    pub fn stop(&self, app: &AppHandle) -> Result<CompanionUiState, String> {
        let mut runtime_guard = self.runtime.lock().map_err(|_| "lock")?;
        if let Some(rt) = runtime_guard.take() {
            let _ = rt.stop_tx.send(true);
        }
        self.session.clear();
        let state = CompanionUiState {
            running: false,
            port: self.port(),
            session: self.session.phase(),
            device_name: None,
            device_id: None,
            last_rtt_ms: None,
            audio_routing: AudioRouting::Host,
            paired_device_count: self.auth.paired_count(),
        };
        emit_ui_state(app, &self.auth, &self.session, false, self.port());
        Ok(state)
    }

    pub fn pairing_payload(&self) -> Result<PairingPayload, String> {
        let token = match self.auth.current_pairing_token()? {
            Some(t) => t,
            None => self.auth.mint_pairing_token()?,
        };
        let candidates = list_local_ipv4s();
        let ip = prefer_pairing_ip(&candidates)
            .or_else(detect_lan_ipv4)
            .unwrap_or_else(|| "127.0.0.1".to_string());
        Ok(PairingPayload {
            host_id: self.auth.host_id()?,
            ip,
            port: self.port(),
            pairing_token: token,
            protocol_version: PROTOCOL_VERSION,
            pubkey: self.auth.host_pubkey()?,
            candidate_ips: candidates,
        })
    }

    pub fn refresh_pairing_token(&self) -> Result<PairingPayload, String> {
        let _ = self.auth.mint_pairing_token()?;
        self.pairing_payload()
    }

    pub fn list_devices(&self) -> Result<Vec<PairedDevice>, String> {
        self.auth.paired_devices()
    }

    pub fn revoke_device(&self, device_id: &str) -> Result<(), String> {
        self.auth.revoke_device(device_id)?;
        if self.session.device_id().as_deref() == Some(device_id) {
            self.session.clear();
        }
        Ok(())
    }
}

/// Best-effort LAN IPv4 for QR payload (UDP connect trick; no packets sent).
fn detect_lan_ipv4() -> Option<String> {
    if let Ok(ip) = local_ip_address::local_ip() {
        if let std::net::IpAddr::V4(v4) = ip {
            if !v4.is_loopback() {
                return Some(v4.to_string());
            }
        }
    }
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    match socket.local_addr().ok()?.ip() {
        std::net::IpAddr::V4(v4) => Some(v4.to_string()),
        _ => None,
    }
}

fn list_local_ipv4s() -> Vec<String> {
    let mut ips = Vec::new();
    if let Ok(ifaces) = local_ip_address::list_afinet_netifas() {
        for (_name, ip) in ifaces {
            if let std::net::IpAddr::V4(v4) = ip {
                if !v4.is_loopback() && !v4.is_link_local() && !v4.is_multicast() {
                    let s = v4.to_string();
                    if !ips.contains(&s) {
                        ips.push(s);
                    }
                }
            }
        }
    }
    if ips.is_empty() {
        if let Some(ip) = detect_lan_ipv4() {
            ips.push(ip);
        }
    }
    // Prefer USB-tether-looking subnets first in the list for parent UX.
    ips.sort_by_key(|ip| if looks_like_usb_tether(ip) { 0 } else { 1 });
    ips
}

fn prefer_pairing_ip(candidates: &[String]) -> Option<String> {
    candidates
        .iter()
        .find(|ip| looks_like_usb_tether(ip))
        .cloned()
        .or_else(|| candidates.first().cloned())
}

/// Common Android USB tethering / Windows ICS host ranges.
fn looks_like_usb_tether(ip: &str) -> bool {
    ip.starts_with("192.168.42.")
        || ip.starts_with("192.168.43.")
        || ip.starts_with("192.168.137.")
}

// --- Tauri commands ---

#[tauri::command]
pub fn cmd_companion_start(
    app: AppHandle,
    port: Option<u16>,
    bridge: State<CompanionBridge>,
) -> Result<CompanionUiState, String> {
    bridge.start(app, port)
}

#[tauri::command]
pub fn cmd_companion_stop(
    app: AppHandle,
    bridge: State<CompanionBridge>,
) -> Result<CompanionUiState, String> {
    bridge.stop(&app)
}

#[tauri::command]
pub fn cmd_companion_status(bridge: State<CompanionBridge>) -> CompanionUiState {
    bridge.ui_state()
}

#[tauri::command]
pub fn cmd_companion_pairing_payload(bridge: State<CompanionBridge>) -> Result<PairingPayload, String> {
    bridge.pairing_payload()
}

#[tauri::command]
pub fn cmd_companion_refresh_pairing(
    bridge: State<CompanionBridge>,
) -> Result<PairingPayload, String> {
    bridge.refresh_pairing_token()
}

#[tauri::command]
pub fn cmd_companion_list_devices(bridge: State<CompanionBridge>) -> Result<Vec<PairedDevice>, String> {
    bridge.list_devices()
}

#[tauri::command]
pub fn cmd_companion_revoke_device(
    device_id: String,
    bridge: State<CompanionBridge>,
) -> Result<(), String> {
    bridge.revoke_device(&device_id)
}
