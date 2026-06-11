import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useHeadTracking } from "../../hooks/useHeadTracking";
import { useAppStore } from "../../stores/appStore";
import type { HeadTrackingSettings } from "../../lib/types";

const DEFAULT_HT: HeadTrackingSettings = {
  sensitivity: 5,
  deadZone: 0.02,
  acceleration: 1.5,
  smoothing: 0.3,
  calibrated: false,
};

export function HeadTrackingWizard() {
  const { activeProfileId, settings, updateSettings, setShowHeadTrackingWizard } =
    useAppStore();
  const [htSettings, setHtSettings] = useState<HeadTrackingSettings>(DEFAULT_HT);
  const [mode, setMode] = useState<"touch" | "head">(
    settings.headTrackingEnabled ? "head" : "touch",
  );

  const { videoRef, calibrated, calibrate } = useHeadTracking(
    mode === "head",
    htSettings,
    () => {},
  );

  useEffect(() => {
    if (!activeProfileId) return;
    invoke<string>("cmd_get_head_tracking_settings", { profileId: activeProfileId })
      .then((json) => setHtSettings({ ...DEFAULT_HT, ...JSON.parse(json) }))
      .catch(() => {});
  }, [activeProfileId]);

  const save = async () => {
    if (!activeProfileId) return;
    await invoke("cmd_save_head_tracking_settings", {
      profileId: activeProfileId,
      settingsJson: JSON.stringify({ ...htSettings, calibrated }),
    });
    await updateSettings({ headTrackingEnabled: mode === "head" });
    setShowHeadTrackingWizard(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Head Tracking Calibration</h2>
          <button type="button" onClick={() => setShowHeadTrackingWizard(false)}>
            Close
          </button>
        </div>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            className={`rounded-lg px-4 py-2 ${mode === "touch" ? "bg-blue-600 text-white" : "bg-slate-100"}`}
            onClick={() => setMode("touch")}
          >
            Touch Mode
          </button>
          <button
            type="button"
            className={`rounded-lg px-4 py-2 ${mode === "head" ? "bg-blue-600 text-white" : "bg-slate-100"}`}
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
            <p className="mb-3 text-sm text-slate-600">
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

        <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-white" onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}
