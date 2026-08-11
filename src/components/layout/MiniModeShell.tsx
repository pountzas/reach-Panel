import { KeyboardSection } from "../keyboard/KeyboardSection";
import { useAppStore } from "../../stores/appStore";
import { CollapsedFab } from "./CollapsedFab";

/**
 * Mini Mode UI: full-width keyboard + suggestions when visible,
 * or a 3-button collapsed FAB (Settings → Dictate → Expand) when hidden.
 * Expand reopens the keyboard until external input loses focus; does not exit Mini Mode.
 */
export function MiniModeShell() {
  const miniModeKeyboardVisible = useAppStore((s) => s.miniModeKeyboardVisible);
  const settings = useAppStore((s) => s.settings);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const expandMiniModeKeyboard = useAppStore((s) => s.expandMiniModeKeyboard);

  if (!miniModeKeyboardVisible) {
    return (
      <CollapsedFab
        showSettings
        onSettings={() => void setShowSettings(true)}
        onExpand={() => void expandMiniModeKeyboard()}
      />
    );
  }

  return (
    <div
      className="flex h-full w-full flex-col"
      style={{
        width: "100vw",
        height: "100vh",
        backgroundColor: settings.appBgColor ?? "#f1f5f9",
      }}
    >
      <div className="min-h-0 flex-1">
        <KeyboardSection />
      </div>
    </div>
  );
}
