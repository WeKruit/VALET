import { initServer } from "@ts-rest/fastify";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { resumeCrudContract } from "@valet/contracts";
import type { ResumeResponse } from "@valet/shared/schemas";

const s = initServer();

/** Map Drizzle row (jsonb parsedData is `unknown`) to contract shape. */
function toResumeResponse(row: Record<string, unknown>): ResumeResponse {
  return {
    id: row.id as string,
    userId: row.userId as string,
    filename: row.filename as string,
    mimeType: row.mimeType as string,
    fileSizeBytes: row.fileSizeBytes as number,
    isDefault: row.isDefault as boolean,
    status: row.status as ResumeResponse["status"],
    parsedData: (row.parsedData as ResumeResponse["parsedData"]) ?? null,
    parsingConfidence: row.parsingConfidence as number | null,
    createdAt: row.createdAt as Date,
    parsedAt: row.parsedAt as Date | null,
  };
}

/**
 * ts-rest router for resume CRUD operations (list, getById, delete, setDefault).
 * The upload route is registered separately to avoid ts-rest body-parsing
 * conflicts with @fastify/multipart.
 */
export const resumeRouter = s.router(resumeCrudContract, {
  list: async ({ request }) => {
    const { resumeService } = request.diScope.cradle;
    const resumes = await resumeService.listByUser(request.userId);
    return { status: 200 as const, body: { data: resumes.map((r) => toResumeResponse(r as unknown as Record<string, unknown>)) } };
  },

  getById: async ({ params, request }) => {
    const { resumeService } = request.diScope.cradle;
    const resume = await resumeService.getById(params.id, request.userId);
    return { status: 200 as const, body: toResumeResponse(resume as unknown as Record<string, unknown>) };
  },

  delete: async ({ params, request }) => {
    const { resumeService } = request.diScope.cradle;
    await resumeService.delete(params.id, request.userId);
    return { status: 204 as const, body: undefined };
  },

  setDefault: async ({ params, request }) => {
    const { resumeService } = request.diScope.cradle;
    await resumeService.setDefault(params.id, request.userId);
    const resume = await resumeService.getById(params.id, request.userId);
    return { status: 200 as const, body: toResumeResponse(resume as unknown as Record<string, unknown>) };
  },

  retryParse: async ({ params, request }) => {
    const { resumeService } = request.diScope.cradle;
    const result = await resumeService.retryParse(params.id, request.userId);
    return { status: 202 as const, body: result };
  },
});

/**
 * Standalone Fastify route for multipart resume upload.
 * Registered outside ts-rest so @fastify/multipart can parse the request
 * body without interference from ts-rest's JSON body parser.
 */
export async function resumeUploadRoute(fastify: FastifyInstance) {
  fastify.post(
    "/api/v1/resumes/upload",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { resumeService } = request.diScope.cradle;

      const file = await request.file();
      if (!file) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "No file provided",
        });
      }

      const buffer = await file.toBuffer();

      let resume;
      try {
        resume = await resumeService.upload(request.userId, {
          filename: file.filename,
          data: buffer,
          mimetype: file.mimetype,
        });
      } catch (err) {
        request.log.error({ err, filename: file.filename, mimetype: file.mimetype }, "Resume upload failed");
        throw err;
      }

      return reply.status(202).send({
        id: resume.id,
        status: resume.status,
      });
    },
  );
}
