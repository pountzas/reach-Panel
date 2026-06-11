import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { v4 as uuidv4 } from "../../lib/uuid";
import { useAppStore } from "../../stores/appStore";
import { INTERNAL_PROFILE_ID, type QuickAction } from "../../lib/types";

export function QuickActionEditor() {
  const { quickActions, loadQuickActions, saveActiveProfile } = useAppStore();
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState("");
  const [actionType, setActionType] = useState<"app" | "url">("url");
  const [category, setCategory] = useState("Utilities");

  const save = async () => {
    if (!label || !target) return;
    const action: QuickAction = {
      id: uuidv4(),
      profile_id: INTERNAL_PROFILE_ID,
      label,
      target,
      action_type: actionType,
      category,
      sort_order: quickActions.length,
    };
    await invoke("cmd_save_quick_action", { action });
    setLabel("");
    setTarget("");
    await loadQuickActions();
    await saveActiveProfile();
  };

  const remove = async (id: string) => {
    await invoke("cmd_delete_quick_action", { id });
    await loadQuickActions();
    await saveActiveProfile();
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <h3 className="mb-2 font-semibold">Quick Action Editor</h3>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <input
          className="rounded border px-2 py-1 text-sm"
          placeholder="Label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          className="rounded border px-2 py-1 text-sm"
          placeholder="Target (chrome or URL)"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <select
          className="rounded border px-2 py-1 text-sm"
          value={actionType}
          onChange={(e) => setActionType(e.target.value as "app" | "url")}
        >
          <option value="app">App</option>
          <option value="url">URL</option>
        </select>
        <select
          className="rounded border px-2 py-1 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option>Entertainment</option>
          <option>School</option>
          <option>Communication</option>
          <option>Utilities</option>
        </select>
      </div>
      <button
        type="button"
        className="mb-3 rounded-lg bg-blue-600 px-3 py-1 text-sm text-white"
        onClick={save}
      >
        Add Action
      </button>
      <ul className="space-y-1 text-sm">
        {quickActions.map((a) => (
          <li key={a.id} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1">
            <span>
              {a.label} ({a.category})
            </span>
            <button type="button" className="text-red-600" onClick={() => remove(a.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
