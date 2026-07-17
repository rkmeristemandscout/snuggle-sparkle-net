// Server-only: log an error to public.error_logs via the service role client.
// Never throws — logging failures are swallowed so callers can keep responding.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface LogErrorInput {
  source: string;
  message: string;
  requestId?: string | null;
  userId?: string | null;
  organizationId?: string | null;
  level?: "error" | "warn" | "info";
  stack?: string | null;
  path?: string | null;
  method?: string | null;
  status?: number | null;
  metadata?: Record<string, unknown>;
}

export async function logServerError(input: LogErrorInput): Promise<void> {
  try {
    await supabaseAdmin.from("error_logs").insert({
      source: input.source,
      message: input.message.slice(0, 4000),
      request_id: input.requestId ?? null,
      user_id: input.userId ?? null,
      organization_id: input.organizationId ?? null,
      level: input.level ?? "error",
      stack: input.stack?.slice(0, 8000) ?? null,
      path: input.path ?? null,
      method: input.method ?? null,
      status: input.status ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (e) {
    console.error("[error_logs] failed to persist error", e);
  }
}
