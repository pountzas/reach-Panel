import type { CSSProperties } from "react";
import { useState } from "react";
import { useTranslation } from "../../hooks/useTranslation";
import {
  createCaregiverPack,
  parseWordListLines,
} from "../../lib/language";
import type { LanguageAgeBand, LanguagePack, LessonLanguage } from "../../lib/language/types";

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
  const [title, setTitle] = useState("");
  const [wordsText, setWordsText] = useState("");
  const [emptyError, setEmptyError] = useState(false);

  const fieldStyle: CSSProperties = {
    borderColor: surface.panelBorder,
    backgroundColor: surface.panelBg,
    color: surface.panelText,
  };

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
          style={fieldStyle}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          autoFocus
        />
      </label>
      <label className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 text-xs" style={{ color: surface.panelMutedText }}>
        <span>{t("languageNewListWords")}</span>
        <textarea
          className="min-h-[8rem] w-full flex-1 resize-none rounded-md border px-2 py-1.5 text-sm"
          style={fieldStyle}
          value={wordsText}
          onChange={(event) => {
            setWordsText(event.target.value);
            setEmptyError(false);
          }}
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
