use super::TtsSettings;
use anyhow::{anyhow, Result};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use windows::core::HSTRING;
use windows::Foundation::Collections::IVectorView;
use windows::Media::Core::MediaSource;
use windows::Media::Playback::{MediaPlaybackState, MediaPlayer, MediaPlayerAudioCategory};
use windows::Media::SpeechSynthesis::{SpeechSynthesizer, VoiceInformation};
use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

struct ActivePlayback {
    player: MediaPlayer,
    cancel: Arc<AtomicBool>,
}

static SYNTHESIZER: OnceLock<Mutex<Option<SpeechSynthesizer>>> = OnceLock::new();
static PLAYBACK: OnceLock<Mutex<Option<ActivePlayback>>> = OnceLock::new();

fn synthesizer_slot() -> &'static Mutex<Option<SpeechSynthesizer>> {
    SYNTHESIZER.get_or_init(|| Mutex::new(None))
}

fn playback_slot() -> &'static Mutex<Option<ActivePlayback>> {
    PLAYBACK.get_or_init(|| Mutex::new(None))
}

fn ensure_winrt() -> Result<()> {
    unsafe {
        RoInitialize(RO_INIT_MULTITHREADED).ok();
    }
    Ok(())
}

fn with_synthesizer<F, R>(f: F) -> Result<R>
where
    F: FnOnce(&SpeechSynthesizer) -> Result<R>,
{
    ensure_winrt()?;
    let mut guard = synthesizer_slot()
        .lock()
        .map_err(|_| anyhow!("TTS synthesizer lock poisoned"))?;
    if guard.is_none() {
        *guard = Some(SpeechSynthesizer::new()?);
    }
    let synth = guard
        .as_ref()
        .ok_or_else(|| anyhow!("TTS synthesizer unavailable"))?;
    f(synth)
}

fn culture_prefix(language: &str) -> &str {
    match language {
        "el" => "el",
        "de" => "de",
        "fr" => "fr",
        "it" => "it",
        "es" => "es",
        "pt" => "pt",
        _ => "en",
    }
}

fn find_voice(language: &str) -> Result<VoiceInformation> {
    let voices = SpeechSynthesizer::AllVoices()?;
    pick_voice(&voices, language)
}

fn pick_voice(voices: &IVectorView<VoiceInformation>, language: &str) -> Result<VoiceInformation> {
    let prefix = culture_prefix(language);
    let size = voices.Size()?;
    for i in 0..size {
        let voice = voices.GetAt(i)?;
        let lang = voice.Language()?.to_string();
        if lang.to_lowercase().starts_with(prefix) {
            return Ok(voice);
        }
    }
    Err(anyhow!(
        "No WinRT voice found for language '{language}'. Install it in Windows Settings > Time & language > Speech."
    ))
}

fn map_rate(sapi_rate: i32) -> f64 {
    (1.0 + (sapi_rate as f64 / 10.0)).clamp(0.5, 3.0)
}

fn map_volume(volume: u16) -> f64 {
    (volume as f64 / 100.0).clamp(0.0, 1.0)
}

fn wait_for_playback(
    session: &windows::Media::Playback::MediaPlaybackSession,
    cancel: &AtomicBool,
) -> Result<()> {
    let mut was_playing = false;
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Ok(());
        }
        let state = match session.PlaybackState() {
            Ok(state) => state,
            Err(_) => return Ok(()),
        };
        if state == MediaPlaybackState::Playing {
            was_playing = true;
        }
        if was_playing
            && state != MediaPlaybackState::Playing
            && state != MediaPlaybackState::Buffering
            && state != MediaPlaybackState::Opening
        {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(100));
    }
}

fn clear_playback_if_current(cancel: &Arc<AtomicBool>) {
    if let Ok(mut guard) = playback_slot().lock() {
        let is_current = guard
            .as_ref()
            .map(|active| Arc::ptr_eq(&active.cancel, cancel))
            .unwrap_or(false);
        if is_current {
            *guard = None;
        }
    }
}

pub fn speak_text(text: &str, settings: &TtsSettings) -> Result<()> {
    ensure_winrt()?;
    let _ = stop_speaking();

    let voice = find_voice(&settings.language)?;
    let stream = with_synthesizer(|synthesizer| {
        synthesizer.SetVoice(&voice)?;
        let options = synthesizer.Options()?;
        options.SetAudioVolume(map_volume(settings.volume))?;
        options.SetSpeakingRate(map_rate(settings.rate))?;
        let stream_op = synthesizer.SynthesizeTextToStreamAsync(&HSTRING::from(text))?;
        stream_op
            .get()
            .map_err(|e| anyhow!("Speech synthesis failed: {e}"))
    })?;

    let content_type = stream.ContentType()?;
    let media_source = MediaSource::CreateFromStream(&stream, &content_type)?;

    let player = MediaPlayer::new()?;
    let _ = player.SetAudioCategory(MediaPlayerAudioCategory::Speech);
    player.SetSource(&media_source)?;

    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut guard = playback_slot()
            .lock()
            .map_err(|_| anyhow!("TTS playback lock poisoned"))?;
        *guard = Some(ActivePlayback {
            player: player.clone(),
            cancel: Arc::clone(&cancel),
        });
    }

    player.Play()?;
    let wait_result = wait_for_playback(&player.PlaybackSession()?, &cancel);
    clear_playback_if_current(&cancel);
    let _ = player.Close();
    wait_result
}

pub fn list_voices() -> Result<Vec<String>> {
    ensure_winrt()?;
    let voices = SpeechSynthesizer::AllVoices()?;
    let size = voices.Size()?;
    let mut result = Vec::new();
    for i in 0..size {
        let voice = voices.GetAt(i)?;
        let name = voice.DisplayName()?.to_string();
        let lang = voice.Language()?.to_string();
        result.push(format!("{name} ({lang})"));
    }
    Ok(result)
}

pub fn get_status() -> Result<String> {
    let speaking = playback_slot()
        .lock()
        .map(|guard| guard.is_some())
        .unwrap_or(false);
    if speaking {
        Ok("speaking".to_string())
    } else {
        Ok("idle".to_string())
    }
}

pub fn stop_speaking() -> Result<()> {
    let active = {
        let mut guard = playback_slot()
            .lock()
            .map_err(|_| anyhow!("TTS playback lock poisoned"))?;
        guard.take()
    };
    if let Some(active) = active {
        active.cancel.store(true, Ordering::SeqCst);
        let _ = active.player.Pause();
        let _ = active.player.SetSource(None);
        let _ = active.player.Close();
    }
    Ok(())
}
