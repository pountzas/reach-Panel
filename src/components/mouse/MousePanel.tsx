import { MouseIcon, NumpadIcon } from "../common/SectionIcons";
import { MouseSpeedSlider } from "./MouseSpeedSlider";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { Trackpad } from "./Trackpad";
import { NumKeypad } from "./NumKeypad";

export function MousePanel() {
  const { settings, updateSettings } = useAppStore();
  const { t } = useTranslation();
  const showNumpad = settings.mousePanelMode === "numpad";

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col rounded-xl border border-slate-300 p-2"
      style={{
        backgroundColor: settings.mousePanelBgColor ?? "#f8fafc",
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        {!showNumpad && (
          <MouseSpeedSlider
            value={settings.mouseSpeed}
            onChange={(mouseSpeed) => updateSettings({ mouseSpeed })}
          />
        )}
        <div className={`flex shrink-0 rounded border border-slate-300 ${showNumpad ? "ml-auto" : ""}`}>
          <button
            type="button"
            className={`group relative flex items-center justify-center rounded-l p-2 ${!showNumpad ? "bg-slate-700 text-white" : "bg-white text-slate-700"}`}
            onClick={() => updateSettings({ mousePanelMode: "mouse" })}
            aria-pressed={!showNumpad}
            aria-label={t("mouse")}
          >
            <MouseIcon className="h-4 w-4" />
            <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
              {t("mouse")}
            </span>
          </button>
          <button
            type="button"
            className={`group relative flex items-center justify-center rounded-r p-2 ${showNumpad ? "bg-slate-700 text-white" : "bg-white text-slate-700"}`}
            onClick={() => updateSettings({ mousePanelMode: "numpad" })}
            aria-pressed={showNumpad}
            aria-label={t("numpad")}
          >
            <NumpadIcon className="h-4 w-4" />
            <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
              {t("numpad")}
            </span>
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {showNumpad ? <NumKeypad /> : <Trackpad />}
      </div>
    </div>
  );
}
