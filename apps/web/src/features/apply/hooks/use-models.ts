import { api } from "@/lib/api-client";

export function useModels() {
  const query = api.models.getModels.useQuery({
    queryKey: ["models"],
    queryData: {},
    staleTime: 1000 * 60 * 5, // 5 minutes — models rarely change
  });

  const models = query.data?.status === 200 ? query.data.body : null;

  return {
    models: models?.models ?? [],
    defaultReasoningModel: models?.default_reasoning_model ?? null,
    defaultVisionModel: models?.default_vision_model ?? null,
    isLoading: query.isLoading,
  };
}
