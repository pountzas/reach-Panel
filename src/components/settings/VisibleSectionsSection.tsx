import { useShallow } from "zustand/react/shallow";
import type { SurfaceColors } from "../../lib/colorProfiles";
import { isV1FeatureHidden } from "../../lib/v1HiddenFeatures";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppStore } from "../../stores/appStore";
import { SettingsSection } from "./SettingsSection";
import { ToggleRow, WordPackDictionaries } from "./settingsControls";

export function VisibleSectionsSection({ surface }: { surface: SurfaceColors }) {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppStore(
    useShallow((s) => ({
      settings: s.settings,
      updateSettings: s.updateSettings,
    })),
  );
  return (
    <SettingsSection title={t("settingsVisibleSections")} surface={surface}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {!isV1FeatureHidden("mouse") && (
          <ToggleRow
            label={t("showMouseSection")}
            checked={settings.mouseVisible}
            onChange={(checked) => updateSettings({ mouseVisible: checked })}
            surface={surface}
          />
        )}
        <ToggleRow
          label={t("showSuggestionsBar")}
          checked={settings.suggestionsVisible}
          onChange={(checked) =>
            updateSettings({
              suggestionsVisible: checked,
              predictionEnabled: checked,
            })
          }
          surface={surface}
        />
        <ToggleRow
          label={t("showDictationControl")}
          checked={settings.dictationVisible}
          onChange={(checked) => updateSettings({ dictationVisible: checked })}
          surface={surface}
        />
        <ToggleRow
          label={t("showInputPreview")}
          checked={settings.inputPreviewVisible !== false}
          onChange={(checked) => updateSettings({ inputPreviewVisible: checked })}
          surface={surface}
        />
      </div>
      <div className="mt-3">
        <ToggleRow
          label={t("showTeachingInputHelpers")}
          checked={settings.showTeachingInputHelpers !== false}
          onChange={(checked) =>
            updateSettings({ showTeachingInputHelpers: checked })
          }
          surface={surface}
        />
        <p
          className="mt-1 px-1 text-xs"
          style={{ color: surface.panelMutedText }}
        >
          {t("showTeachingInputHelpersDescription")}
        </p>
      </div>
      <WordPackDictionaries surface={surface} />
    </SettingsSection>
  );
}
