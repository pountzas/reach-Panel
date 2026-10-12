import { useRef, ViewTransition } from "react";
import { SuggestionsBar } from "../common/SuggestionsBar";
import { useAppStore } from "../../stores/appStore";
import { InputPreview } from "./InputPreview";

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
      <ViewTransition default="rp-vt-fade-slide">
        <div
          data-slot="preview"
          aria-hidden={!showPreview}
          inert={!showPreview}
          className={`min-w-0 shrink ${
            showPreview
              ? "w-[320px] opacity-100"
              : "pointer-events-none w-0 overflow-hidden opacity-0"
          }`}
          style={showPreview ? { width: PREVIEW_WIDTH } : { width: 0 }}
        >
          <InputPreview />
        </div>
      </ViewTransition>
      <ViewTransition default="rp-vt-fade-slide">
        <div
          data-slot="suggestions"
          aria-hidden={!showSuggestions}
          inert={!showSuggestions}
          className={`min-w-0 ${
            showSuggestions
              ? "opacity-100"
              : "pointer-events-none w-0 overflow-hidden opacity-0"
          } ${showPreview && showSuggestions ? "ml-2" : "ml-0"}`}
        >
          <SuggestionsBar suggestions={displaySuggestions} />
        </div>
      </ViewTransition>
    </div>
  );
}
