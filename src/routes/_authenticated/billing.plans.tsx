import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePlanStripeIds } from "@/lib/billing.functions";

export const Route = createFileRoute("/_authenticated/billing/plans")({
  component: BillingPlansAdmin,
});

function BillingPlansAdmin() {
  const { isSuperAdmin, isLoading } = usePermissions();
  const qc = useQueryClient();
  const update = useServerFn(updatePlanStripeIds);

  const plansQ = useQuery({
    queryKey: ["billing", "plans", "admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!isSuperAdmin) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h2 className="text-lg font-semibold">Forbidden</h2>
        <p className="mt-1 text-sm text-muted-foreground">Only platform super admins can edit plan Stripe IDs.</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/billing"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Billing</Link></Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Plan Stripe mapping</h1>
          <p className="text-sm text-muted-foreground">
            Paste each plan's Stripe Product ID (<code>prod_…</code>) and Price ID (<code>price_…</code>).
            Leave blank to auto-create at first checkout.
          </p>
        </div>
        <Button asChild variant="outline" size="sm"><Link to="/billing"><ArrowLeft className="mr-2 h-4 w-4" /> Billing</Link></Button>
      </header>

      <div className="grid gap-4">
        {plansQ.data?.map((plan) => (
          <PlanRow
            key={plan.id}
            plan={plan}
            onSave={async (productId, priceId) => {
              await update({ data: { planId: plan.id, stripeProductId: productId, stripePriceId: priceId } });
              toast.success(`Saved ${plan.name}`);
              qc.invalidateQueries({ queryKey: ["billing"] });
            }}
          />
        ))}
      </div>
    </div>
  );
}

function PlanRow({
  plan,
  onSave,
}: {
  plan: { id: string; name: string; key: string; price_cents: number; interval: string; stripe_product_id: string | null; stripe_price_id: string | null };
  onSave: (productId: string, priceId: string) => Promise<void>;
}) {
  const [product, setProduct] = useState(plan.stripe_product_id ?? "");
  const [price, setPrice] = useState(plan.stripe_price_id ?? "");
  useEffect(() => { setProduct(plan.stripe_product_id ?? ""); setPrice(plan.stripe_price_id ?? ""); }, [plan.stripe_product_id, plan.stripe_price_id]);

  const save = useMutation({
    mutationFn: async () => onSave(product.trim(), price.trim()),
    onError: (e: Error) => toast.error(e.message),
  });

  const dirty = product !== (plan.stripe_product_id ?? "") || price !== (plan.stripe_price_id ?? "");
  const isFree = plan.key === "free";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{plan.name}</CardTitle>
          <span className="text-sm text-muted-foreground">
            {isFree ? "Free" : `$${(plan.price_cents / 100).toFixed(2)} / ${plan.interval}`}
          </span>
        </div>
        <CardDescription>Plan key: <code>{plan.key}</code></CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`prod-${plan.id}`}>Stripe Product ID</Label>
          <Input id={`prod-${plan.id}`} placeholder="prod_..." value={product} onChange={(e) => setProduct(e.target.value)} disabled={isFree} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`price-${plan.id}`}>Stripe Price ID</Label>
          <Input id={`price-${plan.id}`} placeholder="price_..." value={price} onChange={(e) => setPrice(e.target.value)} disabled={isFree} />
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending || isFree}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
