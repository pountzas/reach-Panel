// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTOSTART_ENABLED_CACHE_KEY,
  AUTOSTART_PREFERENCE_KNOWN_KEY,
  reconcileAutostartOnLoad,
  setAutostartEnabled,
  type AutostartApi,
} from "./autostart";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
    key: (i) => Array.from(map.keys())[i] ?? null,
  };
}

function mockApi(overrides: Partial<AutostartApi> = {}): AutostartApi {
  return {
    enable: vi.fn(async () => {}),
    disable: vi.fn(async () => {}),
    isEnabled: vi.fn(async () => false),
    ...overrides,
  };
}

describe("reconcileAutostartOnLoad", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("first run enables autostart and marks preference known", async () => {
    const api = mockApi();
    const on = await reconcileAutostartOnLoad(api, storage);
    expect(on).toBe(true);
    expect(api.enable).toHaveBeenCalledTimes(1);
    expect(api.disable).not.toHaveBeenCalled();
    expect(storage.getItem(AUTOSTART_PREFERENCE_KNOWN_KEY)).toBe("1");
    expect(storage.getItem(AUTOSTART_ENABLED_CACHE_KEY)).toBe("1");
  });

  it("does not mark known when first-run enable fails", async () => {
    const api = mockApi({
      enable: vi.fn(async () => {
        throw new Error("denied");
      }),
    });
    await expect(reconcileAutostartOnLoad(api, storage)).rejects.toThrow("denied");
    expect(storage.getItem(AUTOSTART_PREFERENCE_KNOWN_KEY)).toBeNull();
  });

  it("when known, OS false wins without calling enable", async () => {
    storage.setItem(AUTOSTART_PREFERENCE_KNOWN_KEY, "1");
    storage.setItem(AUTOSTART_ENABLED_CACHE_KEY, "1");
    const api = mockApi({ isEnabled: vi.fn(async () => false) });
    const on = await reconcileAutostartOnLoad(api, storage);
    expect(on).toBe(false);
    expect(api.enable).not.toHaveBeenCalled();
    expect(storage.getItem(AUTOSTART_ENABLED_CACHE_KEY)).toBe("0");
  });

  it("when known, OS true updates cache without disable", async () => {
    storage.setItem(AUTOSTART_PREFERENCE_KNOWN_KEY, "1");
    storage.setItem(AUTOSTART_ENABLED_CACHE_KEY, "0");
    const api = mockApi({ isEnabled: vi.fn(async () => true) });
    const on = await reconcileAutostartOnLoad(api, storage);
    expect(on).toBe(true);
    expect(api.disable).not.toHaveBeenCalled();
    expect(storage.getItem(AUTOSTART_ENABLED_CACHE_KEY)).toBe("1");
  });
});

describe("setAutostartEnabled", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
    storage.setItem(AUTOSTART_PREFERENCE_KNOWN_KEY, "1");
  });

  it("enable path calls enable and caches true", async () => {
    const api = mockApi();
    await expect(setAutostartEnabled(true, api, storage)).resolves.toBe(true);
    expect(api.enable).toHaveBeenCalledTimes(1);
    expect(storage.getItem(AUTOSTART_ENABLED_CACHE_KEY)).toBe("1");
    expect(storage.getItem(AUTOSTART_PREFERENCE_KNOWN_KEY)).toBe("1");
  });

  it("disable path calls disable and caches false", async () => {
    const api = mockApi();
    await expect(setAutostartEnabled(false, api, storage)).resolves.toBe(false);
    expect(api.disable).toHaveBeenCalledTimes(1);
    expect(storage.getItem(AUTOSTART_ENABLED_CACHE_KEY)).toBe("0");
  });

  it("on failure restores cache from isEnabled", async () => {
    const api = mockApi({
      enable: vi.fn(async () => {
        throw new Error("fail");
      }),
      isEnabled: vi.fn(async () => false),
    });
    await expect(setAutostartEnabled(true, api, storage)).rejects.toThrow("fail");
    expect(storage.getItem(AUTOSTART_ENABLED_CACHE_KEY)).toBe("0");
  });
});
