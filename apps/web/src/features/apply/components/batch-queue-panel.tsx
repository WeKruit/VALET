import { useState, useRef } from "react";
import { Card, CardContent } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { Input } from "@valet/ui/components/input";
import { Textarea } from "@valet/ui/components/textarea";
import { Badge } from "@valet/ui/components/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@valet/ui/components/tabs";
import {
  Link2,
  Upload,
  ClipboardPaste,
  Plus,
  X,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCreditBalance } from "../hooks/use-credit-balance";
import { useCreditCost } from "@/features/credits/hooks/use-credit-cost";
import { useBatchQueueStore, type QueueItem } from "../stores/batch-queue.store";
import { BatchConfirmDialog } from "./batch-confirm-dialog";

const BATCH_MAX = 25;

function isValidHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function parseUrlsFromText(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && isValidHttpsUrl(s));
}

function parseCsvUrls(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => {
      // Take first column (split by comma), strip quotes
      const col =
        line
          .split(",")[0]
          ?.trim()
          .replace(/^["']|["']$/g, "") ?? "";
      return col;
    })
    .filter((s) => s.length > 0 && isValidHttpsUrl(s));
}

interface BatchQueuePanelProps {
  resumeId: string;
  quality: "speed" | "balanced" | "quality";
  notes?: string;
  targetWorkerId?: string;
  reasoningModel?: string;
  visionModel?: string;
  resumeReady?: boolean;
}

export function BatchQueuePanel({
  resumeId,
  quality,
  notes,
  targetWorkerId,
  reasoningModel,
  visionModel,
  resumeReady = true,
}: BatchQueuePanelProps) {
  const { items, addUrl, addUrls, removeItem, clearAll } = useBatchQueueStore();
  const { enforcementEnabled } = useCreditBalance();

  // Input states
  const [pasteText, setPasteText] = useState("");
  const [singleUrl, setSingleUrl] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pendingItems = items.filter((i) => i.status === "pending");
  const pendingCount = pendingItems.length;
  const { canAfford, totalCost, balance } = useCreditCost("batch_application", pendingCount);
  const insufficientCredits = enforcementEnabled && !canAfford;

  function handlePasteAdd() {
    const urls = parseUrlsFromText(pasteText);
    if (urls.length === 0) {
      toast.error("No valid HTTPS URLs found.");
      return;
    }
    addUrls(urls, BATCH_MAX);
    setPasteText("");
  }

  function handleSingleAdd() {
    if (!isValidHttpsUrl(singleUrl)) {
      toast.error("Enter a valid HTTPS URL.");
      return;
    }
    if (items.length >= BATCH_MAX) {
      toast.error(`Queue limit is ${BATCH_MAX} URLs.`);
      return;
    }
    addUrl(singleUrl);
    setSingleUrl("");
  }

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const urls = parseCsvUrls(text);
      if (urls.length === 0) {
        toast.error("No valid URLs found in CSV.");
        return;
      }
      addUrls(urls, BATCH_MAX);
      toast.success(`${urls.length} URL${urls.length > 1 ? "s" : ""} added from CSV.`);
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-uploaded
    e.target.value = "";
  }

  function handleRunAll() {
    if (pendingCount === 0) return;
    setConfirmOpen(true);
  }

  const statusIcon: Record<QueueItem["status"], React.ReactNode> = {
    pending: <div className="h-2 w-2 rounded-full bg-[var(--wk-text-tertiary)]" />,
    submitting: <Loader2 className="h-3 w-3 animate-spin text-[var(--wk-copilot)]" />,
    submitted: <CheckCircle2 className="h-3 w-3 text-[var(--wk-status-success)]" />,
    failed: <AlertTriangle className="h-3 w-3 text-[var(--wk-status-error)]" />,
  };

  return (
    <>
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="h-4 w-4 text-[var(--wk-text-secondary)]" />
            <h3 className="text-sm font-semibold text-[var(--wk-text-primary)]">Batch Queue</h3>
            {items.length > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {items.length}/{BATCH_MAX}
              </Badge>
            )}
          </div>

          {/* Input tabs */}
          <Tabs defaultValue="paste" className="mb-4">
            <TabsList className="w-full">
              <TabsTrigger value="paste" className="flex-1 gap-1">
                <ClipboardPaste className="h-3 w-3" />
                Paste
              </TabsTrigger>
              <TabsTrigger value="csv" className="flex-1 gap-1">
                <Upload className="h-3 w-3" />
                CSV
              </TabsTrigger>
              <TabsTrigger value="single" className="flex-1 gap-1">
                <Plus className="h-3 w-3" />
                Add URL
              </TabsTrigger>
            </TabsList>

            <TabsContent value="paste">
              <div className="space-y-2">
                <Textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Paste URLs (one per line or comma-separated)..."
                  rows={4}
                  className="resize-none text-sm"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handlePasteAdd}
                  disabled={!pasteText.trim()}
                >
                  Add URLs
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="csv">
              <div className="space-y-2">
                <p className="text-xs text-[var(--wk-text-secondary)]">
                  Upload a .csv file. URLs are read from the first column.
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  onChange={handleCsvUpload}
                  className="hidden"
                />
                <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Choose CSV
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="single">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--wk-text-tertiary)]" />
                  <Input
                    type="url"
                    placeholder="https://..."
                    value={singleUrl}
                    onChange={(e) => setSingleUrl(e.target.value)}
                    className="pl-10"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSingleAdd();
                    }}
                  />
                </div>
                <Button
                  variant="secondary"
                  size="default"
                  onClick={handleSingleAdd}
                  disabled={!singleUrl.trim()}
                >
                  Add
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* Queue list */}
          {items.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--wk-text-tertiary)] uppercase tracking-wider">
                  Queued URLs
                </span>
                <button
                  onClick={clearAll}
                  className="text-xs text-[var(--wk-text-tertiary)] hover:text-[var(--wk-status-error)] cursor-pointer transition-colors"
                >
                  Clear all
                </button>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-1">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center gap-2 px-2.5 py-1.5 rounded-[var(--wk-radius-md)] text-sm",
                      item.status === "failed" &&
                        "bg-[color-mix(in_srgb,var(--wk-status-error)_5%,transparent)]",
                      item.status === "submitted" &&
                        "bg-[color-mix(in_srgb,var(--wk-status-success)_5%,transparent)]",
                    )}
                  >
                    <span className="shrink-0">{statusIcon[item.status]}</span>
                    <span className="flex-1 truncate text-[var(--wk-text-secondary)]">
                      {item.url}
                    </span>
                    {item.error && (
                      <span className="shrink-0 text-[10px] text-[var(--wk-status-error)]">
                        {item.error}
                      </span>
                    )}
                    {(item.status === "pending" || item.status === "failed") && (
                      <button
                        onClick={() => removeItem(item.id)}
                        className="shrink-0 p-0.5 rounded cursor-pointer text-[var(--wk-text-tertiary)] hover:text-[var(--wk-status-error)] transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Footer: Run All */}
              <div className="flex items-center justify-between pt-2 border-t border-[var(--wk-border-subtle)]">
                <span className="text-xs text-[var(--wk-text-tertiary)]">
                  Uses {totalCost} credit{totalCost !== 1 ? "s" : ""} -- Balance: {balance}
                </span>
                <Button
                  variant="cta"
                  size="sm"
                  onClick={handleRunAll}
                  disabled={pendingCount === 0 || insufficientCredits || !resumeReady}
                >
                  Run All ({pendingCount})
                </Button>
              </div>

              {insufficientCredits && (
                <p className="text-xs text-[var(--wk-status-error)]">
                  Insufficient credits. You need {totalCost} but have {balance}.
                </p>
              )}
              {!resumeReady && (
                <p className="text-xs text-[var(--wk-status-warning)]">
                  A parsed resume is required before running batch applications.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <BatchConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        jobUrls={pendingItems.map((i) => i.url)}
        resumeId={resumeId}
        quality={quality}
        notes={notes}
        targetWorkerId={targetWorkerId}
        reasoningModel={reasoningModel}
        visionModel={visionModel}
      />
    </>
  );
}
