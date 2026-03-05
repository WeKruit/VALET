import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
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
const EarlyAccessPage = lazy(() =>
  import("./features/early-access/pages/early-access-page").then((m) => ({
    default: m.EarlyAccessPage,
  })),
);
const BrowserSessionPage = lazy(() =>
  import("./features/tasks/pages/browser-session-page").then((m) => ({
    default: m.BrowserSessionPage,
  })),
);
const InsightsPage = lazy(() =>
  import("./features/insights/pages/insights-page").then((m) => ({
    default: m.InsightsPage,
  })),
);
const JobsPage = lazy(() =>
  import("./features/job-inbox/pages/jobs-page").then((m) => ({
    default: m.JobsPage,
  })),
);
const SettingsPage = lazy(() =>
  import("./features/settings/pages/settings-page").then((m) => ({
    default: m.SettingsPage,
  })),
);
const DownloadPage = lazy(() =>
  import("./features/download/pages/download-page").then((m) => ({
    default: m.DownloadPage,
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
const SessionsPage = lazy(() =>
  import("./features/admin/pages/sessions-page").then((m) => ({
    default: m.SessionsPage,
  })),
);
const AdminTasksPage = lazy(() =>
  import("./features/admin/pages/admin-tasks-page").then((m) => ({
    default: m.AdminTasksPage,
  })),
);
const AdminTaskDetailPage = lazy(() =>
  import("./features/admin/pages/admin-task-detail-page").then((m) => ({
    default: m.AdminTaskDetailPage,
  })),
);
const DeploysPage = lazy(() =>
  import("./features/admin/pages/deploys-page").then((m) => ({
    default: m.DeploysPage,
  })),
);
const MonitoringPage = lazy(() =>
  import("./features/admin/pages/monitoring-page").then((m) => ({
    default: m.MonitoringPage,
  })),
);
const WorkersPage = lazy(() =>
  import("./features/admin/pages/workers-page").then((m) => ({
    default: m.WorkersPage,
  })),
);
const SecretsStatusPage = lazy(() =>
  import("./features/admin/pages/secrets-status-page").then((m) => ({
    default: m.SecretsStatusPage,
  })),
);
const OperationAdminLayout = lazy(() =>
  import("./features/operation-admin/layout/operation-admin-layout").then((m) => ({
    default: m.OperationAdminLayout,
  })),
);
const EarlyAccessAdminPage = lazy(() =>
  import("./features/operation-admin/pages/early-access-admin-page").then((m) => ({
    default: m.EarlyAccessAdminPage,
  })),
);
const EmailTemplatesAdminPage = lazy(() =>
  import("./features/operation-admin/pages/email-templates-admin-page").then((m) => ({
    default: m.EmailTemplatesAdminPage,
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
        <Route path="/download" element={<DownloadPage />} />
        <Route path="/legal/terms" element={<TermsOfServicePage />} />
        <Route path="/legal/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/browser-session/:token" element={<BrowserSessionPage />} />

        {/* Auth-protected routes */}
        <Route
          path="/early-access"
          element={
            <AuthGuard>
              <EarlyAccessPage />
            </AuthGuard>
          }
        />

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
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/settings/*" element={<SettingsPage />} />
          <Route
            path="/admin/sandboxes"
            element={
              <AdminGuard>
                <SandboxesPage />
              </AdminGuard>
            }
          />
          <Route
            path="/admin/sandboxes/:id"
            element={
              <AdminGuard>
                <SandboxDetailPage />
              </AdminGuard>
            }
          />
          <Route
            path="/admin/tasks"
            element={
              <AdminGuard>
                <AdminTasksPage />
              </AdminGuard>
            }
          />
          <Route
            path="/admin/tasks/:id"
            element={
              <AdminGuard>
                <AdminTaskDetailPage />
              </AdminGuard>
            }
          />
          <Route
            path="/admin/deploys"
            element={
              <AdminGuard>
                <DeploysPage />
              </AdminGuard>
            }
          />
          <Route
            path="/admin/monitoring"
            element={
              <AdminGuard>
                <MonitoringPage />
              </AdminGuard>
            }
          />
          <Route
            path="/admin/sessions"
            element={
              <AdminGuard>
                <SessionsPage />
              </AdminGuard>
            }
          />
          <Route
            path="/admin/workers"
            element={
              <AdminGuard>
                <WorkersPage />
              </AdminGuard>
            }
          />
          <Route
            path="/admin/secrets"
            element={
              <AdminGuard>
                <SecretsStatusPage />
              </AdminGuard>
            }
          />

          {/* Operation Admin routes */}
          <Route
            path="/operation-admin"
            element={
              <AdminGuard>
                <OperationAdminLayout />
              </AdminGuard>
            }
          >
            <Route index element={<Navigate to="early-access" replace />} />
            <Route path="early-access" element={<EarlyAccessAdminPage />} />
            <Route path="email-templates" element={<EmailTemplatesAdminPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
