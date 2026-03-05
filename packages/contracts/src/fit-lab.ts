import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  analyzeJobRequest,
  compareResumeRequest,
  createVariantRequest,
  jobAnalysisResponse,
  compareResumeResponse,
  resumeVariantResponse,
  resumeVariantListResponse,
  errorResponse,
} from "@valet/shared/schemas";

const c = initContract();

export const fitLabContract = c.router({
  analyzeJob: {
    method: "POST",
    path: "/api/v1/fit-lab/analyze-job",
    body: analyzeJobRequest,
    responses: {
      200: jobAnalysisResponse,
      400: errorResponse,
    },
    summary: "Parse a job description and extract structured requirements",
  },

  compareResume: {
    method: "POST",
    path: "/api/v1/fit-lab/compare",
    body: compareResumeRequest,
    responses: {
      200: compareResumeResponse,
      400: errorResponse,
      404: errorResponse,
    },
    summary: "Compare a resume against a job description and score the match",
  },

  createVariant: {
    method: "POST",
    path: "/api/v1/fit-lab/variants",
    body: createVariantRequest,
    responses: {
      201: resumeVariantResponse,
      400: errorResponse,
      404: errorResponse,
    },
    summary: "Generate a tailored resume variant for a specific job",
  },

  getVariant: {
    method: "GET",
    path: "/api/v1/fit-lab/variants/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: resumeVariantResponse,
      404: errorResponse,
    },
    summary: "Retrieve a resume variant with diff data",
  },

  listVariants: {
    method: "GET",
    path: "/api/v1/fit-lab/variants",
    query: z.object({
      resumeId: z.string().uuid().optional(),
    }),
    responses: {
      200: resumeVariantListResponse,
    },
    summary: "List resume variants for the current user",
  },
});
