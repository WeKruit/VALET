import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@valet/ui/components/dialog";
import { Input } from "@valet/ui/components/input";
import { Button } from "@valet/ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@valet/ui/components/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@valet/ui/components/select";
import { Link2, PenLine } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";

interface ImportJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportJobDialog({ open, onOpenChange }: ImportJobDialogProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<string>("url");

  // URL import state
  const [url, setUrl] = useState("");

  // Manual add state
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [platform, setPlatform] = useState("unknown");
  const [location, setLocation] = useState("");

  const importUrl = api.jobLeads.importUrl.useMutation({
    onSuccess: (res) => {
      if (res.status === 201) {
        toast.success(`Imported: ${res.body.title} at ${res.body.company}`);
        queryClient.invalidateQueries({ queryKey: ["job-leads"] });
        resetAndClose();
      }
    },
    onError: () => {
      toast.error("Failed to import URL. Please try again.");
    },
  });

  const createLead = api.jobLeads.create.useMutation({
    onSuccess: (res) => {
      if (res.status === 201) {
        toast.success("Job added.");
        queryClient.invalidateQueries({ queryKey: ["job-leads"] });
        resetAndClose();
      }
    },
    onError: () => {
      toast.error("Failed to add job. Please try again.");
    },
  });

  function resetAndClose() {
    setUrl("");
    setTitle("");
    setCompany("");
    setJobUrl("");
    setPlatform("unknown");
    setLocation("");
    onOpenChange(false);
  }

  function handleImportUrl() {
    if (!url.trim()) {
      toast.error("Please enter a URL.");
      return;
    }
    try {
      new URL(url.trim());
    } catch {
      toast.error("Please enter a valid URL.");
      return;
    }
    importUrl.mutate({ body: { url: url.trim() } });
  }

  function handleManualAdd() {
    if (!title.trim() || !company.trim() || !jobUrl.trim()) {
      toast.error("Title, company, and job URL are required.");
      return;
    }
    try {
      new URL(jobUrl.trim());
    } catch {
      toast.error("Please enter a valid job URL.");
      return;
    }
    createLead.mutate({
      body: {
        title: title.trim(),
        company: company.trim(),
        jobUrl: jobUrl.trim(),
        platform: platform as any,
        location: location.trim() || undefined,
        source: "manual",
      },
    });
  }

  const isSubmitting = importUrl.isPending || createLead.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Job</DialogTitle>
          <DialogDescription>Import from a URL or add details manually.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="url" className="flex-1 gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              Import URL
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex-1 gap-1.5">
              <PenLine className="h-3.5 w-3.5" />
              Add Manually
            </TabsTrigger>
          </TabsList>

          <TabsContent value="url" className="mt-4 space-y-4">
            <div>
              <label className="text-sm font-medium">Job URL</label>
              <Input
                className="mt-1"
                placeholder="https://www.linkedin.com/jobs/view/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleImportUrl()}
              />
              <p className="mt-1.5 text-xs text-[var(--wk-text-tertiary)]">
                Supports LinkedIn, Greenhouse, Lever, and Workday URLs.
              </p>
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={resetAndClose}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleImportUrl} disabled={isSubmitting}>
                {importUrl.isPending ? "Importing..." : "Import"}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="manual" className="mt-4 space-y-4">
            <div>
              <label className="text-sm font-medium">Job Title</label>
              <Input
                className="mt-1"
                placeholder="e.g. Software Engineer"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Company</label>
              <Input
                className="mt-1"
                placeholder="e.g. Acme Corp"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Job URL</label>
              <Input
                className="mt-1"
                placeholder="https://..."
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Platform</label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="greenhouse">Greenhouse</SelectItem>
                    <SelectItem value="lever">Lever</SelectItem>
                    <SelectItem value="workday">Workday</SelectItem>
                    <SelectItem value="unknown">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Location</label>
                <Input
                  className="mt-1"
                  placeholder="e.g. San Francisco"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={resetAndClose}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleManualAdd} disabled={isSubmitting}>
                {createLead.isPending ? "Adding..." : "Add Job"}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
