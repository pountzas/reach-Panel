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
 * Keyboard slide is CSS; FAB stays mounted and is shown only on the settled
 * collapsed window. The native window is resized once by the store (after paint).
 */
export function FocusModeShell() {
  const focusModeKeyboardVisible = useAppStore(
    (s) => s.focusModeKeyboardVisible,
  );
  const focusContentAnim = useAppStore((s) => s.focusContentAnim);
  const isAnimatingWindow = useAppStore((s) => s.isAnimatingWindow);
  const settings = useAppStore((s) => s.settings);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const expandFocusModeKeyboard = useAppStore((s) => s.expandFocusModeKeyboard);

  const showApplying =
    isAnimatingWindow &&
    focusModeKeyboardVisible &&
    focusContentAnim === "idle";
  const showKeyboardLayer =
    focusModeKeyboardVisible || focusContentAnim === "exit";
  // Keep CollapsedFab mounted (display:none when idle) so expand/collapse does
  // not remount-stagger. Only interactive when the collapsed window is settled.
  const fabInteractive =
    !focusModeKeyboardVisible &&
    focusContentAnim !== "exit" &&
    !isAnimatingWindow;

  const [keyboardSlideIn, setKeyboardSlideIn] = useState(
    focusModeKeyboardVisible &&
      focusContentAnim === "idle" &&
      !isAnimatingWindow,
  );

  useEffect(() => {
    if (focusContentAnim === "enter") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset slide before enter rAF
      setKeyboardSlideIn(false);
      // Double rAF so the off-screen frame paints before the slide-up.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          setKeyboardSlideIn(true);
        });
      });
      return () => {
        cancelAnimationFrame(raf1);
        if (raf2) cancelAnimationFrame(raf2);
      };
    }
    if (focusContentAnim === "exit") {
      setKeyboardSlideIn(false);
      return;
    }
    if (showApplying) {
      setKeyboardSlideIn(false);
      return;
    }
    setKeyboardSlideIn(focusModeKeyboardVisible);
  }, [focusContentAnim, focusModeKeyboardVisible, showApplying]);

  useEffect(() => {
    if (focusContentAnim !== "enter" && focusContentAnim !== "exit") return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      notifyFocusContentAnimDone();
    };
    const root = document.getElementById("focus-keyboard-layer");
    const onEnd = (e: TransitionEvent) => {
      if (e.target !== root) return;
      if (e.propertyName !== "transform") return;
      finish();
    };
    root?.addEventListener("transitionend", onEnd);
    const fallback = window.setTimeout(finish, MOTION.focusKeyboard + 80);
    return () => {
      root?.removeEventListener("transitionend", onEnd);
      window.clearTimeout(fallback);
    };
  }, [focusContentAnim]);

  const bg = settings.focusModeTransparent
    ? "transparent"
    : (settings.appBgColor ?? "#f1f5f9");

  const keyboardTransition =
    "transition-transform [transition-duration:var(--rp-dur-focus-keyboard)] [transition-timing-function:var(--rp-ease-focus-keyboard)] motion-reduce:transition-none";

  return (
    <div
      className="relative h-full w-full"
      style={{ background: "transparent" }}>
      <div
        data-fab-layer
        className={fabInteractive ? "absolute inset-0" : "hidden"}
        aria-hidden={!fabInteractive}>
        <CollapsedFab
          fillWindow
          showSettings
          showDictation={settings.micMode === true}
          onSettings={() => {
            setShowSettings(true);
          }}
          onExpand={() => void expandFocusModeKeyboard()}
        />
      </div>
      {showKeyboardLayer && (
        <div
          id="focus-keyboard-layer"
          className={`absolute inset-0 flex flex-col ${keyboardTransition} ${
            keyboardSlideIn ? "translate-y-0" : "translate-y-full"
          } ${focusModeKeyboardVisible && keyboardSlideIn ? "" : "pointer-events-none"}`}
          style={{
            width: "100vw",
            height: "100vh",
            backgroundColor: bg,
          }}
          onContextMenu={(e) => {
            e.preventDefault();
          }}>
          <div className="min-h-0 flex-1">
            <KeyboardSection />
          </div>
        </div>
      )}
    </div>
  );
}
