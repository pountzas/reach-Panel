//! Windows keyboard injection, layout switching, and modifier state.

mod layout;
mod send;
mod state;

#[cfg(test)]
mod tests;

pub use layout::{
    get_input_methods, get_installed_language_tags, get_keyboard_layout, get_layout_key_labels,
    lang_id_to_iso_tag, reset_layout_compose_state, set_input_method_by_hkl,
    set_input_method_by_language, set_system_language, translate_layout_key_press,
    windows_ui_language, InputMethod, LayoutKeyLabel, LayoutKeyTranslation,
};
pub use send::{press_combo, press_key, press_media_key, type_text, KeyPressRequest};
pub use state::{get_caps_lock_state, get_keyboard_state, KeyboardState};
