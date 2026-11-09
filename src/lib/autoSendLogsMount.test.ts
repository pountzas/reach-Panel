import { describe, expect, it, vi } from "vitest";
import {
  mountAutoSendLogs,
  type AutoSendLogsMountDeps,
} from "./autoSendLogsMount";

type SchedulerDeps = Parameters<AutoSendLogsMountDeps["startScheduler"]>[0];

function fakeDeps(
  overrides: Partial<AutoSendLogsMountDeps> = {},
): AutoSendLogsMountDeps {
  return {
    invoke: async () => true,
    startScheduler: () => () => {},
    getSettings: () => ({}),
    updateSettings: () => {},
    now: () => new Date("2026-11-09T00:00:00.000Z"),
    log: { warn: () => {} },
    ...overrides,
  };
}

describe("mountAutoSendLogs", () => {
  it("starts the scheduler when upload is configured", async () => {
    let schedulerDeps: SchedulerDeps | undefined;
    const startScheduler = vi.fn((deps: SchedulerDeps) => {
      schedulerDeps = deps;
      return () => {};
    });
    const invoke = vi.fn(async () => true);
    const updateSettings = vi.fn();
    await mountAutoSendLogs(
      fakeDeps({
        invoke,
        startScheduler,
        updateSettings,
      }),
    );
    expect(invoke).toHaveBeenCalledWith("cmd_diagnostics_upload_available");
    expect(startScheduler).toHaveBeenCalledTimes(1);
    schedulerDeps?.onAttempt("2026-11-09T00:00:00.000Z");
    schedulerDeps?.onSuccess("2026-11-09T00:00:00.000Z");
    expect(updateSettings).toHaveBeenCalledWith({
      lastAutoSendLogsAttemptAt: "2026-11-09T00:00:00.000Z",
    });
    expect(updateSettings).toHaveBeenCalledWith({
      lastAutoSendLogsAt: "2026-11-09T00:00:00.000Z",
    });
  });

  it("does not start the scheduler when upload is unconfigured", async () => {
    const startScheduler = vi.fn(() => () => {});
    const invoke = vi.fn(async () => false);
    const stop = await mountAutoSendLogs(
      fakeDeps({
        invoke,
        startScheduler,
      }),
    );
    expect(invoke).toHaveBeenCalledWith("cmd_diagnostics_upload_available");
    expect(startScheduler).not.toHaveBeenCalled();
    expect(typeof stop).toBe("function");
  });

  it("reads enabled and last success from getSettings at check time", async () => {
    const settings = {
      autoSendLogsWeekly: false as boolean | undefined,
      lastAutoSendLogsAt: undefined as string | undefined,
      lastAutoSendLogsAttemptAt: undefined as string | undefined,
    };
    let schedulerDeps: SchedulerDeps | undefined;
    await mountAutoSendLogs(
      fakeDeps({
        getSettings: () => ({ ...settings }),
        startScheduler: (deps) => {
          schedulerDeps = deps;
          return () => {};
        },
      }),
    );
    settings.autoSendLogsWeekly = true;
    settings.lastAutoSendLogsAt = "2026-01-01T00:00:00.000Z";
    settings.lastAutoSendLogsAttemptAt = "2026-11-08T00:00:00.000Z";
    expect(schedulerDeps?.isEnabled()).toBe(true);
    expect(schedulerDeps?.getLastSuccessAt()).toBe("2026-01-01T00:00:00.000Z");
    expect(schedulerDeps?.getLastAttemptAt()).toBe("2026-11-08T00:00:00.000Z");
  });
});
