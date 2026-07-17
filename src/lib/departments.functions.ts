import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { departmentSchema, slugSchema } from "@/lib/auth-schemas";

const uuid = z.string().uuid();
function fail(msg: string): never { throw new Error(msg); }

export const listDepartments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) =>
    z.object({ organizationId: uuid }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("departments")
      .select("id, name, slug, description, created_at")
      .eq("organization_id", data.organizationId)
      .order("name", { ascending: true });
    if (error) fail(error.message);
    return rows ?? [];
  });

export const createDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string } & z.infer<typeof departmentSchema>) =>
    z.object({ organizationId: uuid }).merge(departmentSchema).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("departments")
      .insert({
        organization_id: data.organizationId,
        name: data.name, slug: data.slug,
        description: data.description || null,
        created_by: context.userId,
      })
      .select("id, name, slug, description").single();
    if (error) fail(error.message);
    return row!;
  });

export const updateDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { departmentId: string } & Partial<z.infer<typeof departmentSchema>>) =>
    z.object({
      departmentId: uuid,
      name: z.string().trim().min(2).max(60).optional(),
      slug: slugSchema.optional(),
      description: z.string().trim().max(280).optional().or(z.literal("")),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: { name?: string; slug?: string; description?: string | null } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.slug !== undefined) patch.slug = data.slug;
    if (data.description !== undefined) patch.description = data.description || null;
    const { data: row, error } = await context.supabase
      .from("departments").update(patch).eq("id", data.departmentId)
      .select("id, name, slug, description").single();
    if (error) fail(error.message);
    return row!;
  });

export const deleteDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { departmentId: string }) => z.object({ departmentId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("departments").delete().eq("id", data.departmentId);
    if (error) fail(error.message);
    return { ok: true };
  });
