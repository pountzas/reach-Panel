import { useRef } from "react";
import { SuggestionsBar } from "../common/SuggestionsBar";
import { useAppStore } from "../../stores/appStore";
import { InputPreview } from "./InputPreview";

const SLOT_ANIM =
  "overflow-hidden transition-[max-width,opacity,transform,margin] duration-300 ease-out motion-reduce:transition-none";

const PREVIEW_WIDTH = 320;

export function PreviewSuggestionsRow({
  showPreview,
  showSuggestions,
}: {
  showPreview: boolean;
  showSuggestions: boolean;
}) {
  const suggestions = useAppStore((s) => s.suggestions);
  const lastSuggestionsRef = useRef<string[]>([]);
  if (suggestions.length > 0) {
    lastSuggestionsRef.current = suggestions;
  }
  const displaySuggestions =
    suggestions.length > 0 ? suggestions : lastSuggestionsRef.current;

  return (
    <div className="flex w-full min-w-0 items-center justify-center">
      <div
        data-slot="preview"
        aria-hidden={!showPreview}
        className={`${SLOT_ANIM} shrink-0 ${
          showPreview
            ? "max-w-[320px] opacity-100 translate-x-0"
            : "pointer-events-none max-w-0 opacity-0 -translate-x-2"
        }`}
        style={{ width: PREVIEW_WIDTH }}
      >
        <InputPreview />
      </div>
      <div
        data-slot="suggestions"
        aria-hidden={!showSuggestions}
        className={`${SLOT_ANIM} min-w-0 ${
          showSuggestions
            ? "max-w-[min(60vw,40rem)] opacity-100 translate-x-0"
            : "pointer-events-none max-w-0 opacity-0 translate-x-2"
        } ${showPreview && showSuggestions ? "ml-2" : "ml-0"}`}
      >
        <SuggestionsBar suggestions={displaySuggestions} />
      </div>
    </div>
  );
}
