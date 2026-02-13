import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import { useAuth } from "@/features/auth/hooks/use-auth";
import {
  LAYER_1_REGISTRATION,
  LAYER_2_COPILOT_DISCLAIMER,
} from "@/content/legal/consent-text";

const CONSENT_CACHE_KEY = "wk-consent-status";

interface ConsentCache {
  tosAccepted: boolean;
  copilotAccepted: boolean;
  userId: string;
}

function getCachedConsent(userId: string): ConsentCache | null {
  try {
    const raw = localStorage.getItem(CONSENT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentCache;
    if (parsed.userId !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setCachedConsent(cache: ConsentCache) {
  localStorage.setItem(CONSENT_CACHE_KEY, JSON.stringify(cache));
}

export function useConsent() {
  const user = useAuth((s) => s.user);
  const [tosAccepted, setTosAccepted] = useState<boolean | null>(null);
  const [copilotAccepted, setCopilotAccepted] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const tosCheck = api.consent.check.useQuery({
    queryKey: ["consent", "check", "tos", user?.id],
    queryData: {
      query: {
        type: LAYER_1_REGISTRATION.type,
        version: LAYER_1_REGISTRATION.version,
      },
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 10,
  });

  const copilotCheck = api.consent.check.useQuery({
    queryKey: ["consent", "check", "copilot", user?.id],
    queryData: {
      query: {
        type: LAYER_2_COPILOT_DISCLAIMER.type,
        version: LAYER_2_COPILOT_DISCLAIMER.version,
      },
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 10,
  });

  // Initialize from cache
  useEffect(() => {
    if (!user) return;
    const cached = getCachedConsent(user.id);
    if (cached) {
      setTosAccepted(cached.tosAccepted);
      setCopilotAccepted(cached.copilotAccepted);
      setIsLoading(false);
    }
  }, [user]);

  // Update from API responses
  useEffect(() => {
    if (tosCheck.data?.status === 200) {
      setTosAccepted(tosCheck.data.body.accepted);
    }
  }, [tosCheck.data]);

  useEffect(() => {
    if (copilotCheck.data?.status === 200) {
      setCopilotAccepted(copilotCheck.data.body.accepted);
    }
  }, [copilotCheck.data]);

  // Sync loading state
  useEffect(() => {
    if (!tosCheck.isLoading && !copilotCheck.isLoading) {
      setIsLoading(false);
    }
  }, [tosCheck.isLoading, copilotCheck.isLoading]);

  // Cache consent status when both resolved
  useEffect(() => {
    if (user && tosAccepted !== null && copilotAccepted !== null) {
      setCachedConsent({
        tosAccepted,
        copilotAccepted,
        userId: user.id,
      });
    }
  }, [user, tosAccepted, copilotAccepted]);

  const markTosAccepted = useCallback(() => {
    setTosAccepted(true);
    if (user) {
      setCachedConsent({
        tosAccepted: true,
        copilotAccepted: copilotAccepted ?? false,
        userId: user.id,
      });
    }
  }, [user, copilotAccepted]);

  const markCopilotAccepted = useCallback(() => {
    setCopilotAccepted(true);
    if (user) {
      setCachedConsent({
        tosAccepted: tosAccepted ?? false,
        copilotAccepted: true,
        userId: user.id,
      });
    }
  }, [user, tosAccepted]);

  const needsConsent = !isLoading && (!tosAccepted || !copilotAccepted);
  const needsTos = !isLoading && !tosAccepted;
  const needsCopilot = !isLoading && tosAccepted && !copilotAccepted;

  return {
    tosAccepted,
    copilotAccepted,
    isLoading,
    needsConsent,
    needsTos,
    needsCopilot,
    markTosAccepted,
    markCopilotAccepted,
  };
}
