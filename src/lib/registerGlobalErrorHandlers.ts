import { invoke } from "@tauri-apps/api/core";

import { logError } from "./log";

let registered = false;

/** Chromium aborts React view transitions when the viewport resizes mid-animation. */
export function isAbortedViewTransition(reason: unknown): boolean {
  if (!(reason instanceof DOMException)) {
    return false;
  }
  if (reason.name !== "InvalidStateError" && reason.name !== "AbortError") {
    return false;
  }
  const lower = reason.message.toLowerCase();
  const mentionsAbort = lower.includes("transition") && lower.includes("abort");
  const mentionsViewport = lower.includes("viewport size changed");
  return mentionsAbort || mentionsViewport;
}

function recordAbortedViewTransitionBreadcrumb(): void {
  void invoke("cmd_record_breadcrumb", {
    scope: "window",
    message: "view-transition aborted (viewport resize)",
  }).catch(() => {
    /* breadcrumb must never throw or re-enter the global error handlers */
  });
}

function onWindowError(event: ErrorEvent): void {
  logError("window", event.message, {
    source: `${event.filename}:${event.lineno}:${event.colno}`,
    error: event.error,
  });
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  if (isAbortedViewTransition(event.reason)) {
    event.preventDefault();
    recordAbortedViewTransitionBreadcrumb();
    return;
  }
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
