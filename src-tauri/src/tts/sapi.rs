use super::TtsSettings;
use anyhow::{anyhow, Result};
use windows::core::PCWSTR;
use windows::Win32::Foundation::BOOL;
use windows::Win32::Media::Speech::{
    ISpObjectToken, ISpObjectTokenCategory, ISpVoice, SPCAT_VOICES,
    SPVOICESTATUS, SpObjectTokenCategory, SpVoice, SPF_DEFAULT, SPF_PURGEBEFORESPEAK,
};
use windows::Win32::System::Com::{CoInitializeEx, CLSCTX_ALL, COINIT_APARTMENTTHREADED};

const ONECORE_VOICES: PCWSTR =
    windows::core::w!("HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech_OneCore\\Voices");

fn language_lcids(language: &str) -> &'static [&'static str] {
    match language {
        "el" => &["408", "0408", "41008"],
        "de" => &["407", "0407"],
        "fr" => &["40C", "040C"],
        "it" => &["410", "0410"],
        "es" => &["40A", "040A", "C0A", "0C0A"],
        "pt" => &["816", "0816", "416", "0416"],
        _ => &["409", "0409", "1033"],
    }
}

fn language_prefix(language: &str) -> &'static str {
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

unsafe fn enumerate_tokens(category: &ISpObjectTokenCategory) -> Result<Vec<ISpObjectToken>> {
    let enumerator = category.EnumTokens(PCWSTR::null(), PCWSTR::null())?;
    let mut tokens = Vec::new();
    loop {
        let mut token = None;
        let mut fetched = 0u32;
        match enumerator.Next(1, &mut token, Some(&mut fetched)) {
            Ok(()) if fetched > 0 => {
                if let Some(t) = token {
                    tokens.push(t);
                }
            }
            _ => break,
        }
    }
    Ok(tokens)
}

unsafe fn token_matches_language(token: &ISpObjectToken, language: &str) -> bool {
    for lcid in language_lcids(language) {
        let attr = format!("Language={lcid}");
        let wide: Vec<u16> = attr.encode_utf16().chain(std::iter::once(0)).collect();
        let mut matches = BOOL(0);
        if token
            .MatchesAttributes(PCWSTR(wide.as_ptr()), &mut matches)
            .is_ok()
            && matches.as_bool()
        {
            return true;
        }
    }

    if let Ok(lang_val) = token.GetStringValue(windows::core::w!("Language")) {
        let lang_str = pwstr_to_string(lang_val);
        let lower = lang_str.to_lowercase();
        let prefix = language_prefix(language);
        if lower.starts_with(prefix) {
            return true;
        }
        for lcid in language_lcids(language) {
            if lower.contains(lcid) {
                return true;
            }
        }
    }
    false
}

fn pwstr_to_string(pw: windows::core::PWSTR) -> String {
    if pw.0.is_null() {
        return String::new();
    }
    unsafe {
        let len = (0..)
            .take_while(|&i| *pw.0.add(i) != 0)
            .count();
        String::from_utf16_lossy(std::slice::from_raw_parts(pw.0, len))
    }
}

unsafe fn find_voice_in_category(
    category_path: PCWSTR,
    language: &str,
) -> Result<Option<ISpObjectToken>> {
    let category: ISpObjectTokenCategory =
        windows::Win32::System::Com::CoCreateInstance(&SpObjectTokenCategory, None, CLSCTX_ALL)?;
    category.SetId(category_path, BOOL(1))?;

    for lcid in language_lcids(language) {
        let attr = format!("Language={lcid}");
        let wide: Vec<u16> = attr.encode_utf16().chain(std::iter::once(0)).collect();
        if let Ok(enumerator) = category.EnumTokens(PCWSTR(wide.as_ptr()), PCWSTR::null()) {
            let mut token = None;
            let mut fetched = 0u32;
            if enumerator.Next(1, &mut token, Some(&mut fetched)).is_ok() && fetched > 0 {
                return Ok(token);
            }
        }
    }

    for token in enumerate_tokens(&category)? {
        if token_matches_language(&token, language) {
            return Ok(Some(token));
        }
    }
    Ok(None)
}

unsafe fn find_voice_token(language: &str) -> Result<Option<ISpObjectToken>> {
    if let Some(token) = find_voice_in_category(SPCAT_VOICES, language)? {
        return Ok(Some(token));
    }
    find_voice_in_category(ONECORE_VOICES, language)
}

pub fn speak_text(text: &str, settings: &TtsSettings) -> Result<()> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let voice: ISpVoice =
            windows::Win32::System::Com::CoCreateInstance(&SpVoice, None, CLSCTX_ALL)?;

        let token = find_voice_token(&settings.language)?;
        let token = token.ok_or_else(|| {
            anyhow!(
                "No SAPI voice found for language '{}'. Windows Settings voices use OneCore.",
                settings.language
            )
        })?;
        voice
            .SetVoice(&token)
            .map_err(|e| anyhow!("Failed to set SAPI voice: {e}"))?;

        voice.SetRate(settings.rate)?;
        voice.SetVolume(settings.volume)?;
        let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        voice.Speak(PCWSTR(wide.as_ptr()), SPF_DEFAULT.0 as u32, None)?;
    }
    Ok(())
}

pub fn list_voices() -> Result<Vec<String>> {
    let mut voices = Vec::new();
    for (lang, label) in [
        ("en", "English"),
        ("el", "Greek"),
        ("de", "German"),
        ("fr", "French"),
        ("it", "Italian"),
        ("es", "Spanish"),
        ("pt", "Portuguese"),
    ] {
        unsafe {
            let installed = find_voice_token(lang)?.is_some();
            voices.push(format!(
                "SAPI {label}: {}",
                if installed { "installed" } else { "not found" }
            ));
        }
    }
    Ok(voices)
}

pub fn get_status() -> Result<String> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let voice: ISpVoice =
            windows::Win32::System::Com::CoCreateInstance(&SpVoice, None, CLSCTX_ALL)?;
        let mut status = SPVOICESTATUS::default();
        voice.GetStatus(&mut status, std::ptr::null_mut())?;
        if status.dwRunningState == 2 {
            Ok("speaking".to_string())
        } else {
            Ok("idle".to_string())
        }
    }
}

pub fn stop_speaking() -> Result<()> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let voice: ISpVoice =
            windows::Win32::System::Com::CoCreateInstance(&SpVoice, None, CLSCTX_ALL)?;
        voice.Speak(None, SPF_PURGEBEFORESPEAK.0 as u32, None)?;
    }
    Ok(())
}
