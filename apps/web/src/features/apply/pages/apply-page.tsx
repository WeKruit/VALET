import { ApplyForm } from "../components/apply-form";

export function ApplyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold text-[var(--wk-text-primary)]">
          New Application
        </h1>
        <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
          Paste a job URL to start a new application
        </p>
      </div>

      <ApplyForm />
    </div>
  );
}
