/**
 * Frontend log wrapper for `@tauri-apps/plugin-log`.
 *
 * Never log typed or dictated text, typed buffers, suggestion words, clipboard
 * contents, Groq or API keys, the full `settings_json`, or companion pairing
 * secrets. Lengths, counts, ids, and enum states are fine.
 */
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { debug, error, info, warn } from "@tauri-apps/plugin-log";

const GROQ_KEY = /gsk_[A-Za-z0-9_-]+/g;

export type LogFields = Record<string, unknown>;

/** Replace Groq-style `gsk_…` secrets. Lengths and other text stay intact. */
export function redact(value: string): string {
  return value.replace(GROQ_KEY, "gsk_***");
}

export function serializeError(error: unknown): string {
  if (error instanceof Error) {
    const details = error.stack?.trim()
      ? error.stack
      : `${error.name}: ${error.message}`;
    return redact(details);
  }
  return redact(String(error));
}

function currentWindowLabel(): string {
  try {
    return WebviewWindow.getCurrent().label;
  } catch {
    return "unknown";
  }
}

function formatValue(value: unknown): string {
  if (value instanceof Error) {
    return serializeError(value);
  }
  if (typeof value === "string") {
    return redact(value);
  }
  try {
    return redact(JSON.stringify(value));
  } catch {
    return redact(String(value));
  }
}

function formatFields(fields?: LogFields): string {
  if (!fields) {
    return "";
  }
  const parts = Object.entries(fields).map(
    ([key, value]) => `${key}=${formatValue(value)}`,
  );
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

function formatRecord(
  scope: string,
  message: string,
  fields?: LogFields,
): string {
  return redact(
    `[${currentWindowLabel()}] ${scope}: ${message}${formatFields(fields)}`,
  );
}

function formatConsoleLine(args: unknown[]): string {
  return redact(args.map(formatValue).join(" "));
}

function emit(fn: (message: string) => Promise<void>, message: string): void {
  fn(message).catch(() => {
    /* logging must never throw or re-enter the global error handlers */
  });
}

export function logError(
  scope: string,
  message: string,
  fields?: LogFields,
): void {
  emit(error, formatRecord(scope, message, fields));
}

export function logWarn(
  scope: string,
  message: string,
  fields?: LogFields,
): void {
  emit(warn, formatRecord(scope, message, fields));
}

export function logInfo(
  scope: string,
  message: string,
  fields?: LogFields,
): void {
  emit(info, formatRecord(scope, message, fields));
}

export function logDebug(
  scope: string,
  message: string,
  fields?: LogFields,
): void {
  emit(debug, formatRecord(scope, message, fields));
}

/** Forward `console.error` / `console.warn` into rotating log files. */
export function initLog(): void {
  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);
  console.error = (...args: unknown[]) => {
    originalError(...args);
    emit(error, formatConsoleLine(args));
  };
  console.warn = (...args: unknown[]) => {
    originalWarn(...args);
    emit(warn, formatConsoleLine(args));
  };
}
