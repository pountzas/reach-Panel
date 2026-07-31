import { useRef, useState, type ComponentType } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../stores/appStore";
import { useContainerSize } from "../../hooks/useContainerSize";
import { usePressableButton } from "../../hooks/usePressableButton";
import { HoverTooltip } from "../common/HoverTooltip";
import { PRESSABLE_BUTTON_CLASS } from "../../lib/buttonClasses";
import { getSurfaceColors } from "../../lib/colorProfiles";
import {
  MOUSE_SPEED_MULTIPLIERS,
  resolveMouseSpeed,
} from "../../lib/mouseSpeed";
import {
  DoubleClickIcon,
  DragLockIcon,
  LeftClickIcon,
  PrecisionIcon,
  RightClickIcon,
  ScrollIcon,
} from "./MouseButtonIcons";

const SPEED_MAP = MOUSE_SPEED_MULTIPLIERS;

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

interface TrackpadButtonProps {
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
  const { settings, pollError } = useAppStore();
  const { ref, width } = useContainerSize<HTMLDivElement>();
  const compact = settings.inputAreaCompact;
  const showBottomRow = settings.mouseBottomRowVisible;
  const { iconSize, paddingY, gap } = computeButtonMetrics(width, compact);
  const [dragLock, setDragLock] = useState(false);
  const [precision, setPrecision] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const keyBgColor = settings.keyboardKeyColor ?? "#ffffff";
  const keyTextColor = settings.keyTextColor ?? "#1e293b";
  const surface = getSurfaceColors(settings.appBgColor);

  const speed =
    (SPEED_MAP[resolveMouseSpeed(settings.mouseSpeed)] ?? 1) *
    (precision || settings.precisionMode ? 0.4 : 1) *
    (settings.mouseCustomSpeed ?? 1);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    lastPos.current = { x: e.clientX, y: e.clientY };
    dragging.current = true;
  };

  const onPointerMove = async (e: React.PointerEvent) => {
    if (!dragging.current || !lastPos.current) return;
    const dx = Math.round((e.clientX - lastPos.current.x) * speed);
    const dy = Math.round((e.clientY - lastPos.current.y) * speed);
    if (dx !== 0 || dy !== 0) {
      await invoke("cmd_move_cursor_relative", { dx, dy });
      await pollError();
    }
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = () => {
    dragging.current = false;
    lastPos.current = null;
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
            await invoke("cmd_mouse_click", { button: "left" });
            await pollError();
          }}
        />
        <TrackpadButton
          label="Double click"
          icon={DoubleClickIcon}
          {...buttonProps}
          onClick={async () => {
            await invoke("cmd_mouse_double_click");
            await pollError();
          }}
        />
        <TrackpadButton
          label="Right click"
          icon={RightClickIcon}
          {...buttonProps}
          onClick={async () => {
            await invoke("cmd_mouse_click", { button: "right" });
            await pollError();
          }}
        />
        {showBottomRow && (
          <>
            <TrackpadButton
              label="Drag lock"
              icon={DragLockIcon}
              {...buttonProps}
              active={dragLock}
              onClick={() => setDragLock(!dragLock)}
            />
            <TrackpadButton
              label="Precision mode"
              icon={PrecisionIcon}
              {...buttonProps}
              active={precision}
              onClick={() => setPrecision(!precision)}
            />
            <TrackpadButton
              label="Scroll"
              icon={ScrollIcon}
              {...buttonProps}
              onClick={async () => {
                await invoke("cmd_mouse_scroll", { delta: 120, horizontal: false });
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
