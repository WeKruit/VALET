import { Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./components/layout/app-layout";
import { AuthGuard } from "./components/common/auth-guard";
import { NotFoundPage } from "./components/common/not-found-page";
import { LoginPage } from "./features/auth/components/login-page";
import { DashboardPage } from "./features/dashboard/pages/dashboard-page";
import { TasksPage } from "./features/tasks/pages/tasks-page";
import { TaskDetailPage } from "./features/tasks/pages/task-detail-page";
import { ApplyPage } from "./features/apply/pages/apply-page";
import { OnboardingPage } from "./features/onboarding/pages/onboarding-page";
import { SettingsPage } from "./features/settings/pages/settings-page";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
        <Route path="/settings/*" element={<SettingsPage />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
