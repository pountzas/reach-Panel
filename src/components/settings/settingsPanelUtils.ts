import { invoke } from "@tauri-apps/api/core";
import type { TranslationKey } from "../../i18n";
import { notify } from "../../lib/notify";
import type { TaskbarPosition } from "../../lib/types";

type TaskbarPositionResult = {
  success: boolean;
  applied: boolean;
  message: string;
  current?: TaskbarPosition | null;
  open_taskbar_settings?: boolean;
};

type TaskbarPositionPreferencePatch = {
  taskbarPositionPreference: TaskbarPosition;
};

export const handleSaveProfile = async (
  saveActiveProfile: () => Promise<void>,
  t: (key: TranslationKey) => string,
): Promise<void> => {
  try {
    await saveActiveProfile();
    notify.success(t("profileSaved"));
  } catch (error) {
    notify.error(error instanceof Error ? error.message : String(error));
  }
};

export const handleDeleteProfile = async (
  activeProfileFile: string | null | undefined,
  deleteProfileFile: (filename: string) => Promise<void>,
  t: (key: TranslationKey) => string,
): Promise<void> => {
  if (!activeProfileFile) return;
  if (!window.confirm(t("deleteProfileConfirm"))) return;
  try {
    await deleteProfileFile(activeProfileFile);
    notify.success(t("profileDeleted"));
  } catch (error) {
    notify.error(error instanceof Error ? error.message : String(error));
  }
};

export const handleWipeProfile = async (
  wipeActiveProfile: () => Promise<void>,
  t: (key: TranslationKey) => string,
): Promise<void> => {
  if (!window.confirm(t("wipeProfileConfirm"))) return;
  try {
    await wipeActiveProfile();
    notify.success(t("profileWiped"));
  } catch (error) {
    notify.error(error instanceof Error ? error.message : String(error));
  }
};

export const applyTaskbarPosition = async (
  position: TaskbarPosition,
  currentPreference: TaskbarPosition | string | null | undefined,
  monitorId: number | null | undefined,
  updateSettings: (patch: TaskbarPositionPreferencePatch) => void,
  t: (key: TranslationKey) => string,
): Promise<void> => {
  const previous: TaskbarPosition = currentPreference === "top" ? "top" : "bottom";
  updateSettings({ taskbarPositionPreference: position });
  try {
    const result = await invoke<TaskbarPositionResult>("cmd_set_taskbar_position", {
      position,
      monitorId,
    });
    if (result.success) {
      if (result.applied) {
        notify.success(t("taskbarPositionApplied"));
      }
      return;
    }
    const actual: TaskbarPosition =
      result.current === "top" || result.current === "bottom"
        ? result.current
        : previous;
    updateSettings({ taskbarPositionPreference: actual });
    notify.info(result.message || t("taskbarPositionUnsupported"));
    if (result.open_taskbar_settings) {
      void invoke("cmd_open_windows_settings", {
        uri: "ms-settings:taskbar",
      }).catch(() => {});
    }
  } catch {
    updateSettings({ taskbarPositionPreference: previous });
    notify.error(t("taskbarPositionFailed"));
  }
};
