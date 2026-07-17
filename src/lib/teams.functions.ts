import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { teamSchema, slugSchema } from "@/lib/auth-schemas";

const uuid = z.string().uuid();

/** RLS enforces tenant isolation on every call. */
function fail(msg: string): never {
  throw new Error(msg);
}

export const listTeams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) =>
    z.object({ organizationId: uuid }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("teams")
      .select("id, name, slug, description, owner_id, created_at")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: true });
    if (error) fail(error.message);
    return rows ?? [];
  });

export const createTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string } & z.infer<typeof teamSchema>) =>
    z.object({ organizationId: uuid }).merge(teamSchema).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("teams")
      .insert({
        organization_id: data.organizationId,
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        owner_id: context.userId,
        created_by: context.userId,
      })
      .select("id, name, slug, description, owner_id")
      .single();
    if (error) fail(error.message);
    return row!;
  });

export const updateTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { teamId: string } & Partial<z.infer<typeof teamSchema>> & { ownerId?: string }) =>
    z.object({
      teamId: uuid,
      name: z.string().trim().min(2).max(60).optional(),
      slug: slugSchema.optional(),
      description: z.string().trim().max(280).optional().or(z.literal("")),
      ownerId: uuid.optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.slug !== undefined) patch.slug = data.slug;
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.ownerId !== undefined) patch.owner_id = data.ownerId;
    const { data: row, error } = await context.supabase
      .from("teams").update(patch).eq("id", data.teamId)
      .select("id, name, slug, description, owner_id").single();
    if (error) fail(error.message);
    return row!;
  });

export const deleteTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { teamId: string }) => z.object({ teamId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("teams").delete().eq("id", data.teamId);
    if (error) fail(error.message);
    return { ok: true };
  });

export const addTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { teamId: string; userId: string; role?: "owner" | "member" }) =>
    z.object({
      teamId: uuid, userId: uuid,
      role: z.enum(["owner", "member"]).default("member"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("team_members")
      .insert({ team_id: data.teamId, user_id: data.userId, role: data.role });
    if (error) fail(error.message);
    return { ok: true };
  });

export const removeTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { teamId: string; userId: string }) =>
    z.object({ teamId: uuid, userId: uuid }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("team_members").delete()
      .eq("team_id", data.teamId).eq("user_id", data.userId);
    if (error) fail(error.message);
    return { ok: true };
  });
