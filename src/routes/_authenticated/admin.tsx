import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Shield, Building2, Users, KeyRound, Activity, DollarSign, Boxes, Mail,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminConsole,
});

type Stats = {
  organizations: number;
  active_organizations: number;
  users: number;
  teams: number;
  departments: number;
  invitations: number;
  api_keys: number;
  audit_events_7d: number;
};

function AdminConsole() {
  const { isSuperAdmin, isLoading } = usePermissions();

  const statsQuery = useQuery({
    enabled: isSuperAdmin,
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_stats");
      if (error) throw error;
      return data as Stats;
    },
  });

  const orgsQuery = useQuery({
    enabled: isSuperAdmin,
    queryKey: ["admin-orgs"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_organizations");
      if (error) throw error;
      return data as Array<{ id: string; name: string; slug: string; status: string; created_at: string; member_count: number }>;
    },
  });

  const usersQuery = useQuery({
    enabled: isSuperAdmin,
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) throw error;
      return data as Array<{ id: string; email: string; full_name: string | null; created_at: string; last_sign_in_at: string | null; org_count: number }>;
    },
  });

  const logsQuery = useQuery({
    enabled: isSuperAdmin,
    queryKey: ["admin-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, category, action, summary, created_at, organization_id")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const usageQuery = useQuery({
    enabled: isSuperAdmin,
    queryKey: ["admin-usage"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("created_at")
        .gte("created_at", new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString());
      if (error) throw error;
      const buckets = new Map<string, number>();
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 3600 * 1000);
        const k = d.toISOString().slice(0, 10);
        buckets.set(k, 0);
      }
      for (const row of data ?? []) {
        const k = new Date(row.created_at as string).toISOString().slice(0, 10);
        if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
      }
      return Array.from(buckets.entries()).map(([date, count]) => ({ date: date.slice(5), count }));
    },
  });

  if (isLoading) return null;
  if (!isSuperAdmin) {
    return (
      <div className="rounded-lg border p-8 text-center text-muted-foreground">
        Admin Console is restricted to platform super admins.
      </div>
    );
  }

  const stats = statsQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Shield className="h-6 w-6" /> Admin Console</h1>
        <p className="text-sm text-muted-foreground">Platform-wide oversight for super administrators.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Building2} label="Organizations" value={stats?.organizations ?? 0} sub={`${stats?.active_organizations ?? 0} active`} />
        <StatCard icon={Users} label="Users" value={stats?.users ?? 0} sub={`${stats?.invitations ?? 0} pending invites`} />
        <StatCard icon={KeyRound} label="API Keys" value={stats?.api_keys ?? 0} sub="Active credentials" />
        <StatCard icon={Activity} label="Audit Events (7d)" value={stats?.audit_events_7d ?? 0} sub="Across all orgs" />
      </div>

      <Tabs defaultValue="organizations">
        <TabsList className="flex-wrap">
          <TabsTrigger value="organizations">Organizations</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="organizations">
          <Card>
            <CardHeader><CardTitle>All Organizations</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead><TableHead>Slug</TableHead>
                    <TableHead>Status</TableHead><TableHead>Members</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(orgsQuery.data ?? []).map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.name}</TableCell>
                      <TableCell className="font-mono text-xs">{o.slug}</TableCell>
                      <TableCell><Badge variant={o.status === "active" ? "secondary" : "destructive"}>{o.status}</Badge></TableCell>
                      <TableCell>{Number(o.member_count)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(o.created_at), { addSuffix: true })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader><CardTitle>All Users</CardTitle><CardDescription>Latest 500 sign-ups.</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead><TableHead>Name</TableHead>
                    <TableHead>Orgs</TableHead><TableHead>Last sign-in</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(usersQuery.data ?? []).map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono text-xs">{u.email}</TableCell>
                      <TableCell>{u.full_name ?? "—"}</TableCell>
                      <TableCell>{Number(u.org_count)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{u.last_sign_in_at ? formatDistanceToNow(new Date(u.last_sign_in_at), { addSuffix: true }) : "Never"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" /> Revenue</CardTitle><CardDescription>Connect billing to populate this view.</CardDescription></CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <StatCard icon={DollarSign} label="MRR" value="$0" sub="Connect billing" />
                <StatCard icon={DollarSign} label="ARR" value="$0" sub="Connect billing" />
                <StatCard icon={DollarSign} label="Paid seats" value={0} sub="—" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid gap-4 md:grid-cols-2">
            <StatCard icon={Boxes} label="Teams" value={stats?.teams ?? 0} sub="Across all orgs" />
            <StatCard icon={Boxes} label="Departments" value={stats?.departments ?? 0} sub="Across all orgs" />
            <StatCard icon={Mail} label="Pending invites" value={stats?.invitations ?? 0} sub="Not yet accepted" />
            <StatCard icon={KeyRound} label="Active API keys" value={stats?.api_keys ?? 0} sub="Not revoked" />
          </div>
        </TabsContent>

        <TabsContent value="usage">
          <Card>
            <CardHeader><CardTitle>Platform activity — 14 days</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={usageQuery.data ?? []}>
                  <defs>
                    <linearGradient id="usageGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" fill="url(#usageGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader><CardTitle>Latest platform events</CardTitle></CardHeader>
            <CardContent>
              <div className="divide-y">
                {(logsQuery.data ?? []).map((l) => (
                  <div key={l.id as string} className="flex items-start justify-between gap-3 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="uppercase text-[10px]">{l.category as string}</Badge>
                        <span className="text-xs font-mono text-muted-foreground">{l.action as string}</span>
                      </div>
                      <p className="mt-1 text-sm">{l.summary as string}</p>
                    </div>
                    <p className="shrink-0 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(l.created_at as string), { addSuffix: true })}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
