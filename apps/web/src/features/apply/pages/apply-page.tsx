import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Sheet, SheetContent } from "@valet/ui/components/sheet";
import { Button } from "@valet/ui/components/button";
import { PanelLeft, PanelRight } from "lucide-react";
import { WorkbenchRail } from "../components/workbench-rail";
import { WorkbenchCenter } from "../components/workbench-center";
import { WorkbenchSidecar } from "../components/workbench-sidecar";
import { useWorkbenchStore } from "../stores/workbench.store";
import { useState } from "react";

export function ApplyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedTaskId, setSelectedTaskId } = useWorkbenchStore();

  // Sync URL param ?task= to store
  const taskParam = searchParams.get("task");
  useEffect(() => {
    if (taskParam && taskParam !== selectedTaskId) {
      setSelectedTaskId(taskParam);
    }
  }, [taskParam, selectedTaskId, setSelectedTaskId]);

  // Sync store to URL param
  useEffect(() => {
    const current = searchParams.get("task");
    if (selectedTaskId && selectedTaskId !== current) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("task", selectedTaskId);
          return next;
        },
        { replace: true },
      );
    } else if (!selectedTaskId && current) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("task");
          return next;
        },
        { replace: true },
      );
    }
  }, [selectedTaskId, searchParams, setSearchParams]);

  // Mobile sheet state
  const [railOpen, setRailOpen] = useState(false);
  const [sidecarOpen, setSidecarOpen] = useState(false);

  return (
    <div className="-m-4 md:-m-6 flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Desktop left rail */}
      <div className="hidden lg:flex w-[280px] shrink-0">
        <WorkbenchRail />
      </div>

      {/* Mobile left rail sheet */}
      <Sheet open={railOpen} onOpenChange={setRailOpen}>
        <SheetContent side="left" className="w-72 p-0 lg:hidden" aria-describedby={undefined}>
          <div className="h-full" onClick={() => setRailOpen(false)}>
            <WorkbenchRail />
          </div>
        </SheetContent>
      </Sheet>

      {/* Center pane */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile toolbar */}
        <div className="flex items-center justify-between border-b border-[var(--wk-border-subtle)] px-3 py-2 lg:hidden">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setRailOpen(true)}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-[var(--wk-text-secondary)]">
            {selectedTaskId ? "Task Detail" : "New Application"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setSidecarOpen(true)}
          >
            <PanelRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <WorkbenchCenter />
        </div>
      </div>

      {/* Desktop right sidecar */}
      <div className="hidden xl:flex w-[360px] shrink-0">
        <WorkbenchSidecar />
      </div>

      {/* Mobile right sidecar sheet */}
      <Sheet open={sidecarOpen} onOpenChange={setSidecarOpen}>
        <SheetContent side="right" className="w-80 p-0 xl:hidden" aria-describedby={undefined}>
          <WorkbenchSidecar />
        </SheetContent>
      </Sheet>
    </div>
  );
}
