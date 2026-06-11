import { useAppStore } from "../../stores/appStore";
import { Trackpad } from "./Trackpad";

export function MousePanel() {
  const { settings, updateSettings } = useAppStore();

  return (
    <div
      className="flex h-full flex-col rounded-xl border border-slate-300 bg-slate-50 p-2"
      style={{ width: settings.mousePanelWidth, minWidth: 180 }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">Mouse</span>
        <select
          className="rounded border px-1 py-0.5 text-xs"
          value={settings.mouseSide}
          onChange={(e) =>
            updateSettings({
              mouseSide: e.target.value as "right" | "left" | "floating",
            })
          }
        >
          <option value="right">Right</option>
          <option value="left">Left</option>
          <option value="floating">Floating</option>
        </select>
      </div>
      <div className="mb-2">
        <label className="text-xs text-slate-500">Width</label>
        <input
          type="range"
          min={180}
          max={400}
          value={settings.mousePanelWidth}
          onChange={(e) =>
            updateSettings({ mousePanelWidth: Number(e.target.value) })
          }
          className="w-full"
        />
      </div>
      <div className="mb-2">
        <label className="text-xs text-slate-500">Speed</label>
        <select
          className="w-full rounded border px-2 py-1 text-sm"
          value={settings.mouseSpeed}
          onChange={(e) =>
            updateSettings({
              mouseSpeed: e.target.value as "slow" | "medium" | "fast" | "custom",
            })
          }
        >
          <option value="slow">Slow</option>
          <option value="medium">Medium</option>
          <option value="fast">Fast</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div className="min-h-0 flex-1">
        <Trackpad />
      </div>
    </div>
  );
}
