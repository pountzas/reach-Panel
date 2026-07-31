import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../stores/appStore";
import {
  displayLabel,
  getLayoutRows,
  isFnActive,
  isFnMappedKey,
  isKeyActive,
  isShiftActive,
  KeyDef,
  resolveKeyOutput,
  resolveOnscreenLayout,
} from "../../lib/keyboardLayouts";
import { KeyButton } from "./KeyButton";
import { LanguagePicker } from "./LanguagePicker";
import { LanguageSwitchLabel } from "./LanguageSwitchLabel";
import { useContainerSize } from "../../hooks/useContainerSize";
import { useTranslation } from "../../hooks/useTranslation";
import { computeKeyMetrics } from "../../lib/keyMetrics";
import type { OnscreenLayout } from "../../lib/types";

export function Keyboard() {
  const settings = useAppStore((s) => s.settings);
  const keyboardLayout = useAppStore((s) => s.keyboardLayout);
  const stickyModifiers = useAppStore((s) => s.stickyModifiers);
  const physicalKeyState = useAppStore((s) => s.physicalKeyState);
  const toggleSticky = useAppStore((s) => s.toggleSticky);
  const pollKeyboardState = useAppStore((s) => s.pollKeyboardState);
  const clearSticky = useAppStore((s) => s.clearSticky);
  const clearStickyExceptFn = useAppStore((s) => s.clearStickyExceptFn);
  const appendTyped = useAppStore((s) => s.appendTyped);
  const backspaceTyped = useAppStore((s) => s.backspaceTyped);
  const setTypedBuffer = useAppStore((s) => s.setTypedBuffer);
  const loadSuggestions = useAppStore((s) => s.loadSuggestions);
  const recordTypedWord = useAppStore((s) => s.recordTypedWord);
  const pollError = useAppStore((s) => s.pollError);
  const inputMethods = useAppStore((s) => s.inputMethods);
  const layoutKeyLabels = useAppStore((s) => s.layoutKeyLabels);
  const languagePickerOpen = useAppStore((s) => s.languagePickerOpen);
  const setLanguagePickerOpen = useAppStore((s) => s.setLanguagePickerOpen);
  const selectTypingInputMethod = useAppStore((s) => s.selectTypingInputMethod);
  const loadInputMethods = useAppStore((s) => s.loadInputMethods);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const { ref, height } = useContainerSize<HTMLDivElement>();
  const { t } = useTranslation();
  const shiftActive = isShiftActive(physicalKeyState, stickyModifiers);
  const fnActive = isFnActive(stickyModifiers);
  const activeModifiers = stickyModifiers.filter((m) => m !== "capslock" && m !== "fn");
  const followWindowsLayout = (settings.onscreenLayout ?? "auto") === "auto";
  const effectiveLayout = resolveOnscreenLayout(
    settings.onscreenLayout,
    keyboardLayout,
    settings.typingLanguage,
  );
  const rows = getLayoutRows(
    effectiveLayout,
    settings.typingLanguage,
    followWindowsLayout ? layoutKeyLabels : undefined,
  );
  const { keyHeight, spacing } = computeKeyMetrics(height, rows.length);
  const fontSize = settings.keyboardFontSize ?? 18;

  const clearModifiersAfterKey = (usedFn: boolean) => {
    if (settings.fnKeyMode === "latched") {
      if (activeModifiers.length) clearStickyExceptFn();
      return;
    }
    if (activeModifiers.length || usedFn) clearSticky();
  };

  const openLanguagePicker = async () => {
    await loadInputMethods();
    setLanguagePickerOpen(!languagePickerOpen);
  };

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
      await openLanguagePicker();
      await pollError();
      return;
    }

    if (languagePickerOpen) {
      setLanguagePickerOpen(false);
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
      await recordTypedWord();
      setTypedBuffer("");
      await invoke("cmd_press_key", {
        request: { key: "enter", modifiers: [...activeModifiers] },
      });
      clearModifiersAfterKey(false);
      await loadSuggestions();
      await pollError();
      return;
    }

    if (key === "space") {
      await recordTypedWord();
      appendTyped(" ");
      await invoke("cmd_press_key", {
        request: { key: "space", modifiers: [...activeModifiers] },
      });
      clearModifiersAfterKey(false);
      await loadSuggestions();
      await pollError();
      return;
    }

    const usedFn = fnActive && isFnMappedKey(keyDef.key);
    const typingLocale = settings.typingLanguage || "en";
    const output = resolveKeyOutput(
      keyDef,
      physicalKeyState.capsLock,
      shiftActive,
      fnActive,
      typingLocale,
    );
    if (output.length === 1) appendTyped(output);
    await invoke("cmd_press_key", {
      request: { key: output, modifiers: [...activeModifiers] },
    });
    clearModifiersAfterKey(usedFn);
    await loadSuggestions();
    await pollError();
  };

  return (
    <div
      ref={ref}
      className="relative flex h-full w-full flex-col rounded-xl p-2"
      style={{
        backgroundColor: settings.keyboardBgColor ?? "#e8edf2",
        opacity: settings.opacity,
      }}
    >
      {rows.map((row, ri) => (
        <div key={ri} className="flex w-full">
          {row.map((k, ci) => {
            const isLang = k.key === "langswitch";
            if (!isLang) {
              return (
                <KeyButton
                  key={`${ri}-${k.key}-${k.label}-${ci}`}
                  label={displayLabel(
                    k,
                    physicalKeyState.capsLock,
                    shiftActive,
                    fnActive,
                    settings.typingLanguage || "en",
                  )}
                  width={k.width}
                  size={keyHeight}
                  spacing={spacing}
                  fontSize={fontSize}
                  bgColor={settings.keyboardKeyColor ?? "#ffffff"}
                  textColor={settings.keyTextColor ?? "#1e293b"}
                  stretch
                  active={isKeyActive(k, ri, ci, physicalKeyState, stickyModifiers)}
                  onPress={() => handleKey(k)}
                />
              );
            }
            return (
              <div
                key={`${ri}-${k.key}-${k.label}-${ci}`}
                className="relative flex"
                style={{
                  flex: `${k.width ?? 1} 1 0`,
                  minWidth: 0,
                  height: keyHeight,
                  marginRight: spacing,
                  marginBottom: spacing,
                }}
              >
                {languagePickerOpen ? (
                  <LanguagePicker
                    methods={inputMethods}
                    activeHkl={physicalKeyState.systemHkl}
                    onscreenLayout={(settings.onscreenLayout ?? "auto") as OnscreenLayout}
                    onSelectLanguage={(method) => {
                      void selectTypingInputMethod(method);
                    }}
                    onSelectLayout={(layout) => {
                      void updateSettings({ onscreenLayout: layout });
                      setLanguagePickerOpen(false);
                    }}
                    onClose={() => setLanguagePickerOpen(false)}
                    fontSize={fontSize}
                    textColor={settings.keyTextColor ?? "#1e293b"}
                    bgColor={settings.keyboardKeyColor ?? "#ffffff"}
                    mutedColor="#94a3b8"
                    languageSectionLabel={t("typingLanguage")}
                    layoutSectionLabel={t("onscreenLayout")}
                    autoLayoutLabel={t("onscreenLayoutAuto")}
                  />
                ) : null}
                <div className="flex h-full w-full">
                  <KeyButton
                    label={
                      <LanguageSwitchLabel
                        currentLanguage={settings.typingLanguage}
                        fontSize={fontSize}
                      />
                    }
                    width={1}
                    size={keyHeight}
                    spacing={0}
                    fontSize={fontSize}
                    bgColor={settings.keyboardKeyColor ?? "#ffffff"}
                    textColor={settings.keyTextColor ?? "#1e293b"}
                    stretch
                    active={languagePickerOpen}
                    onPress={() => handleKey(k)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
