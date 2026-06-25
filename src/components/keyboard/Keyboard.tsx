import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../stores/appStore";
import {
  displayLabel,
  getLayoutRows,
  isKeyActive,
  isShiftActive,
  KeyDef,
  resolveKeyOutput,
} from "../../lib/keyboardLayouts";
import { KeyButton } from "./KeyButton";
import { LanguageSwitchLabel } from "./LanguageSwitchLabel";
import { useContainerSize } from "../../hooks/useContainerSize";
import { computeKeyMetrics } from "../../lib/keyMetrics";

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

  const { ref, height } = useContainerSize<HTMLDivElement>();
  const shiftActive = isShiftActive(physicalKeyState, stickyModifiers);
  const activeModifiers = stickyModifiers.filter((m) => m !== "capslock");
  const rows = getLayoutRows(keyboardLayout, settings.language, {
    functionKeysEnabled: settings.functionKeysEnabled,
  });
  const { keyHeight, spacing } = computeKeyMetrics(height, rows.length);
  const fontSize = settings.keyboardFontSize ?? 18;

  const handleKey = async (keyDef: KeyDef) => {
    const key = keyDef.key;

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

    if (keyDef.modifier) {
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

    const output = resolveKeyOutput(keyDef, physicalKeyState.capsLock, shiftActive);
    if (output.length === 1) appendTyped(output);
    await invoke("cmd_press_key", {
      request: { key: output, modifiers: [...activeModifiers] },
    });
    if (activeModifiers.length) clearSticky();
    await loadSuggestions();
    await pollError();
  };

  return (
    <div
      ref={ref}
      className="flex h-full w-full flex-col rounded-xl p-2"
      style={{
        backgroundColor: settings.keyboardBgColor ?? "#e8edf2",
        opacity: settings.opacity,
      }}
    >
      {rows.map((row, ri) => (
        <div key={ri} className="flex w-full">
          {row.map((k, ci) => (
            <KeyButton
              key={`${ri}-${k.key}-${k.label}-${ci}`}
              label={
                k.key === "langswitch" ? (
                  <LanguageSwitchLabel
                    currentLanguage={settings.language}
                    fontSize={fontSize}
                  />
                ) : (
                  displayLabel(k, physicalKeyState.capsLock, shiftActive)
                )
              }
              width={k.width}
              size={keyHeight}
              spacing={spacing}
              fontSize={fontSize}
              bgColor={settings.keyboardKeyColor ?? "#ffffff"}
              textColor={settings.keyTextColor ?? "#1e293b"}
              stretch
              active={isKeyActive(
                k,
                ri,
                ci,
                physicalKeyState,
                stickyModifiers,
                { functionKeysEnabled: settings.functionKeysEnabled },
              )}
              onPress={() => handleKey(k)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
