import { initContract } from "@ts-rest/core";
import {
  velocityQuery,
  velocityResponse,
  conversionResponse,
  responseRatesResponse,
  resumePerformanceResponse,
} from "@valet/shared/schemas";

const c = initContract();

export const insightsContract = c.router({
  getVelocity: {
    method: "GET",
    path: "/api/v1/insights/velocity",
    query: velocityQuery,
    responses: {
      200: velocityResponse,
    },
    summary: "Get application velocity over time",
  },

  getConversionByPlatform: {
    method: "GET",
    path: "/api/v1/insights/conversion",
    responses: {
      200: conversionResponse,
    },
    summary: "Get conversion rates grouped by platform",
  },

  getResponseRates: {
    method: "GET",
    path: "/api/v1/insights/response-rates",
    responses: {
      200: responseRatesResponse,
    },
    summary: "Get response rate distribution by external status",
  },

  getResumePerformance: {
    method: "GET",
    path: "/api/v1/insights/resume-performance",
    responses: {
      200: resumePerformanceResponse,
    },
    summary: "Get resume variant match score performance",
  },
});
