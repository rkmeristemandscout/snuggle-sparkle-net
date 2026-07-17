// Notification API helpers callable from client via useServerFn.
// Authenticated with requireSupabaseAuth; every mutation runs as the caller,
// and the DB RPCs constrain writes to their own rows.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const idSchema = z.object({ id: z.string().uuid() });
const listSchema = z.object({
  organizationId: z.string().uuid().optional(),
  unreadOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
const markAllSchema = z.object({ organizationId: z.string().uuid().optional() });

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => listSchema.parse(v ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("notifications")
      .select("id, type, title, message, link, metadata, read_at, created_at, organization_id")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.organizationId) q = q.eq("organization_id", data.organizationId);
    if (data.unreadOnly) q = q.is("read_at", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => idSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("mark_notification_read", { _id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => markAllSchema.parse(v ?? {}))
  .handler(async ({ data, context }) => {
    const { data: count, error } = await context.supabase.rpc("mark_all_notifications_read", {
      _org: data.organizationId ?? null,
    });
    if (error) throw new Error(error.message);
    return { count: (count as number) ?? 0 };
  });

export const deleteNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => idSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("delete_notification", { _id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
