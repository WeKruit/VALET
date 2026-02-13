import { initContract } from "@ts-rest/core";
import {
  createCheckoutSessionRequest,
  createPortalSessionRequest,
  checkoutSessionResponse,
  portalSessionResponse,
  billingStatusResponse,
  createPaypalOrderRequest,
  createPaypalOrderResponse,
  capturePaypalOrderRequest,
  capturePaypalOrderResponse,
  errorResponse,
} from "@valet/shared/schemas";

const c = initContract();

export const billingContract = c.router({
  createCheckoutSession: {
    method: "POST",
    path: "/api/v1/billing/checkout",
    body: createCheckoutSessionRequest,
    responses: {
      200: checkoutSessionResponse,
      400: errorResponse,
      401: errorResponse,
    },
    summary: "Create a Stripe Checkout session for subscription upgrade",
  },
  createPortalSession: {
    method: "POST",
    path: "/api/v1/billing/portal",
    body: createPortalSessionRequest,
    responses: {
      200: portalSessionResponse,
      401: errorResponse,
    },
    summary: "Create a Stripe Customer Portal session for subscription management",
  },
  getStatus: {
    method: "GET",
    path: "/api/v1/billing/status",
    responses: {
      200: billingStatusResponse,
      401: errorResponse,
    },
    summary: "Get current billing status for the authenticated user",
  },
  createPaypalOrder: {
    method: "POST",
    path: "/api/v1/billing/paypal/create-order",
    body: createPaypalOrderRequest,
    responses: {
      200: createPaypalOrderResponse,
      400: errorResponse,
      401: errorResponse,
    },
    summary: "Create a PayPal order for subscription upgrade",
  },
  capturePaypalOrder: {
    method: "POST",
    path: "/api/v1/billing/paypal/capture-order",
    body: capturePaypalOrderRequest,
    responses: {
      200: capturePaypalOrderResponse,
      400: errorResponse,
      401: errorResponse,
    },
    summary: "Capture a PayPal order after user approval",
  },
});
