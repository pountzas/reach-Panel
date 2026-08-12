import { useEffect, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useHeadTracking } from "../../hooks/useHeadTracking";
import { useAppStore } from "../../stores/appStore";
import { getSurfaceColors } from "../../lib/colorProfiles";
import { INTERNAL_PROFILE_ID, type HeadTrackingSettings } from "../../lib/types";
import { ToolWindowHeader } from "../common/ToolWindowHeader";
import { useTranslation } from "../../hooks/useTranslation";

const DEFAULT_HT: HeadTrackingSettings = {
  sensitivity: 5,
  deadZone: 0.02,
  acceleration: 1.5,
  smoothing: 0.3,
  calibrated: false,
};

function noopMove(_dx: number, _dy: number) {}

export function HeadTrackingWizard() {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const saveActiveProfile = useAppStore((s) => s.saveActiveProfile);
  const setShowHeadTrackingWizard = useAppStore((s) => s.setShowHeadTrackingWizard);
  const [htSettings, setHtSettings] = useState<HeadTrackingSettings>(DEFAULT_HT);
  const [mode, setMode] = useState<"touch" | "head">(
    settings.headTrackingEnabled ? "head" : "touch",
  );

  const { videoRef, calibrated, calibrate } = useHeadTracking(
    mode === "head",
    htSettings,
    noopMove,
  );

  useEffect(() => {
    invoke<string>("cmd_get_head_tracking_settings", { profileId: INTERNAL_PROFILE_ID })
      .then((json) => setHtSettings({ ...DEFAULT_HT, ...JSON.parse(json) }))
      .catch(() => {});
  }, []);

  const save = async () => {
    await invoke("cmd_save_head_tracking_settings", {
      profileId: INTERNAL_PROFILE_ID,
      settingsJson: JSON.stringify({ ...htSettings, calibrated }),
    });
    await saveActiveProfile();
    await updateSettings({ headTrackingEnabled: mode === "head" });
    setShowHeadTrackingWizard(false);
  };

  const surface = getSurfaceColors(settings.appBgColor);
  const headerBg = settings.headerBgColor ?? "#1e293b";
  const headerText = settings.headerTextColor ?? "#ffffff";
  const secondaryButtonStyle: CSSProperties = {
    backgroundColor: surface.panelButtonBg,
    borderColor: surface.panelBorder,
    color: surface.panelText,
  };
  const activeModeStyle: CSSProperties = {
    backgroundColor: "#2563eb",
    color: "#ffffff",
  };

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden"
      style={{ backgroundColor: settings.appBgColor ?? "#f1f5f9" }}
    >
      <ToolWindowHeader
        style={{ backgroundColor: headerBg, color: headerText }}
        title="Head Tracking Calibration"
        actions={
          <button
            type="button"
            className="rounded bg-white/20 px-3 py-1 text-sm hover:bg-white/30"
            onClick={() => setShowHeadTrackingWizard(false)}
          >
            {t("close")}
          </button>
        }
      />

      <div
        className="min-h-0 flex-1 overflow-y-auto p-4"
        style={{ color: surface.panelText }}
      >
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            className="rounded-lg border px-4 py-2"
            style={mode === "touch" ? activeModeStyle : secondaryButtonStyle}
            onClick={() => setMode("touch")}
          >
            Touch Mode
          </button>
          <button
            type="button"
            className="rounded-lg border px-4 py-2"
            style={mode === "head" ? activeModeStyle : secondaryButtonStyle}
            onClick={() => setMode("head")}
          >
            Head Mode
          </button>
        </div>

        {mode === "head" && (
          <>
            <video
              ref={videoRef}
              className="mb-3 w-full rounded-lg bg-black"
              muted
              playsInline
            />
            <p className="mb-3 text-sm" style={{ color: surface.panelMutedText }}>
              Look straight ahead, then press Calibrate. Move your head to control the cursor.
            </p>
            <button
              type="button"
              className="mb-4 rounded-lg bg-green-600 px-4 py-2 text-white"
              onClick={calibrate}
            >
              {calibrated ? "Recalibrate" : "Calibrate"}
            </button>

            <div className="mb-4 space-y-2">
              <label className="block text-sm">
                Sensitivity: {htSettings.sensitivity}
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={htSettings.sensitivity}
                  onChange={(e) =>
                    setHtSettings({ ...htSettings, sensitivity: Number(e.target.value) })
                  }
                  className="w-full"
                />
              </label>
              <label className="block text-sm">
                Dead zone: {htSettings.deadZone}
                <input
                  type="range"
                  min={0.01}
                  max={0.1}
                  step={0.01}
                  value={htSettings.deadZone}
                  onChange={(e) =>
                    setHtSettings({ ...htSettings, deadZone: Number(e.target.value) })
                  }
                  className="w-full"
                />
              </label>
            </div>
          </>
        )}

        <button
          type="button"
          className="rounded-lg bg-blue-600 px-4 py-2 text-white"
          onClick={save}
        >
          Save
        </button>
      </div>
    </div>
  );
}
