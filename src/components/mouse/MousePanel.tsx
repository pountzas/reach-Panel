import { MouseIcon, NumpadIcon, PanelLeftIcon, PanelRightIcon } from "../common/SectionIcons";
import { ModeToggleButton, ModeToggleGroup } from "../common/ModeToggle";
import { MouseSpeedSwitch } from "./MouseSpeedSwitch";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { getSurfaceColors } from "../../lib/colorProfiles";
import { Trackpad } from "./Trackpad";
import { NumKeypad } from "./NumKeypad";

export function MousePanel() {
  const { settings, updateSettings } = useAppStore();
  const { t } = useTranslation();
  const surface = getSurfaceColors(settings.appBgColor);
  const showNumpad = settings.mousePanelMode === "numpad";
  const mouseOnLeft = settings.mousePanelSide === "left";

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col rounded-xl border p-2"
      style={{
        backgroundColor: settings.mousePanelBgColor ?? "#f8fafc",
        borderColor: surface.panelBorder,
      }}
    >
      <div className="relative z-20 mb-2 flex shrink-0 items-center justify-end gap-2 overflow-visible pr-1 pt-6">
        {!showNumpad && (
          <MouseSpeedSwitch
            value={settings.mouseSpeed}
            onChange={(mouseSpeed) => updateSettings({ mouseSpeed })}
          />
        )}
        <ModeToggleGroup>
          <ModeToggleButton
            active={mouseOnLeft}
            position="first"
            label={t("mousePanelLeft")}
            onClick={() => updateSettings({ mousePanelSide: "left" })}
          >
            <PanelLeftIcon className="h-4 w-4" />
          </ModeToggleButton>
          <ModeToggleButton
            active={!mouseOnLeft}
            position="last"
            label={t("mousePanelRight")}
            onClick={() => updateSettings({ mousePanelSide: "right" })}
          >
            <PanelRightIcon className="h-4 w-4" />
          </ModeToggleButton>
        </ModeToggleGroup>
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
