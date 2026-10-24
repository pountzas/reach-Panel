import {
  disable as pluginDisable,
  enable as pluginEnable,
  isEnabled as pluginIsEnabled,
} from "@tauri-apps/plugin-autostart";

export const AUTOSTART_PREFERENCE_KNOWN_KEY = "autostartPreferenceKnown";
export const AUTOSTART_ENABLED_CACHE_KEY = "autostartEnabled";

export type AutostartApi = {
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  isEnabled: () => Promise<boolean>;
};

const defaultApi: AutostartApi = {
  enable: () => pluginEnable(),
  disable: () => pluginDisable(),
  isEnabled: () => pluginIsEnabled(),
};

function writeCache(storage: Storage, on: boolean): void {
  storage.setItem(AUTOSTART_PREFERENCE_KNOWN_KEY, "1");
  storage.setItem(AUTOSTART_ENABLED_CACHE_KEY, on ? "1" : "0");
}

export function isAutostartPreferenceKnown(
  storage: Storage = localStorage,
): boolean {
  return storage.getItem(AUTOSTART_PREFERENCE_KNOWN_KEY) === "1";
}

export function getCachedAutostartEnabled(
  storage: Storage = localStorage,
): boolean {
  return storage.getItem(AUTOSTART_ENABLED_CACHE_KEY) === "1";
}

/**
 * First run (unknown preference): enable() and mark known.
 * Known preference: mirror OS isEnabled() into cache (OS wins).
 */
export async function reconcileAutostartOnLoad(
  api: AutostartApi = defaultApi,
  storage: Storage = localStorage,
): Promise<boolean> {
  if (!isAutostartPreferenceKnown(storage)) {
    await api.enable();
    writeCache(storage, true);
    return true;
  }
  const on = await api.isEnabled();
  writeCache(storage, on);
  return on;
}

/** Enable/disable OS registration and update the global cache. */
export async function setAutostartEnabled(
  on: boolean,
  api: AutostartApi = defaultApi,
  storage: Storage = localStorage,
): Promise<boolean> {
  try {
    if (on) {
      await api.enable();
    } else {
      await api.disable();
    }
    writeCache(storage, on);
    return on;
  } catch (error) {
    try {
      const actual = await api.isEnabled();
      writeCache(storage, actual);
    } catch {
      // keep prior cache if OS read also fails
    }
    throw error;
  }
}
