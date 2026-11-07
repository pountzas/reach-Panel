mod companion;
mod commands;
mod db;
mod diagnostics;
mod input;
mod language;
mod logging;
mod music;
mod prediction;
mod profiles;
mod services;
mod stt;
mod teaching_pdf;
mod teaching_pdf_appearances;
mod teaching_pdf_reach;
mod window;

#[cfg(not(target_os = "windows"))]
compile_error!("ReachPanel is Windows-only. macOS is not supported.");

use db::Database;
use input::focus_target;
use prediction::ensure_english_pack;
use profiles::ProfileStore;
use tauri::Manager;

pub(crate) struct AppState {
    pub(crate) db: Database,
    pub(crate) profiles: ProfileStore,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    crate::diagnostics::install_panic_hook();
    tauri::Builder::default()
        .on_page_load(|webview, payload| {
            window::icon_sync::on_app_page_load(&webview, &payload);
            if let Some(window) = webview.app_handle().get_webview_window(webview.label()) {
                crate::diagnostics::register_process_failed(&window);
            }
        })
        .plugin(crate::logging::plugin())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .setup(|app| {
            crate::diagnostics::on_setup(app);
            let app_data_dir = app.path().app_data_dir().map_err(|e| {
                crate::diagnostics::log_setup_error(format!("failed to resolve app data dir: {e}"))
            })?;
            let db = Database::new(app_data_dir.clone()).map_err(|e| {
                crate::diagnostics::log_setup_error(format!("failed to initialize database: {e}"))
            })?;
            let profiles = ProfileStore::new(&app_data_dir).map_err(|e| {
                crate::diagnostics::log_setup_error(format!(
                    "failed to initialize profile store: {e}"
                ))
            })?;
            profiles.ensure_default_profile_file(&db).map_err(|e| {
                crate::diagnostics::log_setup_error(format!(
                    "failed to load default profile file: {e}"
                ))
            })?;
            app.manage(AppState { db, profiles });

            match companion::CompanionBridge::new(&app_data_dir) {
                Ok(bridge) => {
                    // Default off — user starts from Settings → Companion.
                    app.manage(bridge);
                }
                Err(e) => {
                    crate::diagnostics::log_setup_error(format!(
                        "Failed to initialize companion bridge: {e}"
                    ));
                    return Err(e.into());
                }
            }

            {
                let state = app.state::<AppState>();
                if let Err(e) = ensure_english_pack(app.handle(), &state.db) {
                    log::error!("Failed to install bundled English word pack: {e}");
                }
            }

            stt::init(&app_data_dir, app.handle().clone());

            if let Some(window) = app.get_webview_window("main") {
                window::configure_main_window(&window);
                window::events::register_main_window_event_logs(window.clone());
                focus_target::init(app.handle().clone());
                input::input_preview::init(app.handle().clone());
                crate::diagnostics::register_process_failed(&window);
            }
            crate::logging::log_session_start(app);
            if let Ok(log_dir) = app.path().app_log_dir() {
                crate::diagnostics::breadcrumbs::start(log_dir);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::keyboard::cmd_press_key,
            commands::keyboard::cmd_type_text,
            commands::keyboard::cmd_get_keyboard_layout,
            commands::keyboard::cmd_get_keyboard_state,
            commands::input_preview::cmd_set_input_preview_enabled,
            commands::input_preview::cmd_subscribe_input_preview,
            commands::keyboard::cmd_get_input_focused,
            commands::keyboard::cmd_set_system_language,
            commands::keyboard::cmd_get_input_methods,
            commands::keyboard::cmd_set_input_method,
            commands::keyboard::cmd_get_layout_key_labels,
            commands::keyboard::cmd_translate_layout_key,
            commands::keyboard::cmd_reset_layout_compose_state,
            commands::mouse::cmd_move_cursor_relative,
            commands::mouse::cmd_trackpad_gesture_begin,
            commands::mouse::cmd_trackpad_gesture_end,
            commands::mouse::cmd_get_cursor_position,
            commands::mouse::cmd_primary_mouse_button_down,
            commands::mouse::cmd_mouse_click,
            commands::mouse::cmd_mouse_double_click,
            commands::mouse::cmd_mouse_scroll,
            commands::window::cmd_list_monitors,
            commands::window::cmd_get_main_window_monitor,
            commands::window::cmd_apply_window_layout,
            commands::window::cmd_animate_window_layout,
            commands::window::cmd_set_always_on_top,
            commands::input_preview::cmd_exclude_window_from_capture,
            commands::window::cmd_set_window_focusable,
            commands::window::cmd_expand_window_for_mode_menu,
            commands::profiles::cmd_get_profiles,
            commands::profiles::cmd_list_profile_files,
            commands::profiles::cmd_get_active_profile_file,
            commands::profiles::cmd_load_profile_file,
            commands::profiles::cmd_save_active_profile_file,
            commands::profiles::cmd_create_profile_file,
            commands::profiles::cmd_delete_profile_file,
            commands::profiles::cmd_wipe_active_profile,
            commands::keyboard::cmd_get_windows_ui_language,
            commands::files::cmd_pick_music_song_file,
            commands::files::cmd_pick_teaching_pdf,
            commands::library::cmd_read_music_file,
            commands::teaching_pdf::cmd_read_teaching_pdf,
            commands::library::cmd_list_imported_songs,
            commands::library::cmd_upsert_imported_song,
            commands::library::cmd_delete_imported_song,
            commands::teaching_pdf::cmd_list_teaching_pdfs,
            commands::teaching_pdf::cmd_save_teaching_pdfs,
            commands::teaching_pdf::cmd_ensure_teaching_reach_pdf,
            commands::teaching_pdf::cmd_read_teaching_reach_annotations,
            commands::teaching_pdf::cmd_write_teaching_reach_annotations,
            commands::teaching_pdf::cmd_delete_teaching_reach_pdf,
            commands::files::cmd_pick_teaching_reach_export_path,
            commands::teaching_pdf::cmd_export_teaching_reach_pdf,
            commands::library::cmd_list_custom_language_packs,
            commands::library::cmd_upsert_custom_language_pack,
            commands::library::cmd_delete_custom_language_pack,
            commands::profiles::cmd_update_profile_settings,
            commands::dictation::cmd_start_dictation,
            commands::dictation::cmd_stop_dictation,
            commands::dictation::cmd_get_stt_status,
            commands::system::cmd_open_windows_settings,
            commands::system::cmd_get_log_dir,
            commands::system::cmd_open_log_dir,
            commands::system::cmd_collect_diagnostics,
            commands::system::cmd_diagnostics_upload_available,
            commands::system::cmd_send_diagnostics,
            commands::window::cmd_set_taskbar_position,
            commands::window::cmd_get_taskbar_position,
            commands::prediction::cmd_get_suggestions,
            commands::prediction::cmd_record_word,
            commands::prediction::cmd_list_word_packs,
            commands::prediction::cmd_install_word_pack,
            commands::prediction::cmd_uninstall_word_pack,
            companion::cmd_companion_start,
            companion::cmd_companion_stop,
            companion::cmd_companion_status,
            companion::cmd_companion_pairing_payload,
            companion::cmd_companion_refresh_pairing,
            companion::cmd_companion_list_devices,
            companion::cmd_companion_revoke_device,
            crate::diagnostics::breadcrumbs::cmd_record_breadcrumb,
            #[cfg(debug_assertions)]
            crate::diagnostics::cmd_debug_panic,
        ])
        .build(tauri::generate_context!())
        .unwrap_or_else(|e| {
            // Process entry: no caller to return to; exit instead of panicking.
            log::error!("error while running tauri application: {e}");
            std::process::exit(1);
        })
        .run(|app, event| {
            if matches!(
                event,
                tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
            ) {
                crate::diagnostics::breadcrumbs::flush();
            }
            crate::diagnostics::on_run_event(app, &event);
        });
}
