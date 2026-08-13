use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: u32 = 1;
pub const DEFAULT_PORT: u16 = 17890;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Envelope {
    pub v: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(default)]
    pub payload: serde_json::Value,
}

impl Envelope {
    pub fn reply(id: Option<String>, msg_type: impl Into<String>, payload: serde_json::Value) -> Self {
        Self {
            v: PROTOCOL_VERSION,
            id,
            msg_type: msg_type.into(),
            payload,
        }
    }

    pub fn event(msg_type: impl Into<String>, payload: serde_json::Value) -> Self {
        Self {
            v: PROTOCOL_VERSION,
            id: None,
            msg_type: msg_type.into(),
            payload,
        }
    }

    pub fn error(id: Option<String>, code: &str, message: impl Into<String>) -> Self {
        Self::reply(
            id,
            "error",
            serde_json::json!({ "code": code, "message": message.into() }),
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingPayload {
    pub host_id: String,
    pub ip: String,
    pub port: u16,
    pub pairing_token: String,
    pub protocol_version: u32,
    /// Host identity material for future channel binding (not a TLS cert yet).
    pub pubkey: String,
    /// Other local IPv4s (Wi‑Fi + USB tether) so parents can pick the right link.
    #[serde(default)]
    pub candidate_ips: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionUiState {
    pub running: bool,
    pub port: u16,
    pub session: SessionPhase,
    pub device_name: Option<String>,
    pub device_id: Option<String>,
    pub last_rtt_ms: Option<u64>,
    pub audio_routing: AudioRouting,
    pub paired_device_count: usize,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionPhase {
    #[default]
    Idle,
    Active,
    Reconnecting,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AudioRouting {
    #[default]
    Host,
    Tablet,
}
