use crate::commands::{err, ok, CommandResult};
use crate::input::{
    begin_trackpad_gesture, end_trackpad_gesture, get_cursor_position, mouse_click,
    mouse_double_click, mouse_scroll, move_cursor_relative, primary_mouse_button_down,
};

#[tauri::command]
pub fn cmd_move_cursor_relative(dx: i32, dy: i32) -> CommandResult {
    match move_cursor_relative(dx, dy) {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn cmd_trackpad_gesture_begin(window: tauri::WebviewWindow) -> CommandResult {
    let hwnd = match window.hwnd() {
        Ok(hwnd) => hwnd.0 as isize,
        Err(e) => return err(e),
    };
    match begin_trackpad_gesture(hwnd) {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn cmd_trackpad_gesture_end() -> CommandResult {
    match end_trackpad_gesture() {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn cmd_get_cursor_position() -> Result<(i32, i32), String> {
    get_cursor_position().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_primary_mouse_button_down() -> bool {
    primary_mouse_button_down()
}

#[tauri::command]
pub fn cmd_mouse_click(button: String) -> CommandResult {
    match mouse_click(&button) {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn cmd_mouse_double_click() -> CommandResult {
    match mouse_double_click() {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn cmd_mouse_scroll(delta: i32, horizontal: bool) -> CommandResult {
    match mouse_scroll(delta, horizontal) {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}
