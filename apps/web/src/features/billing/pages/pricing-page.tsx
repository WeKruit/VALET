import { useState } from "react";
import { Check, ChevronDown, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@valet/ui/components/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface Tier {
  name: string;
  key: "free" | "starter" | "pro" | "enterprise";
  price: string;
  period: string;
  description: string;
  features: string[];
  priceId?: string;
  cta: string;
  popular: boolean;
}

const tiers: Tier[] = [
  {
    name: "Free",
    key: "free",
    price: "$0",
    period: "forever",
    description: "Get started with basic job application automation",
    features: [
      "5 applications per month",
      "1 resume profile",
      "Basic form filling",
      "Community support",
    ],
    cta: "Current Plan",
    popular: false,
  },
  {
    name: "Starter",
    key: "starter",
    price: "$19",
    period: "/month",
    description: "For active job seekers who want to move fast",
    features: [
      "50 applications per month",
      "3 resume profiles",
      "Smart form filling with AI",
      "Application tracking dashboard",
      "Email support",
    ],
    // Replace with actual Stripe price ID once created in dashboard
    priceId: "price_starter_monthly",
    cta: "Get Started",
    popular: true,
  },
  {
    name: "Pro",
    key: "pro",
    price: "$49",
    period: "/month",
    description: "Unlimited automation for serious job hunters",
    features: [
      "Unlimited applications",
      "Unlimited resume profiles",
      "Advanced AI form filling",
      "Priority application queue",
      "Custom cover letters",
      "Analytics & insights",
      "Priority support",
    ],
    priceId: "price_pro_monthly",
    cta: "Go Pro",
    popular: false,
  },
];

type PaymentMethod = "card" | "paypal";

const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined;

const faqItems = [
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes, you can cancel your subscription at any time from your billing settings. Your plan will remain active until the end of the current billing period.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "The Free plan lets you try Valet with 5 applications per month at no cost. Upgrade whenever you're ready to scale your job search.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit and debit cards via Stripe, as well as PayPal for your convenience.",
  },
  {
    question: "Can I upgrade or downgrade?",
    answer:
      "Yes, you can change your plan at any time. Upgrades take effect immediately, and downgrades apply at the start of your next billing cycle.",
  },
  {
    question: "Is my payment information secure?",
    answer:
      "Yes, we never store your card details directly. All payments are processed securely through Stripe and PayPal, both of which are PCI DSS compliant.",
  },
];

function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-xl md:text-2xl font-display font-semibold text-[var(--wk-text-primary)] text-center mb-6">
        Frequently Asked Questions
      </h2>
      <div className="space-y-2">
        {faqItems.map((item, index) => {
          const isOpen = openIndex === index;
          return (
            <div
              key={index}
              className="rounded-lg border border-[var(--wk-border)] bg-[var(--wk-bg-secondary)]"
            >
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-sm font-medium text-[var(--wk-text-primary)]">
                  {item.question}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-[var(--wk-text-secondary)] transition-transform duration-200",
                    isOpen && "rotate-180"
                  )}
                />
              </button>
              {isOpen && (
                <div className="px-4 pb-3">
                  <p className="text-sm text-[var(--wk-text-secondary)]">
                    {item.answer}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PricingPage() {
  const { user } = useAuth();
  const checkoutMutation = api.billing.createCheckoutSession.useMutation();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");

  const handleCheckout = async (priceId: string, tierKey: string) => {
    setLoadingTier(tierKey);
    try {
      const result = await checkoutMutation.mutateAsync({
        body: {
          priceId,
          successUrl: `${window.location.origin}/settings?tab=billing&status=success`,
          cancelUrl: `${window.location.origin}/pricing`,
        },
      });

      if (result.status === 200) {
        window.location.href = result.body.url;
      }
    } catch {
      toast.error(
        "Payment setup is being configured. Please try again later."
      );
    } finally {
      setLoadingTier(null);
    }
  };

  const handlePaypalCreateOrder = async (_priceId: string) => {
    toast.error("PayPal integration coming soon. Please use a credit card for now.");
    return "";
  };

  const showPaypalOption = !!PAYPAL_CLIENT_ID;

  const pricingContent = (
    <div className="space-y-6 md:space-y-8">
      <div className="text-center">
        <h1 className="text-2xl md:text-3xl font-display font-semibold text-[var(--wk-text-primary)]">
          Choose your plan
        </h1>
        <p className="mt-2 text-sm md:text-base text-[var(--wk-text-secondary)]">
          Scale your job search with automated applications
        </p>
      </div>

      {showPaypalOption && (
        <div className="flex items-center justify-center gap-1 rounded-lg border border-[var(--wk-border)] bg-[var(--wk-bg-secondary)] p-1 max-w-xs mx-auto">
          <button
            type="button"
            onClick={() => setPaymentMethod("card")}
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors flex-1 justify-center",
              paymentMethod === "card"
                ? "bg-[var(--wk-bg-primary)] text-[var(--wk-text-primary)] shadow-sm"
                : "text-[var(--wk-text-secondary)] hover:text-[var(--wk-text-primary)]"
            )}
          >
            <CreditCard className="h-4 w-4" />
            Credit Card
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethod("paypal")}
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors flex-1 justify-center",
              paymentMethod === "paypal"
                ? "bg-[var(--wk-bg-primary)] text-[var(--wk-text-primary)] shadow-sm"
                : "text-[var(--wk-text-secondary)] hover:text-[var(--wk-text-primary)]"
            )}
          >
            PayPal
          </button>
        </div>
      )}

      <div className="grid gap-4 md:gap-6 md:grid-cols-3 max-w-5xl mx-auto">
        {tiers.map((tier) => {
          const isCurrentTier = user?.subscriptionTier === tier.key;
          const isLoading = loadingTier === tier.key;

          return (
            <Card
              key={tier.key}
              className={cn(
                "relative flex flex-col",
                tier.popular && "border-[var(--wk-accent-amber)] border-2"
              )}
            >
              {tier.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap bg-[var(--wk-accent-amber)] text-[var(--wk-text-primary)]">
                  Most Popular
                </Badge>
              )}

              <CardHeader>
                <CardTitle className="text-xl">{tier.name}</CardTitle>
                <CardDescription>{tier.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-[var(--wk-text-primary)]">
                    {tier.price}
                  </span>
                  <span className="text-[var(--wk-text-secondary)] ml-1">
                    {tier.period}
                  </span>
                </div>
              </CardHeader>

              <CardContent className="flex-1">
                <ul className="space-y-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="h-5 w-5 shrink-0 text-[var(--wk-accent-amber)] mt-0.5" />
                      <span className="text-sm text-[var(--wk-text-secondary)]">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                {isCurrentTier ? (
                  <Button variant="secondary" className="w-full" disabled>
                    Current Plan
                  </Button>
                ) : tier.priceId ? (
                  paymentMethod === "paypal" && showPaypalOption ? (
                    <div className="w-full">
                      <PayPalButtons
                        style={{ layout: "horizontal", label: "subscribe", height: 40 }}
                        createOrder={() => handlePaypalCreateOrder(tier.priceId!)}
                        onError={() => {
                          toast.error("PayPal integration coming soon. Please use a credit card for now.");
                        }}
                      />
                    </div>
                  ) : (
                    <Button
                      className="w-full"
                      variant={tier.popular ? "cta" : "secondary"}
                      onClick={() => handleCheckout(tier.priceId!, tier.key)}
                      disabled={isLoading}
                    >
                      {isLoading ? "Loading..." : tier.cta}
                    </Button>
                  )
                ) : (
                  <Button variant="secondary" className="w-full" disabled>
                    {tier.cta}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <FaqSection />
    </div>
  );

  if (showPaypalOption && PAYPAL_CLIENT_ID) {
    return (
      <PayPalScriptProvider options={{ clientId: PAYPAL_CLIENT_ID, intent: "subscription" }}>
        {pricingContent}
      </PayPalScriptProvider>
    );
  }

  return pricingContent;
}
