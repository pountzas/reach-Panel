import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "../../hooks/useTranslation";
import {
  greekComposeEnabled,
  processCharacterInput,
} from "../../lib/keyboardCharacterInput";
import { applyGreekLayoutTranslation } from "../../lib/layoutKeyTranslation";
import {
  createCaregiverPack,
  parseWordListLines,
} from "../../lib/language";
import type { GreekPendingAccent } from "../../lib/language/greekCompose";
import type { LanguageAgeBand, LanguagePack, LessonLanguage } from "../../lib/language/types";
import { useAppStore } from "../../stores/appStore";

export function NewLanguageListForm({
  lessonLanguage,
  ageBand,
  surface,
  onSave,
  onCancel,
}: {
  lessonLanguage: LessonLanguage;
  ageBand: LanguageAgeBand;
  surface: {
    panelBorder: string;
    panelBg: string;
    panelText: string;
    panelMutedText: string;
  };
  onSave: (pack: LanguagePack) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings);
  const keyboardLayout = useAppStore((s) => s.keyboardLayout);
  const authoringField = useAppStore((s) => s.languageListAuthoringField);
  const setLanguageListAuthoringActive = useAppStore((s) => s.setLanguageListAuthoringActive);
  const setLanguageListAuthoringField = useAppStore((s) => s.setLanguageListAuthoringField);
  const registerLanguageListAuthoringHandlers = useAppStore(
    (s) => s.registerLanguageListAuthoringHandlers,
  );
  const [title, setTitle] = useState("");
  const [wordsText, setWordsText] = useState("");
  const [emptyError, setEmptyError] = useState(false);
  const greekPendingRef = useRef<GreekPendingAccent | null>(null);

  const fieldStyle = (focused: boolean): CSSProperties => ({
    borderColor: focused ? surface.panelText : surface.panelBorder,
    backgroundColor: surface.panelBg,
    color: surface.panelText,
    outline: focused ? `2px solid ${surface.panelText}` : undefined,
    outlineOffset: focused ? 2 : undefined,
  });

  const greekContext = {
    typingLanguage: settings.typingLanguage,
    keyboardLayout,
    onscreenLayout: settings.onscreenLayout,
    languageLessonActive: true as const,
    lessonLanguage,
  };

  const applyToField = useCallback(
    (
      field: "title" | "words",
      updater: (
        current: string,
        pending: GreekPendingAccent | null,
      ) => { buffer: string; pending: GreekPendingAccent | null },
    ) => {
      if (field === "title") {
        setTitle((current) => {
          const next = updater(current, greekPendingRef.current);
          greekPendingRef.current = next.pending;
          return next.buffer;
        });
        return;
      }
      setWordsText((current) => {
        const next = updater(current, greekPendingRef.current);
        greekPendingRef.current = next.pending;
        return next.buffer;
      });
    },
    [],
  );

  useEffect(() => {
    setLanguageListAuthoringActive(true);
    return () => {
      registerLanguageListAuthoringHandlers(null);
      setLanguageListAuthoringActive(false);
    };
  }, [registerLanguageListAuthoringHandlers, setLanguageListAuthoringActive]);

  useEffect(() => {
    const greek = greekComposeEnabled(greekContext);

    registerLanguageListAuthoringHandlers({
      keyInput: (ch, options) => {
        const field = useAppStore.getState().languageListAuthoringField;
        applyToField(field, (current, pending) => {
          const result = processCharacterInput(current, pending, ch, {
            physicalKey: options?.physicalKey,
            greekCompose: greek,
          });
          return { buffer: result.buffer, pending: result.pendingAccent };
        });
      },
      backspace: () => {
        const field = useAppStore.getState().languageListAuthoringField;
        applyToField(field, (current, pending) => {
          if (pending) {
            return { buffer: current, pending: null };
          }
          return { buffer: current.slice(0, -1), pending: null };
        });
      },
      enter: () => {
        const field = useAppStore.getState().languageListAuthoringField;
        if (field === "title") {
          setLanguageListAuthoringField("words");
          greekPendingRef.current = null;
          return;
        }
        applyToField("words", (current) => ({
          buffer: `${current}\n`,
          pending: null,
        }));
      },
      layoutTranslation: (translation, options) => {
        const field = useAppStore.getState().languageListAuthoringField;
        applyToField(field, (current, pending) => {
          const result = applyGreekLayoutTranslation(current, pending, translation, {
            physicalKey: options.physicalKey,
            shift: options.shift,
            fallbackOutput: options.fallbackOutput,
            greekCompose: greek,
          });
          return { buffer: result.buffer, pending: result.pending };
        });
      },
    });
  }, [
    applyToField,
    greekContext.keyboardLayout,
    greekContext.onscreenLayout,
    greekContext.typingLanguage,
    lessonLanguage,
    registerLanguageListAuthoringHandlers,
    setLanguageListAuthoringField,
  ]);

  const saveList = () => {
    const pack = createCaregiverPack({
      title,
      words: parseWordListLines(wordsText),
      lessonLanguage,
      ageBand,
    });
    if (!pack) {
      setEmptyError(true);
      return;
    }
    onSave(pack);
  };

  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        saveList();
      }}
    >
      <label className="flex min-w-0 flex-col gap-1 text-xs" style={{ color: surface.panelMutedText }}>
        <span>{t("languageNewListTitle")}</span>
        <input
          className="w-full rounded-md border px-2 py-1.5 text-sm"
          style={fieldStyle(authoringField === "title")}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onFocus={() => setLanguageListAuthoringField("title")}
          readOnly
          aria-readonly="true"
        />
      </label>
      <label className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 text-xs" style={{ color: surface.panelMutedText }}>
        <span>{t("languageNewListWords")}</span>
        <textarea
          className="min-h-[8rem] w-full flex-1 resize-none rounded-md border px-2 py-1.5 text-sm"
          style={fieldStyle(authoringField === "words")}
          value={wordsText}
          onChange={(event) => {
            setWordsText(event.target.value);
            setEmptyError(false);
          }}
          onFocus={() => setLanguageListAuthoringField("words")}
          readOnly
          aria-readonly="true"
        />
      </label>
      {emptyError ? (
        <p className="text-sm text-red-600">{t("languageNewListEmpty")}</p>
      ) : null}
      <div className="flex shrink-0 gap-2">
        <button
          type="submit"
          className="rounded-md border px-3 py-2 text-sm font-semibold"
          style={{
            borderColor: surface.panelBorder,
            backgroundColor: surface.panelBg,
            color: surface.panelText,
          }}
        >
          {t("languageNewListSave")}
        </button>
        <button
          type="button"
          className="rounded-md border px-3 py-2 text-sm"
          style={{
            borderColor: surface.panelBorder,
            backgroundColor: surface.panelBg,
            color: surface.panelText,
          }}
          onClick={onCancel}
        >
          {t("languageNewListCancel")}
        </button>
      </div>
    </form>
  );
}
