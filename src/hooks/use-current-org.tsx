import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import type { Database } from "@/integrations/supabase/types";

export type OrgRole = Database["public"]["Enums"]["org_role"];
export type OrgStatus = Database["public"]["Enums"]["org_status"];

export type Membership = {
  role: OrgRole;
  organization: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logo_url: string | null;
    status: OrgStatus;
    created_by: string | null;
  };
};

type Ctx = {
  memberships: Membership[];
  currentOrgId: string | null;
  currentMembership: Membership | null;
  setCurrentOrgId: (id: string | null) => void;
  isLoading: boolean;
  refetch: () => void;
};

const STORAGE_KEY = "stackly.currentOrgId";
const OrgContext = createContext<Ctx | null>(null);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [currentOrgId, setCurrentOrgIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });

  const query = useQuery({
    enabled: !!user,
    queryKey: ["memberships", user?.id],
    queryFn: async (): Promise<Membership[]> => {
      const { data, error } = await supabase
        .from("organization_members")
        .select("role, organization:organization_id(id, name, slug, description, logo_url, status, created_by)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? [])
        .map((r) => ({
          role: r.role as OrgRole,
          organization: r.organization as Membership["organization"],
        }))
        .filter((m) => m.organization);
    },
  });

  const memberships = query.data ?? [];

  useEffect(() => {
    if (!memberships.length) return;
    const stillValid = currentOrgId && memberships.some((m) => m.organization.id === currentOrgId);
    if (!stillValid) {
      const next = memberships[0].organization.id;
      setCurrentOrgIdState(next);
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, [memberships, currentOrgId]);

  const setCurrentOrgId = (id: string | null) => {
    setCurrentOrgIdState(id);
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  };

  const currentMembership = useMemo(
    () => memberships.find((m) => m.organization.id === currentOrgId) ?? null,
    [memberships, currentOrgId],
  );

  return (
    <OrgContext.Provider
      value={{
        memberships,
        currentOrgId,
        currentMembership,
        setCurrentOrgId,
        isLoading: query.isLoading,
        refetch: query.refetch,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useCurrentOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useCurrentOrg must be used within OrganizationProvider");
  return ctx;
}
