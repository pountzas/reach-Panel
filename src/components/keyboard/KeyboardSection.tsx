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
          <div className="flex rounded border border-slate-300 text-xs">
            <button
              type="button"
              className={`flex items-center gap-1 rounded-l px-2 py-0.5 ${!showSynth ? "bg-slate-700 text-white" : "bg-white text-slate-700"}`}
              onClick={() => updateSettings({ keyboardSectionMode: "keyboard" })}
              aria-pressed={!showSynth}
            >
              <KeyboardIcon />
              {t("keyboard")}
            </button>
            <button
              type="button"
              className={`flex items-center gap-1 rounded-r px-2 py-0.5 ${showSynth ? "bg-slate-700 text-white" : "bg-white text-slate-700"}`}
              onClick={() => updateSettings({ keyboardSectionMode: "synthesizer" })}
              aria-pressed={showSynth}
            >
              <SynthesizerIcon />
              {t("synthesizer")}
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
