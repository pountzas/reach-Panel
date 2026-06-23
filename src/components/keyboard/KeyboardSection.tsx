import { KeyboardIcon, SynthesizerIcon } from "../common/SectionIcons";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { Keyboard } from "./Keyboard";
import { Synthesizer } from "./Synthesizer";

export function KeyboardSection() {
  const { settings, updateSettings } = useAppStore();
  const { t } = useTranslation();
  const showSynth = settings.keyboardSectionMode === "synthesizer";
  const showToggle = settings.keyboardModeToggleVisible;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {showToggle && (
        <div className="mb-1 flex justify-end">
          <div className="flex rounded border border-slate-300">
            <button
              type="button"
              className={`group relative flex items-center justify-center rounded-l p-2 ${!showSynth ? "bg-slate-700 text-white" : "bg-white text-slate-700"}`}
              onClick={() => updateSettings({ keyboardSectionMode: "keyboard" })}
              aria-pressed={!showSynth}
              aria-label={t("keyboard")}
            >
              <KeyboardIcon className="h-4 w-4" />
              <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                {t("keyboard")}
              </span>
            </button>
            <button
              type="button"
              className={`group relative flex items-center justify-center rounded-r p-2 ${showSynth ? "bg-slate-700 text-white" : "bg-white text-slate-700"}`}
              onClick={() => updateSettings({ keyboardSectionMode: "synthesizer" })}
              aria-pressed={showSynth}
              aria-label={t("synthesizer")}
            >
              <SynthesizerIcon className="h-4 w-4" />
              <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                {t("synthesizer")}
              </span>
            </button>
          </div>
        </div>
      )}
      {showSynth ? (
        <div className="min-h-0 flex-1">
          <Synthesizer />
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <Keyboard />
        </div>
      )}
    </div>
  );
}
