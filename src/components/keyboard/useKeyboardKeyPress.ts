import { invoke } from "@tauri-apps/api/core";
import { isLanguageLessonCaptureActive } from "../../lib/language";
import {
  isFnMappedKey,
  resolveKeyOutput,
  type KeyDef,
} from "../../lib/keyboardLayouts";
import type { LayoutKeyTranslation } from "../../lib/layoutKeyTranslation";
import { commandFailure } from "../../lib/logIpc";
import type { AppSettings, CommandResult } from "../../lib/types";
import { useAppStore } from "../../stores/appStore";
import {
  clearModifiersAfterKey,
  greekTranslateOptions,
  openLanguagePicker,
} from "./keyboardUtils";

export type KeyPressContext = {
  pollKeyboardState: () => Promise<void> | void;
  loadInputMethods: () => Promise<void>;
  languagePickerOpen: boolean;
  setLanguagePickerOpen: (open: boolean) => void;
  dictateDisabled: boolean;
  toggleDictation: () => Promise<void> | void;
  languageLessonMode: Parameters<typeof isLanguageLessonCaptureActive>[0];
  languageListAuthoringHandlers: {
    backspace: () => void;
    enter: () => void;
    keyInput: (text: string, opts?: { physicalKey?: string }) => void;
    layoutTranslation: (
      t: LayoutKeyTranslation,
      opts: ReturnType<typeof greekTranslateOptions>,
    ) => void;
  } | null;
  languageListAuthoringActive: boolean;
  languageBackspace: () => void;
  greekKeyboardActive: boolean;
  physicalKeyState: { capsLock: boolean; systemHkl: number };
  fnActive: boolean;
  translateLayoutKey: (physicalKey: string) => Promise<LayoutKeyTranslation>;
  applyLanguageLayoutTranslation: (
    t: LayoutKeyTranslation,
    opts: ReturnType<typeof greekTranslateOptions>,
  ) => void;
  settings: Pick<AppSettings, "fnKeyMode">;
  activeModifiers: string[];
  clearStickyExceptFn: () => void;
  clearSticky: () => void;
  languageKeyInput: (text: string, opts?: { physicalKey?: string }) => void;
  freeWriteCaptureActive: boolean;
  freeWriteNotepadBackspace: () => void;
  greekFreeWriteActive: boolean;
  freeWriteNotepadInput: (text: string) => void;
  applyFreeWriteLayoutTranslation: (
    t: LayoutKeyTranslation,
    opts: ReturnType<typeof greekTranslateOptions>,
  ) => void;
  freeWritePdfFocus: boolean;
  toggleSticky: (key: string) => void;
  backspaceTyped: () => void;
  loadSuggestions: () => Promise<void> | void;
  recordTypedWord: () => Promise<void> | void;
  setTypedBuffer: (v: string) => void;
  typeCharacter: (
    ch: string,
    opts?: { physicalKey?: string },
  ) => string | false | null | undefined;
  applyTypedLayoutTranslation: (
    t: LayoutKeyTranslation,
    opts: ReturnType<typeof greekTranslateOptions>,
  ) => string | false | null | undefined;
  shiftActive: boolean;
  typingLocale: string;
  checkLanguageAnswer: () => void;
};

export function useKeyboardKeyPress(ctx: KeyPressContext) {
  const setLastError = useAppStore((s) => s.setLastError);

  const reportCommandFailure = (result: CommandResult) => {
    const failure = commandFailure(result);
    if (failure) setLastError(failure);
  };

  const handleKey = async (
    keyDef: KeyDef,
    options?: { deferSuggestions?: boolean },
  ) => {
    const key = keyDef.key;
    const deferSuggestions = options?.deferSuggestions === true;

    if (key === "capslock") {
      const result = await invoke<CommandResult>("cmd_press_key", {
        request: { key: "capslock", modifiers: [] },
      });
      await ctx.pollKeyboardState();
      reportCommandFailure(result);
      return;
    }

    if (key === "langswitch") {
      await openLanguagePicker(
        () => Promise.resolve(ctx.loadInputMethods()),
        ctx.languagePickerOpen,
        ctx.setLanguagePickerOpen,
      );
      return;
    }

    if (key === "dictate") {
      if (!ctx.dictateDisabled) {
        await ctx.toggleDictation();
      }
      return;
    }

    if (ctx.languagePickerOpen) {
      ctx.setLanguagePickerOpen(false);
    }

    const languageCaptureActive = isLanguageLessonCaptureActive(
      ctx.languageLessonMode,
    );

    if (languageCaptureActive) {
      const authoringHandlers = ctx.languageListAuthoringHandlers;
      if (ctx.languageListAuthoringActive && !authoringHandlers) {
        return;
      }
      const authoring =
        ctx.languageListAuthoringActive && authoringHandlers
          ? authoringHandlers
          : null;
      if (keyDef.modifier) {
        return;
      }
      if (key === "backspace") {
        if (authoring) {
          authoring.backspace();
        } else {
          ctx.languageBackspace();
          if (ctx.greekKeyboardActive) {
            void invoke("cmd_reset_layout_compose_state", {
              hkl: ctx.physicalKeyState.systemHkl || null,
            });
          }
        }
        return;
      }
      if (key === "enter") {
        if (authoring) {
          authoring.enter();
        } else {
          ctx.checkLanguageAnswer();
        }
        return;
      }
      if (key === "space") {
        if (authoring) {
          authoring.keyInput(" ");
        }
        return;
      }
      const usedFnLang = ctx.fnActive && isFnMappedKey(keyDef.key);
      if (ctx.greekKeyboardActive && keyDef.physicalKey) {
        const translation = await ctx.translateLayoutKey(keyDef.physicalKey);
        const translateOptions = greekTranslateOptions(
          keyDef,
          ctx.physicalKeyState.capsLock,
          ctx.shiftActive,
          ctx.fnActive,
          ctx.typingLocale,
        );
        if (authoring) {
          authoring.layoutTranslation(translation, translateOptions);
        } else {
          ctx.applyLanguageLayoutTranslation(translation, translateOptions);
        }
        clearModifiersAfterKey(
          ctx.settings.fnKeyMode,
          ctx.activeModifiers,
          usedFnLang,
          ctx.clearStickyExceptFn,
          ctx.clearSticky,
        );
        return;
      }
      const langOutput = resolveKeyOutput(
        keyDef,
        ctx.physicalKeyState.capsLock,
        ctx.shiftActive,
        ctx.fnActive,
        ctx.typingLocale,
      );
      if (langOutput.length === 1 || keyDef.physicalKey) {
        if (authoring) {
          authoring.keyInput(langOutput, { physicalKey: keyDef.physicalKey });
        } else {
          ctx.languageKeyInput(langOutput, { physicalKey: keyDef.physicalKey });
        }
      }
      clearModifiersAfterKey(
        ctx.settings.fnKeyMode,
        ctx.activeModifiers,
        usedFnLang,
        ctx.clearStickyExceptFn,
        ctx.clearSticky,
      );
      return;
    }

    if (ctx.freeWriteCaptureActive) {
      if (keyDef.modifier) return;
      if (key === "backspace") {
        ctx.freeWriteNotepadBackspace();
        if (ctx.greekFreeWriteActive) {
          void invoke("cmd_reset_layout_compose_state", {
            hkl: ctx.physicalKeyState.systemHkl || null,
          });
        }
        return;
      }
      if (key === "enter") {
        ctx.freeWriteNotepadInput("\n");
        return;
      }
      if (key === "space") {
        ctx.freeWriteNotepadInput(" ");
        return;
      }
      const usedFnFw = ctx.fnActive && isFnMappedKey(keyDef.key);
      if (ctx.greekFreeWriteActive && keyDef.physicalKey) {
        const translation = await ctx.translateLayoutKey(keyDef.physicalKey);
        ctx.applyFreeWriteLayoutTranslation(
          translation,
          greekTranslateOptions(
            keyDef,
            ctx.physicalKeyState.capsLock,
            ctx.shiftActive,
            ctx.fnActive,
            ctx.typingLocale,
          ),
        );
        clearModifiersAfterKey(
          ctx.settings.fnKeyMode,
          ctx.activeModifiers,
          usedFnFw,
          ctx.clearStickyExceptFn,
          ctx.clearSticky,
        );
        return;
      }
      const fwOutput = resolveKeyOutput(
        keyDef,
        ctx.physicalKeyState.capsLock,
        ctx.shiftActive,
        ctx.fnActive,
        ctx.typingLocale,
      );
      if (fwOutput) ctx.freeWriteNotepadInput(fwOutput);
      clearModifiersAfterKey(
        ctx.settings.fnKeyMode,
        ctx.activeModifiers,
        usedFnFw,
        ctx.clearStickyExceptFn,
        ctx.clearSticky,
      );
      return;
    }

    // Free write PDF focus: do not inject externally or into notepad.
    if (ctx.freeWritePdfFocus) {
      return;
    }

    if (keyDef.modifier) {
      ctx.toggleSticky(key);
      return;
    }

    if (key === "backspace") {
      ctx.backspaceTyped();
      if (ctx.greekKeyboardActive) {
        void invoke("cmd_reset_layout_compose_state", {
          hkl: ctx.physicalKeyState.systemHkl || null,
        });
      }
      const backspaceResult = await invoke<CommandResult>("cmd_press_key", {
        request: { key: "backspace", modifiers: [] },
      });
      reportCommandFailure(backspaceResult);
      if (!deferSuggestions) {
        await ctx.loadSuggestions();
      }
      return;
    }

    if (key === "enter") {
      await ctx.recordTypedWord();
      ctx.setTypedBuffer("");
      const enterResult = await invoke<CommandResult>("cmd_press_key", {
        request: { key: "enter", modifiers: [...ctx.activeModifiers] },
      });
      reportCommandFailure(enterResult);
      clearModifiersAfterKey(
        ctx.settings.fnKeyMode,
        ctx.activeModifiers,
        false,
        ctx.clearStickyExceptFn,
        ctx.clearSticky,
      );
      await ctx.loadSuggestions();
      return;
    }

    if (key === "space") {
      await ctx.recordTypedWord();
      const inject = ctx.typeCharacter(" ");
      if (inject) {
        const spaceResult = await invoke<CommandResult>("cmd_press_key", {
          request: { key: "space", modifiers: [...ctx.activeModifiers] },
        });
        reportCommandFailure(spaceResult);
      }
      clearModifiersAfterKey(
        ctx.settings.fnKeyMode,
        ctx.activeModifiers,
        false,
        ctx.clearStickyExceptFn,
        ctx.clearSticky,
      );
      await ctx.loadSuggestions();
      return;
    }

    const usedFn = ctx.fnActive && isFnMappedKey(keyDef.key);
    if (ctx.greekKeyboardActive && keyDef.physicalKey) {
      const translation = await ctx.translateLayoutKey(keyDef.physicalKey);
      const inject = ctx.applyTypedLayoutTranslation(
        translation,
        greekTranslateOptions(
          keyDef,
          ctx.physicalKeyState.capsLock,
          ctx.shiftActive,
          ctx.fnActive,
          ctx.typingLocale,
        ),
      );
      if (inject) {
        const greekResult = await invoke<CommandResult>("cmd_press_key", {
          request: {
            key: inject,
            modifiers: [...ctx.activeModifiers],
            physicalKey: keyDef.physicalKey,
          },
        });
        reportCommandFailure(greekResult);
      }
      clearModifiersAfterKey(
        ctx.settings.fnKeyMode,
        ctx.activeModifiers,
        usedFn,
        ctx.clearStickyExceptFn,
        ctx.clearSticky,
      );
      await ctx.loadSuggestions();
      return;
    }

    const output = resolveKeyOutput(
      keyDef,
      ctx.physicalKeyState.capsLock,
      ctx.shiftActive,
      ctx.fnActive,
      ctx.typingLocale,
    );
    if (output.length === 1 || keyDef.physicalKey) {
      const inject = ctx.typeCharacter(output, {
        physicalKey: keyDef.physicalKey,
      });
      if (inject) {
        const charResult = await invoke<CommandResult>("cmd_press_key", {
          request: {
            key: inject,
            modifiers: [...ctx.activeModifiers],
            physicalKey: keyDef.physicalKey,
          },
        });
        reportCommandFailure(charResult);
      }
    } else {
      const specialResult = await invoke<CommandResult>("cmd_press_key", {
        request: { key: output, modifiers: [...ctx.activeModifiers] },
      });
      reportCommandFailure(specialResult);
    }
    clearModifiersAfterKey(
      ctx.settings.fnKeyMode,
      ctx.activeModifiers,
      usedFn,
      ctx.clearStickyExceptFn,
      ctx.clearSticky,
    );
    await ctx.loadSuggestions();
  };
  return handleKey;
}
