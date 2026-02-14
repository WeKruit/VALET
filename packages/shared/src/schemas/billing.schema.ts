import { z } from "zod";

// ─── Request Schemas ───

export const createCheckoutSessionRequest = z.object({
  priceId: z.string().min(1),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

export const createPortalSessionRequest = z.object({
  returnUrl: z.string().url(),
});

// ─── Response Schemas ───

export const checkoutSessionResponse = z.object({
  url: z.string().url(),
});

export const portalSessionResponse = z.object({
  url: z.string().url(),
});

export const billingStatusResponse = z.object({
  subscriptionTier: z.enum(["free", "starter", "pro", "enterprise"]),
  stripeCustomerId: z.string().nullable(),
  hasActiveSubscription: z.boolean(),
});

// ─── PayPal Schemas ───

export const createPaypalOrderRequest = z.object({
  priceId: z.string().min(1),
});

export const createPaypalOrderResponse = z.object({
  orderId: z.string(),
});

export const capturePaypalOrderRequest = z.object({
  orderId: z.string().min(1),
});

export const capturePaypalOrderResponse = z.object({
  status: z.string(),
  subscriptionTier: z.enum(["free", "starter", "pro", "enterprise"]),
});

// ─── Inferred Types ───
export type CreateCheckoutSessionRequest = z.infer<typeof createCheckoutSessionRequest>;
export type CreatePortalSessionRequest = z.infer<typeof createPortalSessionRequest>;
export type CheckoutSessionResponse = z.infer<typeof checkoutSessionResponse>;
export type PortalSessionResponse = z.infer<typeof portalSessionResponse>;
export type BillingStatusResponse = z.infer<typeof billingStatusResponse>;
export type CreatePaypalOrderRequest = z.infer<typeof createPaypalOrderRequest>;
export type CreatePaypalOrderResponse = z.infer<typeof createPaypalOrderResponse>;
export type CapturePaypalOrderRequest = z.infer<typeof capturePaypalOrderRequest>;
export type CapturePaypalOrderResponse = z.infer<typeof capturePaypalOrderResponse>;
