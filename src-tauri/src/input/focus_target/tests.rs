use super::{
    classify_aria_role, combo_box_accepts_text, host_is_chromium, is_editable_class,
    is_last_real_text_focus_live, line_strip_bounds, resolve_bounds_with_sticky,
    satellite_matches_remembered_owner, should_retain_text_focus, sticky_rect_for_target,
    uia_control_is_text_input, uia_signals_are_autocomplete_satellite, AriaRoleKind,
    ScreenRect, UiaTextInputSignals, LAST_REAL_TEXT_FOCUS_TTL, LINE_STRIP_HEIGHT,
    LINE_STRIP_WIDTH,
};
use std::time::{Duration, Instant};

fn rect(left: i32, top: i32, width: i32, height: i32) -> ScreenRect {
    ScreenRect {
        left,
        top,
        width,
        height,
    }
}

#[test]
fn line_strip_tall_uia_with_caret_crops_to_one_line() {
    let uia = rect(100, 200, 800, 600);
    let caret = (100 + 400, 200 + 300); // middle of UIA
    let strip = line_strip_bounds(Some(uia), Some(caret)).expect("strip");
    assert_eq!(strip.height, LINE_STRIP_HEIGHT);
    assert_eq!(strip.width, LINE_STRIP_WIDTH);
    assert!(
        caret.1 >= strip.top && caret.1 < strip.top + strip.height,
        "caret Y {} not inside strip top={} height={}",
        caret.1,
        strip.top,
        strip.height
    );
    assert!(strip.left >= uia.left);
    assert!(strip.left + strip.width <= uia.left + uia.width);
    assert_eq!(strip.left + strip.width / 2, caret.0);
    assert_eq!(strip.top + strip.height / 2, caret.1);
}

#[test]
fn line_strip_tall_uia_without_caret_uses_top_left_contained_window() {
    let uia = rect(100, 200, 800, 600);
    let strip = line_strip_bounds(Some(uia), None).expect("strip");
    assert_eq!(strip, rect(100, 200, LINE_STRIP_WIDTH, LINE_STRIP_HEIGHT));
}

#[test]
fn line_strip_ignores_caret_outside_uia() {
    let uia = rect(100, 200, 400, 300);
    let outside = (900, 80); // typical bogus GetCaretPos on window chrome
    let strip = line_strip_bounds(Some(uia), Some(outside)).expect("strip");
    assert_eq!(strip, rect(100, 200, LINE_STRIP_WIDTH, LINE_STRIP_HEIGHT));
}

#[test]
fn line_strip_wide_line_like_uia_is_contained() {
    let uia = rect(50, 90, 900, 40);
    let strip = line_strip_bounds(Some(uia), None).expect("strip");
    assert_eq!(strip, rect(50, 90, LINE_STRIP_WIDTH, 40));
}

#[test]
fn line_strip_short_but_wide_enough_stays_inside_field() {
    let uia = rect(80, 90, 200, 40);
    let strip = line_strip_bounds(Some(uia), None).expect("strip");
    assert_eq!(strip, rect(80, 90, 200, 40));
}

#[test]
fn line_strip_tiny_uia_with_caret_expands_around_caret() {
    let uia = rect(500, 400, 40, 16);
    let caret = (520, 408);
    let strip = line_strip_bounds(Some(uia), Some(caret)).expect("strip");
    assert_eq!(strip.width, LINE_STRIP_WIDTH);
    assert_eq!(strip.height, LINE_STRIP_HEIGHT);
    assert_eq!(strip.left, caret.0 - 160);
    assert_eq!(strip.top, caret.1 - 24);
}

#[test]
fn line_strip_tiny_uia_without_caret_expands_around_uia() {
    let uia = rect(500, 400, 40, 16);
    let strip = line_strip_bounds(Some(uia), None).expect("strip");
    assert_eq!(strip.width, LINE_STRIP_WIDTH);
    assert_eq!(strip.height, LINE_STRIP_HEIGHT);
    let cx = uia.left + uia.width / 2;
    let cy = uia.top + uia.height / 2;
    assert_eq!(strip.left, cx - 160);
    assert_eq!(strip.top, cy - 24);
}

#[test]
fn line_strip_already_line_like_uia_stays_about_same_size() {
    let uia = rect(80, 90, 320, 48);
    let strip = line_strip_bounds(Some(uia), None).expect("strip");
    assert_eq!(strip.left, 80);
    assert_eq!(strip.top, 90);
    assert_eq!(strip.width, 320);
    assert_eq!(strip.height, 48);
}

#[test]
fn line_strip_caret_only_matches_legacy_caret_bounds() {
    let caret = (640, 360);
    let strip = line_strip_bounds(None, Some(caret)).expect("strip");
    assert_eq!(
        strip,
        rect(
            caret.0 - 160,
            caret.1 - 24,
            LINE_STRIP_WIDTH,
            LINE_STRIP_HEIGHT
        )
    );
}

#[test]
fn line_strip_neither_uia_nor_caret_returns_none() {
    assert_eq!(line_strip_bounds(None, None), None);
}

#[test]
fn sticky_bounds_only_when_allowed() {
    let sticky = rect(40, 50, LINE_STRIP_WIDTH, LINE_STRIP_HEIGHT);
    assert_eq!(
        resolve_bounds_with_sticky(None, Some(sticky), true),
        Some(sticky)
    );
    assert_eq!(resolve_bounds_with_sticky(None, Some(sticky), false), None);
    let live = rect(80, 90, LINE_STRIP_WIDTH, LINE_STRIP_HEIGHT);
    assert_eq!(
        resolve_bounds_with_sticky(Some(live), Some(sticky), false),
        Some(live)
    );
}

fn signals(
    control_type: i32,
    value_writable: bool,
    is_chromium_document: bool,
    aria_role: AriaRoleKind,
) -> UiaTextInputSignals {
    signals_with_text_pattern(
        control_type,
        value_writable,
        is_chromium_document,
        aria_role,
        false,
    )
}

fn signals_with_text_pattern(
    control_type: i32,
    value_writable: bool,
    is_chromium_document: bool,
    aria_role: AriaRoleKind,
    has_text_pattern: bool,
) -> UiaTextInputSignals {
    signals_with_text_editability(
        control_type,
        value_writable,
        is_chromium_document,
        aria_role,
        has_text_pattern,
        has_text_pattern,
    )
}

fn signals_with_text_editability(
    control_type: i32,
    value_writable: bool,
    is_chromium_document: bool,
    aria_role: AriaRoleKind,
    has_text_pattern: bool,
    text_pattern_editable: bool,
) -> UiaTextInputSignals {
    UiaTextInputSignals {
        control_type,
        value_writable,
        is_chromium_document,
        aria_role,
        has_text_pattern,
        text_pattern_editable,
    }
}

#[test]
fn classify_aria_role_maps_landmarks_and_textboxes() {
    assert_eq!(classify_aria_role("main"), AriaRoleKind::NotText);
    assert_eq!(classify_aria_role("tablist"), AriaRoleKind::NotText);
    assert_eq!(classify_aria_role("textbox"), AriaRoleKind::TextInput);
    assert_eq!(classify_aria_role("searchbox"), AriaRoleKind::TextInput);
    assert_eq!(classify_aria_role("spinbutton"), AriaRoleKind::TextInput);
    assert_eq!(classify_aria_role("combobox"), AriaRoleKind::ComboBox);
    assert_eq!(classify_aria_role(""), AriaRoleKind::Unspecified);
    assert_eq!(classify_aria_role("TextBox"), AriaRoleKind::TextInput);
}

#[test]
fn editable_class_names_include_common_inputs() {
    assert!(is_editable_class("Edit"));
    assert!(is_editable_class("RichEdit20W"));
    assert!(is_editable_class("RICHEDIT50W"));
    assert!(is_editable_class("RichEditD2DPT"));
    assert!(is_editable_class("Scintilla"));
    assert!(!is_editable_class("Button"));
    assert!(!is_editable_class("Progman"));
    assert!(!is_editable_class("Shell_TrayWnd"));
    assert!(!is_editable_class("Chrome_WidgetWin_1"));
    // Whole-page browser HWNDs are not text fields — UIA must decide.
    assert!(!is_editable_class("Chrome_RenderWidgetHostHWND"));
    assert!(!is_editable_class("Internet Explorer_Server"));
}

#[test]
fn uia_edit_control_is_text_input() {
    assert!(uia_control_is_text_input(signals(
        50004, // UIA_EditControlTypeId
        false,
        false,
        AriaRoleKind::Unspecified,
    )));
}

#[test]
fn uia_writable_edit_is_text_input() {
    assert!(uia_control_is_text_input(signals(
        50004, // UIA_EditControlTypeId
        true,
        false,
        AriaRoleKind::Unspecified,
    )));
}

#[test]
fn uia_writable_custom_with_textbox_role_is_text_input() {
    assert!(uia_control_is_text_input(signals(
        50025, // UIA_CustomControlTypeId (contenteditable)
        true,
        false,
        AriaRoleKind::TextInput,
    )));
}

#[test]
fn uia_youtube_comment_contenteditable_group_is_text_input() {
    // Chromium exposes contenteditable roots as Group + aria role "group"
    // with TextPattern (YouTube #contenteditable-root "Add a comment...").
    // role=group is NotText for landmarks, so editable TextPattern must tip it over
    // even when ValuePattern / value_writable is false.
    assert!(uia_control_is_text_input(signals_with_text_editability(
        50026, // UIA_GroupControlTypeId
        false,
        true,
        AriaRoleKind::NotText,
        true,
        true,
    )));
    // Read-only TextPattern Groups stay rejected.
    assert!(!uia_control_is_text_input(signals_with_text_editability(
        50026,
        false,
        true,
        AriaRoleKind::NotText,
        true,
        false,
    )));
    // A plain Group landmark without TextPattern stays rejected.
    assert!(!uia_control_is_text_input(signals(
        50026,
        false,
        true,
        AriaRoleKind::NotText,
    )));
}

#[test]
fn sticky_bounds_identity_rejects_mismatched_hwnd() {
    let rect_a = rect(10, 20, LINE_STRIP_WIDTH, LINE_STRIP_HEIGHT);
    let rect_b = rect(30, 40, LINE_STRIP_WIDTH, LINE_STRIP_HEIGHT);
    assert_eq!(
        sticky_rect_for_target(Some(1), Some(rect_a), Some(1)),
        Some(rect_a)
    );
    assert_eq!(sticky_rect_for_target(Some(2), Some(rect_b), Some(1)), None);
    assert_eq!(sticky_rect_for_target(Some(1), Some(rect_a), None), None);
    assert_eq!(
        resolve_bounds_with_sticky(
            None,
            sticky_rect_for_target(Some(2), Some(rect_b), Some(1)),
            true
        ),
        None
    );
}

#[test]
fn uia_chromium_contenteditable_document_is_text_input() {
    assert!(uia_control_is_text_input(signals(
        50030, // UIA_DocumentControlTypeId
        true,
        true,
        AriaRoleKind::TextInput,
    )));
}

#[test]
fn uia_youtube_channel_main_landmark_is_not_text_input() {
    // ytd-browse role="main" is a page landmark, not a text field.
    assert!(!uia_control_is_text_input(signals(
        50030, // UIA_DocumentControlTypeId
        true,
        true,
        AriaRoleKind::NotText,
    )));
    assert!(!uia_control_is_text_input(signals(
        50025, // UIA_CustomControlTypeId
        true,
        true,
        AriaRoleKind::NotText,
    )));
}

#[test]
fn uia_chromium_writable_page_without_textbox_role_is_not_text_input() {
    assert!(!uia_control_is_text_input(signals(
        50030,
        true,
        true,
        AriaRoleKind::Unspecified,
    )));
    assert!(!uia_control_is_text_input(signals(
        50025,
        true,
        true,
        AriaRoleKind::Unspecified,
    )));
}

#[test]
fn uia_static_text_is_not_text_input() {
    assert!(!uia_control_is_text_input(signals(
        50020, // UIA_TextControlTypeId
        false,
        false,
        AriaRoleKind::Unspecified,
    )));
}

#[test]
fn uia_slider_with_value_pattern_is_not_text_input() {
    assert!(!uia_control_is_text_input(signals(
        50015, // UIA_SliderControlTypeId (YouTube volume)
        true,
        false,
        AriaRoleKind::Unspecified,
    )));
}

#[test]
fn uia_button_with_value_pattern_is_not_text_input() {
    assert!(!uia_control_is_text_input(signals(
        50000, // UIA_ButtonControlTypeId
        true,
        false,
        AriaRoleKind::Unspecified,
    )));
}

#[test]
fn uia_word_document_is_text_input_but_chromium_document_is_not() {
    assert!(uia_control_is_text_input(signals(
        50030, // UIA_DocumentControlTypeId
        false,
        false,
        AriaRoleKind::Unspecified,
    )));
    assert!(!uia_control_is_text_input(signals(
        50030,
        false,
        true,
        AriaRoleKind::Unspecified,
    )));
}

#[test]
fn uia_plain_button_is_not_text_input() {
    assert!(!uia_control_is_text_input(signals(
        50000, // UIA_ButtonControlTypeId
        false,
        false,
        AriaRoleKind::Unspecified,
    )));
}

#[test]
fn classify_aria_role_maps_search_suggestions_as_autocomplete() {
    assert_eq!(
        classify_aria_role("option"),
        AriaRoleKind::AutocompletePopup
    );
    assert_eq!(
        classify_aria_role("listbox"),
        AriaRoleKind::AutocompletePopup
    );
    assert_eq!(
        classify_aria_role("listitem"),
        AriaRoleKind::AutocompletePopup
    );
    assert!(!uia_control_is_text_input(signals(
        50007, // UIA_ListItemControlTypeId
        false,
        true,
        AriaRoleKind::AutocompletePopup,
    )));
    assert!(uia_signals_are_autocomplete_satellite(signals(
        50007,
        false,
        true,
        AriaRoleKind::Unspecified,
    )));
    assert!(uia_signals_are_autocomplete_satellite(signals(
        50000, // button nested inside a suggestion
        false,
        true,
        AriaRoleKind::AutocompletePopup,
    )));
}

#[test]
fn youtube_search_suggestion_keeps_keyboard_after_searchbox() {
    // Hovering a suggestion must not hide the keyboard once the search box showed it.
    assert!(should_retain_text_focus(false, true, true));
    // A listbox on its own must not pop the keyboard.
    assert!(!should_retain_text_focus(false, true, false));
    // Leaving the field for a real non-text control hides it.
    assert!(!should_retain_text_focus(false, false, true));
    assert!(should_retain_text_focus(true, false, false));
}

#[test]
fn last_real_text_focus_expires_after_ttl() {
    let recorded = Instant::now();
    assert!(is_last_real_text_focus_live(
        recorded,
        recorded + Duration::from_secs(1)
    ));
    assert!(!is_last_real_text_focus_live(
        recorded,
        recorded + LAST_REAL_TEXT_FOCUS_TTL + Duration::from_millis(1)
    ));
}

#[test]
fn autocomplete_satellite_requires_remembered_owner() {
    assert!(satellite_matches_remembered_owner(42, 0, Some((42, 100))));
    assert!(satellite_matches_remembered_owner(0, 100, Some((42, 100))));
    assert!(!satellite_matches_remembered_owner(7, 99, Some((42, 100))));
    assert!(!satellite_matches_remembered_owner(42, 100, None));
}

#[test]
fn uia_chromium_select_combobox_is_not_text_input() {
    // Chromium <select>: ComboBox + writable ValuePattern, no TextPattern.
    assert!(!uia_control_is_text_input(signals_with_text_editability(
        50003, // UIA_ComboBoxControlTypeId
        true,
        true,
        AriaRoleKind::ComboBox,
        false,
        false,
    )));
}

#[test]
fn uia_chromium_select_only_aria_combobox_on_button_is_not_text_input() {
    assert!(!uia_control_is_text_input(signals_with_text_editability(
        50000, // UIA_ButtonControlTypeId
        true,
        true,
        AriaRoleKind::ComboBox,
        false,
        false,
    )));
}

#[test]
fn uia_base_ui_button_combobox_rejected_even_when_chromium_flag_missing() {
    // In-page Chromium nodes often have NativeWindowHandle=0, so the host
    // flag can be wrong unless FG class is consulted. Button+combobox
    // triggers (Base UI / shadcn Select) must still never count as text.
    assert!(!uia_control_is_text_input(signals_with_text_editability(
        50000, // UIA_ButtonControlTypeId
        true,
        false, // mis-detected non-Chromium
        AriaRoleKind::ComboBox,
        false,
        false,
    )));
    assert!(!combo_box_accepts_text(signals_with_text_editability(
        50000,
        true,
        false,
        AriaRoleKind::ComboBox,
        false,
        false,
    )));
}

#[test]
fn host_is_chromium_uses_framework_id_and_class_fallbacks() {
    // WebView2 in a WPF/WinForms host: FrameworkId is Chrome, FG is not.
    assert!(host_is_chromium("Chrome", "", "HwndWrapper[MyApp;;1]"));
    assert!(host_is_chromium("chrome", "", ""));
    // Class fallbacks when FrameworkId is empty.
    assert!(host_is_chromium("", "", "Chrome_WidgetWin_1"));
    assert!(host_is_chromium("", "", "Chrome_RenderWidgetHostHWND"));
    assert!(host_is_chromium(
        "",
        "Chrome_RenderWidgetHostHWND",
        "Notepad"
    ));
    assert!(!host_is_chromium("", "", "Notepad"));
    assert!(!host_is_chromium("", "", ""));
    assert!(!host_is_chromium("Win32", "", "Notepad"));
}

#[test]
fn uia_chromium_document_requires_editable_text_pattern() {
    // Plain Chromium page / iframe Document: not text.
    assert!(!uia_control_is_text_input(signals_with_text_editability(
        50030, // UIA_DocumentControlTypeId
        true,
        true,
        AriaRoleKind::Unspecified,
        true,
        false,
    )));
    // designMode / contenteditable iframe editor (TinyMCE, CKEditor 4): text.
    assert!(uia_control_is_text_input(signals_with_text_editability(
        50030,
        false,
        true,
        AriaRoleKind::Unspecified,
        true,
        true,
    )));
    // Native Document (Word): still text.
    assert!(uia_control_is_text_input(signals_with_text_editability(
        50030,
        false,
        false,
        AriaRoleKind::Unspecified,
        false,
        false,
    )));
}

#[test]
fn uia_chromium_number_input_spinbutton_is_text_input() {
    // HTML <input type="number"> → AriaRole spinbutton, UIA Spinner.
    assert_eq!(classify_aria_role("spinbutton"), AriaRoleKind::TextInput);
    assert!(uia_control_is_text_input(signals_with_text_editability(
        50016, // UIA_SpinnerControlTypeId
        true,
        true,
        AriaRoleKind::TextInput,
        true,
        true,
    )));
    // Even when AriaRole is missing, Spinner + writable ValuePattern is a number field.
    assert!(uia_control_is_text_input(signals_with_text_editability(
        50016,
        true,
        true,
        AriaRoleKind::Unspecified,
        false,
        false,
    )));
}

#[test]
fn uia_chromium_editable_combobox_with_text_pattern_is_text_input() {
    assert!(uia_control_is_text_input(signals_with_text_editability(
        50003, // UIA_ComboBoxControlTypeId
        true,
        true,
        AriaRoleKind::ComboBox,
        true,
        true,
    )));
    assert!(uia_control_is_text_input(signals_with_text_editability(
        50004, // UIA_EditControlTypeId
        true,
        true,
        AriaRoleKind::ComboBox,
        true,
        true,
    )));
}

#[test]
fn uia_native_writable_combobox_is_text_input_without_text_pattern() {
    assert!(uia_control_is_text_input(signals_with_text_editability(
        50003,
        true,
        false,
        AriaRoleKind::Unspecified,
        false,
        false,
    )));
    assert!(!uia_control_is_text_input(signals_with_text_editability(
        50003,
        false,
        false,
        AriaRoleKind::Unspecified,
        false,
        false,
    )));
}

#[test]
fn uia_custom_text_pattern_requires_editability() {
    assert!(!uia_control_is_text_input(signals_with_text_editability(
        50025, // UIA_CustomControlTypeId
        false,
        true,
        AriaRoleKind::Unspecified,
        true,
        false,
    )));
    assert!(uia_control_is_text_input(signals_with_text_editability(
        50025,
        false,
        true,
        AriaRoleKind::Unspecified,
        true,
        true,
    )));
}

#[test]
fn combo_box_accepts_text_requires_editable_text_pattern_on_chromium() {
    assert!(!combo_box_accepts_text(signals_with_text_editability(
        50003,
        true,
        true,
        AriaRoleKind::ComboBox,
        false,
        false,
    )));
    assert!(combo_box_accepts_text(signals_with_text_editability(
        50003,
        true,
        true,
        AriaRoleKind::ComboBox,
        true,
        true,
    )));
    assert!(combo_box_accepts_text(signals_with_text_editability(
        50003,
        true,
        false,
        AriaRoleKind::Unspecified,
        false,
        false,
    )));
    assert!(!combo_box_accepts_text(signals_with_text_editability(
        50003,
        false,
        false,
        AriaRoleKind::Unspecified,
        false,
        false,
    )));
}