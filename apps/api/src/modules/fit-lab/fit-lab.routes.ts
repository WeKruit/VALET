import { initServer } from "@ts-rest/fastify";
import { fitLabContract } from "@valet/contracts";
import type { ResumeVariantResponse } from "@valet/shared/schemas";
import { requireAbility } from "../../common/middleware/authorize.js";

const s = initServer();

function toVariantResponse(row: Record<string, unknown>): ResumeVariantResponse {
  return {
    id: row.id as string,
    userId: row.userId as string,
    baseResumeId: row.baseResumeId as string,
    taskId: (row.taskId as string) ?? null,
    jobUrl: row.jobUrl as string,
    variantData: (row.variantData as Record<string, unknown>) ?? {},
    diffData: (row.diffData as Record<string, unknown>) ?? {},
    matchScoreBefore: (row.matchScoreBefore as number) ?? null,
    matchScoreAfter: (row.matchScoreAfter as number) ?? null,
    keywordGaps: (row.keywordGaps as ResumeVariantResponse["keywordGaps"]) ?? null,
    rephraseMode: row.rephraseMode as string,
    createdAt: row.createdAt as Date,
  };
}

export const fitLabRouter = s.router(fitLabContract, {
  analyzeJob: async ({ body, request }) => {
    await requireAbility("read", "Resume")(request);
    const { fitLabService } = request.diScope.cradle;
    const result = await fitLabService.analyzeJob(body);
    return { status: 200 as const, body: result };
  },

  compareResume: async ({ body, request }) => {
    await requireAbility("read", "Resume")(request);
    const { fitLabService } = request.diScope.cradle;
    const result = await fitLabService.compareResume(request.userId, body);
    return { status: 200 as const, body: result };
  },

  createVariant: async ({ body, request }) => {
    await requireAbility("create", "Resume")(request);
    const { fitLabService } = request.diScope.cradle;
    const variant = await fitLabService.createVariant(request.userId, body);
    return {
      status: 201 as const,
      body: toVariantResponse(variant as unknown as Record<string, unknown>),
    };
  },

  getVariant: async ({ params, request }) => {
    await requireAbility("read", "Resume")(request);
    const { fitLabService } = request.diScope.cradle;
    const variant = await fitLabService.getVariant(params.id, request.userId);
    return {
      status: 200 as const,
      body: toVariantResponse(variant as unknown as Record<string, unknown>),
    };
  },

  listVariants: async ({ query, request }) => {
    await requireAbility("read", "Resume")(request);
    const { fitLabService } = request.diScope.cradle;
    const variants = await fitLabService.listVariants(request.userId, query.resumeId);
    return {
      status: 200 as const,
      body: {
        data: variants.map((v) => toVariantResponse(v as unknown as Record<string, unknown>)),
      },
    };
  },
});
