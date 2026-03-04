import { TaskDetail } from "@/features/tasks/components/task-detail";
import { ApplyForm } from "./apply-form";
import { useWorkbenchStore } from "../stores/workbench.store";

export function WorkbenchCenter() {
  const { selectedTaskId } = useWorkbenchStore();

  if (selectedTaskId) {
    return (
      <div className="space-y-6">
        <TaskDetail taskId={selectedTaskId} />
      </div>
    );
  }

  return <ApplyForm />;
}
