import { create } from "zustand";

type ConnectionStatus = "connected" | "connecting" | "disconnected";

interface RealtimeStore {
  status: ConnectionStatus;
  setStatus: (status: ConnectionStatus) => void;
  lastMessage: unknown | null;
  setLastMessage: (msg: unknown) => void;
}

export const useRealtimeStore = create<RealtimeStore>((set) => ({
  status: "disconnected",
  setStatus: (status) => set({ status }),
  lastMessage: null,
  setLastMessage: (msg) => set({ lastMessage: msg }),
}));
