import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppShell } from "./components/layout/AppShell";
import { useAppStore } from "./stores/appStore";

function App() {
  const { loadProfiles, loadMonitors, loadKeyboardLayout, pollKeyboardState } =
    useAppStore();

  useEffect(() => {
    const init = async () => {
      await loadProfiles();
      await loadMonitors();
      await loadKeyboardLayout();
      await pollKeyboardState();
      await invoke("cmd_set_always_on_top", { enabled: true });
      await invoke("cmd_set_window_focusable", { focusable: false });
    };
    init();
  }, [loadProfiles, loadMonitors, loadKeyboardLayout, pollKeyboardState]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void pollKeyboardState();
    }, 50);
    return () => window.clearInterval(id);
  }, [pollKeyboardState]);

  return <AppShell />;
}

export default App;
