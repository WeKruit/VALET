import type { PropsWithChildren } from "react";
import {
  LDProvider,
  useFlags,
  type LDContext,
  type LDFlagSet,
} from "launchdarkly-react-client-sdk";
import { useAuth } from "@/features/auth/hooks/use-auth";

const FLAG_KEYS = {
  desktopHandoff: "valet.web.desktop_handoff.enabled",
  downloadPage: "valet.web.download_page.enabled",
} as const;

type SupportedEnvironment = "test" | "staging" | "production";

function resolveEnvironment(): SupportedEnvironment {
  const raw = (
    import.meta.env.VITE_VALET_ENVIRONMENT ?? (import.meta.env.DEV ? "test" : "production")
  ).toLowerCase();

  if (raw === "staging") return "staging";
  if (raw === "production" || raw === "prod") return "production";
  return "test";
}

function resolveClientSideId(environment: SupportedEnvironment): string {
  if (environment === "production") {
    return import.meta.env.VITE_LD_CLIENT_SIDE_ID_PRODUCTION ?? "";
  }
  if (environment === "staging") {
    return import.meta.env.VITE_LD_CLIENT_SIDE_ID_STAGING ?? "";
  }
  return import.meta.env.VITE_LD_CLIENT_SIDE_ID_TEST ?? "";
}

function buildContext(
  environment: SupportedEnvironment,
  user: ReturnType<typeof useAuth.getState>["user"],
): LDContext {
  if (!user) {
    return {
      kind: "user",
      key: "anonymous",
      anonymous: true,
      environment,
      channel:
        environment === "staging" ? "beta" : environment === "production" ? "stable" : "local",
      isAdmin: false,
    };
  }

  return {
    kind: "user",
    key: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isAdmin: user.role === "admin" || user.role === "superadmin",
    environment,
    channel: environment === "staging" ? "beta" : environment === "production" ? "stable" : "local",
  };
}

export function LaunchDarklyProvider({ children }: PropsWithChildren) {
  const user = useAuth((state) => state.user);
  const environment = resolveEnvironment();
  const clientSideID = resolveClientSideId(environment);

  if (!clientSideID) {
    return <>{children}</>;
  }

  return (
    <LDProvider
      clientSideID={clientSideID}
      context={buildContext(environment, user)}
      deferInitialization={false}
      reactOptions={{ useCamelCaseFlagKeys: false }}
      options={{
        application: {
          id: "valet-web",
          version: import.meta.env.VITE_APP_VERSION ?? "0.0.0",
        },
      }}
    >
      {children}
    </LDProvider>
  );
}

export function useValetWebFlags() {
  const flags = useFlags<LDFlagSet>();
  return {
    desktopHandoffEnabled:
      typeof flags[FLAG_KEYS.desktopHandoff] === "boolean"
        ? Boolean(flags[FLAG_KEYS.desktopHandoff])
        : true,
    downloadPageEnabled:
      typeof flags[FLAG_KEYS.downloadPage] === "boolean"
        ? Boolean(flags[FLAG_KEYS.downloadPage])
        : true,
  };
}
