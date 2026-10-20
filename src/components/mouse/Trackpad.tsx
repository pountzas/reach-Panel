import { useEffect, useRef, useState, type ComponentType } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../stores/appStore";
import { useContainerSize } from "../../hooks/useContainerSize";
import { usePressableButton } from "../../hooks/usePressableButton";
import { HoverTooltip } from "../common/HoverTooltip";
import { PRESSABLE_BUTTON_CLASS } from "../../lib/buttonClasses";
import { getSurfaceColors } from "../../lib/colorProfiles";
import { commandFailure, logIpc } from "../../lib/logIpc";
import {
  MOUSE_SPEED_MULTIPLIERS,
  resolveMouseSpeed,
} from "../../lib/mouseSpeed";
import type { CommandResult } from "../../lib/types";
import {
  DoubleClickIcon,
  DragLockIcon,
  LeftClickIcon,
  PrecisionIcon,
  RightClickIcon,
  ScrollIcon,
} from "./MouseButtonIcons";

const SPEED_MAP = MOUSE_SPEED_MULTIPLIERS;

/** Max finger travel (CSS px) still counted as a tap rather than a drag. */
const TAP_SLOP_PX = 14;
/** Max press duration for a tap. */
const TAP_MAX_MS = 350;
/** Window after a tap in which a second tap becomes a double-click. */
const DOUBLE_TAP_MS = 400;

const COMPACT_SCALE = 0.75;

function computeButtonMetrics(containerWidth: number, compact: boolean) {
  const scale = compact ? COMPACT_SCALE : 1;
  if (containerWidth <= 0) {
    return {
      iconSize: Math.round(24 * scale),
      paddingY: Math.round(12 * scale),
      gap: Math.round(8 * scale),
    };
  }
  const iconSize = Math.round(
    Math.max(18, Math.min(28, Math.floor(containerWidth / 9))) * scale,
  );
  const paddingY = Math.round(
    Math.max(6, Math.min(14, Math.floor(containerWidth / 18))) * scale,
  );
  const gap = Math.round(
    Math.max(4, Math.min(10, Math.floor(containerWidth / 24))) * scale,
  );
  return { iconSize, paddingY, gap };
}

type TrackpadButtonProps = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  iconSize: number;
  paddingY: number;
  bgColor: string;
  textColor: string;
  active?: boolean;
  onClick: () => void | Promise<void>;
}

function TrackpadButton({
  label,
  icon: Icon,
  iconSize,
  paddingY,
  bgColor,
  textColor,
  active,
  onClick,
}: TrackpadButtonProps) {
  const { pressedClass, pointerHandlers } = usePressableButton(active ?? false);

  return (
    <button
      type="button"
      aria-label={label}
      {...(active !== undefined ? { "aria-pressed": active } : {})}
      className={`ak-action-btn group relative flex items-center justify-center px-2 ${PRESSABLE_BUTTON_CLASS} ${active ? "sticky-active" : ""} ${pressedClass}`}
      style={{
        paddingTop: paddingY,
        paddingBottom: paddingY,
        color: textColor,
        backgroundColor: bgColor,
      }}
      onClick={() => void onClick()}
      {...pointerHandlers}
    >
      <span className="inline-flex shrink-0" style={{ width: iconSize, height: iconSize }}>
        <Icon className="h-full w-full" />
      </span>
      <HoverTooltip label={label} />
    </button>
  );
}

export function Trackpad() {
  const settings = useAppStore((s) => s.settings);
  const setLastError = useAppStore((s) => s.setLastError);
  const { ref, width } = useContainerSize<HTMLDivElement>();
  const compact = settings.inputAreaCompact;
  const showBottomRow = settings.mouseBottomRowVisible;
  const { iconSize, paddingY, gap } = computeButtonMetrics(width, compact);
  const [dragLock, setDragLock] = useState(false);
  const [precision, setPrecision] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const gestureReady = useRef(false);
  const gestureGen = useRef(0);
  const pendingDelta = useRef({ dx: 0, dy: 0 });
  const subPixel = useRef({ x: 0, y: 0 });
  const rafId = useRef<number | null>(null);
  const ipcInFlight = useRef(false);
  const pressStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const travelPx = useRef(0);
  const lastTapAt = useRef(0);
  const pendingClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyBgColor = settings.keyboardKeyColor ?? "#ffffff";
  const keyTextColor = settings.keyTextColor ?? "#1e293b";
  const surface = getSurfaceColors(settings.appBgColor);

  const speed =
    SPEED_MAP[resolveMouseSpeed(settings.mouseSpeed)] *
    (precision ? 0.4 : 1) *
    (settings.mouseCustomSpeed ?? 1);

  const clearPendingClick = () => {
    if (pendingClickTimer.current !== null) {
      clearTimeout(pendingClickTimer.current);
      pendingClickTimer.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      clearPendingClick();
      gestureGen.current += 1;
      gestureReady.current = false;
      if (dragging.current) {
        dragging.current = false;
        void invoke<CommandResult>("cmd_trackpad_gesture_end")
          .then((result) => {
            const failure = commandFailure(result);
            if (failure) logIpc("cmd_trackpad_gesture_end")(failure);
          })
          .catch(logIpc("cmd_trackpad_gesture_end"));
      }
    };
  }, []);

  const flushPendingMove = () => {
    rafId.current = null;
    if (ipcInFlight.current) {
      rafId.current = requestAnimationFrame(flushPendingMove);
      return;
    }
    const { dx, dy } = pendingDelta.current;
    if (dx === 0 && dy === 0) return;
    pendingDelta.current = { dx: 0, dy: 0 };
    ipcInFlight.current = true;
    void invoke<CommandResult>("cmd_move_cursor_relative", { dx, dy })
      .then((result) => {
        const failure = commandFailure(result);
        if (failure) logIpc("cmd_move_cursor_relative")(failure);
      })
      .catch(logIpc("cmd_move_cursor_relative"))
      .finally(() => {
        ipcInFlight.current = false;
      });
  };

  const fireLeftClick = async () => {
    const result = await invoke<CommandResult>("cmd_mouse_click", {
      button: "left",
    });
    const failure = commandFailure(result);
    if (failure) setLastError(failure);
  };

  const fireDoubleClick = async () => {
    const result = await invoke<CommandResult>("cmd_mouse_double_click");
    const failure = commandFailure(result);
    if (failure) setLastError(failure);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    lastPos.current = { x: e.clientX, y: e.clientY };
    pressStart.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    travelPx.current = 0;
    pendingDelta.current = { dx: 0, dy: 0 };
    subPixel.current = { x: 0, y: 0 };
    const gen = ++gestureGen.current;
    dragging.current = true;
    gestureReady.current = false;
    void invoke<CommandResult>("cmd_trackpad_gesture_begin")
      .then((result) => {
        const failure = commandFailure(result);
        if (failure) {
          if (gestureGen.current === gen) {
            dragging.current = false;
            gestureReady.current = false;
            setLastError(failure);
          }
          return;
        }
        if (gestureGen.current !== gen) {
          void invoke<CommandResult>("cmd_trackpad_gesture_end")
            .then((endResult) => {
              const endFailure = commandFailure(endResult);
              if (endFailure) {
                logIpc("cmd_trackpad_gesture_end")(endFailure);
                setLastError(endFailure);
              }
            })
            .catch(logIpc("cmd_trackpad_gesture_end"));
          return;
        }
        gestureReady.current = true;
      })
      .catch((error: unknown) => {
        logIpc("cmd_trackpad_gesture_begin")(error);
        if (gestureGen.current === gen) {
          dragging.current = false;
          gestureReady.current = false;
          setLastError(error instanceof Error ? error.message : String(error));
        }
      });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !lastPos.current) return;
    e.preventDefault();
    const rawDx = e.clientX - lastPos.current.x;
    const rawDy = e.clientY - lastPos.current.y;
    travelPx.current += Math.hypot(rawDx, rawDy);
    // Dragging past tap slop cancels a waiting single-click from a prior tap.
    if (travelPx.current > TAP_SLOP_PX) {
      clearPendingClick();
      lastTapAt.current = 0;
    }
    subPixel.current.x += rawDx * speed;
    subPixel.current.y += rawDy * speed;
    const dx = Math.round(subPixel.current.x);
    const dy = Math.round(subPixel.current.y);
    subPixel.current.x -= dx;
    subPixel.current.y -= dy;
    lastPos.current = { x: e.clientX, y: e.clientY };
    // Wait until the backend session is active so we never GetCursorPos on a touch point.
    if (!gestureReady.current || (dx === 0 && dy === 0)) return;
    pendingDelta.current.dx += dx;
    pendingDelta.current.dy += dy;
    rafId.current ??= requestAnimationFrame(flushPendingMove);
  };

  const handleTap = () => {
    const now = performance.now();
    if (lastTapAt.current > 0 && now - lastTapAt.current <= DOUBLE_TAP_MS) {
      clearPendingClick();
      lastTapAt.current = 0;
      void fireDoubleClick();
      return;
    }
    lastTapAt.current = now;
    clearPendingClick();
    pendingClickTimer.current = setTimeout(() => {
      pendingClickTimer.current = null;
      lastTapAt.current = 0;
      void fireLeftClick();
    }, DOUBLE_TAP_MS);
  };

  const endGesture = () => {
    // pointerup and lostpointercapture can both fire; end only once.
    if (!dragging.current) return;
    const start = pressStart.current;
    const duration = start ? performance.now() - start.t : Number.POSITIVE_INFINITY;
    const wasTap =
      travelPx.current <= TAP_SLOP_PX && duration <= TAP_MAX_MS;
    const endedGen = ++gestureGen.current;

    dragging.current = false;
    gestureReady.current = false;
    lastPos.current = null;
    pressStart.current = null;
    travelPx.current = 0;
    subPixel.current = { x: 0, y: 0 };
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }

    const endBackend = () => {
      if (gestureGen.current !== endedGen) return;
      void invoke<CommandResult>("cmd_trackpad_gesture_end")
        .then((result) => {
          const failure = commandFailure(result);
          if (failure) {
            logIpc("cmd_trackpad_gesture_end")(failure);
            setLastError(failure);
          }
        })
        .catch((error: unknown) => {
          logIpc("cmd_trackpad_gesture_end")(error);
          setLastError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (gestureGen.current !== endedGen) return;
          if (wasTap) handleTap();
        });
    };

    const flushThenEnd = () => {
      if (gestureGen.current !== endedGen) return;
      if (ipcInFlight.current) {
        rafId.current = requestAnimationFrame(flushThenEnd);
        return;
      }
      const { dx, dy } = pendingDelta.current;
      if (dx === 0 && dy === 0) {
        endBackend();
        return;
      }
      pendingDelta.current = { dx: 0, dy: 0 };
      ipcInFlight.current = true;
      void invoke<CommandResult>("cmd_move_cursor_relative", { dx, dy })
        .then((result) => {
          const failure = commandFailure(result);
          if (failure) logIpc("cmd_move_cursor_relative")(failure);
        })
        .catch(logIpc("cmd_move_cursor_relative"))
        .finally(() => {
          ipcInFlight.current = false;
          if (gestureGen.current !== endedGen) return;
          endBackend();
        });
    };

    flushThenEnd();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    endGesture();
  };

  const onLostPointerCapture = () => {
    endGesture();
  };
  const buttonProps = { iconSize, paddingY, bgColor: keyBgColor, textColor: keyTextColor };

  return (
    <div ref={ref} className="flex h-full min-h-0 flex-col" style={{ gap }}>
      <div
        className="min-h-0 flex-1 rounded-xl border-2 border-dashed touch-none"
        style={{ backgroundColor: surface.insetBg, borderColor: surface.insetBorder }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onLostPointerCapture}
      >
        <div
          className="flex h-full items-center justify-center"
          style={{ color: surface.insetText }}
        >
          Trackpad
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-3" style={{ gap }}>
        <TrackpadButton
          label="Left click"
          icon={LeftClickIcon}
          {...buttonProps}
          onClick={async () => {
            const result = await invoke<CommandResult>("cmd_mouse_click", {
              button: "left",
            });
            const failure = commandFailure(result);
            if (failure) setLastError(failure);
          }}
        />
        <TrackpadButton
          label="Double click"
          icon={DoubleClickIcon}
          {...buttonProps}
          onClick={async () => {
            const result = await invoke<CommandResult>("cmd_mouse_double_click");
            const failure = commandFailure(result);
            if (failure) setLastError(failure);
          }}
        />
        <TrackpadButton
          label="Right click"
          icon={RightClickIcon}
          {...buttonProps}
          onClick={async () => {
            const result = await invoke<CommandResult>("cmd_mouse_click", {
              button: "right",
            });
            const failure = commandFailure(result);
            if (failure) setLastError(failure);
          }}
        />
        {showBottomRow && (
          <>
            <TrackpadButton
              label="Drag lock"
              icon={DragLockIcon}
              {...buttonProps}
              active={dragLock}
              onClick={() => { setDragLock(!dragLock); }}
            />
            <TrackpadButton
              label="Precision mode"
              icon={PrecisionIcon}
              {...buttonProps}
              active={precision}
              onClick={() => { setPrecision(!precision); }}
            />
            <TrackpadButton
              label="Scroll"
              icon={ScrollIcon}
              {...buttonProps}
              onClick={async () => {
                const result = await invoke<CommandResult>("cmd_mouse_scroll", {
                  delta: 120,
                  horizontal: false,
                });
                const failure = commandFailure(result);
                if (failure) setLastError(failure);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
