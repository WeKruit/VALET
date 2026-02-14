import { CreditCard, ExternalLink } from "lucide-react";
import { Button } from "@valet/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { api } from "@/lib/api-client";
import { useNavigate } from "react-router-dom";

export function BillingSettings() {
  const navigate = useNavigate();
  const statusQuery = api.billing.getStatus.useQuery({
    queryKey: ["billing", "status"],
    queryData: {},
  });
  const portalMutation = api.billing.createPortalSession.useMutation();

  const handleManageBilling = async () => {
    const result = await portalMutation.mutateAsync({
      body: {
        returnUrl: `${window.location.origin}/settings?tab=billing`,
      },
    });

    if (result.status === 200) {
      window.location.href = result.body.url;
    }
  };

  const status = statusQuery.data?.status === 200 ? statusQuery.data.body : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Subscription
          </CardTitle>
          <CardDescription>
            Manage your subscription and billing details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusQuery.isLoading ? (
            <p className="text-sm text-[var(--wk-text-secondary)]">
              Loading billing information...
            </p>
          ) : status ? (
            <>
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--wk-text-secondary)]">
                  Current plan:
                </span>
                <Badge variant="default" className="capitalize">
                  {status.subscriptionTier}
                </Badge>
              </div>

              {status.hasActiveSubscription ? (
                <Button
                  variant="secondary"
                  onClick={handleManageBilling}
                  disabled={portalMutation.isPending}
                >
                  {portalMutation.isPending ? "Loading..." : "Manage Subscription"}
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--wk-text-secondary)]">
                    You are on the free plan. Upgrade to unlock more applications and features.
                  </p>
                  <Button onClick={() => navigate("/pricing")}>
                    View Plans
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-[var(--wk-text-secondary)]">
              Unable to load billing information. Please try again later.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
