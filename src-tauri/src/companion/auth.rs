use chrono::{Duration, Utc};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const PAIRING_TTL_SECS: i64 = 5 * 60;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedDevice {
    pub device_id: String,
    pub device_name: String,
    /// SHA-256 hex of the cleartext credential.
    pub credential_hash: String,
    pub created_at: String,
    pub last_seen_at: String,
    pub revoked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoreFile {
    host_id: String,
    /// Random host identity bytes (hex) advertised as `pubkey` in QR.
    host_pubkey: String,
    devices: Vec<PairedDevice>,
}

#[derive(Debug, Clone)]
struct ActivePairingToken {
    token: String,
    expires_at: chrono::DateTime<Utc>,
}

pub struct AuthStore {
    path: PathBuf,
    inner: Mutex<StoreFile>,
    pairing: Mutex<Option<ActivePairingToken>>,
}

impl AuthStore {
    pub fn open(app_data_dir: &Path) -> Result<Self, String> {
        let dir = app_data_dir.join("companion");
        std::fs::create_dir_all(&dir).map_err(|e| format!("companion dir: {e}"))?;
        let path = dir.join("auth.json");
        let inner = if path.exists() {
            let raw = std::fs::read_to_string(&path).map_err(|e| format!("read auth: {e}"))?;
            serde_json::from_str(&raw).map_err(|e| format!("parse auth: {e}"))?
        } else {
            let store = StoreFile {
                host_id: uuid::Uuid::new_v4().to_string(),
                host_pubkey: random_hex(32),
                devices: Vec::new(),
            };
            let json = serde_json::to_string_pretty(&store).map_err(|e| e.to_string())?;
            std::fs::write(&path, json).map_err(|e| format!("write auth: {e}"))?;
            store
        };
        Ok(Self {
            path,
            inner: Mutex::new(inner),
            pairing: Mutex::new(None),
        })
    }

    pub fn host_id(&self) -> Result<String, String> {
        Ok(self.inner.lock().map_err(|_| "lock")?.host_id.clone())
    }

    pub fn host_pubkey(&self) -> Result<String, String> {
        Ok(self.inner.lock().map_err(|_| "lock")?.host_pubkey.clone())
    }

    pub fn paired_devices(&self) -> Result<Vec<PairedDevice>, String> {
        Ok(self.inner.lock().map_err(|_| "lock")?.devices.clone())
    }

    pub fn paired_count(&self) -> usize {
        self.inner
            .lock()
            .map(|g| g.devices.iter().filter(|d| !d.revoked).count())
            .unwrap_or(0)
    }

    pub fn mint_pairing_token(&self) -> Result<String, String> {
        let token = random_hex(24);
        let expires_at = Utc::now() + Duration::seconds(PAIRING_TTL_SECS);
        *self.pairing.lock().map_err(|_| "lock")? = Some(ActivePairingToken {
            token: token.clone(),
            expires_at,
        });
        Ok(token)
    }

    pub fn current_pairing_token(&self) -> Result<Option<String>, String> {
        let mut guard = self.pairing.lock().map_err(|_| "lock")?;
        if let Some(active) = guard.as_ref() {
            if active.expires_at > Utc::now() {
                return Ok(Some(active.token.clone()));
            }
        }
        *guard = None;
        Ok(None)
    }

    /// Consume a valid pairing token and register a new device. Returns (device_id, credential).
    pub fn pair_device(&self, device_name: &str, pairing_token: &str) -> Result<(String, String), String> {
        {
            let mut pairing = self.pairing.lock().map_err(|_| "lock")?;
            let active = pairing
                .as_ref()
                .ok_or_else(|| "No active pairing token".to_string())?;
            if active.expires_at <= Utc::now() {
                *pairing = None;
                return Err("Pairing token expired".to_string());
            }
            if active.token != pairing_token {
                return Err("Invalid pairing token".to_string());
            }
            *pairing = None;
        }

        let device_id = uuid::Uuid::new_v4().to_string();
        let credential = random_hex(32);
        let now = Utc::now().to_rfc3339();
        let device = PairedDevice {
            device_id: device_id.clone(),
            device_name: if device_name.trim().is_empty() {
                "Tablet".to_string()
            } else {
                device_name.trim().to_string()
            },
            credential_hash: hash_credential(&credential),
            created_at: now.clone(),
            last_seen_at: now,
            revoked: false,
        };

        let mut inner = self.inner.lock().map_err(|_| "lock")?;
        inner.devices.push(device);
        self.persist(&inner)?;
        Ok((device_id, credential))
    }

    pub fn authenticate_credential(
        &self,
        device_id: &str,
        credential: &str,
    ) -> Result<PairedDevice, String> {
        let hash = hash_credential(credential);
        let mut inner = self.inner.lock().map_err(|_| "lock")?;
        let device = inner
            .devices
            .iter_mut()
            .find(|d| d.device_id == device_id && !d.revoked)
            .ok_or_else(|| "Unknown or revoked device".to_string())?;
        if device.credential_hash != hash {
            return Err("Invalid credential".to_string());
        }
        device.last_seen_at = Utc::now().to_rfc3339();
        let cloned = device.clone();
        self.persist(&inner)?;
        Ok(cloned)
    }

    pub fn revoke_device(&self, device_id: &str) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|_| "lock")?;
        let device = inner
            .devices
            .iter_mut()
            .find(|d| d.device_id == device_id)
            .ok_or_else(|| "Device not found".to_string())?;
        device.revoked = true;
        self.persist(&inner)
    }

    fn persist(&self, inner: &StoreFile) -> Result<(), String> {
        let json = serde_json::to_string_pretty(inner).map_err(|e| e.to_string())?;
        std::fs::write(&self.path, json).map_err(|e| format!("write auth: {e}"))
    }
}

fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    hex::encode(buf)
}

fn hash_credential(credential: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(credential.as_bytes());
    hex::encode(hasher.finalize())
}
