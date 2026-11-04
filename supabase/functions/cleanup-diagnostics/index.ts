import { createClient } from "npm:@supabase/supabase-js@2";

const RETENTION_DAYS = 30;

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function objectPath(createdAt: string, reportId: string): string {
  const date = new Date(createdAt);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}/${month}/${reportId}.zip`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }
  try {
    const admin = adminClient();
    const cutoff = new Date(
      Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: rows, error: selectError } = await admin
      .from("diagnostic_reports")
      .select("report_id, created_at")
      .lt("created_at", cutoff);
    if (selectError) throw selectError;

    const paths = (rows ?? []).map((row) =>
      objectPath(row.created_at, row.report_id),
    );
    if (paths.length > 0) {
      const { error: removeError } = await admin.storage
        .from("diagnostics")
        .remove(paths);
      if (removeError) throw removeError;
    }

    const { error: deleteError } = await admin
      .from("diagnostic_reports")
      .delete()
      .lt("created_at", cutoff);
    if (deleteError) throw deleteError;

    return Response.json({
      ok: true,
      deleted: paths.length,
    });
  } catch {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
});
