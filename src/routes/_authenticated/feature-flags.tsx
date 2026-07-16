import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Flag, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/feature-flags")({
  component: FeatureFlagsPage,
});

type Flag = {
  id: string;
  organization_id: string | null;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  rollout_percentage: number;
};

function FeatureFlagsPage() {
  const { currentOrgId } = useCurrentOrg();
  const { can, isSuperAdmin, isLoading: permsLoading } = usePermissions();
  const canManage = can("feature_flag.manage") || isSuperAdmin;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ key: "", name: "", description: "" });

  const { data: flags = [], isLoading } = useQuery({
    enabled: !!currentOrgId,
    queryKey: ["feature-flags", currentOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_flags")
        .select("id, organization_id, key, name, description, enabled, rollout_percentage")
        .or(`organization_id.eq.${currentOrgId},organization_id.is.null`)
        .order("name");
      if (error) throw error;
      return data as Flag[];
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("feature_flags").update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feature-flags", currentOrgId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const rollout = useMutation({
    mutationFn: async ({ id, pct }: { id: string; pct: number }) => {
      const { error } = await supabase.from("feature_flags").update({ rollout_percentage: pct }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feature-flags", currentOrgId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const createFlag = useMutation({
    mutationFn: async () => {
      if (!currentOrgId) throw new Error("No organization");
      const { error } = await supabase.from("feature_flags").insert({
        organization_id: currentOrgId,
        key: form.key.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        enabled: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setOpen(false);
      setForm({ key: "", name: "", description: "" });
      qc.invalidateQueries({ queryKey: ["feature-flags", currentOrgId] });
      toast.success("Flag created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteFlag = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("feature_flags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feature-flags", currentOrgId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (permsLoading) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Flag className="h-6 w-6" /> Feature Flags</h1>
          <p className="text-sm text-muted-foreground">Toggle features for this organization.</p>
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> New flag</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create feature flag</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Key</Label><Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="new_dashboard" /></div>
                <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="New Dashboard" /></div>
                <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button onClick={() => createFlag.mutate()} disabled={!form.key.trim() || !form.name.trim() || createFlag.isPending}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Flags</CardTitle><CardDescription>Global flags apply to all organizations.</CardDescription></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : flags.length === 0 ? (
            <p className="text-sm text-muted-foreground">No flags configured.</p>
          ) : (
            <div className="divide-y">
              {flags.map((f) => {
                const isGlobal = f.organization_id === null;
                const editable = canManage && (!isGlobal || isSuperAdmin);
                return (
                  <div key={f.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{f.name}</p>
                        {isGlobal && <Badge variant="outline">Global</Badge>}
                      </div>
                      <p className="text-xs font-mono text-muted-foreground">{f.key}</p>
                      {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Rollout</span>
                        <Input
                          type="number" min={0} max={100}
                          className="w-16"
                          value={f.rollout_percentage}
                          disabled={!editable}
                          onChange={(e) => rollout.mutate({ id: f.id, pct: Math.max(0, Math.min(100, Number(e.target.value))) })}
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                      <Switch
                        checked={f.enabled}
                        disabled={!editable}
                        onCheckedChange={(v) => toggle.mutate({ id: f.id, enabled: v })}
                      />
                      {editable && !isGlobal && (
                        <Button variant="ghost" size="icon" onClick={() => deleteFlag.mutate(f.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
