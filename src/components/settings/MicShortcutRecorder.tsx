import { useCallback, useEffect, useState } from "react";
import type { SurfaceColors } from "../../lib/colorProfiles";
import {
  DEFAULT_PC_MIC_CUSTOM_KEYS,
  formatPcMicCombo,
} from "../../lib/pcMicSend";
import { pcMicShortcutFromKeyboardEvent } from "../../lib/pcMicShortcutFromEvent";
import { useTranslation } from "../../hooks/useTranslation";

type MicShortcutRecorderProps = {
  value: string[];
  onChange: (keys: string[]) => void;
  surface: SurfaceColors;
};

export function MicShortcutRecorder({
  value,
  onChange,
  surface,
}: MicShortcutRecorderProps) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const keys = value.length > 0 ? value : [...DEFAULT_PC_MIC_CUSTOM_KEYS];

  const stopRecording = useCallback(() => {
    setRecording(false);
  }, []);

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const combo = pcMicShortcutFromKeyboardEvent(event);
      if (combo.length === 0) return;
      onChange(combo);
      setRecording(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [recording, onChange]);

  return (
    <div className="mt-2">
      <p className="text-sm" style={{ color: surface.panelText }}>
        {t("pcMicCustomShortcut")}: {formatPcMicCombo(keys)}
      </p>
      <button
        type="button"
        className="mt-2 rounded-lg border px-3 py-2 text-sm"
        style={{
          backgroundColor: surface.panelButtonBg,
          borderColor: recording ? "#2563eb" : surface.panelBorder,
          color: surface.panelText,
        }}
        onClick={() => {
          if (recording) {
            stopRecording();
          } else {
            setRecording(true);
          }
        }}>
        {recording ? t("pcMicCustomRecording") : t("pcMicCustomRecord")}
      </button>
    </div>
  );
}
