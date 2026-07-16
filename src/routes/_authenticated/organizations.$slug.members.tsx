import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { inviteSchema, type InviteValues } from "@/lib/auth-schemas";
import { useCurrentOrg, type OrgRole } from "@/hooks/use-current-org";
import { useSession } from "@/hooks/use-session";
import { usePermissions } from "@/hooks/use-permissions";
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
  const { can } = usePermissions();
  const membership = memberships.find((m) => m.organization.slug === slug);
  const org = membership?.organization;
  const canManage = can(["org.manage_users", "org.invite_members"]);
  const isOwner = membership?.role === "owner";
  const qc = useQueryClient();

  const members = useQuery({
    enabled: !!org,
    queryKey: ["members", org?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .select("id, user_id, role, created_at")
        .eq("organization_id", org!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const ids = Array.from(new Set((data ?? []).map((m) => m.user_id)));
      let profiles: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", ids);
        profiles = Object.fromEntries((profs ?? []).map((p) => [p.id, p]));
      }
      return (data ?? []).map((m) => ({ ...m, profile: profiles[m.user_id] ?? null }));
    },
  });

  const invites = useQuery({
    enabled: !!org && !!canManage,
    queryKey: ["invitations", org?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_invitations")
        .select("id, email, role, token, accepted_at, rejected_at, expires_at, created_at")
        .eq("organization_id", org!.id)
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

  const resend = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("resend_invitation", { _invitation_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invitation resent with a new link");
      qc.invalidateQueries({ queryKey: ["invitations", org?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const expire = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("expire_invitation", { _invitation_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invitation expired");
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
              const profile = m.profile;
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
            <h2 className="text-lg font-semibold">Invitations</h2>
            {invites.isLoading ? (
              <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
            ) : invites.data && invites.data.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {invites.data.map((inv) => {
                  const url = `${window.location.origin}/join/${inv.token}`;
                  const status = inv.accepted_at
                    ? "accepted"
                    : inv.rejected_at
                      ? "rejected"
                      : new Date(inv.expires_at) < new Date()
                        ? "expired"
                        : "pending";
                  const isPending = status === "pending";
                  return (
                    <li key={inv.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{inv.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {inv.role} · {isPending
                              ? `expires ${new Date(inv.expires_at).toLocaleDateString()}`
                              : status}
                          </p>
                        </div>
                        <Badge
                          variant={
                            status === "pending" ? "secondary"
                            : status === "accepted" ? "default"
                            : "destructive"
                          }
                        >
                          {status}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {isPending && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => {
                              navigator.clipboard.writeText(url);
                              toast.success("Link copied");
                            }}
                          >
                            <Copy className="mr-1 h-3.5 w-3.5" /> Copy link
                          </Button>
                        )}
                        {!inv.accepted_at && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => resend.mutate(inv.id)}
                            disabled={resend.isPending}
                          >
                            Resend
                          </Button>
                        )}
                        {isPending && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => expire.mutate(inv.id)}
                            disabled={expire.isPending}
                          >
                            Expire
                          </Button>
                        )}
                        <Button
                          size="sm" variant="ghost" className="text-destructive"
                          onClick={() => revoke.mutate(inv.id)}
                          disabled={revoke.isPending}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No invitations yet.</p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
