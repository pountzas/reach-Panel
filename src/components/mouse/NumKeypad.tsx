import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../stores/appStore";
import { KeyButton } from "../keyboard/KeyButton";
import { useContainerSize } from "../../hooks/useContainerSize";
import { computeKeyMetrics } from "../../lib/keyMetrics";

const NUMPAD_ROW_COUNT = 5;

type NumpadKeyDef = {
  label: string;
  key: string;
  gridColumn: string;
  gridRow: string;
};

const NUMPAD_KEYS: NumpadKeyDef[] = [
  { label: "/", key: "/", gridColumn: "2", gridRow: "1" },
  { label: "*", key: "*", gridColumn: "3", gridRow: "1" },
  { label: "-", key: "-", gridColumn: "4", gridRow: "1" },
  { label: "7", key: "7", gridColumn: "1", gridRow: "2" },
  { label: "8", key: "8", gridColumn: "2", gridRow: "2" },
  { label: "9", key: "9", gridColumn: "3", gridRow: "2" },
  { label: "+", key: "+", gridColumn: "4", gridRow: "2 / span 2" },
  { label: "4", key: "4", gridColumn: "1", gridRow: "3" },
  { label: "5", key: "5", gridColumn: "2", gridRow: "3" },
  { label: "6", key: "6", gridColumn: "3", gridRow: "3" },
  { label: "1", key: "1", gridColumn: "1", gridRow: "4" },
  { label: "2", key: "2", gridColumn: "2", gridRow: "4" },
  { label: "3", key: "3", gridColumn: "3", gridRow: "4" },
  { label: "↵", key: "enter", gridColumn: "4", gridRow: "4 / span 2" },
  { label: "0", key: "0", gridColumn: "1 / span 2", gridRow: "5" },
  { label: ".", key: ".", gridColumn: "3", gridRow: "5" },
];

export function NumKeypad() {
  const { settings, pollError } = useAppStore();
  const { ref, height } = useContainerSize<HTMLDivElement>();
  const { keyHeight, spacing } = computeKeyMetrics(height, NUMPAD_ROW_COUNT);
  const fontSize = settings.keyboardFontSize ?? 18;

  const handleKey = async (key: string) => {
    await invoke("cmd_press_key", { request: { key, modifiers: [] } });
    await pollError();
  };

  return (
    <div
      ref={ref}
      className="flex h-full min-h-0 w-full flex-col justify-center p-2"
    >
      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: "repeat(4, 1fr)",
          gridTemplateRows: `repeat(${NUMPAD_ROW_COUNT}, ${keyHeight}px)`,
          gap: spacing,
        }}
      >
        {NUMPAD_KEYS.map((k) => (
          <KeyButton
            key={`${k.gridColumn}-${k.gridRow}-${k.key}`}
            label={k.label}
            size={keyHeight}
            spacing={spacing}
            fontSize={fontSize}
            bgColor={settings.keyboardKeyColor ?? "#ffffff"}
            textColor={settings.keyTextColor ?? "#1e293b"}
            gridColumn={k.gridColumn}
            gridRow={k.gridRow}
            onPress={() => void handleKey(k.key)}
          />
        ))}
      </div>
    </div>
  );
}
