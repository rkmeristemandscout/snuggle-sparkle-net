import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";

const PENDING_KEY = "stackly.pendingInviteToken";

export const Route = createFileRoute("/join/$token")({
  component: JoinPage,
});

function JoinPage() {
  const { token } = useParams({ from: "/join/$token" });
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string>("Verifying invitation…");

  const accept = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("accept_invitation", { _token: token });
      if (error) throw error;
      return data;
    },
    onSuccess: (org) => {
      const created = Array.isArray(org) ? org[0] : org;
      toast.success(`Joined ${created?.name ?? "organization"}`);
      if (created?.id) window.localStorage.setItem("stackly.currentOrgId", created.id);
      window.localStorage.removeItem(PENDING_KEY);
      navigate({ to: "/dashboard" });
    },
    onError: (e: Error) => setMessage(e.message),
  });

  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.localStorage.setItem(PENDING_KEY, token);
      navigate({ to: "/auth", search: { mode: "signin" as const } });
      return;
    }
    if (!accept.isPending && !accept.isSuccess && !accept.isError) {
      accept.mutate();
    }
     
  }, [loading, user, token]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="rounded-xl border bg-card p-8">
        <h1 className="text-xl font-semibold">Join organization</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {accept.isPending ? "Accepting invitation…" : message}
        </p>
        {accept.isError && (
          <div className="mt-4 flex flex-col gap-2">
            <Button onClick={() => accept.mutate()} disabled={accept.isPending}>
              Try again
            </Button>
            <Button asChild variant="ghost">
              <Link to="/dashboard">Go to dashboard</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
