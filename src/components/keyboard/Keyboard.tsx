import { useCallback, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useShallow } from "zustand/react/shallow";
import { isTeachingSessionActive } from "../../lib/appModeLayout";
import { isLanguageLessonCaptureActive } from "../../lib/language";
import { isFreeWriteCaptureActive } from "../../lib/teaching";
import { isDictationKeyVisible } from "../../lib/teachingInputHelpers";
import { useAppStore } from "../../stores/appStore";
import {
  displayLabel,
  getLayoutRows,
  isKeyActive,
  isSpecialLabeledKey,
  KeyDef,
  resolveOnscreenLayout,
} from "../../lib/keyboardLayouts";
import { greekComposeEnabled } from "../../lib/keyboardCharacterInput";
import type { LayoutKeyTranslation } from "../../lib/layoutKeyTranslation";
import {
  createSerialCoalesceGate,
  type SerialCoalesceGate,
} from "../../lib/keyRepeat";
import { KeyboardKey } from "./KeyboardKey";
import { SpecialKeyLabel, specialKeyAriaLabel } from "./SpecialKeyLabel";
import { LanguagePicker } from "./LanguagePicker";
import { LanguageSwitchLabel } from "./LanguageSwitchLabel";
import { MicrophoneIcon } from "../common/SectionIcons";
import { useContainerSize } from "../../hooks/useContainerSize";
import { useGroqDailyQuota } from "../../hooks/useGroqDailyQuota";
import { useTranslation } from "../../hooks/useTranslation";
import { computeKeyMetrics } from "../../lib/keyMetrics";
import { effectiveKeyboardFontSize } from "../../lib/keyboardFontSize";
import { isTransparentUiActive, transparentKeyPalette } from "../../lib/focusMode";
import type { AppSettings } from "../../lib/types";
import { inject } from "./keyboardUtils";
import { useStickyModifiers } from "../../hooks/useStickyModifiers";
import { useKeyboardKeyPress } from "./useKeyboardKeyPress";
import type { KeyRepeatFireMeta } from "../../hooks/useKeyRepeat";

export function Keyboard() {
  const settingsSlice = useAppStore(
    useShallow((s) => ({
      typingLanguage: s.settings.typingLanguage,
      keyboardSectionMode: s.settings.keyboardSectionMode,
      keyboardFontSize: s.settings.keyboardFontSize,
      keyboardKeyColor: s.settings.keyboardKeyColor,
      keyTextColor: s.settings.keyTextColor,
      transparentKeyColor: s.settings.transparentKeyColor,
      keyboardBgColor: s.settings.keyboardBgColor,
      opacity: s.settings.opacity,
      groqApiKey: s.settings.groqApiKey,
      languageLessonLanguage: s.settings.languageLessonLanguage,
      dictationVisible: s.settings.dictationVisible,
      showTeachingInputHelpers: s.settings.showTeachingInputHelpers,
      focusModeTransparent: s.settings.focusModeTransparent,
      fnKeyMode: s.settings.fnKeyMode,
    })),
  );
  // Helpers still typed as AppSettings; slice lists every field they read.
  const settings = settingsSlice as AppSettings;
  const focusModeActive = useAppStore((s) => s.focusModeActive);
  const keyboardLayout = useAppStore((s) => s.keyboardLayout);
  const {
    stickyModifiers,
    physicalKeyState,
    shiftActive,
    fnActive,
    activeModifiers,
    toggleSticky,
    clearSticky,
    clearStickyExceptFn,
  } = useStickyModifiers();
  const pollKeyboardState = useAppStore((s) => s.pollKeyboardState);
  const typeCharacter = useAppStore((s) => s.typeCharacter);
  const backspaceTyped = useAppStore((s) => s.backspaceTyped);
  const setTypedBuffer = useAppStore((s) => s.setTypedBuffer);
  const loadSuggestions = useAppStore((s) => s.loadSuggestions);
  const recordTypedWord = useAppStore((s) => s.recordTypedWord);
  const inputMethods = useAppStore((s) => s.inputMethods);
  const layoutKeyLabels = useAppStore((s) => s.layoutKeyLabels);
  const languagePickerOpen = useAppStore((s) => s.languagePickerOpen);
  const setLanguagePickerOpen = useAppStore((s) => s.setLanguagePickerOpen);
  const selectTypingInputMethod = useAppStore((s) => s.selectTypingInputMethod);
  const loadInputMethods = useAppStore((s) => s.loadInputMethods);
  const dictationState = useAppStore((s) => s.dictationState);
  const toggleDictation = useAppStore((s) => s.toggleDictation);
  const sttCapability = useAppStore((s) => s.sttCapability);
  const refreshSttCapability = useAppStore((s) => s.refreshSttCapability);
  const applyTypedLayoutTranslation = useAppStore((s) => s.applyTypedLayoutTranslation);
  const applyLanguageLayoutTranslation = useAppStore(
    (s) => s.applyLanguageLayoutTranslation,
  );
  const languageKeyInput = useAppStore((s) => s.languageKeyInput);
  const languageBackspace = useAppStore((s) => s.languageBackspace);
  const checkLanguageAnswer = useAppStore((s) => s.checkLanguageAnswer);
  const languageLessonPlaying = useAppStore((s) => s.languageLessonPlaying);
  const languageListAuthoringActive = useAppStore((s) => s.languageListAuthoringActive);
  const languageListAuthoringHandlers = useAppStore((s) => s.languageListAuthoringHandlers);
  const languageSubjectTab = useAppStore((s) => s.languageSubjectTab);
  const freeWriteFocus = useAppStore((s) => s.freeWriteFocus);
  const freeWriteNotepadInput = useAppStore((s) => s.freeWriteNotepadInput);
  const freeWriteNotepadBackspace = useAppStore((s) => s.freeWriteNotepadBackspace);
  const applyFreeWriteLayoutTranslation = useAppStore((s) => s.applyFreeWriteLayoutTranslation);
  const musicTeachingEnabled = useAppStore((s) => s.musicTeachingEnabled);
  const teachingLesson = useAppStore((s) => s.teachingLesson);

  const { ref, height } = useContainerSize<HTMLDivElement>();
  const langKeyAnchorRef = useRef<HTMLDivElement>(null);
  /** Serialize Backspace hold ticks so cmd_press_key does not overlap. */
  const backspaceInjectGate = useRef<SerialCoalesceGate>(
    createSerialCoalesceGate(),
  ).current;
  const { t } = useTranslation();
  const effectiveLayout = resolveOnscreenLayout(
    keyboardLayout,
    settings.typingLanguage,
  );
  const baseRows = getLayoutRows(
    effectiveLayout,
    settings.typingLanguage,
    layoutKeyLabels,
  );
  const teachingSessionActive = isTeachingSessionActive(
    musicTeachingEnabled,
    settings.keyboardSectionMode,
  );
  const dictationKeyVisible = isDictationKeyVisible(
    settings,
    teachingSessionActive,
  );
  const rows = useMemo<KeyDef[][]>(() => {
    if (dictationKeyVisible) return baseRows;
    return baseRows.map((row) => row.filter((k) => k.key !== "dictate"));
  }, [baseRows, dictationKeyVisible]);
  const { keyHeight, spacing } = computeKeyMetrics(height, rows.length);
  const fontSize = effectiveKeyboardFontSize(
    settings.keyboardFontSize,
    keyHeight,
  );
  const typingLocale = settings.typingLanguage || "en";
  const languageLessonMode = {
    musicTeachingEnabled,
    teachingLesson,
    settings,
    languageLessonPlaying,
    languageListAuthoringActive,
    languageSubjectTab,
  };
  const freeWriteMode = {
    musicTeachingEnabled,
    teachingLesson,
    settings,
    languageSubjectTab,
    freeWriteFocus,
  };
  const freeWriteCaptureActive = isFreeWriteCaptureActive(freeWriteMode);
  const freeWritePdfFocus =
    musicTeachingEnabled &&
    settings.keyboardSectionMode === "synthesizer" &&
    teachingLesson === "language" &&
    languageSubjectTab === "freeWrite" &&
    freeWriteFocus === "pdf";
  const greekKeyboardActive = greekComposeEnabled({
    typingLanguage: settings.typingLanguage,
    keyboardLayout,
    languageLessonActive: isLanguageLessonCaptureActive(languageLessonMode),
    lessonLanguage: settings.languageLessonLanguage,
  });
  const greekFreeWriteActive = greekComposeEnabled({
    typingLanguage: settings.typingLanguage,
    keyboardLayout,
    languageLessonActive: freeWriteCaptureActive,
  });
  const transparent = isTransparentUiActive(settings, focusModeActive);
  const transparentPalette = transparentKeyPalette(settings.transparentKeyColor);
  const keyTextColor = transparent
    ? transparentPalette.text
    : (settings.keyTextColor ?? "#1e293b");

  const listening = dictationState === "listening" || dictationState === "processing";
  const canDictate = sttCapability?.canDictate ?? false;
  // Never disable while a session is active — stop must always be clickable.
  const dictateDisabled = !listening && !canDictate;
  const groqRemainingPercent = useGroqDailyQuota(sttCapability?.engine);

  useEffect((): void => {
    void refreshSttCapability();
  }, [refreshSttCapability, settings.typingLanguage, settings.groqApiKey]);

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

  const translateLayoutKey = async (physicalKey: string): Promise<LayoutKeyTranslation> =>
    invoke<LayoutKeyTranslation>("cmd_translate_layout_key", {
      physicalKey,
      shift: shiftActive,
      capsLock: physicalKeyState.capsLock,
      hkl: physicalKeyState.systemHkl || null,
    });

  const handleKey = useKeyboardKeyPress({
    pollKeyboardState,
    loadInputMethods,
    languagePickerOpen,
    setLanguagePickerOpen,
    dictateDisabled,
    toggleDictation,
    languageLessonMode,
    languageListAuthoringHandlers,
    languageListAuthoringActive,
    languageBackspace,
    greekKeyboardActive,
    physicalKeyState,
    fnActive,
    translateLayoutKey,
    applyLanguageLayoutTranslation,
    settings,
    activeModifiers,
    clearStickyExceptFn,
    clearSticky,
    languageKeyInput,
    freeWriteCaptureActive,
    freeWriteNotepadBackspace,
    greekFreeWriteActive,
    freeWriteNotepadInput,
    applyFreeWriteLayoutTranslation,
    freeWritePdfFocus,
    toggleSticky,
    backspaceTyped,
    loadSuggestions,
    recordTypedWord,
    setTypedBuffer,
    typeCharacter,
    applyTypedLayoutTranslation,
    shiftActive,
    typingLocale,
    checkLanguageAnswer,
  });

  const keyDefsByIdRef = useRef(new Map<string, KeyDef>());
  const keyDefsById = new Map<string, KeyDef>();
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri]!;
    for (let ci = 0; ci < row.length; ci++) {
      const k = row[ci]!;
      keyDefsById.set(`${ri}-${k.key}-${ci}`, k);
    }
  }
  keyDefsByIdRef.current = keyDefsById;

  const handleKeyRef = useRef(handleKey);
  handleKeyRef.current = handleKey;

  const onPressKey = useCallback(
    (keyId: string, meta?: KeyRepeatFireMeta) => {
      const keyDef = keyDefsByIdRef.current.get(keyId);
      if (!keyDef) return;
      if (keyDef.key === "backspace") {
        const runInject = inject(
          (kd, opts) => handleKeyRef.current(kd, opts),
          keyDef,
        );
        if (meta?.repeat) {
          backspaceInjectGate.coalesce(runInject);
        } else {
          backspaceInjectGate.enqueue(runInject);
        }
        return;
      }
      void handleKeyRef.current(keyDef);
    },
    [backspaceInjectGate],
  );

  const onHoldEndKey = useCallback(
    (keyId: string) => {
      const keyDef = keyDefsByIdRef.current.get(keyId);
      if (keyDef?.key !== "backspace") return;
      void backspaceInjectGate.whenIdle().then(() => loadSuggestions());
    },
    [backspaceInjectGate, loadSuggestions],
  );

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
  const keyBgColor = settings.keyboardKeyColor ?? "#ffffff";

  return (
    <div
      ref={ref}
      className={`relative flex h-full w-full flex-col rounded-xl px-2 pb-2 ${focusModeActive ? "pt-0" : "pt-2"}`}
      style={{
        backgroundColor: transparent
          ? "transparent"
          : (settings.keyboardBgColor ?? "#e8edf2"),
        opacity: transparent ? 1 : settings.opacity,
      }}
    >
      {rows.map((row, ri) => (
        <div key={ri} className="flex w-full">
          {row.map((k, ci) => {
            const keyId = `${ri}-${k.key}-${ci}`;
            const isLang = k.key === "langswitch";
            const isDictate = k.key === "dictate";
            if (isDictate) {
              return (
                <KeyboardKey
                  key={keyId}
                  keyId={keyId}
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
                  onPressKey={onPressKey}
                />
              );
            }
            if (!isLang) {
              const specialKey = isSpecialLabeledKey(k.key);
              const isBackspace = k.key === "backspace";
              return (
                <KeyboardKey
                  key={keyId}
                  keyId={keyId}
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
                  bgColor={keyBgColor}
                  textColor={keyTextColor}
                  stretch
                  transparent={transparent}
                  outlineColor={settings.transparentKeyColor}
                  active={isKeyActive(k, ri, ci, physicalKeyState, stickyModifiers)}
                  repeatOnHold={isBackspace}
                  onHoldEndKey={isBackspace ? onHoldEndKey : undefined}
                  onPressKey={onPressKey}
                />
              );
            }
            return (
              <div
                key={keyId}
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
                    onSelectLanguage={(method) => {
                      void selectTypingInputMethod(method);
                    }}
                    onClose={() => setLanguagePickerOpen(false)}
                    fontSize={fontSize}
                    textColor={keyTextColor}
                    bgColor={keyBgColor}
                    mutedColor="#94a3b8"
                    languageSectionLabel={t("typingLanguage")}
                  />
                ) : null}
                <div className="flex h-full w-full">
                  <KeyboardKey
                    keyId={keyId}
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
                    bgColor={keyBgColor}
                    textColor={keyTextColor}
                    stretch
                    transparent={transparent}
                    outlineColor={settings.transparentKeyColor}
                    active={languagePickerOpen}
                    onPressKey={onPressKey}
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
