import { describe, expect, it, vi } from "vitest";
import {
  KEY_REPEAT_INITIAL_DELAY_MS,
  KEY_REPEAT_INTERVAL_MS,
  createSerialCoalesceGate,
} from "./keyRepeat";

describe("keyRepeat constants", () => {
  it("matches Windows-like initial delay and repeat interval", () => {
    expect(KEY_REPEAT_INITIAL_DELAY_MS).toBe(500);
    expect(KEY_REPEAT_INTERVAL_MS).toBe(33);
  });
});

describe("createSerialCoalesceGate", () => {
  it("queues discrete presses so none are skipped", async () => {
    const gate = createSerialCoalesceGate();
    const order: number[] = [];
    let resolveFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    gate.enqueue(async () => {
      order.push(1);
      await first;
    });
    gate.enqueue(async () => {
      order.push(2);
    });
    gate.enqueue(async () => {
      order.push(3);
    });

    await Promise.resolve();
    expect(order).toEqual([1]);
    resolveFirst();
    await vi.waitFor(() => {
      expect(order).toEqual([1, 2, 3]);
    });
  });

  it("coalesces repeat ticks while busy to a single pending run", async () => {
    const gate = createSerialCoalesceGate();
    const runs = vi.fn();
    let resolveFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    gate.enqueue(async () => {
      runs("a");
      await first;
    });
    await Promise.resolve();

    gate.coalesce(async () => {
      runs("b");
    });
    gate.coalesce(async () => {
      runs("c");
    });
    gate.coalesce(async () => {
      runs("d");
    });

    resolveFirst();
    await vi.waitFor(() => {
      expect(runs.mock.calls.map((c) => c[0])).toEqual(["a", "d"]);
    });
  });

  it("whenIdle waits for queued and coalesced work before resolving", async () => {
    const gate = createSerialCoalesceGate();
    const order: string[] = [];
    let resolveFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    gate.enqueue(async () => {
      order.push("inject");
      await first;
    });
    await Promise.resolve();

    gate.coalesce(async () => {
      order.push("repeat");
    });

    const idle = gate.whenIdle().then(() => {
      order.push("idle");
    });

    expect(order).toEqual(["inject"]);
    resolveFirst();
    await idle;
    expect(order).toEqual(["inject", "repeat", "idle"]);
  });
});
