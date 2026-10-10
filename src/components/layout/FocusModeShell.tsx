import { KeyboardSection } from "../keyboard/KeyboardSection";
import { useAppStore } from "../../stores/appStore";
import { CollapsedFab } from "./CollapsedFab";

/**
 * Focus mode UI: full-width keyboard + suggestions when visible,
 * or a 3-button collapsed FAB (Settings → Dictate → Expand) when hidden.
 * Expand reopens the keyboard until external input loses focus; collapse returns to the FAB stack.
 */
export function FocusModeShell() {
  const focusModeKeyboardVisible = useAppStore((s) => s.focusModeKeyboardVisible);
  const settings = useAppStore((s) => s.settings);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const expandFocusModeKeyboard = useAppStore((s) => s.expandFocusModeKeyboard);

  if (!focusModeKeyboardVisible) {
    return (
      <CollapsedFab
        showSettings
        onSettings={() => void setShowSettings(true)}
        onExpand={() => void expandFocusModeKeyboard()}
      />
    );
  }

  return (
    <div
      className="flex h-full w-full flex-col"
      style={{
        width: "100vw",
        height: "100vh",
        backgroundColor:
          settings.focusModeTransparent
            ? "transparent"
            : (settings.appBgColor ?? "#f1f5f9"),
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="min-h-0 flex-1">
        <KeyboardSection />
      </div>
    </div>
  );
}
