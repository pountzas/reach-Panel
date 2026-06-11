import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../stores/appStore";
import {
  displayLabel,
  getLayoutRows,
  isKeyActive,
  isLetterKey,
  isShiftActive,
  languageSwitchLabel,
  resolveLetterCase,
} from "../../lib/keyboardLayouts";
import { KeyButton } from "./KeyButton";

export function Keyboard() {
  const {
    settings,
    keyboardLayout,
    stickyModifiers,
    physicalKeyState,
    toggleSticky,
    pollKeyboardState,
    toggleLanguage,
    clearSticky,
    appendTyped,
    backspaceTyped,
    setTypedBuffer,
    loadSuggestions,
    pollError,
  } = useAppStore();

  const shiftActive = isShiftActive(physicalKeyState, stickyModifiers);
  const activeModifiers = stickyModifiers.filter((m) => m !== "capslock");
  const rows = getLayoutRows(keyboardLayout, settings.language);

  const handleKey = async (key: string, isModifier?: boolean) => {
    if (key === "capslock") {
      await invoke("cmd_press_key", {
        request: { key: "capslock", modifiers: [] },
      });
      await pollKeyboardState();
      await pollError();
      return;
    }

    if (key === "langswitch") {
      await toggleLanguage();
      await pollError();
      return;
    }

    if (isModifier) {
      toggleSticky(key);
      return;
    }

    if (key === "backspace") {
      backspaceTyped();
      await invoke("cmd_press_key", { request: { key: "backspace", modifiers: [] } });
      await loadSuggestions();
      await pollError();
      return;
    }

    if (key === "enter") {
      setTypedBuffer("");
      await invoke("cmd_press_key", {
        request: { key: "enter", modifiers: [...activeModifiers] },
      });
      clearSticky();
      await loadSuggestions();
      await pollError();
      return;
    }

    if (key === "space") {
      appendTyped(" ");
      await invoke("cmd_press_key", {
        request: { key: "space", modifiers: [...activeModifiers] },
      });
      if (activeModifiers.length) clearSticky();
      await loadSuggestions();
      await pollError();
      return;
    }

    const output =
      key.length === 1 && isLetterKey(key)
        ? resolveLetterCase(key, physicalKeyState.capsLock, shiftActive)
        : key;
    if (key.length === 1) appendTyped(output);
    await invoke("cmd_press_key", {
      request: { key: output, modifiers: [...activeModifiers] },
    });
    if (activeModifiers.length) clearSticky();
    await loadSuggestions();
    await pollError();
  };

  return (
    <div
      className="flex flex-col rounded-xl p-2"
      style={{
        backgroundColor: settings.keyboardBgColor ?? "#e8edf2",
        opacity: settings.opacity,
      }}
    >
      {rows.map((row, ri) => (
        <div key={ri} className="flex">
          {row.map((k, ci) => (
            <KeyButton
              key={`${ri}-${k.key}-${k.label}`}
              label={
                k.key === "langswitch"
                  ? languageSwitchLabel(settings.language)
                  : displayLabel(
                      k,
                      physicalKeyState.capsLock,
                      shiftActive,
                    )
              }
              width={k.width}
              size={settings.keyboardKeySize}
              spacing={settings.keyboardSpacing}
              fontSize={settings.keyboardFontSize ?? 18}
              bgColor={settings.keyboardKeyColor ?? "#ffffff"}
              active={isKeyActive(k, ri, ci, physicalKeyState, stickyModifiers)}
              onPress={() => handleKey(k.key, k.modifier)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
