//! Keep the `main` panel visible: no minimize style, no taskbar button, restore on hide.

#[cfg(test)]
mod tests {
    #[test]
    fn main_window_config_disables_minimize_and_taskbar() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../../tauri.conf.json")).expect("tauri.conf.json");
        let windows = conf["app"]["windows"]
            .as_array()
            .expect("app.windows");
        let main = windows
            .iter()
            .find(|w| w["label"] == "main")
            .expect("main window");
        assert_eq!(main["minimizable"], false);
        assert_eq!(main["skipTaskbar"], true);
        assert_eq!(main["maximizable"], false);
        assert_eq!(main["alwaysOnTop"], true);
    }
}
