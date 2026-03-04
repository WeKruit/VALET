import type { JobLeadRepository } from "./job-lead.repository.js";
import type { TaskService } from "../tasks/task.service.js";
import { AppError } from "../../common/errors.js";
import type { Platform, JobLeadStatus, JobLeadSource, JobLead } from "@valet/shared/schemas";

/** Maps URL hostnames to platform identifiers */
const PLATFORM_PATTERNS: Array<{ pattern: RegExp; platform: Platform }> = [
  { pattern: /linkedin\.com/i, platform: "linkedin" },
  { pattern: /greenhouse\.io/i, platform: "greenhouse" },
  { pattern: /lever\.co/i, platform: "lever" },
  { pattern: /myworkday\.com|workday\.com/i, platform: "workday" },
];

function detectPlatform(url: string): Platform {
  for (const { pattern, platform } of PLATFORM_PATTERNS) {
    if (pattern.test(url)) return platform;
  }
  return "unknown";
}

/** Maps a raw DB row (with widened string types) to the contract response shape */
function toJobLeadResponse(row: {
  id: string;
  userId: string;
  jobUrl: string;
  platform: string;
  title: string;
  company: string;
  location: string | null;
  matchScore: number | null;
  source: string;
  status: string;
  taskId: string | null;
  createdAt: Date;
}): JobLead {
  return {
    id: row.id,
    userId: row.userId,
    jobUrl: row.jobUrl,
    platform: row.platform as Platform,
    title: row.title,
    company: row.company,
    location: row.location,
    matchScore: row.matchScore,
    source: row.source as JobLeadSource,
    status: row.status as JobLeadStatus,
    taskId: row.taskId,
    createdAt: row.createdAt,
  };
}

/** Very rough title/company extraction from URL path segments */
function extractMetadataFromUrl(url: string): { title: string; company: string } {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);

    // LinkedIn: /jobs/view/<id> or /jobs/collections/.../<title-at-company>
    if (u.hostname.includes("linkedin.com")) {
      const titleSegment = segments.find((s) => s.includes("-at-"));
      if (titleSegment) {
        const parts = titleSegment.replace(/-/g, " ").split(" at ");
        return {
          title: parts[0]?.trim() ?? "Untitled Position",
          company: parts[1]?.trim() ?? "Unknown Company",
        };
      }
    }

    // Greenhouse: /job/<slug> or boards/<company>/jobs/<id>
    if (u.hostname.includes("greenhouse.io")) {
      const companyIdx = segments.indexOf("boards");
      return {
        title: "Imported Position",
        company:
          companyIdx >= 0 ? (segments[companyIdx + 1] ?? "Unknown Company") : "Unknown Company",
      };
    }

    // Lever: /company/jobId
    if (u.hostname.includes("lever.co")) {
      return {
        title: "Imported Position",
        company: segments[0] ?? "Unknown Company",
      };
    }

    return { title: "Imported Position", company: "Unknown Company" };
  } catch {
    return { title: "Imported Position", company: "Unknown Company" };
  }
}

export class JobLeadService {
  private jobLeadRepo: JobLeadRepository;
  private taskService: TaskService;

  constructor({
    jobLeadRepo,
    taskService,
  }: {
    jobLeadRepo: JobLeadRepository;
    taskService: TaskService;
  }) {
    this.jobLeadRepo = jobLeadRepo;
    this.taskService = taskService;
  }

  async list(
    userId: string,
    query: {
      status?: string;
      platform?: string;
      search?: string;
      limit: number;
      offset: number;
    },
  ): Promise<{ data: JobLead[]; total: number }> {
    const result = await this.jobLeadRepo.findByUserId(userId, query);
    return { data: result.data.map(toJobLeadResponse), total: result.total };
  }

  async getById(id: string, userId: string): Promise<JobLead> {
    const lead = await this.jobLeadRepo.findById(id, userId);
    if (!lead) throw AppError.notFound("Job lead not found");
    return toJobLeadResponse(lead);
  }

  async create(
    userId: string,
    data: {
      title: string;
      company: string;
      jobUrl: string;
      platform?: string;
      location?: string;
      source?: string;
    },
  ): Promise<JobLead> {
    const platform = data.platform ?? detectPlatform(data.jobUrl);
    const row = await this.jobLeadRepo.create({
      userId,
      jobUrl: data.jobUrl,
      platform,
      title: data.title,
      company: data.company,
      location: data.location,
      source: data.source ?? "manual",
    });
    return toJobLeadResponse(row);
  }

  async importUrl(userId: string, url: string) {
    // Check for duplicates
    const existing = await this.jobLeadRepo.findByUrl(userId, url);
    if (existing) throw AppError.conflict("This URL has already been imported");

    const platform = detectPlatform(url);
    const metadata = extractMetadataFromUrl(url);

    const lead = await this.jobLeadRepo.create({
      userId,
      jobUrl: url,
      platform,
      title: metadata.title,
      company: metadata.company,
      source: "url_import",
    });

    return {
      id: lead.id,
      title: lead.title,
      company: lead.company,
      platform: lead.platform as Platform,
      jobUrl: lead.jobUrl,
      location: lead.location,
    };
  }

  async update(
    id: string,
    userId: string,
    data: {
      title?: string;
      company?: string;
      location?: string | null;
      status?: string;
    },
  ): Promise<JobLead> {
    const lead = await this.jobLeadRepo.findById(id, userId);
    if (!lead) throw AppError.notFound("Job lead not found");
    const updated = await this.jobLeadRepo.update(id, data);
    if (!updated) throw AppError.notFound("Job lead not found");
    return toJobLeadResponse(updated);
  }

  async delete(id: string, userId: string) {
    const lead = await this.jobLeadRepo.findById(id, userId);
    if (!lead) throw AppError.notFound("Job lead not found");
    await this.jobLeadRepo.delete(id);
  }

  async queueForApplication(id: string, userId: string, opts: { resumeId?: string }) {
    const lead = await this.jobLeadRepo.findById(id, userId);
    if (!lead) throw AppError.notFound("Job lead not found");

    if (lead.status === "queued" || lead.status === "applied") {
      throw AppError.conflict("This job lead has already been queued or applied");
    }

    // Create a task via the existing task service
    const task = await this.taskService.create(
      {
        jobUrl: lead.jobUrl,
        mode: "copilot",
        resumeId: opts.resumeId ?? "",
      },
      userId,
    );

    // Link task to lead and update status
    await this.jobLeadRepo.update(id, {
      status: "queued",
      taskId: task.id,
    });

    return task;
  }
}
