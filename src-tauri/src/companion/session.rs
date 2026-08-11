use super::protocol::{AudioRouting, SessionPhase};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;

#[derive(Debug, Default)]
pub struct SessionState {
    phase: Mutex<SessionPhase>,
    device_name: Mutex<Option<String>>,
    device_id: Mutex<Option<String>>,
    last_rtt_ms: AtomicU64,
    has_rtt: AtomicBool,
    audio_routing: Mutex<AudioRouting>,
}

impl SessionState {
    pub fn new() -> Self {
        Self {
            phase: Mutex::new(SessionPhase::Idle),
            device_name: Mutex::new(None),
            device_id: Mutex::new(None),
            last_rtt_ms: AtomicU64::new(0),
            has_rtt: AtomicBool::new(false),
            audio_routing: Mutex::new(AudioRouting::Host),
        }
    }

    pub fn phase(&self) -> SessionPhase {
        *self.phase.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn set_active(&self, device_id: String, device_name: String) {
        *self.phase.lock().unwrap_or_else(|e| e.into_inner()) = SessionPhase::Active;
        *self.device_id.lock().unwrap_or_else(|e| e.into_inner()) = Some(device_id);
        *self.device_name.lock().unwrap_or_else(|e| e.into_inner()) = Some(device_name);
        *self.audio_routing.lock().unwrap_or_else(|e| e.into_inner()) = AudioRouting::Tablet;
    }

    pub fn set_reconnecting(&self) {
        let mut phase = self.phase.lock().unwrap_or_else(|e| e.into_inner());
        if *phase == SessionPhase::Active {
            *phase = SessionPhase::Reconnecting;
        }
    }

    pub fn clear(&self) {
        *self.phase.lock().unwrap_or_else(|e| e.into_inner()) = SessionPhase::Idle;
        *self.device_id.lock().unwrap_or_else(|e| e.into_inner()) = None;
        *self.device_name.lock().unwrap_or_else(|e| e.into_inner()) = None;
        *self.audio_routing.lock().unwrap_or_else(|e| e.into_inner()) = AudioRouting::Host;
        self.has_rtt.store(false, Ordering::Relaxed);
        super::dictation::abort();
    }

    #[allow(dead_code)]
    pub fn set_rtt_ms(&self, rtt: u64) {
        self.last_rtt_ms.store(rtt, Ordering::Relaxed);
        self.has_rtt.store(true, Ordering::Relaxed);
    }

    pub fn last_rtt_ms(&self) -> Option<u64> {
        if self.has_rtt.load(Ordering::Relaxed) {
            Some(self.last_rtt_ms.load(Ordering::Relaxed))
        } else {
            None
        }
    }

    pub fn device_name(&self) -> Option<String> {
        self.device_name
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    pub fn device_id(&self) -> Option<String> {
        self.device_id
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    pub fn audio_routing(&self) -> AudioRouting {
        *self
            .audio_routing
            .lock()
            .unwrap_or_else(|e| e.into_inner())
    }

    /// True while companion owns mic/TTS paths (active or briefly reconnecting).
    pub fn tablet_audio_active(&self) -> bool {
        matches!(
            self.phase(),
            SessionPhase::Active | SessionPhase::Reconnecting
        )
    }
}
