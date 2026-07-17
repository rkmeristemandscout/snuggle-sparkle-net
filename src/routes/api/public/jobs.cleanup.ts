// Background job endpoint. Called by pg_cron with the Supabase apikey header.
// Verifies the caller with a timing-safe compare, then runs the maintenance RPC
// as the service role and logs any failure to error_logs.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { extractRequestId } from "@/lib/webhooks.server";

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const Route = createFileRoute("/api/public/jobs/cleanup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = extractRequestId(request);
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        const provided = request.headers.get("apikey") ?? request.headers.get("x-api-key") ?? "";
        if (!anon || !provided || !safeEq(provided, anon)) {
          return new Response(JSON.stringify({ error: "unauthorized", requestId }), {
            status: 401,
            headers: { "content-type": "application/json", "x-request-id": requestId },
          });
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.rpc("run_background_jobs");
          if (error) throw new Error(error.message);
          return new Response(JSON.stringify({ ok: true, requestId, result: data }), {
            status: 200,
            headers: { "content-type": "application/json", "x-request-id": requestId },
          });
        } catch (e) {
          const err = e as Error;
          const { logServerError } = await import("@/lib/errors.server");
          await logServerError({
            source: "jobs.cleanup",
            message: err.message,
            stack: err.stack,
            method: "POST",
            path: "/api/public/jobs/cleanup",
            status: 500,
            requestId,
          });
          return new Response(JSON.stringify({ error: "job_failed", requestId }), {
            status: 500,
            headers: { "content-type": "application/json", "x-request-id": requestId },
          });
        }
      },
    },
  },
});
