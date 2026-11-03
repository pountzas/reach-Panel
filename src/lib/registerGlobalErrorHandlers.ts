import { logError } from "./log";

let registered = false;

function onWindowError(event: ErrorEvent): void {
  logError("window", event.message, {
    source: `${event.filename}:${event.lineno}:${event.colno}`,
    error: event.error,
  });
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  logError("window", "Unhandled rejection", {
    error: event.reason,
  });
}

/** Register window `error` and `unhandledrejection` listeners once. */
export function registerGlobalErrorHandlers(): void {
  if (registered) {
    return;
  }
  registered = true;
  window.addEventListener("error", onWindowError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
}
