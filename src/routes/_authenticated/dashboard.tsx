import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useMemo } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { formatDistanceToNow, subDays, startOfDay, format } from "date-fns";
import { Users, Boxes, Building2, Mail, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { useActivity } from "@/hooks/use-activity";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type Stats = {
  members: number;
  teams: number;
  departments: number;
  pendingInvites: number;
  memberTimeline: { user_id: string; created_at: string }[];
  recentMembers: { user_id: string; created_at: string; role: string; profile: { full_name: string | null; avatar_url: string | null } | null }[];
};

function Dashboard() {
  const { user } = useSession();
  const { currentMembership, currentOrgId } = useCurrentOrg();
  const org = currentMembership?.organization;
  const qc = useQueryClient();

  useEffect(() => {
    if (!currentOrgId) return;
    const channel = supabase
      .channel(`dashboard:${currentOrgId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "organization_members", filter: `organization_id=eq.${currentOrgId}` },
        () => qc.invalidateQueries({ queryKey: ["dashboard-stats", currentOrgId] }))
      .on("postgres_changes",
        { event: "*", schema: "public", table: "teams", filter: `organization_id=eq.${currentOrgId}` },
        () => qc.invalidateQueries({ queryKey: ["dashboard-stats", currentOrgId] }))
      .on("postgres_changes",
        { event: "*", schema: "public", table: "organization_invitations", filter: `organization_id=eq.${currentOrgId}` },
        () => qc.invalidateQueries({ queryKey: ["dashboard-stats", currentOrgId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentOrgId, qc]);

  const stats = useQuery({
    enabled: !!currentOrgId,
    queryKey: ["dashboard-stats", currentOrgId],
    queryFn: async (): Promise<Stats> => {
      const [members, teams, deps, invites] = await Promise.all([
        supabase
          .from("organization_members")
          .select("user_id, role, created_at")
          .eq("organization_id", currentOrgId!)
          .order("created_at", { ascending: false }),
        supabase
          .from("teams")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", currentOrgId!),
        supabase
          .from("departments")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", currentOrgId!),
        supabase
          .from("organization_invitations")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", currentOrgId!)
          .is("accepted_at", null)
          .is("rejected_at", null),
      ]);
      const memberRows = members.data ?? [];
      const ids = memberRows.slice(0, 5).map((m) => m.user_id);
      let profiles: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
      if (ids.length) {
        const { data } = await supabase
          .from("profiles").select("id, full_name, avatar_url").in("id", ids);
        profiles = Object.fromEntries((data ?? []).map((p) => [p.id, p]));
      }
      return {
        members: memberRows.length,
        teams: teams.count ?? 0,
        departments: deps.count ?? 0,
        pendingInvites: invites.count ?? 0,
        memberTimeline: memberRows.map((m) => ({ user_id: m.user_id, created_at: m.created_at })),
        recentMembers: memberRows.slice(0, 5).map((m) => ({
          user_id: m.user_id,
          created_at: m.created_at,
          role: m.role,
          profile: profiles[m.user_id] ?? null,
        })),
      };
    },
  });

  const { activity } = useActivity(currentOrgId);

  const chartData = useMemo(() => {
    const days = 14;
    const buckets = Array.from({ length: days }).map((_, i) => {
      const d = startOfDay(subDays(new Date(), days - 1 - i));
      return { date: d, label: format(d, "MMM d"), joined: 0, cumulative: 0 };
    });
    const timeline = stats.data?.memberTimeline ?? [];
    for (const m of timeline) {
      const created = startOfDay(new Date(m.created_at));
      const idx = buckets.findIndex((b) => b.date.getTime() === created.getTime());
      if (idx >= 0) buckets[idx].joined += 1;
    }
    const before = timeline.filter(
      (m) => startOfDay(new Date(m.created_at)) < buckets[0].date,
    ).length;
    let running = before;
    for (const b of buckets) {
      running += b.joined;
      b.cumulative = running;
    }
    return buckets;
  }, [stats.data]);

  const displayName = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "";

  if (!org) {
    return (
      <div className="grid place-items-center py-24">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Welcome to Stackly</CardTitle>
            <CardDescription>
              You don't belong to any organization yet. Create your first workspace to get started.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild><Link to="/organizations">Create organization</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const cards = [
    { label: "Members", value: stats.data?.members ?? 0, icon: Users, hint: "Total members" },
    { label: "Teams", value: stats.data?.teams ?? 0, icon: Building2, hint: "Active teams" },
    { label: "Departments", value: stats.data?.departments ?? 0, icon: Boxes, hint: "Departments" },
    { label: "Pending invites", value: stats.data?.pendingInvites ?? 0, icon: Mail, hint: "Awaiting response" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Welcome back{displayName ? `, ${displayName.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here's what's happening in {org.name} today.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/invitations">Invitations</Link></Button>
          <Button asChild><Link to="/teams">Create team</Link></Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{c.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Membership growth</CardTitle>
            <CardDescription>Cumulative members over the last 14 days</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1, 220 90% 56%))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1, 220 90% 56%))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area type="monotone" dataKey="cumulative" stroke="var(--color-primary)" strokeWidth={2} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent members</CardTitle>
              <CardDescription>Latest to join</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/organizations/$slug/members" params={{ slug: org.slug }}>
                All <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {stats.data?.recentMembers.length ? (
              <ul className="space-y-4">
                {stats.data.recentMembers.map((m) => {
                  const name = m.profile?.full_name ?? m.user_id.slice(0, 8);
                  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
                  return (
                    <li key={m.user_id} className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      <Badge variant="secondary" className="capitalize">{m.role}</Badge>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity feed</CardTitle>
          <CardDescription>Real-time updates from your workspace</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-80 pr-4">
            {activity.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No activity yet. Invite teammates or create a team to get started.
              </p>
            ) : (
              <ul className="space-y-4">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 border-l-2 border-primary/40 pl-4">
                    <div className="flex-1">
                      <p className="text-sm">{a.summary}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{a.action}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
