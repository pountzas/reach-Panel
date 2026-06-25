import { MouseIcon, NumpadIcon } from "../common/SectionIcons";
import { ModeToggleButton, ModeToggleGroup } from "../common/ModeToggle";
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
      <div className="relative z-20 mb-2 flex items-center justify-end gap-2 overflow-visible pr-1 pt-6">
        {!showNumpad && (
          <MouseSpeedSlider
            value={settings.mouseSpeed}
            onChange={(mouseSpeed) => updateSettings({ mouseSpeed })}
          />
        )}
        <ModeToggleGroup>
          <ModeToggleButton
            active={!showNumpad}
            position="first"
            label={t("mouse")}
            onClick={() => updateSettings({ mousePanelMode: "mouse" })}
          >
            <MouseIcon className="h-4 w-4" />
          </ModeToggleButton>
          <ModeToggleButton
            active={showNumpad}
            position="last"
            label={t("numpad")}
            onClick={() => updateSettings({ mousePanelMode: "numpad" })}
          >
            <NumpadIcon className="h-4 w-4" />
          </ModeToggleButton>
        </ModeToggleGroup>
      </div>
      <div className="min-h-0 flex-1">
        {showNumpad ? <NumKeypad /> : <Trackpad />}
      </div>
    </div>
  );
}
