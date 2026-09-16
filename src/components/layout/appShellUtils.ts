import { exit } from "@tauri-apps/plugin-process";
import { closeAllToolWindows } from "../../lib/toolWindows";

export const handleCloseApp = (): void => {
  void closeAllToolWindows().finally(() => {
    void exit(0);
  });
};
