import { createClient } from "npm:@supabase/supabase-js@2";
import {
  handleSubmitDiagnostics,
  newReportId,
} from "./handler.ts";

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

Deno.serve(async (req) => {
  try {
    const admin = adminClient();
    return await handleSubmitDiagnostics(req, {
      now: () => new Date(),
      randomId: () => {
        const bytes = new Uint8Array(8);
        crypto.getRandomValues(bytes);
        return newReportId(bytes);
      },
      countReports: async (installHash, sinceIso) => {
        const { count, error } = await admin
          .from("diagnostic_reports")
          .select("report_id", { count: "exact", head: true })
          .eq("install_hash", installHash)
          .gte("created_at", sinceIso);
        if (error) throw error;
        return count ?? 0;
      },
      uploadZip: async (objectPath, body) => {
        const { error } = await admin.storage
          .from("diagnostics")
          .upload(objectPath, body, {
            contentType: "application/zip",
            upsert: false,
          });
        if (error) throw error;
      },
      insertReport: async (row) => {
        const { error } = await admin.from("diagnostic_reports").insert(row);
        if (error) throw error;
      },
      pingDb: async () => {
        const { error } = await admin
          .from("diagnostic_reports")
          .select("report_id")
          .limit(1);
        if (error) throw error;
      },
    });
  } catch {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
});
