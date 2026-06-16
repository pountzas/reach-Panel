import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../stores/appStore";
import { KeyButton } from "../keyboard/KeyButton";

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

export function NumKeypad() {
  const { settings, pollError } = useAppStore();
  const keySize = Math.min(settings.keyboardKeySize, 64);
  const spacing = Math.min(settings.keyboardSpacing, 6);

  const handleKey = async (key: string) => {
    await invoke("cmd_press_key", { request: { key, modifiers: [] } });
    await pollError();
  };

  return (
    <div className="flex h-full min-h-0 flex-col justify-center">
      {NUMPAD_ROWS.map((row, ri) => (
        <div key={ri} className="flex justify-center">
          {row.map((k, ci) => (
            <KeyButton
              key={`${ri}-${k.key}-${ci}`}
              label={k.label}
              width={k.width ?? 1}
              size={keySize}
              spacing={spacing}
              fontSize={settings.keyboardFontSize ?? 18}
              bgColor={settings.keyboardKeyColor ?? "#ffffff"}
              textColor={settings.keyTextColor ?? "#1e293b"}
              onPress={() => void handleKey(k.key)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
