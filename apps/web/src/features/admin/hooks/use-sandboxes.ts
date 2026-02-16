import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Ec2Status, SandboxEnvironment, SandboxStatus, SandboxHealthStatus } from "../types";

export interface UseSandboxesParams {
  page?: number;
  pageSize?: number;
  environment?: SandboxEnvironment;
  status?: SandboxStatus;
  healthStatus?: SandboxHealthStatus;
  ec2Status?: Ec2Status;
  search?: string;
  sortBy?: "createdAt" | "updatedAt" | "name" | "status" | "healthStatus";
  sortOrder?: "asc" | "desc";
}

export function useSandboxes(params?: UseSandboxesParams) {
  return api.sandboxes.list.useQuery({
    queryKey: ["admin", "sandboxes", params],
    queryData: {
      query: {
        page: params?.page ?? 1,
        pageSize: params?.pageSize ?? 20,
        ...(params?.environment && { environment: params.environment }),
        ...(params?.status && { status: params.status }),
        ...(params?.healthStatus && { healthStatus: params.healthStatus }),
        ...(params?.ec2Status && { ec2Status: params.ec2Status }),
        ...(params?.search && { search: params.search }),
        sortBy: (params?.sortBy ?? "createdAt") as any,
        sortOrder: (params?.sortOrder ?? "desc") as any,
      },
    },
    staleTime: 1000 * 15,
    refetchInterval: 1000 * 30,
  });
}

export function useSandbox(id: string) {
  return api.sandboxes.getById.useQuery({
    queryKey: ["admin", "sandboxes", id],
    queryData: {
      params: { id },
    },
    enabled: Boolean(id),
    staleTime: 1000 * 10,
  });
}

export function useSandboxMetrics(id: string) {
  return api.sandboxes.metrics.useQuery({
    queryKey: ["admin", "sandboxes", id, "metrics"],
    queryData: {
      params: { id },
    },
    enabled: Boolean(id),
    staleTime: 1000 * 5,
    refetchInterval: 1000 * 15,
    retry: false,
  });
}

export function useCreateSandbox() {
  const qc = useQueryClient();
  return api.sandboxes.create.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "sandboxes"] });
    },
  });
}

export function useUpdateSandbox() {
  const qc = useQueryClient();
  return api.sandboxes.update.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "sandboxes"] });
    },
  });
}

export function useDeleteSandbox() {
  const qc = useQueryClient();
  return api.sandboxes.delete.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "sandboxes"] });
    },
  });
}

export function useHealthCheckSandbox() {
  const qc = useQueryClient();
  return api.sandboxes.healthCheck.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "sandboxes"] });
    },
  });
}

export function useRestartSandbox() {
  const qc = useQueryClient();
  return api.sandboxes.restart.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "sandboxes"] });
    },
  });
}

export function useEc2Status(id: string) {
  return api.sandboxes.getEc2Status.useQuery({
    queryKey: ["admin", "sandboxes", id, "ec2-status"],
    queryData: {
      params: { id },
    },
    enabled: Boolean(id),
    staleTime: 1000 * 5,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === 200) {
        const status = data.body.ec2Status;
        if (status === "pending" || status === "stopping") {
          return 5000;
        }
      }
      return false;
    },
  });
}

export function useStartSandbox() {
  const qc = useQueryClient();
  return api.sandboxes.startSandbox.useMutation({
    onMutate: async (variables) => {
      const id = variables.params.id;
      await qc.cancelQueries({ queryKey: ["admin", "sandboxes", id] });
      const previous = qc.getQueryData(["admin", "sandboxes", id]);
      qc.setQueryData(["admin", "sandboxes", id], (old: any) =>
        old ? { ...old, body: { ...old.body, ec2Status: "pending" } } : old,
      );
      return { previous };
    },
    onError: (_err, variables, context) => {
      if (context?.previous) {
        qc.setQueryData(["admin", "sandboxes", variables.params.id], context.previous);
      }
    },
    onSettled: (_data, _err, variables) => {
      qc.invalidateQueries({ queryKey: ["admin", "sandboxes"] });
      qc.invalidateQueries({
        queryKey: ["admin", "sandboxes", variables.params.id, "ec2-status"],
      });
    },
  });
}

export function useTriggerTask() {
  const qc = useQueryClient();
  return api.sandboxes.triggerTask.useMutation({
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["admin", "sandboxes"] });
      qc.invalidateQueries({
        queryKey: ["admin", "sandboxes", variables.params.id, "worker-status"],
      });
    },
  });
}

export function useTriggerTest() {
  const qc = useQueryClient();
  return api.sandboxes.triggerTest.useMutation({
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["admin", "sandboxes"] });
      qc.invalidateQueries({
        queryKey: ["admin", "sandboxes", variables.params.id, "worker-status"],
      });
    },
  });
}

export function useWorkerStatus(id: string, enabled = true) {
  return api.sandboxes.workerStatus.useQuery({
    queryKey: ["admin", "sandboxes", id, "worker-status"],
    queryData: {
      params: { id },
    },
    enabled: Boolean(id) && enabled,
    staleTime: 1000 * 5,
    refetchInterval: 1000 * 10,
    retry: false,
  });
}

// ─── Deploy Management ───

export function useDeploys() {
  return api.sandboxes.listDeploys.useQuery({
    queryKey: ["admin", "deploys"],
    queryData: {},
    staleTime: 1000 * 5,
    refetchInterval: 1000 * 10,
  });
}

export function useDeployStatus(id: string, enabled = true) {
  return api.sandboxes.getDeployStatus.useQuery({
    queryKey: ["admin", "deploys", id],
    queryData: {
      params: { id },
    },
    enabled: Boolean(id) && enabled,
    staleTime: 1000 * 2,
    refetchInterval: 1000 * 3,
  });
}

export function useTriggerDeploy() {
  const qc = useQueryClient();
  return api.sandboxes.triggerDeploy.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "deploys"] });
    },
  });
}

export function useCancelDeploy() {
  const qc = useQueryClient();
  return api.sandboxes.cancelDeploy.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "deploys"] });
    },
  });
}

export function useStopSandbox() {
  const qc = useQueryClient();
  return api.sandboxes.stopSandbox.useMutation({
    onMutate: async (variables) => {
      const id = variables.params.id;
      await qc.cancelQueries({ queryKey: ["admin", "sandboxes", id] });
      const previous = qc.getQueryData(["admin", "sandboxes", id]);
      qc.setQueryData(["admin", "sandboxes", id], (old: any) =>
        old ? { ...old, body: { ...old.body, ec2Status: "stopping" } } : old,
      );
      return { previous };
    },
    onError: (_err, variables, context) => {
      if (context?.previous) {
        qc.setQueryData(["admin", "sandboxes", variables.params.id], context.previous);
      }
    },
    onSettled: (_data, _err, variables) => {
      qc.invalidateQueries({ queryKey: ["admin", "sandboxes"] });
      qc.invalidateQueries({
        queryKey: ["admin", "sandboxes", variables.params.id, "ec2-status"],
      });
    },
  });
}
