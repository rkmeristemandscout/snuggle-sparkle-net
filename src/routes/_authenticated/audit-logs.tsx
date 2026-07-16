import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Download, ScrollText, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/audit-logs")({
  component: AuditLogsPage,
});

type Log = {
  id: string;
  category: string;
  action: string;
  summary: string;
  actor_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type ActorMap = Record<string, { full_name: string | null; avatar_url: string | null }>;

const CATEGORIES = ["all", "login", "logout", "invite", "update", "delete", "billing", "api_usage", "security"];
const RANGES: Array<{ key: string; label: string; hours: number | null }> = [
  { key: "24h", label: "Last 24 hours", hours: 24 },
  { key: "7d", label: "Last 7 days", hours: 24 * 7 },
  { key: "30d", label: "Last 30 days", hours: 24 * 30 },
  { key: "all", label: "All time", hours: null },
];

function categoryTone(cat: string) {
  switch (cat) {
    case "security": return "destructive" as const;
    case "delete": return "destructive" as const;
    case "billing": return "default" as const;
    case "login":
    case "logout": return "secondary" as const;
    default: return "outline" as const;
  }
}

function toCsv(rows: Log[], actors: ActorMap) {
  const header = ["timestamp", "category", "action", "actor", "entity_type", "entity_id", "summary"];
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) => [
    r.created_at,
    r.category,
    r.action,
    r.actor_id ? actors[r.actor_id]?.full_name ?? r.actor_id : "system",
    r.entity_type ?? "",
    r.entity_id ?? "",
    r.summary,
  ].map(escape).join(","));
  return [header.join(","), ...lines].join("\n");
}

function AuditLogsPage() {
  const { currentOrgId } = useCurrentOrg();
  const { can, isSuperAdmin, isLoading: permsLoading } = usePermissions();
  const canView = can("audit.view") || isSuperAdmin;
  const [category, setCategory] = useState<string>("all");
  const [range, setRange] = useState<string>("7d");
  const [query, setQuery] = useState("");
  const [actorFilter, setActorFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Log | null>(null);
  const qc = useQueryClient();

  const { data: logs = [], isLoading } = useQuery({
    enabled: !!currentOrgId && canView,
    queryKey: ["audit-logs", currentOrgId, category, range, actorFilter],
    queryFn: async () => {
      const cfg = RANGES.find((r) => r.key === range);
      let q = supabase
        .from("audit_logs")
        .select("id, category, action, summary, actor_id, entity_type, entity_id, created_at, metadata")
        .eq("organization_id", currentOrgId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (category !== "all") q = q.eq("category", category);
      if (actorFilter) q = q.eq("actor_id", actorFilter);
      if (cfg?.hours) {
        const since = new Date(Date.now() - cfg.hours * 3600_000).toISOString();
        q = q.gte("created_at", since);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as Log[];
    },
  });

  const actorIds = useMemo(
    () => Array.from(new Set(logs.map((l) => l.actor_id).filter((x): x is string => !!x))),
    [logs],
  );

  const { data: actors = {} } = useQuery<ActorMap>({
    enabled: actorIds.length > 0,
    queryKey: ["audit-log-actors", actorIds.sort().join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", actorIds);
      if (error) throw error;
      const map: ActorMap = {};
      for (const p of data ?? []) map[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url };
      return map;
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((l) =>
      l.summary.toLowerCase().includes(q) ||
      l.action.toLowerCase().includes(q) ||
      (l.entity_type ?? "").toLowerCase().includes(q) ||
      (l.entity_id ?? "").toLowerCase().includes(q) ||
      (l.actor_id ? (actors[l.actor_id]?.full_name ?? "").toLowerCase().includes(q) : false),
    );
  }, [logs, query, actors]);

  useEffect(() => {
    if (!currentOrgId || !canView) return;
    const ch = supabase.channel(`audit:${currentOrgId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_logs", filter: `organization_id=eq.${currentOrgId}` },
        () => qc.invalidateQueries({ queryKey: ["audit-logs", currentOrgId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [currentOrgId, canView, qc]);

  const handleExport = () => {
    const csv = toCsv(filtered, actors);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (permsLoading) return null;
  if (!canView) {
    return <div className="rounded-lg border p-8 text-center text-muted-foreground">You don't have permission to view audit logs.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><ScrollText className="h-6 w-6" /> Audit Logs</h1>
          <p className="text-sm text-muted-foreground">Every important action in your workspace.</p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={filtered.length === 0}>
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle>Recent events</CardTitle>
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="audit-search"
                placeholder="Search summary, actor, entity…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events match your filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[130px]">When</TableHead>
                    <TableHead className="w-[110px]">Category</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead className="w-[160px]">Actor</TableHead>
                    <TableHead className="w-[160px]">Entity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((log) => {
                    const actor = log.actor_id ? actors[log.actor_id] : null;
                    return (
                      <TableRow
                        key={log.id}
                        className="cursor-pointer"
                        onClick={() => setSelected(log)}
                      >
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={categoryTone(log.category)} className="uppercase text-[10px]">
                            {log.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{log.summary}</div>
                          <div className="text-[11px] font-mono text-muted-foreground">{log.action}</div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.actor_id ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setActorFilter(log.actor_id); }}
                              className="text-left hover:underline text-primary"
                              title="Filter events by this actor"
                            >
                              {actor?.full_name ?? "Unknown user"}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">System</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {log.entity_type ? (
                            <>
                              <div>{log.entity_type}</div>
                              {log.entity_id && <div className="font-mono truncate max-w-[140px]">{log.entity_id}</div>}
                            </>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Badge variant={categoryTone(selected.category)} className="uppercase text-[10px]">
                    {selected.category}
                  </Badge>
                  <span className="font-mono text-sm">{selected.action}</span>
                </SheetTitle>
                <SheetDescription>{selected.summary}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Timestamp</div>
                  <div>{format(new Date(selected.created_at), "PPpp")}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Actor</div>
                  <div>
                    {selected.actor_id
                      ? (actors[selected.actor_id]?.full_name ?? selected.actor_id)
                      : "System"}
                  </div>
                </div>
                {selected.entity_type && (
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">Entity</div>
                    <div>{selected.entity_type}</div>
                    {selected.entity_id && <div className="font-mono text-xs">{selected.entity_id}</div>}
                  </div>
                )}
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Metadata</div>
                  <pre className="rounded-md border bg-muted/50 p-3 text-xs overflow-x-auto">
{JSON.stringify(selected.metadata ?? {}, null, 2)}
                  </pre>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Log ID</div>
                  <div className="font-mono text-xs break-all">{selected.id}</div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
