import type { InputPreviewFrame } from "./inputPreviewChannel";

let latest: InputPreviewFrame | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getLatest(): InputPreviewFrame | null {
  return latest;
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function publish(frame: InputPreviewFrame | null): void {
  latest = frame;
  notify();
}

export function clear(): void {
  if (latest === null) return;
  latest = null;
  notify();
}
