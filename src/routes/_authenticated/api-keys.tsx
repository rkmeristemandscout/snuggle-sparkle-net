import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Copy, KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/api-keys")({
  component: ApiKeysPage,
});

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  last_used_at: string | null;
  usage_count: number;
  revoked_at: string | null;
  expires_at: string | null;
  created_at: string;
};

function ApiKeysPage() {
  const { currentOrgId } = useCurrentOrg();
  const { can, isLoading: permsLoading } = usePermissions();
  const canManage = can("org.manage_api_keys");
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<{ token: string; prefix: string } | null>(null);

  const { data: keys = [], isLoading } = useQuery({
    enabled: !!currentOrgId,
    queryKey: ["api-keys", currentOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("id, name, prefix, scopes, last_used_at, usage_count, revoked_at, expires_at, created_at")
        .eq("organization_id", currentOrgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ApiKey[];
    },
  });

  const createKey = useMutation({
    mutationFn: async () => {
      if (!currentOrgId) throw new Error("No organization");
      const { data, error } = await supabase.rpc("create_api_key", {
        _org: currentOrgId, _name: name.trim(),
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as { id: string; prefix: string; token: string };
    },
    onSuccess: (row) => {
      setNewKey({ token: row.token, prefix: row.prefix });
      setName("");
      qc.invalidateQueries({ queryKey: ["api-keys", currentOrgId] });
      toast.success("API key created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeKey = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("revoke_api_key", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys", currentOrgId] });
      toast.success("Key revoked");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const regenKey = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("regenerate_api_key", { _id: id });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as { id: string; prefix: string; token: string };
    },
    onSuccess: (row) => {
      setNewKey({ token: row.token, prefix: row.prefix });
      qc.invalidateQueries({ queryKey: ["api-keys", currentOrgId] });
      toast.success("Key regenerated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  if (permsLoading) return null;
  if (!canManage) {
    return <div className="rounded-lg border p-8 text-center text-muted-foreground">You don't have permission to manage API keys.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><KeyRound className="h-6 w-6" /> API Keys</h1>
        <p className="text-sm text-muted-foreground">Manage programmatic access to this organization.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generate a new key</CardTitle>
          <CardDescription>Give the key a memorable name. The secret is shown once.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 md:flex-row md:items-end"
            onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) createKey.mutate(); }}
          >
            <div className="flex-1">
              <Label htmlFor="key-name">Key name</Label>
              <Input id="key-name" placeholder="Production server" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button type="submit" disabled={createKey.isPending || name.trim().length < 2}>
              {createKey.isPending ? "Generating…" : "Generate key"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Existing keys</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API keys yet.</p>
          ) : (
            <div className="divide-y">
              {keys.map((k) => (
                <div key={k.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{k.name}</p>
                      {k.revoked_at ? (
                        <Badge variant="destructive">Revoked</Badge>
                      ) : (
                        <Badge variant="secondary">Active</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{k.prefix}••••</p>
                    <p className="text-xs text-muted-foreground">
                      {k.last_used_at
                        ? `Last used ${formatDistanceToNow(new Date(k.last_used_at), { addSuffix: true })} · ${k.usage_count} calls`
                        : "Never used"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={!!k.revoked_at || regenKey.isPending}
                      onClick={() => regenKey.mutate(k.id)}>
                      <RefreshCw className="mr-2 h-4 w-4" /> Regenerate
                    </Button>
                    <Button variant="destructive" size="sm" disabled={!!k.revoked_at || revokeKey.isPending}
                      onClick={() => revokeKey.mutate(k.id)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Revoke
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!newKey} onOpenChange={(o) => !o && setNewKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your API key</DialogTitle>
            <DialogDescription>You will not be able to view this secret again.</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/50 p-3 font-mono text-sm break-all">
            {newKey?.token}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => newKey && copy(newKey.token)}>
              <Copy className="mr-2 h-4 w-4" /> Copy
            </Button>
            <Button onClick={() => setNewKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
