import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "../../hooks/useTranslation";
import { StopIcon } from "../common/SectionIcons";
import { DictationVisualizer } from "./DictationVisualizer";

type SttUiState = "idle" | "listening" | "processing";

export function DictationOverlay() {
  const { t } = useTranslation();
  const [state, setState] = useState<SttUiState>("listening");
  const [captureAudio, setCaptureAudio] = useState(true);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    document.body.style.background = "transparent";
  }, []);

  useEffect(() => {
    const refreshCapture = async () => {
      try {
        const status = await invoke<{ engine: string }>("cmd_get_stt_status", {
          language: null,
          groqApiKey: null,
        });
        setCaptureAudio(status.engine !== "groq");
      } catch {
        setCaptureAudio(true);
      }
    };

    void refreshCapture();

    const unlisten = listen<{ state: SttUiState }>("stt-state", (event) => {
      setState(event.payload.state);
      if (event.payload.state === "listening") {
        void refreshCapture();
      }
    });

    return () => {
      void unlisten.then((stop) => stop());
    };
  }, []);

  useEffect(() => {
    if (state === "idle") {
      setEntered(false);
      return;
    }
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, [state]);

  const active = state !== "idle";

  return (
    <div className="flex h-screen w-screen items-end justify-center bg-transparent">
      <div
        className={`flex items-center gap-3 rounded-full bg-slate-900/90 px-3 py-2 shadow-lg transition-[opacity,transform] motion-reduce:transition-none motion-reduce:translate-y-0 ${
          entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
        style={{
          transitionDuration: "var(--rp-dur-base)",
          transitionTimingFunction: "var(--rp-ease-out)",
        }}
      >
        <DictationVisualizer active={active} captureAudio={captureAudio} />
        <span className="whitespace-nowrap text-sm font-medium text-slate-100">
          {t("dictationListening")}
        </span>
        <button
          type="button"
          aria-label={t("dictationStop")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
          onClick={() => void invoke("cmd_stop_dictation")}
        >
          <StopIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
