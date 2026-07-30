import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { v4 as uuidv4 } from "../../lib/uuid";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import type { SurfaceColors } from "../../lib/colorProfiles";
import { resolveQuickActionIcon } from "../../lib/quickActionIcons";
import { INTERNAL_PROFILE_ID, type QuickAction } from "../../lib/types";

interface InstalledApp {
  name: string;
  path: string;
}

function fieldStyle(surface: SurfaceColors): CSSProperties {
  return {
    backgroundColor: surface.insetBg,
    borderColor: surface.insetBorder,
    color: surface.panelText,
  };
}

function InstalledAppRow({
  app,
  surface,
  onSelect,
}: {
  app: InstalledApp;
  surface: SurfaceColors;
  onSelect: () => void;
}) {
  const [iconSrc, setIconSrc] = useState<string | null>(null);
  const [iconFailed, setIconFailed] = useState(false);
  const initial = (app.name.trim().charAt(0) || "?").toUpperCase();

  useEffect(() => {
    let cancelled = false;
    setIconFailed(false);
    setIconSrc(null);
    void resolveQuickActionIcon({
      action_type: "app",
      target: app.path,
    }).then((src) => {
      if (!cancelled) setIconSrc(src);
    });
    return () => {
      cancelled = true;
    };
  }, [app.path]);

  const showImage = Boolean(iconSrc) && !iconFailed;

  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-black/5"
      style={{ color: surface.panelText }}
      onClick={onSelect}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded">
        {showImage ? (
          <img
            src={iconSrc!}
            alt=""
            className="h-7 w-7 object-contain"
            draggable={false}
            onError={() => setIconFailed(true)}
          />
        ) : (
          <span
            className="text-sm font-bold leading-none"
            style={{ color: surface.panelMutedText }}
          >
            {initial}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{app.name}</span>
        <span
          className="block w-full truncate text-[11px]"
          style={{ color: surface.panelMutedText }}
        >
          {app.path}
        </span>
      </span>
    </button>
  );
}

export function QuickActionEditor({ surface }: { surface: SurfaceColors }) {
  const { quickActions, loadQuickActions, saveActiveProfile } = useAppStore();
  const { t } = useTranslation();
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState("");
  const [actionType, setActionType] = useState<"app" | "url">("app");
  const [category, setCategory] = useState("Utilities");
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [appQuery, setAppQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (actionType !== "app") return;
    let cancelled = false;
    setAppsLoading(true);
    setAppsError(null);
    void invoke<InstalledApp[]>("cmd_list_installed_apps")
      .then((apps) => {
        if (!cancelled) setInstalledApps(apps);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAppsError(error instanceof Error ? error.message : String(error));
          setInstalledApps([]);
        }
      })
      .finally(() => {
        if (!cancelled) setAppsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [actionType]);

  const filteredApps = useMemo(() => {
    const q = appQuery.trim().toLowerCase();
    if (!q) return installedApps.slice(0, 80);
    return installedApps
      .filter(
        (app) =>
          app.name.toLowerCase().includes(q) ||
          app.path.toLowerCase().includes(q),
      )
      .slice(0, 80);
  }, [installedApps, appQuery]);

  const selectApp = (app: InstalledApp) => {
    setTarget(app.path);
    if (!label.trim()) {
      setLabel(app.name);
    }
    setAppQuery(app.name);
    setPickerOpen(false);
  };

  const browseExe = async () => {
    const path = await invoke<string | null>("cmd_pick_app_executable");
    if (!path) return;
    setTarget(path);
    setActionType("app");
    if (!label.trim()) {
      const base = path.split(/[/\\]/).pop() ?? path;
      setLabel(base.replace(/\.exe$/i, ""));
    }
    setAppQuery(path);
    setPickerOpen(false);
  };

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
    setAppQuery("");
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
        <select
          className={inputClass}
          style={fieldStyle(surface)}
          value={actionType}
          onChange={(e) => {
            const next = e.target.value as "app" | "url";
            setActionType(next);
            setTarget("");
            setAppQuery("");
            setPickerOpen(false);
          }}
        >
          <option value="app">{t("quickActionTypeApp")}</option>
          <option value="url">{t("quickActionTypeUrl")}</option>
        </select>

        {actionType === "url" ? (
          <input
            className={`${inputClass} col-span-2`}
            style={fieldStyle(surface)}
            placeholder={t("quickActionTarget")}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        ) : (
          <div className="relative col-span-2">
            <div className="flex gap-2">
              <input
                className={`${inputClass} min-w-0 flex-1`}
                style={fieldStyle(surface)}
                placeholder={t("quickActionSearchApps")}
                value={appQuery}
                onChange={(e) => {
                  setAppQuery(e.target.value);
                  setPickerOpen(true);
                }}
                onFocus={() => setPickerOpen(true)}
              />
              <button
                type="button"
                className="shrink-0 rounded border px-2 py-1.5 text-sm"
                style={{
                  backgroundColor: surface.panelHeaderBg,
                  borderColor: surface.insetBorder,
                  color: surface.panelText,
                }}
                onClick={() => void browseExe()}
              >
                {t("quickActionBrowse")}
              </button>
            </div>
            {pickerOpen && (
              <div
                className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded border shadow-lg"
                style={{
                  backgroundColor: surface.panelBg,
                  borderColor: surface.panelBorder,
                }}
              >
                {appsLoading && (
                  <p
                    className="px-3 py-2 text-xs"
                    style={{ color: surface.panelMutedText }}
                  >
                    {t("quickActionLoadingApps")}
                  </p>
                )}
                {!appsLoading && appsError && (
                  <p className="px-3 py-2 text-xs text-red-600">{appsError}</p>
                )}
                {!appsLoading && !appsError && filteredApps.length === 0 && (
                  <p
                    className="px-3 py-2 text-xs"
                    style={{ color: surface.panelMutedText }}
                  >
                    {t("quickActionNoApps")}
                  </p>
                )}
                {!appsLoading &&
                  filteredApps.map((app) => (
                    <InstalledAppRow
                      key={app.path}
                      app={app}
                      surface={surface}
                      onSelect={() => selectApp(app)}
                    />
                  ))}
              </div>
            )}
            {target && (
              <p
                className="mt-1 truncate text-[11px]"
                style={{ color: surface.panelMutedText }}
                title={target}
              >
                {target}
              </p>
            )}
          </div>
        )}

        <select
          className={`${inputClass} col-span-2`}
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
        onClick={() => void save()}
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
              onClick={() => void remove(a.id)}
            >
              {t("quickActionDelete")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
