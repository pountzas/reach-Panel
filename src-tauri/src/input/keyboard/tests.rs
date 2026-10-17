use super::layout::{
    load_layout_for_language, reset_layout_compose_state, translate_layout_key_press,
};

#[test]
fn greek_tonos_then_o_produces_omicron_with_accent() {
    reset_layout_compose_state(None);
    let tonos = translate_layout_key_press(";", false, false, None);
    // When the active Windows layout is not Greek, ";" is a normal key — JS compose handles that.
    if !tonos.dead && tonos.text == ";" {
        reset_layout_compose_state(None);
        return;
    }
    assert!(tonos.dead, "tonos key should be dead, got {:?}", tonos);
    assert!(tonos.text.is_empty());

    let vowel = translate_layout_key_press("o", false, false, None);
    assert!(
        vowel.text.contains('\u{03CC}'),
        "expected ό, got {:?}",
        vowel.text
    );
    reset_layout_compose_state(None);
}

#[test]
fn greek_caps_lock_uppercases_letter_and_xor_with_shift() {
    reset_layout_compose_state(None);
    let Ok(hkl) = load_layout_for_language("el") else {
        return;
    };
    let hkl_val = Some(hkl.0 as u64);

    let lower = translate_layout_key_press("a", false, false, hkl_val);
    if !lower.text.contains('\u{03B1}') {
        // Greek layout unavailable in this environment.
        reset_layout_compose_state(hkl_val);
        return;
    }

    let caps = translate_layout_key_press("a", false, true, hkl_val);
    assert!(
        caps.text.contains('\u{0391}'),
        "Caps Lock should produce Α, got {:?}",
        caps.text
    );

    let caps_shift = translate_layout_key_press("a", true, true, hkl_val);
    assert!(
        caps_shift.text.contains('\u{03B1}'),
        "Caps+Shift XOR should produce α, got {:?}",
        caps_shift.text
    );

    reset_layout_compose_state(hkl_val);
}
