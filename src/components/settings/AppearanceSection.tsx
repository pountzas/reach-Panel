import { useShallow } from "zustand/react/shallow";
import {
  COLOR_PROFILE_IDS,
  getColorProfileColors,
  type ColorProfileId,
  type SurfaceColors,
} from "../../lib/colorProfiles";
import type { TranslationKey } from "../../i18n";
import { isV1FeatureHidden } from "../../lib/v1HiddenFeatures";
import {
  KEYBOARD_FONT_SIZE_MAX,
  KEYBOARD_FONT_SIZE_MIN,
  clampKeyboardFontSize,
} from "../../lib/keyboardFontSize";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppStore } from "../../stores/appStore";
import { SettingsSection } from "./SettingsSection";
import { ColorField } from "./settingsControls";

const COLOR_PROFILE_LABEL_KEYS: Record<ColorProfileId, TranslationKey> = {
  "light-grey": "colorProfileLightGrey",
  "dark-grey": "colorProfileDarkGrey",
  custom: "colorProfileCustom",
};

type AppearanceSectionProps = {
  surface: SurfaceColors;
};

export function AppearanceSection({ surface }: AppearanceSectionProps) {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppStore(
    useShallow((s) => ({
      settings: s.settings,
      updateSettings: s.updateSettings,
    })),
  );
  const keyboardFontSizeMax = KEYBOARD_FONT_SIZE_MAX;
  const keyboardFontSizePx = clampKeyboardFontSize(settings.keyboardFontSize);

  return (
    <SettingsSection title={t("appearance")} surface={surface}>
      <fieldset className="mb-4">
        <legend
          className="mb-2 text-sm font-medium"
          style={{ color: surface.panelText }}>
          {t("colorProfile")}
        </legend>
        <div className="flex flex-wrap gap-2">
          {COLOR_PROFILE_IDS.map((id) => {
            const selected = settings.colorProfile === id;
            return (
              <label
                key={id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
                style={{
                  borderColor: selected
                    ? surface.panelBorder
                    : surface.insetBorder,
                  backgroundColor: selected
                    ? surface.panelHeaderBg
                    : surface.insetBg,
                  color: surface.panelText,
                }}>
                <input
                  type="radio"
                  name="colorProfile"
                  checked={selected}
                  onChange={() =>
                    updateSettings({
                      colorProfile: id,
                      ...getColorProfileColors(id),
                    })
                  }
                />
                {t(COLOR_PROFILE_LABEL_KEYS[id])}
              </label>
            );
          })}
        </div>
      </fieldset>

      {settings.colorProfile === "custom" && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <ColorField
            label={t("appBackgroundColor")}
            value={settings.appBgColor ?? "#f1f5f9"}
            onChange={(v) =>
              updateSettings({ appBgColor: v, colorProfile: "custom" })
            }
            surface={surface}
          />
          <ColorField
            label={t("headerColor")}
            value={settings.headerBgColor ?? "#1e293b"}
            onChange={(v) =>
              updateSettings({ headerBgColor: v, colorProfile: "custom" })
            }
            surface={surface}
          />
          <ColorField
            label={t("headerTextColor")}
            value={settings.headerTextColor ?? "#ffffff"}
            onChange={(v) =>
              updateSettings({ headerTextColor: v, colorProfile: "custom" })
            }
            surface={surface}
          />
          <ColorField
            label={t("keyboardBackgroundColor")}
            value={settings.keyboardBgColor ?? "#e8edf2"}
            onChange={(v) =>
              updateSettings({ keyboardBgColor: v, colorProfile: "custom" })
            }
            surface={surface}
          />
          <ColorField
            label={t("keyColor")}
            value={settings.keyboardKeyColor ?? "#ffffff"}
            onChange={(v) =>
              updateSettings({ keyboardKeyColor: v, colorProfile: "custom" })
            }
            surface={surface}
          />
          <ColorField
            label={t("keyTextColor")}
            value={settings.keyTextColor ?? "#1e293b"}
            onChange={(v) =>
              updateSettings({ keyTextColor: v, colorProfile: "custom" })
            }
            surface={surface}
          />
          {!isV1FeatureHidden("mouse") && (
            <ColorField
              label={t("mousePanelColor")}
              value={settings.mousePanelBgColor ?? "#f8fafc"}
              onChange={(v) =>
                updateSettings({ mousePanelBgColor: v, colorProfile: "custom" })
              }
              surface={surface}
            />
          )}
        </div>
      )}

      <label className="block text-sm" style={{ color: surface.panelText }}>
        {t("opacity")}
        <input
          type="range"
          min={0.5}
          max={1}
          step={0.05}
          value={settings.opacity}
          onChange={(e) => updateSettings({ opacity: Number(e.target.value) })}
          className="mt-1 w-full"
        />
      </label>

      <div className="mt-4 block text-sm" style={{ color: surface.panelText }}>
        <label
          htmlFor="settings-keyboard-font-size"
          className="flex items-center justify-between gap-2">
          <span>{t("keyboardFontSize")}</span>
          <span className="tabular-nums opacity-80">
            {keyboardFontSizePx}px
          </span>
        </label>
        <input
          id="settings-keyboard-font-size"
          type="range"
          min={KEYBOARD_FONT_SIZE_MIN}
          max={keyboardFontSizeMax}
          step={1}
          value={keyboardFontSizePx}
          onChange={(e) =>
            void updateSettings({
              keyboardFontSize: Number(e.target.value),
            })
          }
          className="mt-1 w-full"
        />
      </div>
    </SettingsSection>
  );
}
