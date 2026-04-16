import { Hono } from "hono";
import { requireAuth } from "@/auth/middleware";
import {
  stripe,
  getOrCreateCustomer,
  createCheckoutSession,
  createPortalSession,
} from "@/lib/stripe";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendInvoiceEmail } from "@/emails/resend";

export const billingRoutes = new Hono();

// POST /billing/checkout — create a Stripe checkout session
billingRoutes.post("/checkout", requireAuth, async (c) => {
  const u = c.get("user") as { id: string; email: string; name: string; stripeCustomerId?: string };
  const priceId = process.env.STRIPE_PRO_PRICE_ID!;

  const customer = await getOrCreateCustomer({
    userId: u.id,
    email: u.email,
    name: u.name,
    stripeCustomerId: u.stripeCustomerId,
  });

  // Persist customer ID if new
  if (!u.stripeCustomerId) {
    await db.update(user).set({ stripeCustomerId: customer.id }).where(eq(user.id, u.id));
  }

  const session = await createCheckoutSession({
    customerId: customer.id,
    priceId,
    successUrl: `${process.env.APP_URL}/billing/success`,
    cancelUrl: `${process.env.APP_URL}/billing/cancel`,
  });

  return c.json({ url: session.url });
});

// POST /billing/portal — customer billing portal
billingRoutes.post("/portal", requireAuth, async (c) => {
  const u = c.get("user") as { stripeCustomerId?: string };
  if (!u.stripeCustomerId) return c.json({ error: "No billing account" }, 400);

  const portal = await createPortalSession({
    customerId: u.stripeCustomerId,
    returnUrl: `${process.env.APP_URL}/settings`,
  });

  return c.json({ url: portal.url });
});

// POST /billing/webhook — Stripe webhook handler
billingRoutes.post("/webhook", async (c) => {
  const sig = c.req.header("stripe-signature")!;
  const body = await c.req.text();

  let event: ReturnType<typeof stripe.webhooks.constructEvent>;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return c.json({ error: "Invalid signature" }, 400);
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as { customer: string; status: string };
      const customerId = sub.customer;
      const active = sub.status === "active";
      await db
        .update(user)
        .set({ plan: active ? "pro" : "free" })
        .where(eq(user.stripeCustomerId, customerId));
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as { customer: string };
      await db
        .update(user)
        .set({ plan: "free" })
        .where(eq(user.stripeCustomerId, sub.customer));
      break;
    }

    case "invoice.payment_succeeded": {
      const inv = event.data.object as {
        customer_email?: string;
        amount_paid: number;
        hosted_invoice_url?: string;
        created: number;
      };
      if (inv.customer_email) {
        await sendInvoiceEmail({
          to: inv.customer_email,
          name: "there",
          amount: `$${(inv.amount_paid / 100).toFixed(2)}`,
          invoiceUrl: inv.hosted_invoice_url ?? "",
          date: new Date(inv.created * 1000).toLocaleDateString(),
        });
      }
      break;
    }
  }

  return c.json({ received: true });
});
