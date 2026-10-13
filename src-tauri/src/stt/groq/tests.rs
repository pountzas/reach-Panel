use super::audio::{encode_wav_pcm16, resample_linear};
use super::{groq_remaining_percent, resolve_api_key};

#[test]
fn resample_identity() {
    let input = vec![0.0, 0.5, 1.0, -0.5];
    assert_eq!(resample_linear(&input, 16000, 16000), input);
}

#[test]
fn resample_doubles_length() {
    let input = vec![0.0, 1.0, 0.0, -1.0];
    let out = resample_linear(&input, 8000, 16000);
    assert_eq!(out.len(), 8);
}

#[test]
fn wav_header_size() {
    let samples = vec![0.0f32; 160];
    let wav = encode_wav_pcm16(&samples, 16000);
    assert_eq!(&wav[0..4], b"RIFF");
    assert_eq!(&wav[8..12], b"WAVE");
    assert_eq!(wav.len(), 44 + 160 * 2);
}

#[test]
fn resolve_key_prefers_settings() {
    assert_eq!(
        resolve_api_key(Some("  settings-key  ")).as_deref(),
        Some("settings-key")
    );
    assert_eq!(resolve_api_key(Some("")).as_deref(), None);
    assert_eq!(resolve_api_key(Some("   ")).as_deref(), None);
}

#[test]
fn remaining_percent_from_headers() {
    assert_eq!(groq_remaining_percent(50, 100), 50);
    assert_eq!(groq_remaining_percent(1, 3), 33);
    assert_eq!(groq_remaining_percent(2, 3), 67);
    assert_eq!(groq_remaining_percent(0, 100), 0);
    assert_eq!(groq_remaining_percent(100, 100), 100);
    assert_eq!(groq_remaining_percent(0, 0), 0);
    assert_eq!(groq_remaining_percent(200, 100), 100);
}
