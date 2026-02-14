import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { users, type Database } from "@valet/db";
import type { FastifyBaseLogger } from "fastify";

const TIER_MAP: Record<string, "starter" | "pro" | "enterprise"> = {
  // Map Stripe price IDs to subscription tiers.
  // These will be populated once Stripe products are created in the dashboard.
  // Example:
  // "price_xxx_starter_monthly": "starter",
  // "price_xxx_pro_monthly": "pro",
};

export class BillingService {
  private stripe: Stripe;
  private db: Database;
  private logger: FastifyBaseLogger;

  constructor({ db, logger }: { db: Database; logger: FastifyBaseLogger }) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY environment variable is required");
    }

    this.stripe = new Stripe(secretKey);
    this.db = db;
    this.logger = logger;
  }

  async createCheckoutSession(
    userId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<string> {
    const customerId = await this.getOrCreateStripeCustomer(userId);

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId },
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL");
    }

    return session.url;
  }

  async createPortalSession(
    userId: string,
    returnUrl: string,
  ): Promise<string> {
    const customerId = await this.getOrCreateStripeCustomer(userId);

    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return session.url;
  }

  async getBillingStatus(userId: string) {
    const rows = await this.db
      .select({
        subscriptionTier: users.subscriptionTier,
        stripeCustomerId: users.stripeCustomerId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = rows[0];
    if (!user) {
      throw new Error("User not found");
    }

    return {
      subscriptionTier: user.subscriptionTier as "free" | "starter" | "pro" | "enterprise",
      stripeCustomerId: user.stripeCustomerId ?? null,
      hasActiveSubscription: user.subscriptionTier !== "free",
    };
  }

  async handleWebhook(rawBody: string, signature: string): Promise<void> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET environment variable is required");
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      this.logger.error({ err }, "Stripe webhook signature verification failed");
      throw new Error("Invalid webhook signature");
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.handleCheckoutCompleted(session);
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await this.handleSubscriptionUpdated(subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await this.handleSubscriptionDeleted(subscription);
        break;
      }
      default:
        this.logger.info({ type: event.type }, "Unhandled Stripe webhook event");
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const userId = session.metadata?.userId;
    if (!userId) {
      this.logger.warn("Checkout session missing userId metadata");
      return;
    }

    if (session.subscription) {
      const subscription = await this.stripe.subscriptions.retrieve(
        session.subscription as string,
      );
      const tier = this.resolveTier(subscription);
      await this.db
        .update(users)
        .set({ subscriptionTier: tier, updatedAt: new Date() })
        .where(eq(users.id, userId));

      this.logger.info({ userId, tier }, "Subscription activated via checkout");
    }
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const customerId = subscription.customer as string;
    const tier = this.resolveTier(subscription);

    await this.db
      .update(users)
      .set({ subscriptionTier: tier, updatedAt: new Date() })
      .where(eq(users.stripeCustomerId, customerId));

    this.logger.info({ customerId, tier }, "Subscription updated");
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const customerId = subscription.customer as string;

    await this.db
      .update(users)
      .set({ subscriptionTier: "free", updatedAt: new Date() })
      .where(eq(users.stripeCustomerId, customerId));

    this.logger.info({ customerId }, "Subscription cancelled — reverted to free");
  }

  private resolveTier(subscription: Stripe.Subscription): string {
    const priceId = subscription.items.data[0]?.price.id;
    if (priceId && TIER_MAP[priceId]) {
      return TIER_MAP[priceId];
    }
    // Fallback: if subscription is active, default to starter
    return subscription.status === "active" ? "starter" : "free";
  }

  /**
   * Create a PayPal order for a subscription upgrade.
   * Stub: returns a placeholder order ID until PayPal credentials are configured.
   */
  async createPaypalOrder(userId: string, priceId: string): Promise<string> {
    this.logger.info({ userId, priceId }, "PayPal order creation requested (stub)");

    // TODO: Implement with @paypal/checkout-server-sdk once PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are set
    throw new Error("PayPal integration is not yet configured. Please use Stripe checkout.");
  }

  /**
   * Capture a PayPal order after user approval.
   * Stub: returns placeholder response until PayPal credentials are configured.
   */
  async capturePaypalOrder(
    userId: string,
    orderId: string,
  ): Promise<{ status: string; subscriptionTier: "free" | "starter" | "pro" | "enterprise" }> {
    this.logger.info({ userId, orderId }, "PayPal order capture requested (stub)");

    // TODO: Implement with @paypal/checkout-server-sdk once PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are set
    throw new Error("PayPal integration is not yet configured. Please use Stripe checkout.");
  }

  private async getOrCreateStripeCustomer(userId: string): Promise<string> {
    const rows = await this.db
      .select({
        stripeCustomerId: users.stripeCustomerId,
        email: users.email,
        name: users.name,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = rows[0];
    if (!user) {
      throw new Error("User not found");
    }

    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    // Create a new Stripe customer
    const customer = await this.stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { userId },
    });

    // Persist the Stripe customer ID
    await this.db
      .update(users)
      .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return customer.id;
  }
}
