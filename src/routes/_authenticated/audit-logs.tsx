import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ScrollText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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
  metadata: Record<string, unknown>;
};

const CATEGORIES = ["all", "login", "logout", "invite", "update", "delete", "billing", "api_usage", "security"];

function AuditLogsPage() {
  const { currentOrgId } = useCurrentOrg();
  const { can, isSuperAdmin, isLoading: permsLoading } = usePermissions();
  const canView = can("audit.view") || isSuperAdmin;
  const [category, setCategory] = useState<string>("all");
  const qc = useQueryClient();

  const { data: logs = [], isLoading } = useQuery({
    enabled: !!currentOrgId && canView,
    queryKey: ["audit-logs", currentOrgId, category],
    queryFn: async () => {
      let q = supabase
        .from("audit_logs")
        .select("id, category, action, summary, actor_id, entity_type, entity_id, created_at, metadata")
        .eq("organization_id", currentOrgId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (category !== "all") q = q.eq("category", category);
      const { data, error } = await q;
      if (error) throw error;
      return data as Log[];
    },
  });

  useEffect(() => {
    if (!currentOrgId || !canView) return;
    const ch = supabase.channel(`audit:${currentOrgId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_logs", filter: `organization_id=eq.${currentOrgId}` },
        () => qc.invalidateQueries({ queryKey: ["audit-logs", currentOrgId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [currentOrgId, canView, qc]);

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
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent events</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events yet.</p>
          ) : (
            <div className="divide-y">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="uppercase text-[10px]">{log.category}</Badge>
                      <span className="text-xs font-mono text-muted-foreground">{log.action}</span>
                    </div>
                    <p className="mt-1 text-sm">{log.summary}</p>
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
