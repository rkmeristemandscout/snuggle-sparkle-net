import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { teamSchema, type TeamValues } from "@/lib/auth-schemas";
import { createTeam, updateTeam, deleteTeam } from "@/lib/teams.functions";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { useSession } from "@/hooks/use-session";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Pencil, Trash2, X, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/teams")({
  component: TeamsPage,
});

type TeamRow = {
  id: string; name: string; slug: string;
  description: string | null; owner_id: string; created_at: string;
  owner: { full_name: string | null } | null;
};

function TeamsPage() {
  const { user } = useSession();
  const { currentMembership } = useCurrentOrg();
  const { can } = usePermissions();
  const org = currentMembership?.organization;
  const canManageOrg = can("team.create");
  const isAdmin = currentMembership?.role === "owner" || currentMembership?.role === "admin";
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);

  const create = useServerFn(createTeam);
  const del = useServerFn(deleteTeam);

  const teams = useQuery({
    enabled: !!org,
    queryKey: ["teams", org?.id],
    queryFn: async (): Promise<TeamRow[]> => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name, slug, description, owner_id, created_at")
        .eq("organization_id", org!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const ids = Array.from(new Set((data ?? []).map((t) => t.owner_id)));
      let owners: Record<string, { full_name: string | null }> = {};
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles").select("id, full_name").in("id", ids);
        owners = Object.fromEntries((profs ?? []).map((p) => [p.id, p]));
      }
      return (data ?? []).map((t) => ({ ...t, owner: owners[t.owner_id] ?? null }));
    },
  });

  const { register, handleSubmit, reset, formState } = useForm<TeamValues>({
    resolver: zodResolver(teamSchema),
    defaultValues: { name: "", slug: "", description: "" },
  });

  const createMut = useMutation({
    mutationFn: async (v: TeamValues) => {
      if (!org) throw new Error("Missing organization");
      return create({ data: { organizationId: org.id, ...v } });
    },
    onSuccess: () => {
      toast.success("Team created");
      reset();
      qc.invalidateQueries({ queryKey: ["teams", org?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (teamId: string) => del({ data: { teamId } }),
    onSuccess: () => {
      toast.success("Team deleted");
      qc.invalidateQueries({ queryKey: ["teams", org?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!org) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        Select an organization to see its teams.
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <section className="rounded-xl border bg-card p-6 md:col-span-2">
        <h2 className="text-lg font-semibold">Teams in {org.name}</h2>
        {teams.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        ) : teams.data && teams.data.length > 0 ? (
          <ul className="mt-4 divide-y">
            {teams.data.map((t) =>
              editingId === t.id ? (
                <EditTeamRow
                  key={t.id}
                  team={t}
                  onDone={() => {
                    setEditingId(null);
                    qc.invalidateQueries({ queryKey: ["teams", org.id] });
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <li key={t.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      /{t.slug} · owner {t.owner?.full_name ?? "unknown"}
                      {t.owner_id === user?.id && (
                        <Badge variant="secondary" className="ml-2">You</Badge>
                      )}
                    </p>
                    {t.description && (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-1">{t.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/teams/$teamId" params={{ teamId: t.id }}>Open</Link>
                    </Button>
                    {(t.owner_id === user?.id || isAdmin) && (
                      <>
                        <Button size="icon" variant="ghost" aria-label="Edit"
                          onClick={() => setEditingId(t.id)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" aria-label="Delete">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {t.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This removes the team and all its members. This can't be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => delMut.mutate(t.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </li>
              )
            )}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No teams yet.</p>
        )}
      </section>

      {canManageOrg && (
        <section className="rounded-xl border bg-card p-6">
          <h2 className="text-lg font-semibold">New team</h2>
          <form onSubmit={handleSubmit((v) => createMut.mutate(v))} className="mt-4 space-y-4">
            <div>
              <Label htmlFor="team-name">Name</Label>
              <Input id="team-name" {...register("name")} />
              {formState.errors.name && <p className="mt-1 text-xs text-destructive">{formState.errors.name.message}</p>}
            </div>
            <div>
              <Label htmlFor="team-slug">Slug</Label>
              <Input id="team-slug" placeholder="growth" {...register("slug")} />
              {formState.errors.slug && <p className="mt-1 text-xs text-destructive">{formState.errors.slug.message}</p>}
            </div>
            <div>
              <Label htmlFor="team-desc">Description</Label>
              <Textarea id="team-desc" rows={3} {...register("description")} />
            </div>
            <Button type="submit" disabled={createMut.isPending} className="w-full">
              {createMut.isPending ? "Creating…" : "Create team"}
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}

function EditTeamRow({
  team, onDone, onCancel,
}: {
  team: { id: string; name: string; slug: string; description: string | null };
  onDone: () => void;
  onCancel: () => void;
}) {
  const upd = useServerFn(updateTeam);
  const { register, handleSubmit, formState } = useForm<TeamValues>({
    resolver: zodResolver(teamSchema),
    defaultValues: { name: team.name, slug: team.slug, description: team.description ?? "" },
  });
  const mut = useMutation({
    mutationFn: async (v: TeamValues) => upd({ data: { teamId: team.id, ...v } }),
    onSuccess: () => { toast.success("Team updated"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <li className="py-3">
      <form onSubmit={handleSubmit((v) => mut.mutate(v))} className="grid gap-2 md:grid-cols-3">
        <div>
          <Input {...register("name")} placeholder="Name" />
          {formState.errors.name && <p className="mt-1 text-xs text-destructive">{formState.errors.name.message}</p>}
        </div>
        <div>
          <Input {...register("slug")} placeholder="slug" />
          {formState.errors.slug && <p className="mt-1 text-xs text-destructive">{formState.errors.slug.message}</p>}
        </div>
        <Input {...register("description")} placeholder="Description" />
        <div className="md:col-span-3 flex justify-end gap-1">
          <Button type="button" size="icon" variant="ghost" onClick={onCancel} aria-label="Cancel">
            <X className="h-4 w-4" />
          </Button>
          <Button type="submit" size="icon" disabled={mut.isPending} aria-label="Save">
            <Check className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </li>
  );
}
