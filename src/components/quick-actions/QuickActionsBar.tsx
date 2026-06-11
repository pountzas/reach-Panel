import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../stores/appStore";

const CATEGORY_COLORS: Record<string, string> = {
  Entertainment: "bg-purple-100 text-purple-800",
  School: "bg-green-100 text-green-800",
  Communication: "bg-blue-100 text-blue-800",
  Utilities: "bg-amber-100 text-amber-800",
};

export function QuickActionsBar() {
  const { quickActions, loadQuickActions } = useAppStore();

  const launch = async (actionType: string, target: string) => {
    await invoke("cmd_launch_quick_action", { actionType, target });
  };

  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-white px-3 py-2">
      {quickActions.map((action) => (
        <button
          key={action.id}
          type="button"
          className={`rounded-xl px-4 py-2 text-sm font-semibold shadow-sm ${CATEGORY_COLORS[action.category] ?? "bg-slate-100"}`}
          onClick={() => launch(action.action_type, action.target)}
        >
          {action.label}
        </button>
      ))}
      <button
        type="button"
        className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500"
        onClick={() => loadQuickActions()}
      >
        Refresh
      </button>
    </div>
  );
}
