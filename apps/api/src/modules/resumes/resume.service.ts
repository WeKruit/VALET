import type { Hatchet } from "@hatchet-dev/typescript-sdk";
import type { S3Client } from "@aws-sdk/client-s3";
import {
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import type { ResumeRepository } from "./resume.repository.js";
import { AppError } from "../../common/errors.js";
import { UPLOAD_LIMITS } from "@valet/shared/constants";

const MAX_RESUMES = 5;
const ALLOWED_MIME_TYPES: Set<string> = new Set(UPLOAD_LIMITS.ALLOWED_MIME_TYPES);
const S3_BUCKET = process.env.S3_BUCKET_RESUMES ?? "resumes";

export class ResumeService {
  private resumeRepo: ResumeRepository;
  private hatchet: Hatchet;
  private s3: S3Client;

  constructor({
    resumeRepo,
    hatchet,
    s3,
  }: {
    resumeRepo: ResumeRepository;
    hatchet: Hatchet;
    s3: S3Client;
  }) {
    this.resumeRepo = resumeRepo;
    this.hatchet = hatchet;
    this.s3 = s3;
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

    if (file.data.length > UPLOAD_LIMITS.MAX_RESUME_SIZE_BYTES) {
      throw AppError.badRequest("File size must not exceed 10MB");
    }

    const existing = await this.resumeRepo.findByUserId(userId);
    if (existing.length >= MAX_RESUMES) {
      throw AppError.conflict(
        `Maximum ${MAX_RESUMES} resumes allowed. Delete one first.`,
      );
    }

    const storageKey = `resumes/${userId}/${crypto.randomUUID()}-${file.filename}`;

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

    await this.hatchet.admin.runWorkflow("resume-parse", {
      resumeId: resume.id,
      storageKey,
      userId,
    });

    return resume;
  }

  async updateParsedData(
    id: string,
    userId: string,
    parsedData: Record<string, unknown>,
  ) {
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

    await this.hatchet.admin.runWorkflow("resume-parse", {
      resumeId: id,
      storageKey: resume.fileKey,
      userId,
    });

    return { id, status: "parsing" as const };
  }

  async setDefault(id: string, userId: string) {
    await this.getById(id, userId);
    await this.resumeRepo.setDefault(id, userId);
  }
}
