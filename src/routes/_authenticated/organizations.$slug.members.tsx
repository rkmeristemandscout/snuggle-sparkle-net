import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { inviteSchema, type InviteValues } from "@/lib/auth-schemas";
import { useCurrentOrg, type OrgRole } from "@/hooks/use-current-org";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/organizations/$slug/members")({
  component: MembersPage,
});

function MembersPage() {
  const { slug } = useParams({ from: "/_authenticated/organizations/$slug/members" });
  const { user } = useSession();
  const { memberships } = useCurrentOrg();
  const membership = memberships.find((m) => m.organization.slug === slug);
  const org = membership?.organization;
  const canManage = membership?.role === "owner" || membership?.role === "admin";
  const isOwner = membership?.role === "owner";
  const qc = useQueryClient();

  const members = useQuery({
    enabled: !!org,
    queryKey: ["members", org?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .select("id, user_id, role, created_at, profile:user_id(full_name, avatar_url)")
        .eq("organization_id", org!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const invites = useQuery({
    enabled: !!org && !!canManage,
    queryKey: ["invitations", org?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_invitations")
        .select("id, email, role, token, accepted_at, expires_at, created_at")
        .eq("organization_id", org!.id)
        .is("accepted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { register, handleSubmit, reset, setValue, watch, formState } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "member" },
  });
  const role = watch("role");

  const invite = useMutation({
    mutationFn: async (v: InviteValues) => {
      if (!org || !user) throw new Error("Missing context");
      const { data, error } = await supabase
        .from("organization_invitations")
        .insert({
          organization_id: org.id,
          email: v.email,
          role: v.role,
          invited_by: user.id,
        })
        .select("token")
        .single();
      if (error) throw error;
      return data.token as string;
    },
    onSuccess: (token) => {
      const url = `${window.location.origin}/join/${token}`;
      navigator.clipboard?.writeText(url).catch(() => {});
      toast.success("Invitation created", { description: "Link copied to clipboard" });
      reset();
      qc.invalidateQueries({ queryKey: ["invitations", org?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("organization_invitations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invitation revoked");
      qc.invalidateQueries({ queryKey: ["invitations", org?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: OrgRole }) => {
      const { error } = await supabase
        .from("organization_members")
        .update({ role })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["members", org?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("organization_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Member removed");
      qc.invalidateQueries({ queryKey: ["members", org?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!org) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="grid gap-6 md:grid-cols-5">
      <section className="rounded-xl border bg-card p-6 md:col-span-3">
        <h2 className="text-lg font-semibold">Members</h2>
        {members.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="mt-4 divide-y">
            {members.data?.map((m) => {
              const profile = m.profile as { full_name: string | null; avatar_url: string | null } | null;
              const isSelf = m.user_id === user?.id;
              return (
                <li key={m.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">
                      {profile?.full_name ?? m.user_id.slice(0, 8)}
                      {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">Joined {new Date(m.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canManage && !isSelf ? (
                      <Select
                        value={m.role}
                        onValueChange={(r) => updateRole.mutate({ id: m.id, role: r as OrgRole })}
                      >
                        <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {isOwner && <SelectItem value="owner">Owner</SelectItem>}
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary">{m.role}</Badge>
                    )}
                    {canManage && !isSelf && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeMember.mutate(m.id)}
                        aria-label="Remove member"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="space-y-6 md:col-span-2">
        {canManage && (
          <section className="rounded-xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Invite by email</h2>
            <form onSubmit={handleSubmit((v) => invite.mutate(v))} className="mt-4 space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register("email")} />
                {formState.errors.email && (
                  <p className="mt-1 text-xs text-destructive">{formState.errors.email.message}</p>
                )}
              </div>
              <div>
                <Label>Role</Label>
                <Select value={role} onValueChange={(r) => setValue("role", r as "admin" | "member")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={invite.isPending} className="w-full">
                {invite.isPending ? "Creating…" : "Create invitation"}
              </Button>
            </form>
          </section>
        )}

        {canManage && (
          <section className="rounded-xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Pending invitations</h2>
            {invites.isLoading ? (
              <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
            ) : invites.data && invites.data.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {invites.data.map((inv) => {
                  const url = `${window.location.origin}/join/${inv.token}`;
                  return (
                    <li key={inv.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{inv.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {inv.role} · expires {new Date(inv.expires_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              navigator.clipboard.writeText(url);
                              toast.success("Link copied");
                            }}
                            aria-label="Copy invitation link"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => revoke.mutate(inv.id)}
                            aria-label="Revoke invitation"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No pending invitations.</p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
