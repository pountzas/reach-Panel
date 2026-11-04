import type { TranslationKey } from "../i18n";

export type DiagnosticsBundleFile = {
  name: string;
  size: number;
};

export type SendDiagnosticsResponse = {
  configured: boolean;
  files: DiagnosticsBundleFile[];
  reportId?: string | null;
};

export function formatBundleSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function sendDiagnosticsErrorKey(error: unknown): TranslationKey {
  const message = invokeErrorMessage(error);
  if (message.includes("http_429")) {
    return "sendLogsFailedRateLimited";
  }
  return "sendLogsFailed";
}

function invokeErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return String(error);
}
