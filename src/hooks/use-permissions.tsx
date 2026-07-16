import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useCurrentOrg } from "@/hooks/use-current-org";

export type PermissionKey =
  | "org.view"
  | "org.update"
  | "org.delete"
  | "org.manage_billing"
  | "org.manage_api_keys"
  | "org.manage_users"
  | "org.invite_members"
  | "org.remove_members"
  | "team.view"
  | "team.create"
  | "team.update"
  | "team.delete"
  | "team.manage_members"
  | "department.view"
  | "department.create"
  | "department.update"
  | "department.delete"
  | "invitation.view"
  | "invitation.manage"
  | "audit.view"
  | "feature_flag.manage"
  | "platform.admin";

export function usePermissions() {
  const { user } = useSession();
  const { currentOrgId } = useCurrentOrg();

  const orgArg = currentOrgId ?? "00000000-0000-0000-0000-000000000000";

  const query = useQuery({
    enabled: !!user,
    queryKey: ["permissions", user?.id, currentOrgId],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc("get_user_permissions", { _org: orgArg });
      if (error) throw error;
      return (data ?? []).map((r: { permission_key: string }) => r.permission_key);
    },
  });

  const rolesQuery = useQuery({
    enabled: !!user,
    queryKey: ["user-roles", user?.id, currentOrgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_user_roles", { _org: orgArg });
      if (error) throw error;
      return data ?? [];
    },
  });

  const perms = useMemo(() => new Set(query.data ?? []), [query.data]);
  const roles = rolesQuery.data ?? [];

  const can = (perm: PermissionKey | PermissionKey[]) => {
    if (perms.has("platform.admin")) return true;
    if (Array.isArray(perm)) return perm.some((p) => perms.has(p));
    return perms.has(perm);
  };

  const isSuperAdmin = perms.has("platform.admin");
  const roleKeys = roles.map((r) => r.role_key as string);

  return {
    permissions: perms,
    roles,
    roleKeys,
    isSuperAdmin,
    can,
    isLoading: query.isLoading || rolesQuery.isLoading,
    refetch: () => {
      query.refetch();
      rolesQuery.refetch();
    },
  };
}

export function RequirePermission({
  permission,
  fallback = null,
  children,
}: {
  permission: PermissionKey | PermissionKey[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { can, isLoading } = usePermissions();
  if (isLoading) return null;
  if (!can(permission)) return <>{fallback}</>;
  return <>{children}</>;
}
