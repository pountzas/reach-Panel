import { useCallback, useEffect, useRef, useState } from "react";
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

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "OS"]);

export function MicShortcutRecorder({
  value,
  onChange,
  surface,
}: MicShortcutRecorderProps) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const pendingModifierComboRef = useRef<string[]>([]);
  const keys = value.length > 0 ? value : [...DEFAULT_PC_MIC_CUSTOM_KEYS];

  const stopRecording = useCallback(() => {
    pendingModifierComboRef.current = [];
    setRecording(false);
  }, []);

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const combo = pcMicShortcutFromKeyboardEvent(event);
      if (combo.length === 0) return;
      if (MODIFIER_KEYS.has(event.key)) {
        pendingModifierComboRef.current = combo;
        return;
      }
      onChange(combo);
      pendingModifierComboRef.current = [];
      setRecording(false);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (pendingModifierComboRef.current.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const modsStillHeld =
        event.ctrlKey || event.shiftKey || event.altKey || event.metaKey;
      if (!modsStillHeld) {
        onChange(pendingModifierComboRef.current);
        pendingModifierComboRef.current = [];
        setRecording(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
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
            pendingModifierComboRef.current = [];
            setRecording(true);
          }
        }}>
        {recording ? t("pcMicCustomRecording") : t("pcMicCustomRecord")}
      </button>
    </div>
  );
}