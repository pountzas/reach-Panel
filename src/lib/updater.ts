import { getVersion } from "@tauri-apps/api/app";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const SKIPPED_VERSION_KEY = "skippedUpdateVersion";

export type UpdateProgress = {
  downloaded: number;
  contentLength: number | null;
};

export function getSkippedUpdateVersion(): string | null {
  return localStorage.getItem(SKIPPED_VERSION_KEY);
}

export function skipUpdateVersion(version: string): void {
  localStorage.setItem(SKIPPED_VERSION_KEY, version);
}

export async function getCurrentAppVersion(): Promise<string> {
  return getVersion();
}

export async function checkForUpdate(): Promise<Update | null> {
  if (import.meta.env.DEV) {
    return null;
  }

  try {
    const update = await check();
    if (!update) {
      return null;
    }

    const skipped = getSkippedUpdateVersion();
    if (skipped === update.version) {
      return null;
    }

    return update;
  } catch {
    return null;
  }
}

export async function installUpdate(
  update: Update,
  onProgress: (progress: UpdateProgress) => void,
): Promise<void> {
  let downloaded = 0;
  let contentLength: number | null = null;

  await update.downloadAndInstall((event: DownloadEvent) => {
    switch (event.event) {
      case "Started":
        contentLength = event.data.contentLength ?? null;
        downloaded = 0;
        onProgress({ downloaded, contentLength });
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress({ downloaded, contentLength });
        break;
      case "Finished":
        onProgress({ downloaded, contentLength });
        break;
      default: {
        const _exhaustive: never = event;
        return _exhaustive;
      }
    }
  });

  await relaunch();
}
