import type { PdfAnnotationDoc } from "../../lib/teaching";
import { isFreeWriteCaptureActive } from "../../lib/teaching";
import { isLanguageLessonSpellingActive } from "../../lib/language";
import type { FreeWriteFocus } from "../../lib/teaching/isFreeWriteCaptureActive";
import type { AppSettings } from "../../lib/types";
import {
  freeWriteModeFromState,
  languageLessonModeFromState,
} from "./teachingVisibility";

export type TeachingSuggestionState = {
  languageInputBuffer: string;
  freeWriteFocus: FreeWriteFocus;
  freeWriteSelectedTextId: string | null;
  freeWriteAnnotationDoc: PdfAnnotationDoc;
  settings: AppSettings;
  musicTeachingEnabled: boolean;
  teachingLesson: "music" | "math" | "language";
  languageSubjectTab: "spelling" | "freeWrite";
  languageLessonPlaying: boolean;
  languageListAuthoringActive: boolean;
};

/** Body of the selected Free write PDF text box, or empty when none. */
export function selectedPdfTextBoxBody(
  doc: PdfAnnotationDoc,
  textId: string | null,
): string {
  if (!textId) return "";
  for (const page of Object.values(doc.pages)) {
    const box = page.texts.find((t) => t.id === textId);
    if (box) return box.body;
  }
  return "";
}

/**
 * Active Teaching text that should drive `typedBuffer` / `loadSuggestions`,
 * or `null` when Teaching capture is not the suggestion source.
 */
export function teachingSuggestionSourceText(
  state: TeachingSuggestionState,
): string | null {
  if (isFreeWriteCaptureActive(freeWriteModeFromState(state))) {
    if (state.freeWriteFocus === "pdfText") {
      return selectedPdfTextBoxBody(
        state.freeWriteAnnotationDoc,
        state.freeWriteSelectedTextId,
      );
    }
    return state.settings.freeWriteNotepadText ?? "";
  }
  if (isLanguageLessonSpellingActive(languageLessonModeFromState(state))) {
    return state.languageInputBuffer;
  }
  return null;
}

/**
 * Copy the active Teaching target into `typedBuffer` and refresh chips.
 * Does not clear Greek compose state (unlike `setTypedBuffer`).
 */
export function syncTeachingSuggestions(args: {
  get: () => TeachingSuggestionState & {
    loadSuggestions: () => Promise<void> | void;
  };
  set: (partial: { typedBuffer: string }) => void;
  /** Prefer an explicit buffer when the caller just computed it. */
  buffer?: string;
}): void {
  const source = args.buffer ?? teachingSuggestionSourceText(args.get());
  if (source === null) return;
  args.set({ typedBuffer: source });
  void args.get().loadSuggestions();
}
