import { api } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useAnalyzeJob() {
  return api.fitLab.analyzeJob.useMutation({
    onError: () => {
      toast.error("Failed to analyze job description.");
    },
  });
}

export function useCompareResume() {
  return api.fitLab.compareResume.useMutation({
    onError: () => {
      toast.error("Failed to compare resume.");
    },
  });
}

export function useCreateVariant() {
  const qc = useQueryClient();
  return api.fitLab.createVariant.useMutation({
    onSuccess: () => {
      toast.success("Resume variant created.");
      qc.invalidateQueries({ queryKey: ["fit-lab", "variants"] });
    },
    onError: () => {
      toast.error("Failed to create resume variant.");
    },
  });
}

export function useVariant(id: string, enabled = true) {
  return api.fitLab.getVariant.useQuery({
    queryKey: ["fit-lab", "variants", id],
    queryData: {
      params: { id },
    },
    enabled: Boolean(id) && enabled,
    staleTime: 1000 * 60 * 5,
  });
}

export function useVariants(resumeId?: string) {
  return api.fitLab.listVariants.useQuery({
    queryKey: ["fit-lab", "variants", { resumeId }],
    queryData: {
      query: {
        ...(resumeId ? { resumeId } : {}),
      },
    },
    staleTime: 1000 * 60 * 2,
  });
}
