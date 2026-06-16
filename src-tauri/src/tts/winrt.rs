use super::TtsSettings;
use anyhow::{anyhow, Result};
use std::thread;
use std::time::Duration;
use windows::core::HSTRING;
use windows::Foundation::Collections::IVectorView;
use windows::Media::Core::MediaSource;
use windows::Media::Playback::{MediaPlaybackState, MediaPlayer, MediaPlayerAudioCategory};
use windows::Media::SpeechSynthesis::{SpeechSynthesizer, VoiceInformation};
use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

fn ensure_winrt() -> Result<()> {
    unsafe {
        RoInitialize(RO_INIT_MULTITHREADED).ok();
    }
    Ok(())
}

fn culture_prefix(language: &str) -> &str {
    match language {
        "el" => "el",
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

fn wait_for_playback(session: &windows::Media::Playback::MediaPlaybackSession) -> Result<()> {
    let mut was_playing = false;
    for _ in 0..500 {
        let state = session.PlaybackState()?;
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
    Ok(())
}

pub fn speak_text(text: &str, settings: &TtsSettings) -> Result<()> {
    ensure_winrt()?;

    let voice = find_voice(&settings.language)?;
    let synthesizer = SpeechSynthesizer::new()?;
    synthesizer.SetVoice(&voice)?;

    let options = synthesizer.Options()?;
    options.SetAudioVolume(map_volume(settings.volume))?;
    options.SetSpeakingRate(map_rate(settings.rate))?;

    let stream_op = synthesizer.SynthesizeTextToStreamAsync(&HSTRING::from(text))?;
    let stream = stream_op
        .get()
        .map_err(|e| anyhow!("Speech synthesis failed: {e}"))?;

    let content_type = stream.ContentType()?;
    let media_source = MediaSource::CreateFromStream(&stream, &content_type)?;

    let player = MediaPlayer::new()?;
    let _ = player.SetAudioCategory(MediaPlayerAudioCategory::Speech);
    player.SetSource(&media_source)?;
    player.Play()?;
    wait_for_playback(&player.PlaybackSession()?)?;
    Ok(())
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
    Ok("idle".to_string())
}

pub fn stop_speaking() -> Result<()> {
    Ok(())
}
