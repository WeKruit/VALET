import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/layout/app-layout";
import { AuthGuard } from "./components/common/auth-guard";
import { AdminGuard } from "./lib/guards/admin-guard";
import { NotFoundPage } from "./components/common/not-found-page";
import { LoadingSpinner } from "./components/common/loading-spinner";

// Eagerly loaded (small, needed immediately)
import { LoginPage } from "./features/auth/components/login-page";
import { RegisterPage } from "./features/auth/components/register-page";
import { ForgotPasswordPage } from "./features/auth/components/forgot-password-page";
import { ResetPasswordPage } from "./features/auth/components/reset-password-page";
import { VerifyEmailPage } from "./features/auth/components/verify-email-page";

// Lazy-loaded route pages
const LandingPage = lazy(() =>
  import("./features/landing/pages/landing-page").then((m) => ({
    default: m.LandingPage,
  })),
);
const AboutPage = lazy(() =>
  import("./features/landing/pages/about-page").then((m) => ({
    default: m.AboutPage,
  })),
);
const ContactPage = lazy(() =>
  import("./features/landing/pages/contact-page").then((m) => ({
    default: m.ContactPage,
  })),
);
const DashboardPage = lazy(() =>
  import("./features/dashboard/pages/dashboard-page").then((m) => ({
    default: m.DashboardPage,
  })),
);
const TasksPage = lazy(() =>
  import("./features/tasks/pages/tasks-page").then((m) => ({
    default: m.TasksPage,
  })),
);
const TaskDetailPage = lazy(() =>
  import("./features/tasks/pages/task-detail-page").then((m) => ({
    default: m.TaskDetailPage,
  })),
);
const ApplyPage = lazy(() =>
  import("./features/apply/pages/apply-page").then((m) => ({
    default: m.ApplyPage,
  })),
);
const OnboardingPage = lazy(() =>
  import("./features/onboarding/pages/onboarding-page").then((m) => ({
    default: m.OnboardingPage,
  })),
);
const SettingsPage = lazy(() =>
  import("./features/settings/pages/settings-page").then((m) => ({
    default: m.SettingsPage,
  })),
);
const PricingPage = lazy(() =>
  import("./features/billing/pages/pricing-page").then((m) => ({
    default: m.PricingPage,
  })),
);
const TermsOfServicePage = lazy(() =>
  import("./features/legal/pages/terms-of-service-page").then((m) => ({
    default: m.TermsOfServicePage,
  })),
);
const PrivacyPolicyPage = lazy(() =>
  import("./features/legal/pages/privacy-policy-page").then((m) => ({
    default: m.PrivacyPolicyPage,
  })),
);
const SandboxesPage = lazy(() =>
  import("./features/admin/pages/sandboxes-page").then((m) => ({
    default: m.SandboxesPage,
  })),
);
const SandboxDetailPage = lazy(() =>
  import("./features/admin/pages/sandbox-detail-page").then((m) => ({
    default: m.SandboxDetailPage,
  })),
);

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <LoadingSpinner />
    </div>
  );
}

export function AppRouter() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/legal/terms" element={<TermsOfServicePage />} />
        <Route path="/legal/privacy" element={<PrivacyPolicyPage />} />

        {/* Auth-protected routes */}
        <Route
          path="/onboarding/*"
          element={
            <AuthGuard>
              <OnboardingPage />
            </AuthGuard>
          }
        />

        <Route
          element={
            <AuthGuard>
              <AppLayout />
            </AuthGuard>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
          <Route path="/apply" element={<ApplyPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/settings/*" element={<SettingsPage />} />
          <Route path="/admin/sandboxes" element={<AdminGuard><SandboxesPage /></AdminGuard>} />
          <Route path="/admin/sandboxes/:id" element={<AdminGuard><SandboxDetailPage /></AdminGuard>} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
