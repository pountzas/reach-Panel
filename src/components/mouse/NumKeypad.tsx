import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../stores/appStore";
import { KeyButton } from "../keyboard/KeyButton";
import { useContainerSize } from "../../hooks/useContainerSize";

const NUMPAD_ROWS: { label: string; key: string; width?: number }[][] = [
  [
    { label: "7", key: "7" },
    { label: "8", key: "8" },
    { label: "9", key: "9" },
    { label: "⌫", key: "backspace" },
  ],
  [
    { label: "4", key: "4" },
    { label: "5", key: "5" },
    { label: "6", key: "6" },
    { label: "+", key: "+" },
  ],
  [
    { label: "1", key: "1" },
    { label: "2", key: "2" },
    { label: "3", key: "3" },
    { label: "-", key: "-" },
  ],
  [
    { label: "0", key: "0", width: 2 },
    { label: ".", key: "." },
    { label: "↵", key: "enter" },
  ],
];

function computeKeyMetrics(containerHeight: number, rowCount: number) {
  if (containerHeight <= 0 || rowCount <= 0) {
    return { keyHeight: 40, spacing: 4 };
  }
  const spacing = Math.max(2, Math.floor(containerHeight * 0.01));
  const available = containerHeight - spacing * (rowCount - 1);
  const keyHeight = Math.max(24, Math.floor(available / rowCount));
  return { keyHeight, spacing };
}

export function NumKeypad() {
  const { settings, pollError } = useAppStore();
  const { ref, height } = useContainerSize<HTMLDivElement>();
  const { keyHeight, spacing } = computeKeyMetrics(height, NUMPAD_ROWS.length);
  const fontSize = settings.keyboardFontSize ?? 18;

  const handleKey = async (key: string) => {
    await invoke("cmd_press_key", { request: { key, modifiers: [] } });
    await pollError();
  };

  return (
    <div ref={ref} className="flex h-full min-h-0 flex-col justify-center">
      {NUMPAD_ROWS.map((row, ri) => (
        <div key={ri} className="flex w-full">
          {row.map((k, ci) => (
            <KeyButton
              key={`${ri}-${k.key}-${ci}`}
              label={k.label}
              width={k.width ?? 1}
              size={keyHeight}
              spacing={spacing}
              fontSize={fontSize}
              bgColor={settings.keyboardKeyColor ?? "#ffffff"}
              textColor={settings.keyTextColor ?? "#1e293b"}
              stretch
              onPress={() => void handleKey(k.key)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
