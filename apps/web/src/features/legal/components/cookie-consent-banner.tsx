import CookieConsent from "react-cookie-consent";
import { Link } from "react-router-dom";

export function CookieConsentBanner() {
  return (
    <CookieConsent
      location="bottom"
      buttonText="Accept"
      cookieName="wekruit_cookie_consent"
      disableStyles
      containerClasses="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--wk-border-default)] bg-[var(--wk-surface-white)] px-6 py-4 shadow-[var(--wk-shadow-lg)]"
      contentClasses="flex-1 text-sm text-[var(--wk-text-secondary)]"
      buttonClasses="ml-4 shrink-0 rounded-[var(--wk-radius-full)] bg-[var(--wk-accent-amber)] px-5 py-2 text-sm font-medium text-white hover:brightness-110 transition-all"
      buttonWrapperClasses="flex items-center"
      expires={365}
    >
      <div className="mx-auto flex max-w-[var(--wk-max-width)] items-center gap-4">
        <p>
          We use only essential cookies for authentication and session
          management. No tracking or advertising cookies. See our{" "}
          <Link
            to="/legal/privacy#cookies"
            className="underline underline-offset-2 text-[var(--wk-text-primary)]"
          >
            Privacy Policy
          </Link>{" "}
          for details.
        </p>
      </div>
    </CookieConsent>
  );
}
