import { Tabs, TabsContent, TabsList, TabsTrigger } from "@valet/ui/components/tabs";
import { ResumeSettings } from "../components/resume-settings";
import { ProfileSettings } from "../components/profile-settings";
import { QaBankSettings } from "../components/qa-bank-settings";
import { PreferencesSettings } from "../components/preferences-settings";

export function SettingsPage() {
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

      <Tabs defaultValue="resumes">
        <TabsList>
          <TabsTrigger value="resumes">Resumes</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="answers">Q&A Bank</TabsTrigger>
          <TabsTrigger value="automation">Automation</TabsTrigger>
        </TabsList>

        <TabsContent value="resumes">
          <ResumeSettings />
        </TabsContent>

        <TabsContent value="profile">
          <ProfileSettings />
        </TabsContent>

        <TabsContent value="answers">
          <QaBankSettings />
        </TabsContent>

        <TabsContent value="automation">
          <PreferencesSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
