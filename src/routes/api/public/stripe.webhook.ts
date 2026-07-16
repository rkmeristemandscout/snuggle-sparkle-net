import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";

export const Route = createFileRoute("/api/public/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signature = request.headers.get("stripe-signature");
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!signature) return new Response("Missing stripe-signature", { status: 400 });
        if (!webhookSecret) return new Response("Webhook secret not configured", { status: 500 });

        const body = await request.text();
        const { getStripe } = await import("@/lib/stripe.server");
        const stripe = getStripe();

        let event: Stripe.Event;
        try {
          // constructEventAsync is required in Workers (Web Crypto)
          event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Invalid signature";
          return new Response(`Webhook signature verification failed: ${msg}`, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        async function planIdFromPrice(priceId: string | null | undefined) {
          if (!priceId) return null;
          const { data } = await supabaseAdmin.from("plans").select("id").eq("stripe_price_id", priceId).maybeSingle();
          return data?.id ?? null;
        }

        async function orgIdFromCustomer(customerId: string | null | undefined) {
          if (!customerId) return null;
          const { data } = await supabaseAdmin.from("subscriptions").select("organization_id").eq("stripe_customer_id", customerId).maybeSingle();
          return data?.organization_id ?? null;
        }

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const s = event.data.object as Stripe.Checkout.Session;
              const orgId = s.metadata?.organization_id ?? (await orgIdFromCustomer(s.customer as string));
              if (orgId && s.subscription) {
                const sub = await stripe.subscriptions.retrieve(s.subscription as string) as unknown as Stripe.Subscription & { current_period_start: number; current_period_end: number };
                const planId = await planIdFromPrice(sub.items.data[0]?.price.id);
                await supabaseAdmin.from("subscriptions").upsert({
                  organization_id: orgId,
                  plan_id: planId,
                  stripe_customer_id: sub.customer as string,
                  stripe_subscription_id: sub.id,
                  status: sub.status,
                  current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
                  current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
                  cancel_at_period_end: sub.cancel_at_period_end,
                  canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
                  trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
                }, { onConflict: "organization_id" });
              }
              break;
            }
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted": {
              const sub = event.data.object as Stripe.Subscription & { current_period_start?: number; current_period_end?: number };
              const orgId = sub.metadata?.organization_id ?? (await orgIdFromCustomer(sub.customer as string));
              if (orgId) {
                const planId = await planIdFromPrice(sub.items.data[0]?.price.id);
                const isDeleted = event.type === "customer.subscription.deleted";
                const { data: freePlan } = await supabaseAdmin.from("plans").select("id").eq("key", "free").maybeSingle();
                await supabaseAdmin.from("subscriptions").upsert({
                  organization_id: orgId,
                  plan_id: isDeleted ? freePlan?.id ?? null : planId,
                  stripe_customer_id: sub.customer as string,
                  stripe_subscription_id: isDeleted ? null : sub.id,
                  status: isDeleted ? "canceled" : sub.status,
                  current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
                  current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
                  cancel_at_period_end: sub.cancel_at_period_end,
                  canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
                  trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
                }, { onConflict: "organization_id" });
              }
              break;
            }
            case "invoice.paid":
            case "invoice.payment_failed":
            case "invoice.finalized":
            case "invoice.updated": {
              const inv = event.data.object as Stripe.Invoice;
              const orgId = await orgIdFromCustomer(inv.customer as string);
              if (orgId) {
                await supabaseAdmin.from("invoices").upsert({
                  organization_id: orgId,
                  stripe_invoice_id: inv.id,
                  number: inv.number,
                  amount_due_cents: inv.amount_due,
                  amount_paid_cents: inv.amount_paid,
                  currency: inv.currency,
                  status: inv.status ?? "open",
                  hosted_invoice_url: inv.hosted_invoice_url,
                  invoice_pdf: inv.invoice_pdf,
                  period_start: inv.period_start ? new Date(inv.period_start * 1000).toISOString() : null,
                  period_end: inv.period_end ? new Date(inv.period_end * 1000).toISOString() : null,
                }, { onConflict: "stripe_invoice_id" });
              }
              break;
            }
            case "payment_intent.succeeded":
            case "payment_intent.payment_failed": {
              const pi = event.data.object as Stripe.PaymentIntent & { invoice?: string | null };
              const orgId = await orgIdFromCustomer(pi.customer as string);
              if (orgId) {
                const latestCharge = pi.latest_charge
                  ? await stripe.charges.retrieve(pi.latest_charge as string).catch(() => null)
                  : null;
                await supabaseAdmin.from("payments").upsert({
                  organization_id: orgId,
                  stripe_payment_intent_id: pi.id,
                  stripe_charge_id: latestCharge?.id ?? null,
                  stripe_invoice_id: (pi.invoice as string) ?? null,
                  amount_cents: pi.amount,
                  currency: pi.currency,
                  status: pi.status,
                  description: pi.description,
                  receipt_url: latestCharge?.receipt_url ?? null,
                  paid_at: pi.status === "succeeded" ? new Date().toISOString() : null,
                }, { onConflict: "stripe_payment_intent_id" });
              }
              break;
            }
          }
          return new Response(JSON.stringify({ received: true }), {
            headers: { "content-type": "application/json" },
          });
        } catch (err) {
          console.error("Webhook handler error", err);
          return new Response(err instanceof Error ? err.message : "Handler error", { status: 500 });
        }
      },
    },
  },
});
