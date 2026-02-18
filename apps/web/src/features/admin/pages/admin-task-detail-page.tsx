import { useParams } from "react-router-dom";

export function AdminTaskDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-display font-semibold text-[var(--wk-text-primary)]">
          Task Detail
        </h1>
        <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">Task ID: {id}</p>
      </div>
      <div className="flex items-center justify-center min-h-[40vh] text-[var(--wk-text-tertiary)] text-sm">
        Admin task detail page — coming soon
      </div>
    </div>
  );
}
