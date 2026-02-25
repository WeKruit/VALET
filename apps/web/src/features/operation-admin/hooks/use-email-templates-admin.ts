import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export function useEmailTemplatesList(params?: { isActive?: boolean }) {
  return api.emailTemplatesAdmin.list.useQuery({
    queryKey: ["operation-admin", "email-templates", params],
    queryData: {
      query: {
        ...(params?.isActive !== undefined ? { isActive: params.isActive } : {}),
      },
    },
    staleTime: 1000 * 30,
  });
}

export function useCreateEmailTemplate() {
  const qc = useQueryClient();
  return api.emailTemplatesAdmin.create.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operation-admin", "email-templates"] });
    },
  });
}

export function useUpdateEmailTemplate() {
  const qc = useQueryClient();
  return api.emailTemplatesAdmin.update.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operation-admin", "email-templates"] });
    },
  });
}

export function useDeleteEmailTemplate() {
  const qc = useQueryClient();
  return api.emailTemplatesAdmin.remove.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operation-admin", "email-templates"] });
    },
  });
}

export function usePreviewEmailTemplate() {
  return api.emailTemplatesAdmin.preview.useMutation();
}

export function useSendTestEmail() {
  return api.emailTemplatesAdmin.sendTest.useMutation();
}
