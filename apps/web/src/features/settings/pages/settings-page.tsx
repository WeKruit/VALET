import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@valet/ui/components/tabs";
import { ResumeSettings } from "../components/resume-settings";
import { ProfileSettings } from "../components/profile-settings";
import { QaBankSettings } from "../components/qa-bank-settings";
import { PreferencesSettings } from "../components/preferences-settings";
import { BillingSettings } from "../../billing/components/billing-settings";
import { JobPreferencesSettings } from "../components/job-preferences-settings";
import { NotificationSettings } from "../components/notification-settings";
import { SessionSettings } from "../components/session-settings";

const VALID_TABS = [
  "resumes",
  "profile",
  "answers",
  "automation",
  "job-preferences",
  "notifications",
  "sessions",
  "billing",
] as const;
type SettingsTab = (typeof VALID_TABS)[number];

function isValidTab(value: string | null): value is SettingsTab {
  return VALID_TABS.includes(value as SettingsTab);
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: SettingsTab = isValidTab(tabParam) ? tabParam : "resumes";

  function handleTabChange(value: string) {
    setSearchParams(value === "resumes" ? {} : { tab: value }, { replace: true });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold text-[var(--wk-text-primary)]">
          Settings
        </h1>
        <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
          Manage your resumes, profile, answers, and preferences
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="resumes" className="whitespace-nowrap">
            Resumes
          </TabsTrigger>
          <TabsTrigger value="profile" className="whitespace-nowrap">
            Profile
          </TabsTrigger>
          <TabsTrigger value="answers" className="whitespace-nowrap">
            Q&A Bank
          </TabsTrigger>
          <TabsTrigger value="automation" className="whitespace-nowrap">
            Automation
          </TabsTrigger>
          <TabsTrigger value="job-preferences" className="whitespace-nowrap">
            Job Preferences
          </TabsTrigger>
          <TabsTrigger value="notifications" className="whitespace-nowrap">
            Notifications
          </TabsTrigger>
          <TabsTrigger value="sessions" className="whitespace-nowrap">
            Sessions
          </TabsTrigger>
          <TabsTrigger value="billing" className="whitespace-nowrap">
            Billing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resumes" aria-label="Resumes settings panel">
          <ResumeSettings />
        </TabsContent>

        <TabsContent value="profile" aria-label="Profile settings panel">
          <ProfileSettings />
        </TabsContent>

        <TabsContent value="answers" aria-label="Q&A Bank settings panel">
          <QaBankSettings />
        </TabsContent>

        <TabsContent value="automation" aria-label="Automation settings panel">
          <PreferencesSettings />
        </TabsContent>

        <TabsContent value="job-preferences" aria-label="Job preferences settings panel">
          <JobPreferencesSettings />
        </TabsContent>

        <TabsContent value="notifications" aria-label="Notification settings panel">
          <NotificationSettings />
        </TabsContent>

        <TabsContent value="sessions" aria-label="Sessions settings panel">
          <SessionSettings />
        </TabsContent>

        <TabsContent value="billing" aria-label="Billing settings panel">
          <BillingSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
