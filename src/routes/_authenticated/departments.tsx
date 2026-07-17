import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { departmentSchema, type DepartmentValues } from "@/lib/auth-schemas";
import { createDepartment, updateDepartment, deleteDepartment } from "@/lib/departments.functions";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { useSession } from "@/hooks/use-session";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Pencil, Trash2, X, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/departments")({
  component: DepartmentsPage,
});

function DepartmentsPage() {
  useSession();
  const { currentMembership } = useCurrentOrg();
  const { can } = usePermissions();
  const org = currentMembership?.organization;
  const canManage = can(["department.create", "department.update", "department.delete"]);
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const createFn = useServerFn(createDepartment);
  const delFn = useServerFn(deleteDepartment);


  const departments = useQuery({
    enabled: !!org,
    queryKey: ["departments", org?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name, slug, description, created_at")
        .eq("organization_id", org!.id)
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { register, handleSubmit, reset, formState } = useForm<DepartmentValues>({
    resolver: zodResolver(departmentSchema),
    defaultValues: { name: "", slug: "", description: "" },
  });

  const create = useMutation({
    mutationFn: async (v: DepartmentValues) => {
      if (!org) throw new Error("Missing organization");
      return createFn({ data: { organizationId: org.id, ...v } });
    },
    onSuccess: () => {
      toast.success("Department created");
      reset();
      qc.invalidateQueries({ queryKey: ["departments", org?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (departmentId: string) => delFn({ data: { departmentId } }),
    onSuccess: () => {
      toast.success("Department deleted");
      qc.invalidateQueries({ queryKey: ["departments", org?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!org) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        Select an organization to see its departments.
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <section className="rounded-xl border bg-card p-6 md:col-span-2">
        <h2 className="text-lg font-semibold">Departments in {org.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          New organizations start with HR, Sales, Marketing, Engineering, and Finance.
        </p>
        {departments.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        ) : departments.data && departments.data.length > 0 ? (
          <ul className="mt-4 divide-y">
            {departments.data.map((d) =>
              editingId === d.id ? (
                <EditRow
                  key={d.id}
                  dept={d}
                  onDone={() => {
                    setEditingId(null);
                    qc.invalidateQueries({ queryKey: ["departments", org.id] });
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <li key={d.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground">/{d.slug}</p>
                    {d.description && (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                        {d.description}
                      </p>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" aria-label="Edit"
                        onClick={() => setEditingId(d.id)}>
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
                            <AlertDialogTitle>Delete {d.name}?</AlertDialogTitle>
                            <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => del.mutate(d.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </li>
              )
            )}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No departments yet.</p>
        )}
      </section>

      {canManage && (
        <section className="rounded-xl border bg-card p-6">
          <h2 className="text-lg font-semibold">New department</h2>
          <form onSubmit={handleSubmit((v) => create.mutate(v))} className="mt-4 space-y-4">
            <div>
              <Label htmlFor="dept-name">Name</Label>
              <Input id="dept-name" {...register("name")} />
              {formState.errors.name && <p className="mt-1 text-xs text-destructive">{formState.errors.name.message}</p>}
            </div>
            <div>
              <Label htmlFor="dept-slug">Slug</Label>
              <Input id="dept-slug" placeholder="operations" {...register("slug")} />
              {formState.errors.slug && <p className="mt-1 text-xs text-destructive">{formState.errors.slug.message}</p>}
            </div>
            <div>
              <Label htmlFor="dept-desc">Description</Label>
              <Textarea id="dept-desc" rows={3} {...register("description")} />
            </div>
            <Button type="submit" disabled={create.isPending} className="w-full">
              {create.isPending ? "Creating…" : "Create department"}
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}

function EditRow({
  dept, onDone, onCancel,
}: {
  dept: { id: string; name: string; slug: string; description: string | null };
  onDone: () => void;
  onCancel: () => void;
}) {
  const { register, handleSubmit, formState } = useForm<DepartmentValues>({
    resolver: zodResolver(departmentSchema),
    defaultValues: { name: dept.name, slug: dept.slug, description: dept.description ?? "" },
  });
  const updFn = useServerFn(updateDepartment);
  const update = useMutation({
    mutationFn: async (v: DepartmentValues) => updFn({ data: { departmentId: dept.id, ...v } }),
    onSuccess: () => { toast.success("Department updated"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <li className="py-3">
      <form onSubmit={handleSubmit((v) => update.mutate(v))} className="grid gap-2 md:grid-cols-3">
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
          <Button type="submit" size="icon" disabled={update.isPending} aria-label="Save">
            <Check className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </li>
  );
}
