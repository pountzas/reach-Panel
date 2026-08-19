import { useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../stores/appStore";
import {
  displayLabel,
  getLayoutRows,
  isFnActive,
  isFnMappedKey,
  isKeyActive,
  isShiftActive,
  isSpecialLabeledKey,
  KeyDef,
  resolveKeyOutput,
  resolveOnscreenLayout,
} from "../../lib/keyboardLayouts";
import { KeyButton } from "./KeyButton";
import { SpecialKeyLabel, specialKeyAriaLabel } from "./SpecialKeyLabel";
import { LanguagePicker } from "./LanguagePicker";
import { LanguageSwitchLabel } from "./LanguageSwitchLabel";
import { DictationVisualizer } from "./DictationVisualizer";
import { MicrophoneIcon } from "../common/SectionIcons";
import { useContainerSize } from "../../hooks/useContainerSize";
import { useGroqDailyQuota } from "../../hooks/useGroqDailyQuota";
import { useTranslation } from "../../hooks/useTranslation";
import { computeKeyMetrics } from "../../lib/keyMetrics";
import { isTransparentUiActive, transparentKeyPalette } from "../../lib/miniMode";
import type { OnscreenLayout } from "../../lib/types";

export function Keyboard() {
  const settings = useAppStore((s) => s.settings);
  const miniModeActive = useAppStore((s) => s.miniModeActive);
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
  const dictationState = useAppStore((s) => s.dictationState);
  const toggleDictation = useAppStore((s) => s.toggleDictation);
  const stopDictation = useAppStore((s) => s.stopDictation);
  const sttCapability = useAppStore((s) => s.sttCapability);
  const refreshSttCapability = useAppStore((s) => s.refreshSttCapability);

  const { ref, height } = useContainerSize<HTMLDivElement>();
  const langKeyAnchorRef = useRef<HTMLDivElement>(null);
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
  const baseRows = getLayoutRows(
    effectiveLayout,
    settings.typingLanguage,
    followWindowsLayout ? layoutKeyLabels : undefined,
  );
  const rows = useMemo(() => {
    if (settings.dictationVisible) return baseRows;
    return baseRows.map((row) => row.filter((k) => k.key !== "dictate"));
  }, [baseRows, settings.dictationVisible]);
  const { keyHeight, spacing } = computeKeyMetrics(height, rows.length);
  const fontSize = settings.keyboardFontSize ?? 18;
  const typingLocale = settings.typingLanguage || "en";
  const transparent = isTransparentUiActive(settings, miniModeActive);
  const transparentPalette = transparentKeyPalette(settings.transparentKeyColor);
  const keyTextColor = transparent
    ? transparentPalette.text
    : (settings.keyTextColor ?? "#1e293b");

  const listening = dictationState === "listening" || dictationState === "processing";
  const canDictate = sttCapability?.canDictate ?? false;
  // Never disable while a session is active — stop must always be clickable.
  const dictateDisabled = !listening && !canDictate;
  const captureAudio = sttCapability?.engine !== "groq";
  const groqRemainingPercent = useGroqDailyQuota(sttCapability?.engine);

  useEffect(() => {
    void refreshSttCapability();
  }, [refreshSttCapability, settings.typingLanguage, settings.groqApiKey]);

  useEffect(() => {
    if (!settings.dictationVisible && dictationState !== "idle") {
      void stopDictation();
    }
  }, [settings.dictationVisible, dictationState, stopDictation]);

  let dictateAriaLabel = listening ? t("dictationStop") : t("dictationStart");
  if (dictateDisabled) {
    if (!sttCapability?.online) {
      dictateAriaLabel = t("dictationUnavailableOffline");
    } else if (sttCapability && !sttCapability.winrtSupported) {
      dictateAriaLabel = t("dictationUnavailableUnsupported");
    } else {
      dictateAriaLabel = t("dictationUnavailableOffline");
    }
  } else if (groqRemainingPercent !== null) {
    dictateAriaLabel = `${dictateAriaLabel}. ${t("dictationGroqRemainingToday")} ${groqRemainingPercent}%`;
  }

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

    if (key === "dictate") {
      if (!dictateDisabled) {
        await toggleDictation();
      }
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

  const dictateBgColor = transparent
    ? settings.keyboardKeyColor ?? "#ffffff"
    : listening
      ? "#dc2626"
      : dictateDisabled
        ? "#f1f5f9"
        : (settings.keyboardKeyColor ?? "#ffffff");
  const dictateTextColor = listening
    ? "#ffffff"
    : dictateDisabled
      ? "#94a3b8"
      : "#2563eb";

  return (
    <div
      ref={ref}
      className={`relative flex h-full w-full flex-col rounded-xl px-2 pb-2 ${miniModeActive ? "pt-1" : "pt-2"}`}
      style={{
        backgroundColor: transparent
          ? "transparent"
          : (settings.keyboardBgColor ?? "#e8edf2"),
        opacity: transparent ? 1 : settings.opacity,
      }}
    >
      {listening ? (
        <div className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2">
          <DictationVisualizer active={listening} captureAudio={captureAudio} />
        </div>
      ) : null}
      {rows.map((row, ri) => (
        <div key={ri} className="flex w-full">
          {row.map((k, ci) => {
            const isLang = k.key === "langswitch";
            const isDictate = k.key === "dictate";
            if (isDictate) {
              return (
                <KeyButton
                  key={`${ri}-${k.key}-${k.label}-${ci}`}
                  label={
                    <span className="relative flex h-full w-full items-center justify-center">
                      <MicrophoneIcon className="absolute h-5 w-5" />
                      {groqRemainingPercent !== null ? (
                        <span
                          className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 text-[9px] font-semibold leading-none tabular-nums"
                          aria-hidden
                        >
                          {groqRemainingPercent}%
                        </span>
                      ) : null}
                    </span>
                  }
                  width={k.width}
                  size={keyHeight}
                  spacing={spacing}
                  fontSize={fontSize}
                  bgColor={dictateBgColor}
                  textColor={dictateTextColor}
                  stretch
                  transparent={transparent}
                  outlineColor={settings.transparentKeyColor}
                  active={transparent ? listening : false}
                  disabled={dictateDisabled}
                  ariaLabel={dictateAriaLabel}
                  onPress={() => handleKey(k)}
                />
              );
            }
            if (!isLang) {
              const specialKey = isSpecialLabeledKey(k.key);
              return (
                <KeyButton
                  key={`${ri}-${k.key}-${k.label}-${ci}`}
                  label={
                    specialKey ? (
                      <SpecialKeyLabel keyName={k.key} fontSize={fontSize} />
                    ) : (
                      displayLabel(
                        k,
                        physicalKeyState.capsLock,
                        shiftActive,
                        fnActive,
                        typingLocale,
                      )
                    )
                  }
                  ariaLabel={specialKey ? specialKeyAriaLabel(k.key) : undefined}
                  width={k.width}
                  size={keyHeight}
                  spacing={spacing}
                  fontSize={fontSize}
                  bgColor={settings.keyboardKeyColor ?? "#ffffff"}
                  textColor={keyTextColor}
                  stretch
                  transparent={transparent}
                  outlineColor={settings.transparentKeyColor}
                  active={isKeyActive(k, ri, ci, physicalKeyState, stickyModifiers)}
                  onPress={() => handleKey(k)}
                />
              );
            }
            return (
              <div
                key={`${ri}-${k.key}-${k.label}-${ci}`}
                ref={langKeyAnchorRef}
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
                    anchorRef={langKeyAnchorRef}
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
                    textColor={keyTextColor}
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
                    textColor={keyTextColor}
                    stretch
                    transparent={transparent}
                    outlineColor={settings.transparentKeyColor}
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
