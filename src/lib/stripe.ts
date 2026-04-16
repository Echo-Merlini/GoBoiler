import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-03-31.basil",
});

// ─── Create or retrieve a Stripe customer for a user ────
export async function getOrCreateCustomer({
  userId,
  email,
  name,
  stripeCustomerId,
}: {
  userId: string;
  email: string;
  name: string;
  stripeCustomerId?: string | null;
}) {
  if (stripeCustomerId) {
    return stripe.customers.retrieve(stripeCustomerId);
  }

  return stripe.customers.create({
    email,
    name,
    metadata: { userId },
  });
}

// ─── Create a checkout session ───────────────────────────
export async function createCheckoutSession({
  customerId,
  priceId,
  successUrl,
  cancelUrl,
}: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}) {
  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}

// ─── Create a billing portal session ────────────────────
export async function createPortalSession({
  customerId,
  returnUrl,
}: {
  customerId: string;
  returnUrl: string;
}) {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}
