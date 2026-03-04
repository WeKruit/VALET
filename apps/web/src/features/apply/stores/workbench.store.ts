import { create } from "zustand";

type SidecarPanel = "preview" | "blocker" | "proof" | "help";

interface WorkbenchStore {
  /** Currently selected task ID (null = launch form mode) */
  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;

  /** Active sidecar panel */
  sidecarPanel: SidecarPanel;
  setSidecarPanel: (panel: SidecarPanel) => void;

  /** Left rail filter */
  railFilter: "active" | "waiting" | "recent";
  setRailFilter: (filter: "active" | "waiting" | "recent") => void;
}

export const useWorkbenchStore = create<WorkbenchStore>()((set) => ({
  selectedTaskId: null,
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),

  sidecarPanel: "preview",
  setSidecarPanel: (panel) => set({ sidecarPanel: panel }),

  railFilter: "active",
  setRailFilter: (filter) => set({ railFilter: filter }),
}));
