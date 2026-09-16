import type { KeyDef } from "../../lib/keyboardLayouts";
import { greekTranslateFallback } from "../../lib/layoutKeyTranslation";
import type { FnKeyMode } from "../../lib/types";

type GreekTranslateOptions = {
  physicalKey: string | undefined;
  shift: boolean;
  fallbackOutput: string | undefined;
};

type HandleKeyOptions = {
  deferSuggestions?: boolean;
};

export const clearModifiersAfterKey = (
  fnKeyMode: FnKeyMode,
  activeModifiers: readonly string[],
  usedFn: boolean,
  clearStickyExceptFn: () => void,
  clearSticky: () => void,
): void => {
  if (fnKeyMode === "latched") {
    if (activeModifiers.length) clearStickyExceptFn();
    return;
  }
  if (activeModifiers.length || usedFn) clearSticky();
};

export const greekTranslateOptions = (
  keyDef: KeyDef,
  capsLock: boolean,
  shiftActive: boolean,
  fnActive: boolean,
  typingLocale: string,
): GreekTranslateOptions => {
  return {
    physicalKey: keyDef.physicalKey,
    shift: shiftActive,
    fallbackOutput: greekTranslateFallback(
      keyDef,
      capsLock,
      shiftActive,
      fnActive,
      typingLocale,
    ),
  };
};

export const inject = (
  handleKey: (
    keyDef: KeyDef,
    options?: HandleKeyOptions,
  ) => void | Promise<void>,
  keyDef: KeyDef,
): () => void | Promise<void> => {
  return () => handleKey(keyDef, { deferSuggestions: true });
};

export const openLanguagePicker = async (
  loadInputMethods: () => Promise<void>,
  languagePickerOpen: boolean,
  setLanguagePickerOpen: (open: boolean) => void,
): Promise<void> => {
  await loadInputMethods();
  setLanguagePickerOpen(!languagePickerOpen);
};
