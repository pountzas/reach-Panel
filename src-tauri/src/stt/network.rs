//! Lightweight online check for STT routing (Windows).

pub fn is_online() -> bool {
    use windows::Win32::Networking::WinInet::{InternetGetConnectedState, INTERNET_CONNECTION};
    let mut flags = INTERNET_CONNECTION(0);
    unsafe { InternetGetConnectedState(&mut flags, 0).is_ok() }
}
