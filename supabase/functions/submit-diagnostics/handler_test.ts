import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  handleSubmitDiagnostics,
  objectPathFor,
  type DiagnosticReportRow,
  type SubmitDeps,
} from "./handler.ts";

const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01]);

const INSTALL_HASH = "a".repeat(64);

function deps(overrides: Partial<SubmitDeps> = {}): SubmitDeps & {
  uploads: string[];
  inserts: DiagnosticReportRow[];
  deleted: string[];
  pingCalls: number;
} {
  const uploads: string[] = [];
  const inserts: DiagnosticReportRow[] = [];
  const deleted: string[] = [];
  let pingCalls = 0;
  return {
    uploads,
    inserts,
    deleted,
    get pingCalls() {
      return pingCalls;
    },
    now: () => new Date("2026-11-04T12:00:00.000Z"),
    randomId: () => "A1B2C3D4",
    countReports: async () => 0,
    countAllReports: async () => 0,
    uploadZip: async (objectPath) => {
      uploads.push(objectPath);
    },
    insertReport: async (row) => {
      inserts.push(row);
    },
    deleteReport: async (reportId) => {
      deleted.push(reportId);
    },
    pingDb: async () => {
      pingCalls += 1;
    },
    ...overrides,
  };
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function post(body: Uint8Array, extra: HeadersInit = {}): Request {
  return new Request("https://example.test/functions/v1/submit-diagnostics", {
    method: "POST",
    headers: {
      "content-type": "application/zip",
      "x-install-id": INSTALL_HASH,
      "x-app-version": "0.17.5",
      "content-length": String(body.byteLength),
      ...extra,
    },
    body: asArrayBuffer(body),
  });
}

Deno.test("rejects non-zip magic", async () => {
  const store = deps();
  const response = await handleSubmitDiagnostics(
    post(new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04])),
    store,
  );
  assertEquals(response.status, 400);
  assertEquals(await response.json(), { error: "invalid_zip" });
  assertEquals(store.uploads.length, 0);
  assertEquals(store.inserts.length, 0);
});

Deno.test("rejects content-type that is not zip", async () => {
  const store = deps();
  const response = await handleSubmitDiagnostics(
    post(ZIP_BYTES, { "content-type": "application/json" }),
    store,
  );
  assertEquals(response.status, 400);
  assertEquals(await response.json(), { error: "invalid_content_type" });
});

Deno.test("rejects payloads over 5 MB via content-length", async () => {
  const store = deps();
  const response = await handleSubmitDiagnostics(
    post(ZIP_BYTES, { "content-length": String(5 * 1024 * 1024 + 1) }),
    store,
  );
  assertEquals(response.status, 413);
  assertEquals(await response.json(), { error: "too_large" });
  assertEquals(store.uploads.length, 0);
});

Deno.test("rejects a chunked body over 5 MB without reading it all", async () => {
  const store = deps();
  const chunk = new Uint8Array(1024 * 1024);
  let reads = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      reads += 1;
      if (reads > 8) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
    },
  });
  const response = await handleSubmitDiagnostics(
    new Request("https://example.test/functions/v1/submit-diagnostics", {
      method: "POST",
      headers: {
        "content-type": "application/zip",
        "x-install-id": INSTALL_HASH,
      },
      body: stream,
    }),
    store,
  );
  assertEquals(response.status, 413);
  assertEquals(await response.json(), { error: "too_large" });
  assertEquals(reads <= 7, true);
  assertEquals(store.uploads.length, 0);
});

Deno.test("rejects payloads over 5 MB via bytes read", async () => {
  const store = deps();
  const tooBig = new Uint8Array(5 * 1024 * 1024 + 1);
  tooBig.set([0x50, 0x4b, 0x03, 0x04]);
  const response = await handleSubmitDiagnostics(
    post(tooBig, { "content-length": "" }),
    store,
  );
  assertEquals(response.status, 413);
  assertEquals(store.uploads.length, 0);
});

Deno.test("accepts a valid zip and stores it", async () => {
  const store = deps();
  const response = await handleSubmitDiagnostics(post(ZIP_BYTES), store);
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { report_id: "A1B2C3D4" });
  assertEquals(store.inserts.length, 1);
  assertEquals(store.inserts[0]!.size_bytes, ZIP_BYTES.byteLength);
  assertEquals(store.uploads.length, 1);
});

Deno.test("does not read the body before the install-id check", async () => {
  const store = deps();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      controller.enqueue(ZIP_BYTES);
    },
  });
  const started = performance.now();
  const response = await handleSubmitDiagnostics(
    new Request("https://example.test/functions/v1/submit-diagnostics", {
      method: "POST",
      headers: {
        "content-type": "application/zip",
        "x-install-id": "abc",
      },
      body: stream,
    }),
    store,
  );
  assertEquals(performance.now() - started < 30, true);
  assertEquals(response.status, 400);
  assertEquals(await response.json(), { error: "invalid_install_id" });
  assertEquals(store.uploads.length, 0);
});

Deno.test("does not read the body when rate limited", async () => {
  const store = deps({
    countReports: async () => 1,
  });
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      controller.enqueue(ZIP_BYTES);
    },
  });
  const started = performance.now();
  const response = await handleSubmitDiagnostics(
    new Request("https://example.test/functions/v1/submit-diagnostics", {
      method: "POST",
      headers: {
        "content-type": "application/zip",
        "x-install-id": INSTALL_HASH,
      },
      body: stream,
    }),
    store,
  );
  assertEquals(performance.now() - started < 30, true);
  assertEquals(response.status, 429);
  assertEquals(await response.json(), { error: "rate_limited" });
  assertEquals(store.uploads.length, 0);
});

Deno.test("rejects an install id that is not a sha256 hex hash", async () => {
  const store = deps();
  const response = await handleSubmitDiagnostics(
    post(ZIP_BYTES, { "x-install-id": "abc" }),
    store,
  );
  assertEquals(response.status, 400);
  assertEquals(await response.json(), { error: "invalid_install_id" });
  assertEquals(store.uploads.length, 0);
  assertEquals(store.inserts.length, 0);
});

Deno.test("returns 429 when the global daily cap is exceeded", async () => {
  const store = deps({
    countAllReports: async () => 100,
  });
  const response = await handleSubmitDiagnostics(post(ZIP_BYTES), store);
  assertEquals(response.status, 429);
  assertEquals(await response.json(), { error: "rate_limited" });
  assertEquals(store.uploads.length, 0);
  assertEquals(store.inserts.length, 0);
});

Deno.test("deletes the row when the upload fails", async () => {
  const store = deps({
    uploadZip: async () => {
      throw new Error("storage down");
    },
  });
  const response = await handleSubmitDiagnostics(post(ZIP_BYTES), store);
  assertEquals(response.status, 500);
  assertEquals(await response.json(), { error: "server_error" });
  assertEquals(store.inserts.length, 1);
  assertEquals(store.deleted, ["A1B2C3D4"]);
  assertEquals(store.uploads.length, 0);
});

Deno.test("returns 429 when the per-minute limit is exceeded", async () => {
  const store = deps({
    countReports: async () => 1,
  });
  const response = await handleSubmitDiagnostics(post(ZIP_BYTES), store);
  assertEquals(response.status, 429);
  assertEquals(await response.json(), { error: "rate_limited" });
  assertEquals(store.uploads.length, 0);
});

Deno.test("writes a unique year/month/report path", async () => {
  const store = deps();
  const response = await handleSubmitDiagnostics(post(ZIP_BYTES), store);
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { report_id: "A1B2C3D4" });
  assertEquals(store.uploads, ["2026/11/A1B2C3D4.zip"]);
  assertEquals(objectPathFor(new Date("2026-11-04T12:00:00.000Z"), "A1B2C3D4"), "2026/11/A1B2C3D4.zip");
  assertExists(store.inserts[0]);
});

Deno.test("GET ping returns 200 and writes nothing", async () => {
  let pingCalls = 0;
  const store = deps({
    pingDb: async () => {
      pingCalls += 1;
    },
  });
  const response = await handleSubmitDiagnostics(
    new Request("https://example.test/functions/v1/submit-diagnostics", {
      method: "GET",
    }),
    store,
  );
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { ok: true });
  assertEquals(pingCalls, 1);
  assertEquals(store.uploads.length, 0);
  assertEquals(store.inserts.length, 0);
});
