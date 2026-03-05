import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

// ─── Platform Credentials ───

export function usePlatformCredentials() {
  return api.credentials.listPlatformCredentials.useQuery({
    queryKey: ["platform-credentials"],
    queryData: {},
    staleTime: 1000 * 30,
  });
}

export function useCreatePlatformCredential() {
  const qc = useQueryClient();
  return api.credentials.createPlatformCredential.useMutation({
    onSuccess: () => {
      toast.success("Platform credential saved.");
      qc.invalidateQueries({ queryKey: ["platform-credentials"] });
      qc.invalidateQueries({ queryKey: ["credential-readiness"] });
    },
    onError: () => {
      toast.error("Failed to save credential.");
    },
  });
}

export function useUpdatePlatformCredential() {
  const qc = useQueryClient();
  return api.credentials.updatePlatformCredential.useMutation({
    onSuccess: () => {
      toast.success("Credential updated.");
      qc.invalidateQueries({ queryKey: ["platform-credentials"] });
    },
    onError: () => {
      toast.error("Failed to update credential.");
    },
  });
}

export function useDeletePlatformCredential() {
  const qc = useQueryClient();
  return api.credentials.deletePlatformCredential.useMutation({
    onSuccess: () => {
      toast.success("Credential removed.");
      qc.invalidateQueries({ queryKey: ["platform-credentials"] });
      qc.invalidateQueries({ queryKey: ["credential-readiness"] });
    },
    onError: () => {
      toast.error("Failed to remove credential.");
    },
  });
}

// ─── Mailbox Credentials ───

export function useMailboxCredentials() {
  return api.credentials.listMailboxCredentials.useQuery({
    queryKey: ["mailbox-credentials"],
    queryData: {},
    staleTime: 1000 * 30,
  });
}

export function useCreateMailboxCredential() {
  const qc = useQueryClient();
  return api.credentials.createMailboxCredential.useMutation({
    onSuccess: () => {
      toast.success("Mailbox credential saved.");
      qc.invalidateQueries({ queryKey: ["mailbox-credentials"] });
      qc.invalidateQueries({ queryKey: ["credential-readiness"] });
    },
    onError: () => {
      toast.error("Failed to save mailbox credential.");
    },
  });
}

export function useUpdateMailboxCredential() {
  const qc = useQueryClient();
  return api.credentials.updateMailboxCredential.useMutation({
    onSuccess: () => {
      toast.success("Mailbox credential updated.");
      qc.invalidateQueries({ queryKey: ["mailbox-credentials"] });
    },
    onError: () => {
      toast.error("Failed to update mailbox credential.");
    },
  });
}

export function useDeleteMailboxCredential() {
  const qc = useQueryClient();
  return api.credentials.deleteMailboxCredential.useMutation({
    onSuccess: () => {
      toast.success("Mailbox credential removed.");
      qc.invalidateQueries({ queryKey: ["mailbox-credentials"] });
      qc.invalidateQueries({ queryKey: ["credential-readiness"] });
    },
    onError: () => {
      toast.error("Failed to remove mailbox credential.");
    },
  });
}

// ─── Readiness ───

export function useCredentialReadiness() {
  return api.credentials.checkReadiness.useQuery({
    queryKey: ["credential-readiness"],
    queryData: {},
    staleTime: 1000 * 60,
  });
}
