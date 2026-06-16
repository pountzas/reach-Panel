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
      className="flex h-full min-h-0 flex-col self-stretch rounded-xl border border-slate-300 p-2"
      style={{
        width: settings.mousePanelWidth,
        minWidth: 180,
        backgroundColor: settings.mousePanelBgColor ?? "#f8fafc",
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-700">
          {showNumpad ? t("numpad") : t("mouse")}
        </span>
        <div className="flex items-center gap-1">
          <div className="flex rounded border border-slate-300 text-xs">
            <button
              type="button"
              className={`rounded-l px-2 py-0.5 ${!showNumpad ? "bg-slate-700 text-white" : "bg-white text-slate-700"}`}
              onClick={() => updateSettings({ mousePanelMode: "mouse" })}
              aria-pressed={!showNumpad}
            >
              {t("mouse")}
            </button>
            <button
              type="button"
              className={`rounded-r px-2 py-0.5 ${showNumpad ? "bg-slate-700 text-white" : "bg-white text-slate-700"}`}
              onClick={() => updateSettings({ mousePanelMode: "numpad" })}
              aria-pressed={showNumpad}
            >
              {t("numpad")}
            </button>
          </div>
          {!showNumpad && (
            <select
              className="rounded border px-1 py-0.5 text-xs"
              value={settings.mouseSide}
              onChange={(e) =>
                updateSettings({
                  mouseSide: e.target.value as "right" | "left" | "floating",
                })
              }
            >
              <option value="right">{t("mouseRight")}</option>
              <option value="left">{t("mouseLeft")}</option>
              <option value="floating">{t("mouseFloating")}</option>
            </select>
          )}
        </div>
      </div>
      {!showNumpad && (
        <>
          <div className="mb-2">
            <label className="text-xs text-slate-500">{t("width")}</label>
            <input
              type="range"
              min={180}
              max={400}
              value={settings.mousePanelWidth}
              onChange={(e) =>
                updateSettings({ mousePanelWidth: Number(e.target.value) })
              }
              className="w-full"
            />
          </div>
          <div className="mb-2">
            <label className="text-xs text-slate-500">{t("speed")}</label>
            <select
              className="w-full rounded border px-2 py-1 text-sm"
              value={settings.mouseSpeed}
              onChange={(e) =>
                updateSettings({
                  mouseSpeed: e.target.value as "slow" | "medium" | "fast" | "custom",
                })
              }
            >
              <option value="slow">{t("speedSlow")}</option>
              <option value="medium">{t("speedMedium")}</option>
              <option value="fast">{t("speedFast")}</option>
              <option value="custom">{t("speedCustom")}</option>
            </select>
          </div>
        </>
      )}
      <div className="min-h-0 flex-1">
        {showNumpad ? <NumKeypad /> : <Trackpad />}
      </div>
    </div>
  );
}
