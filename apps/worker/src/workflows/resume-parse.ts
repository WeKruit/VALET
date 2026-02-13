import type { Hatchet } from "@hatchet-dev/typescript-sdk";
import type { Context } from "@hatchet-dev/typescript-sdk/v1/client/worker/context";
import type { JsonValue } from "@hatchet-dev/typescript-sdk/v1/types";
import type Redis from "ioredis";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import pino from "pino";
import { LLMRouter } from "@valet/llm";
import { resumes, qaBank, type Database } from "@valet/db";
import type { EventLogger } from "../services/event-logger.js";

const logger = pino({ name: "resume-parse-workflow" });

interface ResumeParseInput {
  [key: string]: JsonValue;
  resumeId: string;
  storageKey: string;
  userId: string;
}

function publishProgress(
  redis: Redis,
  userId: string,
  message: Record<string, unknown>,
) {
  return redis.publish(`tasks:${userId}`, JSON.stringify(message));
}

function createS3Client() {
  return new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "",
    },
    forcePathStyle: true,
  });
}

function createLLMRouter() {
  return new LLMRouter({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  });
}

const RESUME_PARSE_PROMPT = `You are a resume parser. Extract structured data from the following resume text.

Return a JSON object with exactly these fields (use null for missing fields, [] for empty arrays):
{
  "fullName": "string",
  "email": "string or null",
  "phone": "string or null",
  "location": "city, state or full address string, or null",
  "summary": "brief professional summary string or null",
  "workHistory": [
    {
      "company": "string",
      "title": "string",
      "location": "city, state or null",
      "startDate": "YYYY-MM or null",
      "endDate": "YYYY-MM or null (null if current)",
      "description": "one-line role summary",
      "bullets": ["individual responsibility/achievement as a single sentence each"],
      "achievements": ["notable quantified achievements"]
    }
  ],
  "education": [
    {
      "school": "string",
      "degree": "e.g. B.S., M.S., Ph.D.",
      "fieldOfStudy": "e.g. Computer Science, or null",
      "startDate": "YYYY-MM or null",
      "endDate": "YYYY-MM or null",
      "expectedGraduation": "YYYY-MM if not yet graduated, else null",
      "gpa": "string or null",
      "honors": "e.g. cum laude, Dean's List, or null"
    }
  ],
  "projects": [
    {
      "name": "string",
      "description": "brief description",
      "technologies": ["tech used"],
      "url": "project URL or null",
      "startDate": "YYYY-MM or null",
      "endDate": "YYYY-MM or null"
    }
  ],
  "skills": ["string - individual skill, not categories"],
  "certifications": ["string"],
  "languages": ["string - spoken/written languages"],
  "interests": ["string - hobbies, interests, extracurriculars"],
  "awards": [
    {
      "title": "string",
      "issuer": "organization or null",
      "date": "YYYY-MM or YYYY or null"
    }
  ],
  "volunteerWork": [
    {
      "organization": "string",
      "role": "string or null",
      "description": "string or null",
      "startDate": "YYYY-MM or null",
      "endDate": "YYYY-MM or null"
    }
  ],
  "websites": ["LinkedIn URL, GitHub URL, portfolio URL, etc."],
  "totalYearsExperience": number or null,
  "workAuthorization": "e.g. US Citizen, H1B, OPT, Permanent Resident, or null if not mentioned",
  "inferredAnswers": [
    {
      "question": "common job application question",
      "answer": "inferred answer from resume",
      "confidence": 0.0-1.0,
      "category": "personal|experience|education|skills|preferences"
    }
  ],
  "parseConfidence": 0.0-1.0
}

IMPORTANT parsing rules:
- For workHistory.bullets: split each job description into individual sentences/bullet points. Each bullet should be one responsibility or achievement.
- For skills: extract individual skills, NOT categories. "Python, Java, C++" → ["Python", "Java", "C++"], NOT ["Programming Languages"].
- For totalYearsExperience: calculate from work history date ranges. If unclear, estimate from earliest start date to latest end date.
- For education.expectedGraduation: set this if the degree is not yet completed (e.g. "Expected May 2025").
- For interests: include hobbies, extracurricular activities, and any personal interests mentioned.
- For websites: extract any URLs (LinkedIn, GitHub, portfolio, personal site).

For inferredAnswers, generate answers to common job application questions like:
- Years of experience in the field
- Highest education level completed
- Current/most recent job title
- Are you authorized to work in [country based on location]?
- Willing to relocate?
- Expected salary range (if inferable)
- Available start date
- Willing to work remotely/hybrid/in-office?
- Do you require visa sponsorship?

Resume text:
`;

export function registerResumeParseWorkflow(
  hatchet: Hatchet,
  redis: Redis,
  eventLogger: EventLogger,
  db?: Database,
) {
  const s3 = createS3Client();

  const workflow = hatchet.workflow<ResumeParseInput>({
    name: "resume-parse",
    onEvents: ["resume:uploaded"],
  });

  const extractText = workflow.task({
    name: "extract-text",
    executionTimeout: "30s",
    fn: async (input: ResumeParseInput, _ctx: Context<ResumeParseInput>) => {
      logger.info(
        { resumeId: input.resumeId },
        "Extracting text from resume",
      );

      // Download file from S3
      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_RESUMES ?? "resumes",
        Key: input.storageKey,
      });

      const response = await s3.send(command);
      const bodyStream = response.Body;
      if (!bodyStream) throw new Error("Empty response from S3");

      const chunks: Uint8Array[] = [];
      for await (const chunk of bodyStream as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      const fileBuffer = Buffer.concat(chunks);

      // Extract text based on content type
      const contentType = response.ContentType ?? "application/pdf";
      let extractedText: string;

      if (contentType.includes("pdf")) {
        const pdfParseModule = await import("pdf-parse");
        const pdfParse = (pdfParseModule as any).default ?? pdfParseModule;
        const result = await pdfParse(fileBuffer);
        extractedText = result.text;
      } else if (
        contentType.includes("wordprocessingml") ||
        contentType.includes("msword") ||
        input.storageKey.endsWith(".docx")
      ) {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        extractedText = result.value;
      } else {
        // Fallback: try to read as plain text
        extractedText = fileBuffer.toString("utf-8");
      }

      if (!extractedText.trim()) {
        throw new Error("No text could be extracted from the resume");
      }

      logger.info(
        { resumeId: input.resumeId, textLength: extractedText.length },
        "Text extracted successfully",
      );

      const fileType = contentType.includes("pdf")
        ? "pdf"
        : contentType.includes("wordprocessingml") || contentType.includes("msword") || input.storageKey.endsWith(".docx")
          ? "docx"
          : "other";

      return { extractedText, fileType };
    },
  });

  const llmParse = workflow.task({
    name: "llm-parse",
    executionTimeout: "60s",
    parents: [extractText],
    fn: async (input: ResumeParseInput, ctx: Context<ResumeParseInput>) => {
      const prevData = (await ctx.parentOutput(extractText)) as {
        extractedText: string;
      };

      logger.info({ resumeId: input.resumeId }, "Parsing with LLM");

      let response;
      try {
        const llm = createLLMRouter();

        response = await llm.complete({
          taskType: "answer_generation",
          messages: [
            {
              role: "system",
              content: "You are a precise resume parser. Always return valid JSON. Never include markdown formatting.",
            },
            {
              role: "user",
              content: RESUME_PARSE_PROMPT + prevData.extractedText,
            },
          ],
          temperature: 0.1,
          maxTokens: 4000,
          responseFormat: "json",
        });
      } catch (error) {
        logger.error({ resumeId: input.resumeId, error }, "LLM request failed");
        if (db) {
          await db
            .update(resumes)
            .set({ status: "parse_failed" })
            .where(eq(resumes.id, input.resumeId));
        }
        await publishProgress(redis, input.userId, {
          type: "resume_parse_failed",
          resumeId: input.resumeId,
          error: error instanceof Error ? error.message : "LLM request failed",
        });
        throw error;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(response.content);
      } catch {
        logger.error(
          { resumeId: input.resumeId, rawContent: response.content.slice(0, 200) },
          "Failed to parse LLM JSON response",
        );
        if (db) {
          await db
            .update(resumes)
            .set({ status: "parse_failed" })
            .where(eq(resumes.id, input.resumeId));
        }
        await publishProgress(redis, input.userId, {
          type: "resume_parse_failed",
          resumeId: input.resumeId,
          error: "LLM returned invalid JSON",
        });
        throw new Error("LLM returned invalid JSON for resume parsing");
      }

      const inferredAnswers = (
        (parsed.inferredAnswers as Array<Record<string, unknown>>) ?? []
      ).map((a) => ({
        question: String(a.question ?? ""),
        answer: String(a.answer ?? ""),
        confidence: Number(a.confidence ?? 0.5),
        category: String(a.category ?? "personal"),
        source: "resume_inferred" as const,
      }));

      // Remove inferredAnswers from parsedData (stored separately)
      const { inferredAnswers: _removed, ...parsedData } = parsed;

      logger.info(
        {
          resumeId: input.resumeId,
          confidence: parsedData.parseConfidence,
          llmModel: response.model,
          costUsd: response.usage.costUsd,
        },
        "LLM parsing complete",
      );

      return { parsedData, inferredAnswers };
    },
  });

  workflow.task({
    name: "save-results",
    executionTimeout: "15s",
    parents: [llmParse],
    fn: async (input: ResumeParseInput, ctx: Context<ResumeParseInput>) => {
      const llmResult = (await ctx.parentOutput(llmParse)) as {
        parsedData: Record<string, unknown>;
        inferredAnswers: Array<{
          question: string;
          answer: string;
          confidence: number;
          category: string;
          source: "resume_inferred";
        }>;
      };

      logger.info({ resumeId: input.resumeId }, "Saving parsed results");

      if (db) {
        // Update resume record with parsed data
        await db
          .update(resumes)
          .set({
            parsedData: llmResult.parsedData,
            parsingConfidence: Number(llmResult.parsedData.parseConfidence ?? 0),
            rawText: String(
              (await ctx.parentOutput(extractText) as { extractedText: string }).extractedText,
            ),
            status: "parsed",
            parsedAt: new Date(),
          })
          .where(eq(resumes.id, input.resumeId));

        // Save inferred answers to Q&A bank
        if (llmResult.inferredAnswers.length > 0) {
          await db.insert(qaBank).values(
            llmResult.inferredAnswers.map((a) => ({
              userId: input.userId,
              category: a.category,
              question: a.question,
              answer: a.answer,
              source: "resume_inferred" as const,
            })),
          );
        }

        logger.info(
          {
            resumeId: input.resumeId,
            answersCount: llmResult.inferredAnswers.length,
          },
          "Results saved to database",
        );
      } else {
        logger.warn("No database connection — skipping DB writes");
      }

      await publishProgress(redis, input.userId, {
        type: "resume_parsed",
        resumeId: input.resumeId,
        parseConfidence: llmResult.parsedData.parseConfidence,
      });

      return {
        success: true,
        resumeId: input.resumeId,
        fieldsExtracted: Object.keys(llmResult.parsedData).length,
        inferredAnswers: llmResult.inferredAnswers.length,
      };
    },
  });

  return workflow;
}
