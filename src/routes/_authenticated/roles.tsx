import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/roles")({
  component: RolesPage,
});

type Role = {
  id: string;
  key: string;
  name: string;
  description: string;
  scope: string;
  rank: number;
};

type Assignment = {
  id: string;
  user_id: string;
  role_id: string;
  organization_id: string | null;
  role: { key: string; name: string } | null;
  profile: { full_name: string | null } | null;
};

function RolesPage() {
  const { currentMembership, currentOrgId } = useCurrentOrg();
  const { can, isSuperAdmin, isLoading } = usePermissions();
  const org = currentMembership?.organization;
  const canManage = can("org.manage_users");
  const qc = useQueryClient();

  const roles = useQuery({
    queryKey: ["roles-catalog"],
    queryFn: async (): Promise<Role[]> => {
      const { data, error } = await supabase
        .from("roles")
        .select("id, key, name, description, scope, rank")
        .order("rank", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const permsByRole = useQuery({
    queryKey: ["role-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("role_id, permission:permission_id(key, category, description)");
      if (error) throw error;
      const map = new Map<string, { key: string; category: string; description: string }[]>();
      for (const row of data ?? []) {
        const list = map.get(row.role_id) ?? [];
        if (row.permission) list.push(row.permission as { key: string; category: string; description: string });
        map.set(row.role_id, list);
      }
      return map;
    },
  });

  const assignments = useQuery({
    enabled: !!currentOrgId && canManage,
    queryKey: ["role-assignments", currentOrgId],
    queryFn: async (): Promise<Assignment[]> => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("id, user_id, role_id, organization_id, role:role_id(key, name)")
        .eq("organization_id", currentOrgId!);
      if (error) throw error;
      const ids = Array.from(new Set((data ?? []).map((r) => r.user_id)));
      let profiles: Record<string, { full_name: string | null }> = {};
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles").select("id, full_name").in("id", ids);
        profiles = Object.fromEntries((profs ?? []).map((p) => [p.id, p]));
      }
      return (data ?? []).map((r) => ({
        ...r,
        role: r.role as { key: string; name: string } | null,
        profile: profiles[r.user_id] ?? null,
      }));
    },
  });

  const members = useQuery({
    enabled: !!currentOrgId && canManage,
    queryKey: ["members-for-roles", currentOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", currentOrgId!);
      if (error) throw error;
      const ids = (data ?? []).map((m) => m.user_id);
      if (!ids.length) return [];
      const { data: profs } = await supabase
        .from("profiles").select("id, full_name").in("id", ids);
      return profs ?? [];
    },
  });

  const grant = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      const { error } = await supabase.from("user_roles").insert({
        user_id: userId, role_id: roleId, organization_id: currentOrgId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role granted");
      qc.invalidateQueries({ queryKey: ["role-assignments", currentOrgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role revoked");
      qc.invalidateQueries({ queryKey: ["role-assignments", currentOrgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (!can("org.manage_users") && !isSuperAdmin) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        You don't have permission to view roles.
      </div>
    );
  }

  const assignableRoles = (roles.data ?? []).filter(
    (r) => r.scope === "organization" || isSuperAdmin,
  );

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-6">
        <h1 className="text-xl font-semibold">Roles &amp; permissions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {org ? `Managing roles in ${org.name}` : "Select an organization"}
        </p>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">Role catalog</h2>
        <ul className="mt-4 space-y-4">
          {roles.data?.map((r) => (
            <li key={r.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">
                    {r.name} <Badge variant="outline" className="ml-2">{r.scope}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{r.description}</p>
                </div>
                <Badge variant="secondary">rank {r.rank}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {(permsByRole.data?.get(r.id) ?? []).map((p) => (
                  <Badge key={p.key} variant="outline" className="text-xs font-normal">
                    {p.key}
                  </Badge>
                ))}
                {(permsByRole.data?.get(r.id) ?? []).length === 0 && (
                  <span className="text-xs text-muted-foreground">No permissions</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {canManage && org && (
        <section className="rounded-xl border bg-card p-6">
          <h2 className="text-lg font-semibold">Assign roles</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Grant additional roles to members of {org.name}.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Select onValueChange={(v) => {
              const [userId, roleId] = v.split("|");
              grant.mutate({ userId, roleId });
            }}>
              <SelectTrigger><SelectValue placeholder="Grant role to member…" /></SelectTrigger>
              <SelectContent>
                {members.data?.flatMap((m) =>
                  assignableRoles.map((r) => (
                    <SelectItem key={`${m.id}-${r.id}`} value={`${m.id}|${r.id}`}>
                      {m.full_name ?? m.id.slice(0, 8)} → {r.name}
                    </SelectItem>
                  )),
                )}
              </SelectContent>
            </Select>
          </div>

          <ul className="mt-6 divide-y">
            {assignments.data?.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium">{a.profile?.full_name ?? a.user_id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">{a.role?.name ?? a.role_id}</p>
                </div>
                <Button
                  size="icon" variant="ghost"
                  aria-label="Revoke"
                  onClick={() => revoke.mutate(a.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
            {assignments.data && assignments.data.length === 0 && (
              <li className="py-3 text-sm text-muted-foreground">
                No custom role assignments yet. Members automatically receive roles from their organization membership.
              </li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
