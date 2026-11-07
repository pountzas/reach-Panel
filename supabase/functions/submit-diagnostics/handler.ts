export const MAX_ZIP_BYTES = 5 * 1024 * 1024;
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RATE_PER_MINUTE = 1;
const RATE_PER_DAY = 5;
const RATE_GLOBAL_PER_DAY = 100;

export type DiagnosticReportRow = {
  report_id: string;
  install_hash: string;
  app_version: string;
  size_bytes: number;
  created_at: string;
};

export type SubmitDeps = {
  now: () => Date;
  randomId: () => string;
  countReports: (installHash: string, sinceIso: string) => Promise<number>;
  countAllReports: (sinceIso: string) => Promise<number>;
  uploadZip: (objectPath: string, body: Uint8Array) => Promise<void>;
  insertReport: (row: DiagnosticReportRow) => Promise<void>;
  deleteReport: (reportId: string) => Promise<void>;
  pingDb: () => Promise<void>;
};

export function newReportId(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += CROCKFORD[bytes[i % bytes.length] % 32];
  }
  return out;
}

export function objectPathFor(now: Date, reportId: string): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}/${month}/${reportId}.zip`;
}

function jsonError(status: number, code: string): Response {
  return Response.json({ error: code }, { status });
}

function contentTypeIsZip(value: string | null): boolean {
  if (!value) return false;
  const media = value.split(";")[0].trim().toLowerCase();
  return media === "application/zip";
}

async function readCapped(req: Request, max: number): Promise<Uint8Array | null> {
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function hasZipMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === ZIP_MAGIC[0] &&
    bytes[1] === ZIP_MAGIC[1] &&
    bytes[2] === ZIP_MAGIC[2] &&
    bytes[3] === ZIP_MAGIC[3]
  );
}

export async function handleSubmitDiagnostics(
  req: Request,
  deps: SubmitDeps,
): Promise<Response> {
  if (req.method === "GET") {
    await deps.pingDb();
    return Response.json({ ok: true }, { status: 200 });
  }
  if (req.method !== "POST") {
    return jsonError(405, "method_not_allowed");
  }
  if (!contentTypeIsZip(req.headers.get("content-type"))) {
    return jsonError(400, "invalid_content_type");
  }
  const lengthHeader = req.headers.get("content-length");
  if (lengthHeader) {
    const length = Number(lengthHeader);
    if (!Number.isFinite(length) || length > MAX_ZIP_BYTES) {
      return jsonError(413, "too_large");
    }
  }
  const installHash = req.headers.get("x-install-id")?.trim().toLowerCase() ?? "";
  if (!/^[0-9a-f]{64}$/.test(installHash)) {
    return jsonError(400, "invalid_install_id");
  }
  const appVersion = (req.headers.get("x-app-version")?.trim() ?? "").slice(0, 32);
  const now = deps.now();
  const minuteAgo = new Date(now.getTime() - 60_000).toISOString();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  if ((await deps.countReports(installHash, minuteAgo)) >= RATE_PER_MINUTE) {
    return jsonError(429, "rate_limited");
  }
  if ((await deps.countReports(installHash, dayAgo)) >= RATE_PER_DAY) {
    return jsonError(429, "rate_limited");
  }
  if ((await deps.countAllReports(dayAgo)) >= RATE_GLOBAL_PER_DAY) {
    return jsonError(429, "rate_limited");
  }

  const body = await readCapped(req, MAX_ZIP_BYTES);
  if (body === null) {
    return jsonError(413, "too_large");
  }

  if (!hasZipMagic(body)) {
    return jsonError(400, "invalid_zip");
  }

  const reportId = deps.randomId();
  const createdAt = now.toISOString();
  const objectPath = objectPathFor(now, reportId);
  await deps.insertReport({
    report_id: reportId,
    install_hash: installHash,
    app_version: appVersion,
    size_bytes: body.byteLength,
    created_at: createdAt,
  });
  try {
    await deps.uploadZip(objectPath, body);
  } catch {
    await deps.deleteReport(reportId).catch(() => {});
    return jsonError(500, "server_error");
  }
  return Response.json({ report_id: reportId }, { status: 200 });
}
