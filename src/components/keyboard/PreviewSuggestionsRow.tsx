import { useDeferredValue, useEffect, useRef, ViewTransition } from "react";
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
  const deferredPreview = useDeferredValue(showPreview);
  const deferredSuggestions = useDeferredValue(showSuggestions);
  const suggestions = useAppStore((s) => s.suggestions);
  const lastSuggestionsRef = useRef<string[]>([]);
  useEffect(() => {
    if (suggestions.length > 0) {
      lastSuggestionsRef.current = suggestions;
    }
  }, [suggestions]);
  // While the slot is open, show live suggestions (empty → lightbulb only).
  // While hiding, keep the last chips for the exit transition.
  const displaySuggestions = deferredSuggestions
    ? suggestions
    : suggestions.length > 0
      ? suggestions
      : lastSuggestionsRef.current;

  return (
    <div className="flex w-full min-w-0 items-center justify-center">
      <ViewTransition default="rp-vt-fade-slide">
        <div
          data-slot="preview"
          aria-hidden={!deferredPreview}
          inert={!deferredPreview}
          className={`min-w-0 shrink ${
            deferredPreview
              ? "w-[320px] opacity-100"
              : "pointer-events-none w-0 overflow-hidden opacity-0"
          }`}
          style={deferredPreview ? { width: PREVIEW_WIDTH } : { width: 0 }}
        >
          <InputPreview />
        </div>
      </ViewTransition>
      <ViewTransition default="rp-vt-fade-slide">
        <div
          data-slot="suggestions"
          aria-hidden={!deferredSuggestions}
          inert={!deferredSuggestions}
          className={`min-w-0 ${
            deferredSuggestions
              ? "opacity-100"
              : "pointer-events-none w-0 overflow-hidden opacity-0"
          } ${deferredPreview && deferredSuggestions ? "ml-2" : "ml-0"}`}
        >
          <SuggestionsBar suggestions={displaySuggestions} />
        </div>
      </ViewTransition>
    </div>
  );
}
