import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../stores/appStore";
import { getSurfaceColors } from "../../lib/colorProfiles";
import { resolveQuickActionIcon } from "../../lib/quickActionIcons";
import {
  INSTALLABLE_APPS,
  type InstallableApp,
} from "../../lib/quickActionInstall";
import { useTranslation } from "../../hooks/useTranslation";
import type { QuickAction } from "../../lib/types";

function ActionTile({
  action,
  onLaunch,
  mutedText,
}: {
  action: QuickAction;
  onLaunch: () => void;
  mutedText: string;
}) {
  const [iconSrc, setIconSrc] = useState<string | null>(null);
  const [iconFailed, setIconFailed] = useState(false);
  const initial = (action.label.trim().charAt(0) || "?").toUpperCase();

  useEffect(() => {
    let cancelled = false;
    setIconFailed(false);
    setIconSrc(null);
    void resolveQuickActionIcon(action).then((src) => {
      if (!cancelled) setIconSrc(src);
    });
    return () => {
      cancelled = true;
    };
  }, [action.action_type, action.target, action.id]);

  const showImage = Boolean(iconSrc) && !iconFailed;

  return (
    <button
      type="button"
      title={action.label}
      aria-label={action.label}
      className="flex w-[4.5rem] shrink-0 flex-col items-center gap-1 self-start rounded-lg px-1 py-1 hover:bg-black/5 active:bg-black/10"
      onClick={onLaunch}
    >
      <span className="flex h-10 w-10 items-center justify-center">
        {showImage ? (
          <img
            src={iconSrc!}
            alt=""
            className="h-8 w-8 object-contain"
            draggable={false}
            onError={() => setIconFailed(true)}
          />
        ) : (
          <span
            className="text-base font-bold leading-none"
            style={{ color: mutedText }}
          >
            {initial}
          </span>
        )}
      </span>
      <span
        className="line-clamp-2 w-full text-center text-[10px] font-semibold leading-tight"
        style={{ color: mutedText }}
      >
        {action.label}
      </span>
    </button>
  );
}

async function isAnyProbeInstalled(probes: string[]): Promise<boolean> {
  for (const target of probes) {
    try {
      const ok = await invoke<boolean>("cmd_is_app_installed", { target });
      if (ok) return true;
    } catch {
      // ignore probe failures
    }
  }
  return false;
}

export function QuickActionsBar() {
  const { t } = useTranslation();
  const { quickActions, settings, setShowSettings } = useAppStore();
  const surface = getSurfaceColors(settings.appBgColor);
  const [missingInstalls, setMissingInstalls] = useState<InstallableApp[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const missing: InstallableApp[] = [];
      for (const app of INSTALLABLE_APPS) {
        const installed = await isAnyProbeInstalled(app.probeTargets);
        if (!installed) missing.push(app);
      }
      if (!cancelled) setMissingInstalls(missing);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const launch = async (actionType: string, target: string) => {
    await invoke("cmd_launch_quick_action", { actionType, target });
  };

  const openInstall = async (url: string) => {
    await invoke("cmd_launch_quick_action", {
      actionType: "url",
      target: url,
    });
  };

  return (
    <div
      className="flex h-full flex-col gap-2 overflow-auto px-3 py-2"
      style={{ backgroundColor: surface.panelBg }}
    >
      <div className="flex flex-wrap content-start items-start gap-2">
        {quickActions.map((action) => (
          <ActionTile
            key={action.id}
            action={action}
            mutedText={surface.panelText}
            onLaunch={() => void launch(action.action_type, action.target)}
          />
        ))}
        <button
          type="button"
          title={t("quickActionAdd")}
          aria-label={t("quickActionAdd")}
          className="flex h-[4.25rem] w-[4.5rem] shrink-0 flex-col items-center justify-center gap-1 self-start rounded-lg border border-dashed text-xs font-semibold"
          style={{
            borderColor: surface.panelBorder,
            color: surface.panelMutedText,
          }}
          onClick={() => setShowSettings(true)}
        >
          <span className="text-lg leading-none">+</span>
          <span>{t("add")}</span>
        </button>
      </div>

      {missingInstalls.length > 0 && (
        <div
          className="flex flex-col gap-1 text-[11px] leading-snug"
          style={{ color: surface.panelMutedText }}
        >
          {missingInstalls.map((app) => (
            <p key={app.name}>
              {t("appNotInstalled").replace("{app}", app.name)}{" "}
              <button
                type="button"
                className="font-semibold underline underline-offset-2"
                style={{ color: surface.panelText }}
                onClick={() => void openInstall(app.installUrl)}
              >
                {t("installApp")}
              </button>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
