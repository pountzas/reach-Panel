import { useEffect, useState } from "react";
import { KeyboardSection } from "../keyboard/KeyboardSection";
import { useAppStore, notifyFocusContentAnimDone } from "../../stores/appStore";
import { CollapsedFab } from "./CollapsedFab";
import { MOTION } from "../../lib/motion";

/**
 * Focus mode UI: full-width keyboard + suggestions when visible,
 * or a collapsed FAB stack (Mic (Mic mode) → Settings → R) when hidden.
 * R opens the mode menu; "Show keyboard" reopens the keyboard until external
 * input loses focus; collapse returns to the FAB stack.
 * Keyboard/FAB crossfade is CSS; the native window is resized once by the store.
 */
export function FocusModeShell() {
  const focusModeKeyboardVisible = useAppStore((s) => s.focusModeKeyboardVisible);
  const focusContentAnim = useAppStore((s) => s.focusContentAnim);
  const settings = useAppStore((s) => s.settings);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const expandFocusModeKeyboard = useAppStore((s) => s.expandFocusModeKeyboard);

  const showKeyboardLayer =
    focusModeKeyboardVisible || focusContentAnim === "exit";
  const showFabLayer =
    !focusModeKeyboardVisible || focusContentAnim === "enter";

  const [keyboardSlideIn, setKeyboardSlideIn] = useState(
    focusModeKeyboardVisible && focusContentAnim === "idle",
  );

  useEffect(() => {
    if (focusContentAnim === "enter") {
      setKeyboardSlideIn(false);
      const raf = requestAnimationFrame(() => setKeyboardSlideIn(true));
      return () => cancelAnimationFrame(raf);
    }
    if (focusContentAnim === "exit") {
      setKeyboardSlideIn(false);
      return;
    }
    setKeyboardSlideIn(focusModeKeyboardVisible);
  }, [focusContentAnim, focusModeKeyboardVisible]);

  useEffect(() => {
    if (focusContentAnim !== "enter" && focusContentAnim !== "exit") return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      notifyFocusContentAnimDone();
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName !== "transform") return;
      finish();
    };
    const root = document.getElementById("focus-keyboard-layer");
    root?.addEventListener("transitionend", onEnd);
    const fallback = window.setTimeout(finish, MOTION.slow + 50);
    return () => {
      root?.removeEventListener("transitionend", onEnd);
      window.clearTimeout(fallback);
    };
  }, [focusContentAnim]);

  const bg = settings.focusModeTransparent
    ? "transparent"
    : (settings.appBgColor ?? "#f1f5f9");

  const layerTransition =
    "transition-[transform,opacity] [transition-duration:var(--rp-dur-slow)] [transition-timing-function:var(--rp-ease-out)] motion-reduce:transition-none";

  return (
    <div className="relative h-full w-full" style={{ background: "transparent" }}>
      {showFabLayer && (
        <div
          className={`absolute inset-0 ${layerTransition} ${
            focusModeKeyboardVisible && keyboardSlideIn
              ? "pointer-events-none opacity-0"
              : "opacity-100"
          }`}
        >
          <CollapsedFab
            showSettings
            showDictation={settings.micMode === true}
            onSettings={() => void setShowSettings(true)}
            onExpand={() => void expandFocusModeKeyboard()}
          />
        </div>
      )}
      {showKeyboardLayer && (
        <div
          id="focus-keyboard-layer"
          className={`absolute inset-0 flex flex-col ${layerTransition} ${
            keyboardSlideIn
              ? "translate-y-0 opacity-100"
              : "translate-y-full opacity-0"
          } ${focusModeKeyboardVisible && keyboardSlideIn ? "" : "pointer-events-none"}`}
          style={{
            width: "100vw",
            height: "100vh",
            backgroundColor: bg,
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="min-h-0 flex-1">
            <KeyboardSection />
          </div>
        </div>
      )}
    </div>
  );
}
