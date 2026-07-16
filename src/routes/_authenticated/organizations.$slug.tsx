import { createFileRoute, Link, Outlet, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/organizations/$slug")({
  component: OrgLayout,
});

function OrgLayout() {
  const { slug } = useParams({ from: "/_authenticated/organizations/$slug" });
  const { memberships } = useCurrentOrg();
  const local = memberships.find((m) => m.organization.slug === slug);

  const orgQuery = useQuery({
    enabled: !local,
    queryKey: ["organization", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, slug, description, logo_url, status, created_by")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const org = local?.organization ?? orgQuery.data ?? null;
  const role = local?.role;

  if (!org && (orgQuery.isLoading || !orgQuery.isFetched)) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (!org) {
    return (
      <div className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">Organization not found</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You don't have access, or this workspace doesn't exist.
        </p>
        <Link to="/organizations" className="mt-4 inline-block text-sm underline">
          Back to organizations
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Organization</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
            {org.name}
            {org.status === "suspended" && <Badge variant="destructive">Suspended</Badge>}
            {role && <Badge variant="secondary">{role}</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">/{org.slug}</p>
        </div>
      </div>

      <nav className="flex gap-1 border-b text-sm">
        <TabLink to="/organizations/$slug/settings" slug={org.slug}>Settings</TabLink>
        <TabLink to="/organizations/$slug/members" slug={org.slug}>Members</TabLink>
      </nav>

      <Outlet />
    </div>
  );
}

function TabLink({ to, slug, children }: { to: "/organizations/$slug/settings" | "/organizations/$slug/members"; slug: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      params={{ slug }}
      className="-mb-px border-b-2 border-transparent px-3 py-2 text-muted-foreground hover:text-foreground [&.active]:border-foreground [&.active]:text-foreground"
      activeProps={{ className: "active" }}
    >
      {children}
    </Link>
  );
}
