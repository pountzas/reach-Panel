import type { AutoSendLogsSchedulerDeps } from "./autoSendLogsScheduler";

export type AutoSendLogsMountDeps = {
  invoke: AutoSendLogsSchedulerDeps["invoke"];
  startScheduler: (deps: AutoSendLogsSchedulerDeps) => () => void;
  getSettings: () => {
    autoSendLogsWeekly?: boolean;
    lastAutoSendLogsAt?: string;
    lastAutoSendLogsAttemptAt?: string;
  };
  updateSettings: (partial: {
    lastAutoSendLogsAt?: string;
    lastAutoSendLogsAttemptAt?: string;
  }) => void;
  now: () => Date;
  log: { warn: (message: string) => void };
};

export async function mountAutoSendLogs(
  deps: AutoSendLogsMountDeps,
): Promise<() => void> {
  const available = await deps.invoke("cmd_diagnostics_upload_available");
  if (available !== true) {
    return () => {};
  }
  return deps.startScheduler({
    isEnabled: () => deps.getSettings().autoSendLogsWeekly === true,
    isConfigured: () => true,
    getLastSuccessAt: () => deps.getSettings().lastAutoSendLogsAt,
    getLastAttemptAt: () => deps.getSettings().lastAutoSendLogsAttemptAt,
    now: () => deps.now().getTime(),
    invoke: deps.invoke,
    onAttempt: (iso) => {
      deps.updateSettings({ lastAutoSendLogsAttemptAt: iso });
    },
    onSuccess: (iso) => {
      deps.updateSettings({ lastAutoSendLogsAt: iso });
    },
    log: deps.log,
  });
}
