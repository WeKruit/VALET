import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { AppRouter } from "./router";
import { ErrorBoundary } from "./components/common/error-boundary";
import { CookieConsentBanner } from "./features/legal/components/cookie-consent-banner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRouter />
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                fontFamily: "var(--wk-font-body)",
                background: "var(--wk-surface-white)",
                color: "var(--wk-text-primary)",
                border: "1px solid var(--wk-border-default)",
                borderRadius: "var(--wk-radius-lg)",
              },
            }}
          />
          <CookieConsentBanner />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
