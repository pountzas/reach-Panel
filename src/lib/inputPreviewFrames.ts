import type { InputPreviewFrame } from "./inputPreviewChannel";

let latest: InputPreviewFrame | null = null;
let panelOccluded = false;
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

export function getPanelOccluded(): boolean {
  return panelOccluded;
}

export function setPanelOccluded(value: boolean): void {
  if (panelOccluded === value) return;
  panelOccluded = value;
  notify();
}

export function publish(frame: InputPreviewFrame | null): void {
  latest = frame;
  panelOccluded = false;
  notify();
}

export function clear(): void {
  if (latest === null) return;
  latest = null;
  notify();
}
