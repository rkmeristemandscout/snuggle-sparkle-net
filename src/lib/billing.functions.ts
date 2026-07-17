import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureAdmin(supabase: any, userId: string, orgId: string) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || (data.role !== "owner" && data.role !== "admin")) {
    throw new Error("Only organization owners or admins can manage billing");
  }
}

async function getOrCreateCustomer(
  orgId: string,
  ownerEmail: string | null,
  orgName: string,
) {
  const { getStripe } = await import("./stripe.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const stripe = getStripe();

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("organization_id", orgId)
    .maybeSingle();

  if (sub?.stripe_customer_id) return sub.stripe_customer_id;

  const customer = await stripe.customers.create({
    email: ownerEmail ?? undefined,
    name: orgName,
    metadata: { organization_id: orgId },
  });

  await supabaseAdmin
    .from("subscriptions")
    .upsert(
      { organization_id: orgId, stripe_customer_id: customer.id },
      { onConflict: "organization_id" },
    );

  return customer.id;
}

/** Create a Stripe Checkout session to upgrade/subscribe to a plan. */
export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      planId: z.string().uuid(),
      successUrl: z.string().url(),
      cancelUrl: z.string().url(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureAdmin(supabase, userId, data.organizationId);

    const { data: plan, error: planErr } = await supabase
      .from("plans")
      .select("id, name, price_cents, currency, interval, stripe_price_id, key")
      .eq("id", data.planId)
      .maybeSingle();
    if (planErr || !plan) throw new Error("Plan not found");
    if (plan.key === "free") throw new Error("Free plan does not require checkout");

    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", data.organizationId)
      .single();

    const { data: userRow } = await supabase.auth.getUser();
    const email = userRow.user?.email ?? null;

    const customerId = await getOrCreateCustomer(
      data.organizationId,
      email,
      org?.name ?? "Organization",
    );

    const { getStripe } = await import("./stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stripe = getStripe();

    // Auto-create Stripe price if missing
    let priceId = plan.stripe_price_id;
    if (!priceId) {
      const price = await stripe.prices.create({
        currency: plan.currency,
        unit_amount: plan.price_cents,
        recurring: plan.interval === "one_time" ? undefined : { interval: plan.interval as "month" | "year" },
        product_data: { name: plan.name },
      });
      priceId = price.id;
      await supabaseAdmin.from("plans").update({ stripe_price_id: priceId, stripe_product_id: typeof price.product === "string" ? price.product : price.product.id }).eq("id", plan.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: plan.interval === "one_time" ? "payment" : "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: data.successUrl,
      cancel_url: data.cancelUrl,
      allow_promotion_codes: true,
      metadata: { organization_id: data.organizationId, plan_id: plan.id },
      subscription_data: plan.interval === "one_time" ? undefined : {
        metadata: { organization_id: data.organizationId, plan_id: plan.id },
      },
    });

    return { url: session.url };
  });

/** Create a Stripe Customer Portal session (manage payment method, invoices, cancel, etc.) */
export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      returnUrl: z.string().url(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureAdmin(supabase, userId, data.organizationId);

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (!sub?.stripe_customer_id) throw new Error("No billing account. Subscribe to a paid plan first.");

    const { getStripe } = await import("./stripe.server");
    const stripe = getStripe();
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: data.returnUrl,
    });
    return { url: portal.url };
  });

/** Cancel subscription at period end (or immediately). */
export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      immediately: z.boolean().default(false),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureAdmin(supabase, userId, data.organizationId);

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (!sub?.stripe_subscription_id) throw new Error("No active subscription to cancel");

    const { getStripe } = await import("./stripe.server");
    const stripe = getStripe();
    if (data.immediately) {
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    } else {
      await stripe.subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: true });
    }
    return { ok: true };
  });

/** Renew (undo pending cancellation) a subscription. */
export const renewSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ organizationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureAdmin(supabase, userId, data.organizationId);

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (!sub?.stripe_subscription_id) throw new Error("No subscription found");

    const { getStripe } = await import("./stripe.server");
    const stripe = getStripe();
    await stripe.subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: false });
    return { ok: true };
  });

/** Change plan (upgrade/downgrade) mid-cycle with proration. */
export const changePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      planId: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureAdmin(supabase, userId, data.organizationId);

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (!sub?.stripe_subscription_id) throw new Error("No active subscription. Use checkout to subscribe first.");

    const { data: plan } = await supabase
      .from("plans")
      .select("id, name, price_cents, currency, interval, stripe_price_id, key")
      .eq("id", data.planId)
      .maybeSingle();
    if (!plan) throw new Error("Plan not found");
    if (plan.key === "free") throw new Error("To downgrade to Free, cancel your subscription.");

    const { getStripe } = await import("./stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stripe = getStripe();

    let priceId = plan.stripe_price_id;
    if (!priceId) {
      const price = await stripe.prices.create({
        currency: plan.currency,
        unit_amount: plan.price_cents,
        recurring: { interval: plan.interval as "month" | "year" },
        product_data: { name: plan.name },
      });
      priceId = price.id;
      await supabaseAdmin.from("plans").update({ stripe_price_id: priceId, stripe_product_id: typeof price.product === "string" ? price.product : price.product.id }).eq("id", plan.id);
    }

    const current = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      items: [{ id: current.items.data[0].id, price: priceId }],
      proration_behavior: "create_prorations",
      metadata: { organization_id: data.organizationId, plan_id: plan.id },
    });
    return { ok: true };
  });

/** Super-admin only: set Stripe Product / Price IDs on a plan. */
export const updatePlanStripeIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      planId: z.string().uuid(),
      stripeProductId: z.string().trim().nullable().optional(),
      stripePriceId: z.string().trim().nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isSA, error } = await supabase.rpc("is_super_admin", { _user: userId });
    if (error) throw new Error(error.message);
    if (!isSA) throw new Error("Only platform super admins can edit plan Stripe IDs");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: { stripe_product_id?: string | null; stripe_price_id?: string | null } = {};
    if (data.stripeProductId !== undefined) patch.stripe_product_id = data.stripeProductId || null;
    if (data.stripePriceId !== undefined) patch.stripe_price_id = data.stripePriceId || null;
    const { error: uErr } = await supabaseAdmin.from("plans").update(patch).eq("id", data.planId);
    if (uErr) throw new Error(uErr.message);
    return { ok: true };
  });
