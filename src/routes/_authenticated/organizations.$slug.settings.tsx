import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { orgSettingsSchema, type OrgSettingsValues } from "@/lib/auth-schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { getOrgLogoUrl } from "@/lib/org-logo";

export const Route = createFileRoute("/_authenticated/organizations/$slug/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { slug } = useParams({ from: "/_authenticated/organizations/$slug/settings" });
  const { memberships, refetch, setCurrentOrgId } = useCurrentOrg();
  const membership = memberships.find((m) => m.organization.slug === slug);
  const org = membership?.organization;
  const canEdit = membership?.role === "owner" || membership?.role === "admin";
  const isOwner = membership?.role === "owner";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const { register, handleSubmit, reset, setValue, watch, formState } = useForm<OrgSettingsValues>({
    resolver: zodResolver(orgSettingsSchema),
    defaultValues: { name: "", slug: "", description: "", status: "active" },
  });
  const status = watch("status");

  useEffect(() => {
    if (org) {
      reset({
        name: org.name,
        slug: org.slug,
        description: org.description ?? "",
        status: org.status,
      });
    }
  }, [org, reset]);

  useEffect(() => {
    let cancelled = false;
    getOrgLogoUrl(org?.logo_url).then((u) => { if (!cancelled) setLogoUrl(u); });
    return () => { cancelled = true; };
  }, [org?.logo_url]);

  const save = useMutation({
    mutationFn: async (v: OrgSettingsValues) => {
      if (!org) throw new Error("No organization");
      const { error } = await supabase
        .from("organizations")
        .update({
          name: v.name,
          slug: v.slug,
          description: v.description || null,
          status: v.status,
        })
        .eq("id", org.id);
      if (error) throw error;
      return v.slug;
    },
    onSuccess: (newSlug) => {
      toast.success("Organization updated");
      qc.invalidateQueries({ queryKey: ["memberships"] });
      refetch();
      if (newSlug !== slug) {
        navigate({ to: "/organizations/$slug/settings", params: { slug: newSlug }, replace: true });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      if (!org) throw new Error("No organization");
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${org.id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("organization-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase
        .from("organizations")
        .update({ logo_url: path })
        .eq("id", org.id);
      if (dbErr) throw dbErr;
    },
    onSuccess: () => {
      toast.success("Logo updated");
      qc.invalidateQueries({ queryKey: ["memberships"] });
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async () => {
      if (!org) throw new Error("No organization");
      const { error } = await supabase.from("organizations").delete().eq("id", org.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Organization deleted");
      setCurrentOrgId(null);
      qc.invalidateQueries({ queryKey: ["memberships"] });
      refetch();
      navigate({ to: "/organizations" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!org) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!canEdit) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        You need to be an owner or admin to edit settings.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">Logo</h2>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border bg-muted">
            {logoUrl ? (
              <img src={logoUrl} alt={`${org.name} logo`} className="h-full w-full object-cover" />
            ) : (
              <span className="text-xl font-semibold text-muted-foreground">
                {org.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploadLogo.isPending}>
              {uploadLogo.isPending ? "Uploading…" : "Upload logo"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadLogo.mutate(f);
                e.target.value = "";
              }}
            />
            <p className="mt-2 text-xs text-muted-foreground">PNG, JPG, or SVG. Max 2 MB.</p>
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-6 rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">General</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} />
            {formState.errors.name && <p className="mt-1 text-xs text-destructive">{formState.errors.name.message}</p>}
          </div>
          <div>
            <Label htmlFor="slug">Slug</Label>
            <Input id="slug" {...register("slug")} />
            {formState.errors.slug && <p className="mt-1 text-xs text-destructive">{formState.errors.slug.message}</p>}
          </div>
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" rows={3} {...register("description")} />
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <Select value={status} onValueChange={(v) => setValue("status", v as "active" | "suspended", { shouldDirty: true })}>
            <SelectTrigger id="status" className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            Suspended organizations remain visible but signal that the workspace is paused.
          </p>
        </div>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </form>

      {isOwner && (
        <section className="rounded-xl border border-destructive/40 bg-card p-6">
          <h2 className="text-lg font-semibold text-destructive">Danger zone</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Deleting the organization removes all members, invitations, and logo. This cannot be undone.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="mt-4" disabled={del.isPending}>
                Delete organization
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {org.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  All members will lose access and organization data will be permanently removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => del.mutate()}>Delete permanently</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
      )}
    </div>
  );
}
