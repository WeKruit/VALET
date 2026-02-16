import path from "node:path";
import type { S3Client } from "@aws-sdk/client-s3";
import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import type { FastifyBaseLogger } from "fastify";
import type Redis from "ioredis";
import { LLMRouter } from "@valet/llm";
import type { ResumeRepository } from "./resume.repository.js";
import type { QaBankRepository } from "../qa-bank/qa-bank.repository.js";
import { AppError } from "../../common/errors.js";
import { UPLOAD_LIMITS } from "@valet/shared/constants";
import { publishToUser } from "../../websocket/handler.js";

const MAX_RESUMES = 5;
const ALLOWED_MIME_TYPES: Set<string> = new Set(UPLOAD_LIMITS.ALLOWED_MIME_TYPES);
const ALLOWED_EXTENSIONS: Set<string> = new Set([".pdf", ".docx"]);
const S3_BUCKET = process.env.S3_BUCKET_RESUMES ?? "resumes";

/** Magic byte signatures for allowed file types */
const MAGIC_BYTES: Record<string, { bytes: number[]; offset: number }> = {
  ".pdf": { bytes: [0x25, 0x50, 0x44, 0x46], offset: 0 }, // %PDF
  ".docx": { bytes: [0x50, 0x4b, 0x03, 0x04], offset: 0 }, // PK\x03\x04 (ZIP)
};

function validateMagicBytes(data: Buffer, ext: string): boolean {
  const sig = MAGIC_BYTES[ext];
  if (!sig) return false;
  if (data.length < sig.offset + sig.bytes.length) return false;
  return sig.bytes.every((byte, i) => data[sig.offset + i] === byte);
}

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_") // Only safe chars
    .replace(/^\.+/, "") // Strip leading dots
    .replace(/\.{2,}/g, ".") // Collapse multiple dots
    .slice(0, 255); // Limit length
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
- For workHistory.bullets: split each job description into individual sentences/bullet points.
- For skills: extract individual skills, NOT categories. "Python, Java, C++" → ["Python", "Java", "C++"].
- For totalYearsExperience: calculate from work history date ranges.
- For education.expectedGraduation: set this if the degree is not yet completed.
- For websites: extract any URLs (LinkedIn, GitHub, portfolio, personal site).

For inferredAnswers, generate answers to common job application questions like:
- Years of experience in the field
- Highest education level completed
- Current/most recent job title
- Are you authorized to work in [country based on location]?
- Willing to relocate?
- Expected salary range (if inferable)
- Available start date
- Do you require visa sponsorship?

Resume text:
`;

export class ResumeService {
  private resumeRepo: ResumeRepository;
  private qaBankRepo: QaBankRepository;
  private s3: S3Client;
  private redis: Redis;
  private logger: FastifyBaseLogger;

  constructor({
    resumeRepo,
    qaBankRepo,
    s3,
    redis,
    logger,
  }: {
    resumeRepo: ResumeRepository;
    qaBankRepo: QaBankRepository;
    s3: S3Client;
    redis: Redis;
    logger: FastifyBaseLogger;
  }) {
    this.resumeRepo = resumeRepo;
    this.qaBankRepo = qaBankRepo;
    this.s3 = s3;
    this.redis = redis;
    this.logger = logger;
  }

  async getById(id: string, userId: string) {
    const resume = await this.resumeRepo.findById(id, userId);
    if (!resume) throw AppError.notFound("Resume not found");
    return resume;
  }

  async listByUser(userId: string) {
    return this.resumeRepo.findByUserId(userId);
  }

  async upload(
    userId: string,
    file: {
      filename: string;
      data: Buffer;
      mimetype: string;
    },
  ) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw AppError.badRequest("Only PDF and DOCX files are supported");
    }

    const ext = path.extname(file.filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw AppError.badRequest("Only PDF and DOCX files are supported");
    }

    if (!validateMagicBytes(file.data, ext)) {
      throw AppError.badRequest("File content does not match its extension");
    }

    if (file.data.length > UPLOAD_LIMITS.MAX_RESUME_SIZE_BYTES) {
      throw AppError.badRequest("File size must not exceed 10MB");
    }

    const existing = await this.resumeRepo.findByUserId(userId);
    if (existing.length >= MAX_RESUMES) {
      throw AppError.conflict(`Maximum ${MAX_RESUMES} resumes allowed. Delete one first.`);
    }

    const sanitizedFilename = sanitizeFilename(file.filename);
    const storageKey = `resumes/${userId}/${crypto.randomUUID()}-${sanitizedFilename}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: storageKey,
        Body: file.data,
        ContentType: file.mimetype,
      }),
    );

    const resume = await this.resumeRepo.create({
      userId,
      filename: file.filename,
      fileSizeBytes: file.data.length,
      mimeType: file.mimetype,
      storageKey,
    });

    // Fire-and-forget: parse resume in background
    void this.parseResume(resume.id, storageKey, userId).catch((err) => {
      this.logger.error({ err, resumeId: resume.id }, "Background resume parse failed");
    });

    return resume;
  }

  async updateParsedData(id: string, userId: string, parsedData: Record<string, unknown>) {
    await this.getById(id, userId);
    await this.resumeRepo.update(id, { parsedData });
    return this.getById(id, userId);
  }

  async delete(id: string, userId: string) {
    const resume = await this.getById(id, userId);
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: resume.fileKey,
      }),
    );
    await this.resumeRepo.delete(id);
  }

  async retryParse(id: string, userId: string) {
    const resume = await this.getById(id, userId);

    if (resume.status === "parsed") {
      throw AppError.conflict("Resume is already parsed");
    }

    // Reset status to parsing
    await this.resumeRepo.update(id, {
      status: "parsing",
      parsedData: null,
      parsingConfidence: null,
      rawText: null,
      parsedAt: null,
    });

    // Fire-and-forget: parse resume in background
    void this.parseResume(id, resume.fileKey, userId).catch((err) => {
      this.logger.error({ err, resumeId: id }, "Background resume retry-parse failed");
    });

    return { id, status: "parsing" as const };
  }

  /**
   * Extract text from resume file, parse with LLM, and save results.
   * Runs as a background task (fire-and-forget from upload/retryParse).
   */
  private async parseResume(resumeId: string, storageKey: string, userId: string): Promise<void> {
    this.logger.info({ resumeId }, "Starting resume parse");

    // ── Step 1: Extract text ─────────────────────────────────────
    let extractedText: string;
    try {
      const response = await this.s3.send(
        new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: storageKey,
        }),
      );
      const bodyStream = response.Body;
      if (!bodyStream) throw new Error("Empty response from S3");

      const chunks: Uint8Array[] = [];
      for await (const chunk of bodyStream as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      const fileBuffer = Buffer.concat(chunks);

      const contentType = response.ContentType ?? "application/pdf";
      if (contentType.includes("pdf")) {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: fileBuffer });
        const result = await parser.getText();
        extractedText = result.text;
        await parser.destroy();
      } else if (
        contentType.includes("wordprocessingml") ||
        contentType.includes("msword") ||
        storageKey.endsWith(".docx")
      ) {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        extractedText = result.value;
      } else {
        extractedText = fileBuffer.toString("utf-8");
      }

      if (!extractedText.trim()) {
        throw new Error("No text could be extracted from the resume");
      }

      this.logger.info({ resumeId, textLength: extractedText.length }, "Text extracted");
    } catch (err) {
      this.logger.error({ err, resumeId }, "Text extraction failed");
      await this.resumeRepo.update(resumeId, { status: "parse_failed" });
      await publishToUser(this.redis, userId, {
        type: "resume_parse_failed",
        resumeId,
        error: err instanceof Error ? err.message : "Text extraction failed",
      });
      return;
    }

    // ── Step 1b: Verify content looks like a resume ──────────────
    const resumeConfidence = this.scoreResumeConfidence(extractedText);
    this.logger.info({ resumeId, resumeConfidence }, "Resume content confidence score");

    if (resumeConfidence < 0.3) {
      this.logger.warn({ resumeId, resumeConfidence }, "File does not appear to be a resume");
      await this.resumeRepo.update(resumeId, {
        status: "parse_failed",
        parsingConfidence: resumeConfidence,
      });
      await publishToUser(this.redis, userId, {
        type: "resume_parse_failed",
        resumeId,
        error:
          "The uploaded file does not appear to be a resume. Please upload a valid resume (PDF or DOCX).",
      });
      return;
    }

    // ── Step 2: LLM parse ────────────────────────────────────────
    let parsedData: Record<string, unknown>;
    let inferredAnswers: Array<{
      question: string;
      answer: string;
      confidence: number;
      category: string;
    }>;
    try {
      const llm = new LLMRouter({
        anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
        openaiApiKey: process.env.OPENAI_API_KEY ?? "",
      });

      const response = await llm.complete({
        taskType: "answer_generation",
        messages: [
          {
            role: "system",
            content:
              "You are a precise resume parser. Always return valid JSON. Never include markdown formatting.",
          },
          {
            role: "user",
            content: RESUME_PARSE_PROMPT + extractedText,
          },
        ],
        temperature: 0.1,
        maxTokens: 4000,
        responseFormat: "json",
      });

      const parsed = JSON.parse(response.content);

      inferredAnswers = ((parsed.inferredAnswers as Array<Record<string, unknown>>) ?? []).map(
        (a) => ({
          question: String(a.question ?? ""),
          answer: String(a.answer ?? ""),
          confidence: Number(a.confidence ?? 0.5),
          category: String(a.category ?? "personal"),
        }),
      );

      // Remove inferredAnswers from parsedData (stored separately in qa_bank)
      const { inferredAnswers: _removed, ...rest } = parsed;
      parsedData = rest;

      this.logger.info(
        { resumeId, confidence: parsedData.parseConfidence, model: response.model },
        "LLM parsing complete",
      );
    } catch (err) {
      this.logger.error({ err, resumeId }, "LLM parsing failed");
      await this.resumeRepo.update(resumeId, { status: "parse_failed" });
      await publishToUser(this.redis, userId, {
        type: "resume_parse_failed",
        resumeId,
        error: err instanceof Error ? err.message : "LLM parsing failed",
      });
      return;
    }

    // ── Step 3: Save results ─────────────────────────────────────
    try {
      await this.resumeRepo.update(resumeId, {
        parsedData,
        parsingConfidence: Number(parsedData.parseConfidence ?? 0),
        rawText: extractedText,
        status: "parsed",
        parsedAt: new Date(),
      });

      if (inferredAnswers.length > 0) {
        // Map LLM category names to our QA bank enum values
        const categoryMap: Record<
          string,
          | "identity"
          | "experience"
          | "work_authorization"
          | "compensation"
          | "availability"
          | "custom"
        > = {
          personal: "identity",
          experience: "experience",
          education: "experience",
          skills: "experience",
          preferences: "availability",
          work_authorization: "work_authorization",
          compensation: "compensation",
          availability: "availability",
          identity: "identity",
        };
        for (const a of inferredAnswers) {
          await this.qaBankRepo.create({
            userId,
            category: categoryMap[a.category] ?? "custom",
            question: a.question,
            answer: a.answer,
            usageMode: "always_use",
            source: "resume_inferred",
          });
        }
      }

      this.logger.info(
        { resumeId, answersCount: inferredAnswers.length },
        "Resume parse results saved",
      );

      await publishToUser(this.redis, userId, {
        type: "resume_parsed",
        resumeId,
        parseConfidence: parsedData.parseConfidence,
      });
    } catch (err) {
      this.logger.error({ err, resumeId }, "Failed to save parse results");
      await this.resumeRepo.update(resumeId, { status: "parse_failed" });
      await publishToUser(this.redis, userId, {
        type: "resume_parse_failed",
        resumeId,
        error: "Failed to save parsed results",
      });
    }
  }

  /**
   * Quick heuristic to check if extracted text looks like a resume.
   * Returns 0.0–1.0 confidence. Avoids wasting LLM tokens on non-resume files.
   */
  private scoreResumeConfidence(text: string): number {
    const signals = [
      // Contact info
      /\b[\w.-]+@[\w.-]+\.\w{2,}\b/.test(text),
      /\b\d{3}[.\-\s]?\d{3}[.\-\s]?\d{4}\b/.test(text),
      // Section headers typical of resumes
      /\b(experience|employment|work history)\b/i.test(text),
      /\b(education|university|college|degree|bachelor|master|ph\.?d)\b/i.test(text),
      /\b(skills|technologies|proficiencies|competencies)\b/i.test(text),
      /\b(summary|objective|profile|about)\b/i.test(text),
      // Job-related terms
      /\b(managed|developed|implemented|led|designed|built|created)\b/i.test(text),
      /\b(responsibilities|achievements|accomplishments)\b/i.test(text),
      // Dates (employment periods)
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|present|current)\b/i.test(text),
      /\b20\d{2}\b/.test(text),
      // Text length reasonable for a resume (at least 200 chars)
      text.trim().length >= 200,
    ];

    const matched = signals.filter(Boolean).length;
    return Math.min(matched / signals.length, 1.0);
  }

  async setDefault(id: string, userId: string) {
    await this.getById(id, userId);
    await this.resumeRepo.setDefault(id, userId);
  }
}
