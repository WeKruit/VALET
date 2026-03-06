import { create } from "zustand";
import { toast } from "sonner";
import { normalizeJobUrl, isSupportedJobUrl } from "@valet/shared/schemas";

export interface QueueItem {
  id: string;
  url: string;
  status: "pending" | "submitting" | "submitted" | "failed";
  error?: string;
  taskId?: string;
}

function normalizeUrl(raw: string): string {
  return normalizeJobUrl(raw.trim()) || raw.trim();
}

interface BatchQueueStore {
  items: QueueItem[];
  addUrl: (url: string) => void;
  addUrls: (urls: string[], maxItems?: number) => void;
  removeItem: (id: string) => void;
  clearAll: () => void;
  clearSuccessful: () => void;
  setItemStatus: (
    id: string,
    status: QueueItem["status"],
    extra?: { error?: string; taskId?: string },
  ) => void;
  applyBatchResults: (
    results: Array<{ jobUrl: string; status: string; taskId?: string; error?: string }>,
  ) => void;
}

let nextId = 0;

export const useBatchQueueStore = create<BatchQueueStore>()((set, get) => ({
  items: [],

  addUrl: (raw: string) => {
    const url = normalizeUrl(raw);
    if (!url) return;
    if (!isSupportedJobUrl(url)) {
      toast.error("Unsupported job site");
      return;
    }
    const existing = get().items.find((i) => normalizeUrl(i.url) === url);
    if (existing) {
      toast.error("This URL is already in the queue.");
      return;
    }
    set((s) => ({
      items: [...s.items, { id: String(++nextId), url, status: "pending" }],
    }));
  },

  addUrls: (rawUrls: string[], maxItems = 25) => {
    const currentUrls = new Set(get().items.map((i) => normalizeUrl(i.url)));
    const newItems: QueueItem[] = [];
    let dupes = 0;
    let unsupported = 0;
    for (const raw of rawUrls) {
      const url = normalizeUrl(raw);
      if (!url) continue;
      if (!isSupportedJobUrl(url)) {
        unsupported++;
        continue;
      }
      if (currentUrls.has(url)) {
        dupes++;
        continue;
      }
      currentUrls.add(url);
      newItems.push({ id: String(++nextId), url, status: "pending" });
    }
    if (unsupported > 0) {
      toast.info(`${unsupported} unsupported URL${unsupported > 1 ? "s" : ""} skipped.`);
    }
    if (dupes > 0) {
      toast.info(`${dupes} duplicate URL${dupes > 1 ? "s" : ""} skipped.`);
    }
    const currentCount = get().items.length;
    if (currentCount + newItems.length > maxItems) {
      toast.error(
        `Queue limit is ${maxItems} URLs. ${newItems.length} unique URLs would exceed it.`,
      );
      return;
    }
    if (newItems.length > 0) {
      set((s) => ({ items: [...s.items, ...newItems] }));
    }
  },

  removeItem: (id: string) => {
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
  },

  clearAll: () => set({ items: [] }),

  clearSuccessful: () => {
    set((s) => ({ items: s.items.filter((i) => i.status !== "submitted") }));
  },

  setItemStatus: (id, status, extra) => {
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, status, ...extra } : i)),
    }));
  },

  applyBatchResults: (results) => {
    set((s) => ({
      items: s.items.map((item) => {
        const result = results.find((r) => normalizeUrl(r.jobUrl) === normalizeUrl(item.url));
        if (!result) return { ...item, status: "failed" as const, error: "Not in response" };
        if (result.status === "created") {
          return { ...item, status: "submitted" as const, taskId: result.taskId };
        }
        return {
          ...item,
          status: "failed" as const,
          error: result.error ?? result.status,
        };
      }),
    }));
  },
}));
