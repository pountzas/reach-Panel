import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../stores/appStore";
import {
  DoubleClickIcon,
  DragLockIcon,
  LeftClickIcon,
  PrecisionIcon,
  RightClickIcon,
  ScrollIcon,
} from "./MouseButtonIcons";

const SPEED_MAP = { slow: 0.5, medium: 1, fast: 2, custom: 1.5 };

export function Trackpad() {
  const { settings, pollError } = useAppStore();
  const [dragLock, setDragLock] = useState(false);
  const [precision, setPrecision] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);

  const speed =
    (SPEED_MAP[settings.mouseSpeed] ?? 1) *
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

  return (
    <div className="flex h-full flex-col gap-2">
      <div
        className="flex-1 rounded-xl border-2 border-dashed border-slate-400 bg-slate-100 touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="flex h-full items-center justify-center text-slate-500">
          Trackpad
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          aria-label="Left click"
          title="Left click"
          className="flex items-center justify-center rounded-lg bg-white px-2 py-3 text-slate-700 shadow"
          onClick={async () => {
            await invoke("cmd_mouse_click", { button: "left" });
            await pollError();
          }}
        >
          <LeftClickIcon />
        </button>
        <button
          type="button"
          aria-label="Double click"
          title="Double click"
          className="flex items-center justify-center rounded-lg bg-white px-2 py-3 text-slate-700 shadow"
          onClick={async () => {
            await invoke("cmd_mouse_double_click");
            await pollError();
          }}
        >
          <DoubleClickIcon />
        </button>
        <button
          type="button"
          aria-label="Right click"
          title="Right click"
          className="flex items-center justify-center rounded-lg bg-white px-2 py-3 text-slate-700 shadow"
          onClick={async () => {
            await invoke("cmd_mouse_click", { button: "right" });
            await pollError();
          }}
        >
          <RightClickIcon />
        </button>
        <button
          type="button"
          aria-label="Drag lock"
          title="Drag lock"
          aria-pressed={dragLock}
          className={`flex items-center justify-center rounded-lg px-2 py-3 text-slate-700 shadow ${dragLock ? "bg-blue-200" : "bg-white"}`}
          onClick={() => setDragLock(!dragLock)}
        >
          <DragLockIcon />
        </button>
        <button
          type="button"
          aria-label="Precision mode"
          title="Precision mode"
          aria-pressed={precision}
          className={`flex items-center justify-center rounded-lg px-2 py-3 text-slate-700 shadow ${precision ? "bg-blue-200" : "bg-white"}`}
          onClick={() => setPrecision(!precision)}
        >
          <PrecisionIcon />
        </button>
        <button
          type="button"
          aria-label="Scroll"
          title="Scroll"
          className="flex items-center justify-center rounded-lg bg-white px-2 py-3 text-slate-700 shadow"
          onClick={async () => {
            await invoke("cmd_mouse_scroll", { delta: 120, horizontal: false });
          }}
        >
          <ScrollIcon />
        </button>
      </div>
    </div>
  );
}
