import {
  AUTO_SEND_LOGS_CHECK_INTERVAL_MS,
  AUTO_SEND_LOGS_NOTE,
  AUTO_SEND_LOGS_START_DELAY_MS,
  shouldAutoSend,
} from "./autoSendLogs";
import { sendDiagnosticsErrorKey } from "./sendDiagnostics";

export type AutoSendLogsSchedulerDeps = {
  isEnabled: () => boolean;
  isConfigured: () => boolean;
  getLastSuccessAt: () => string | null | undefined;
  now: () => number;
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  onSuccess: (iso: string) => void;
  log: { warn: (message: string) => void };
};

export function startAutoSendLogsScheduler(
  deps: AutoSendLogsSchedulerDeps,
): () => void {
  const {
    isEnabled,
    isConfigured,
    getLastSuccessAt,
    now,
    invoke,
    onSuccess,
    log,
  } = deps;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let inFlight = false;
  let stopped = false;

  async function check(): Promise<void> {
    if (stopped || inFlight) {
      return;
    }
    if (
      !shouldAutoSend({
        enabled: isEnabled(),
        configured: isConfigured(),
        lastSuccessAt: getLastSuccessAt(),
        now: now(),
      })
    ) {
      return;
    }
    inFlight = true;
    try {
      await invoke("cmd_send_diagnostics", {
        send: true,
        note: AUTO_SEND_LOGS_NOTE,
      });
      onSuccess(new Date(now()).toISOString());
    } catch (error) {
      log.warn(sendDiagnosticsErrorKey(error));
    } finally {
      inFlight = false;
    }
  }

  const startTimer = setTimeout(() => {
    void check();
    intervalId = setInterval(() => {
      void check();
    }, AUTO_SEND_LOGS_CHECK_INTERVAL_MS);
  }, AUTO_SEND_LOGS_START_DELAY_MS);

  return () => {
    stopped = true;
    clearTimeout(startTimer);
    if (intervalId !== undefined) {
      clearInterval(intervalId);
    }
  };
}
