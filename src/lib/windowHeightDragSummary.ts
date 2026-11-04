export type ResizeDragSummary = {
  startRatio: number;
  endRatio: number;
  durationMs: number;
  invokes: number;
  errors: number;
  maxInvokeMs: number;
};

type ResizeDragSession = {
  startRatio: number;
  startedAtMs: number;
  invokes: number;
  errors: number;
  maxInvokeMs: number;
};

let session: ResizeDragSession | null = null;

function nowMs(explicit?: number): number {
  return explicit ?? performance.now();
}

export function beginResizeDrag(startRatio: number, now = nowMs()): void {
  session = {
    startRatio,
    startedAtMs: now,
    invokes: 0,
    errors: 0,
    maxInvokeMs: 0,
  };
}

export function recordResizeDragInvoke(durationMs: number, ok: boolean): void {
  if (!session) {
    return;
  }
  session.invokes += 1;
  if (!ok) {
    session.errors += 1;
  }
  if (durationMs > session.maxInvokeMs) {
    session.maxInvokeMs = durationMs;
  }
}

export function finishResizeDrag(
  endRatio: number,
  now = nowMs(),
): ResizeDragSummary | null {
  if (!session) {
    return null;
  }
  const summary: ResizeDragSummary = {
    startRatio: session.startRatio,
    endRatio,
    durationMs: Math.round(Math.max(0, now - session.startedAtMs)),
    invokes: session.invokes,
    errors: session.errors,
    maxInvokeMs: Math.round(session.maxInvokeMs),
  };
  session = null;
  return summary;
}
