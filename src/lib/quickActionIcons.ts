import { invoke } from "@tauri-apps/api/core";
import type { QuickAction } from "./types";

const iconCache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

function cacheKey(action: Pick<QuickAction, "action_type" | "target">): string {
  return `${action.action_type}:${action.target}`;
}

/** Favicon URL for a website target. */
export function urlFaviconSrc(target: string): string | null {
  try {
    const href = target.includes("://") ? target : `https://${target}`;
    const host = new URL(href).hostname;
    if (!host) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
  } catch {
    return null;
  }
}

/**
 * Resolve a display icon for a quick action.
 * URLs use a favicon service; apps use a native Windows icon extract command.
 */
export async function resolveQuickActionIcon(
  action: Pick<QuickAction, "action_type" | "target">,
): Promise<string | null> {
  const key = cacheKey(action);
  if (iconCache.has(key)) {
    return iconCache.get(key) ?? null;
  }
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    let src: string | null = null;
    if (action.action_type === "url") {
      src = urlFaviconSrc(action.target);
    } else if (action.action_type === "app") {
      try {
        src = await invoke<string | null>("cmd_get_app_icon", {
          target: action.target,
        });
      } catch {
        src = null;
      }
    }
    iconCache.set(key, src);
    inflight.delete(key);
    return src;
  })();

  inflight.set(key, promise);
  return promise;
}
