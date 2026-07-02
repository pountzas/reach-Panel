import { useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { v4 as uuidv4 } from "../../lib/uuid";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import type { SurfaceColors } from "../../lib/colorProfiles";
import { INTERNAL_PROFILE_ID, type QuickAction } from "../../lib/types";

function fieldStyle(surface: SurfaceColors): CSSProperties {
  return {
    backgroundColor: surface.insetBg,
    borderColor: surface.insetBorder,
    color: surface.panelText,
  };
}

export function QuickActionEditor({ surface }: { surface: SurfaceColors }) {
  const { quickActions, loadQuickActions, saveActiveProfile } = useAppStore();
  const { t } = useTranslation();
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

  const inputClass = "rounded border px-2 py-1.5 text-sm";

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <input
          className={inputClass}
          style={fieldStyle(surface)}
          placeholder={t("quickActionLabel")}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          className={inputClass}
          style={fieldStyle(surface)}
          placeholder={t("quickActionTarget")}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <select
          className={inputClass}
          style={fieldStyle(surface)}
          value={actionType}
          onChange={(e) => setActionType(e.target.value as "app" | "url")}
        >
          <option value="app">{t("quickActionTypeApp")}</option>
          <option value="url">{t("quickActionTypeUrl")}</option>
        </select>
        <select
          className={inputClass}
          style={fieldStyle(surface)}
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
        className="mb-3 rounded-lg px-3 py-1.5 text-sm"
        style={{
          backgroundColor: surface.panelHeaderBg,
          color: surface.panelText,
          borderColor: surface.panelBorder,
          borderWidth: 1,
        }}
        onClick={save}
      >
        {t("quickActionAdd")}
      </button>
      <ul className="space-y-1 text-sm">
        {quickActions.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between rounded px-2 py-1.5"
            style={{
              backgroundColor: surface.insetBg,
              color: surface.panelText,
            }}
          >
            <span>
              {a.label} ({a.category})
            </span>
            <button
              type="button"
              className="text-red-600"
              onClick={() => remove(a.id)}
            >
              {t("quickActionDelete")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
