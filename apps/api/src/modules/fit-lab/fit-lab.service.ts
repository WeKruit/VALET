import type { FastifyBaseLogger } from "fastify";
import { LLMRouter } from "@valet/llm";
import type { FitLabRepository } from "./fit-lab.repository.js";
import type { ResumeRepository } from "../resumes/resume.repository.js";
import { AppError } from "../../common/errors.js";
import type { JobAnalysisResponse, CompareResumeResponse, KeywordGap } from "@valet/shared/schemas";

const ANALYZE_JOB_PROMPT = `You are a job description analyzer. Parse the following job description and extract structured information.

Return a JSON object with exactly these fields:
{
  "title": "job title string",
  "company": "company name or null",
  "location": "location or null",
  "requirements": [
    {
      "text": "requirement text",
      "category": "hard_skill" | "soft_skill" | "experience" | "education" | "certification" | "other",
      "importance": "required" | "preferred" | "nice_to_have"
    }
  ],
  "responsibilities": ["responsibility text"],
  "rawText": "the full job description text"
}

Rules:
- Extract ALL requirements, even implicit ones
- Classify importance based on language: "must have", "required" -> required; "preferred", "ideally" -> preferred; "bonus", "plus" -> nice_to_have
- For category: technical skills = hard_skill, interpersonal = soft_skill, years of experience = experience, degrees = education, specific certs = certification
- Keep requirement text concise but complete

Job description:
`;

const COMPARE_RESUME_PROMPT = `You are a resume-to-job-description matching expert. Compare the candidate's resume against the job requirements and produce a detailed match analysis.

Return a JSON object with exactly these fields:
{
  "matchScore": 0.0-1.0 (overall match score),
  "matchedRequirements": ["requirement text that the candidate meets"],
  "missingRequirements": ["requirement text the candidate does NOT meet"],
  "keywordGaps": [
    {
      "keyword": "missing keyword or skill",
      "importance": "required" | "preferred" | "nice_to_have",
      "category": "hard_skill" | "soft_skill" | "experience" | "education" | "certification" | "other",
      "injectable": true/false (can this be honestly added to the resume?),
      "suggestion": "how to address this gap, or null"
    }
  ],
  "strengthSummary": "2-3 sentence summary of candidate's strengths for this role",
  "improvementSummary": "2-3 sentence summary of areas to improve"
}

Scoring rules:
- Weight required requirements heavily (each missed required req = -0.1)
- Weight preferred requirements moderately (each missed = -0.05)
- nice_to_have requirements have minimal impact
- injectable = true means the candidate likely has transferable experience that could be highlighted
- injectable = false means the candidate genuinely lacks this skill/experience

`;

const TAILOR_RESUME_PROMPT = `You are a resume tailoring expert. Given a parsed resume and a job description, create a tailored version of the resume that better matches the job requirements.

IMPORTANT RULES:
- NEVER fabricate experience, skills, or qualifications the candidate doesn't have
- NEVER change dates, company names, job titles, or education details
- You CAN reorder bullet points to prioritize relevant experience
- You CAN rephrase bullet points to better highlight relevant skills
- You CAN add relevant skills the candidate demonstrably has but didn't list
- You CAN adjust the summary/objective to target this specific role
- Return the full tailored resume data in the same structure as the input

Return a JSON object with:
{
  "variantData": { ... same structure as input parsedData, but tailored ... },
  "diffData": {
    "changedSections": ["section names that were modified"],
    "changes": [
      {
        "section": "section name",
        "field": "field path",
        "before": "original text",
        "after": "modified text",
        "reason": "why this change improves the match"
      }
    ]
  },
  "matchScoreAfter": 0.0-1.0 (estimated score after changes)
}

`;

export class FitLabService {
  private fitLabRepo: FitLabRepository;
  private resumeRepo: ResumeRepository;
  private logger: FastifyBaseLogger;
  private llm: LLMRouter;

  constructor({
    fitLabRepo,
    resumeRepo,
    logger,
  }: {
    fitLabRepo: FitLabRepository;
    resumeRepo: ResumeRepository;
    logger: FastifyBaseLogger;
  }) {
    this.fitLabRepo = fitLabRepo;
    this.resumeRepo = resumeRepo;
    this.logger = logger;
    this.llm = new LLMRouter({
      anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
      openaiApiKey: process.env.OPENAI_API_KEY ?? "",
    });
  }

  async analyzeJob(input: {
    jobUrl?: string;
    jobDescription?: string;
  }): Promise<JobAnalysisResponse> {
    const jobText = input.jobDescription ?? "";
    if (!jobText.trim()) {
      throw AppError.badRequest("Job description text is required");
    }

    this.logger.info({ textLength: jobText.length }, "Analyzing job description");

    const response = await this.llm.complete({
      taskType: "answer_generation",
      messages: [
        {
          role: "system",
          content:
            "You are a precise job description parser. Always return valid JSON. Never include markdown formatting.",
        },
        {
          role: "user",
          content: ANALYZE_JOB_PROMPT + jobText,
        },
      ],
      temperature: 0.1,
      maxTokens: 3000,
      responseFormat: "json",
    });

    const parsed = JSON.parse(response.content);

    return {
      title: String(parsed.title ?? "Unknown"),
      company: parsed.company ?? null,
      location: parsed.location ?? null,
      requirements: (parsed.requirements ?? []).map((r: Record<string, unknown>) => ({
        text: String(r.text ?? ""),
        category: String(r.category ?? "other"),
        importance: String(r.importance ?? "preferred"),
      })),
      responsibilities: (parsed.responsibilities ?? []).map(String),
      rawText: jobText,
    };
  }

  async compareResume(
    userId: string,
    input: {
      resumeId: string;
      jobUrl?: string;
      jobDescription?: string;
    },
  ): Promise<CompareResumeResponse> {
    const resume = await this.resumeRepo.findById(input.resumeId, userId);
    if (!resume) throw AppError.notFound("Resume not found");

    if (resume.status !== "parsed" || !resume.parsedData) {
      throw AppError.badRequest("Resume must be parsed before comparison");
    }

    const jobText = input.jobDescription ?? "";
    if (!jobText.trim()) {
      throw AppError.badRequest("Job description text is required");
    }

    this.logger.info(
      { resumeId: input.resumeId, jobTextLength: jobText.length },
      "Comparing resume to job description",
    );

    const response = await this.llm.complete({
      taskType: "answer_generation",
      messages: [
        {
          role: "system",
          content:
            "You are an expert resume-job matcher. Always return valid JSON. Never include markdown formatting.",
        },
        {
          role: "user",
          content:
            COMPARE_RESUME_PROMPT +
            `\n\nResume data:\n${JSON.stringify(resume.parsedData, null, 2)}\n\nJob description:\n${jobText}`,
        },
      ],
      temperature: 0.1,
      maxTokens: 4000,
      responseFormat: "json",
    });

    const parsed = JSON.parse(response.content);

    return {
      matchScore: Number(parsed.matchScore ?? 0),
      matchedRequirements: (parsed.matchedRequirements ?? []).map(String),
      missingRequirements: (parsed.missingRequirements ?? []).map(String),
      keywordGaps: (parsed.keywordGaps ?? []).map(
        (g: Record<string, unknown>): KeywordGap => ({
          keyword: String(g.keyword ?? ""),
          importance: (g.importance as KeywordGap["importance"]) ?? "preferred",
          category: (g.category as KeywordGap["category"]) ?? "other",
          injectable: Boolean(g.injectable),
          suggestion: g.suggestion ? String(g.suggestion) : null,
        }),
      ),
      strengthSummary: String(parsed.strengthSummary ?? ""),
      improvementSummary: String(parsed.improvementSummary ?? ""),
    };
  }

  async createVariant(
    userId: string,
    input: {
      resumeId: string;
      jobUrl: string;
      jobDescription: string;
      rephraseMode: string;
      taskId?: string;
    },
  ) {
    const resume = await this.resumeRepo.findById(input.resumeId, userId);
    if (!resume) throw AppError.notFound("Resume not found");

    if (resume.status !== "parsed" || !resume.parsedData) {
      throw AppError.badRequest("Resume must be parsed before tailoring");
    }

    this.logger.info(
      { resumeId: input.resumeId, rephraseMode: input.rephraseMode },
      "Creating resume variant",
    );

    // Step 1: Get match score before tailoring
    const beforeComparison = await this.compareResume(userId, {
      resumeId: input.resumeId,
      jobDescription: input.jobDescription,
    });

    // Step 2: Generate tailored variant via LLM
    const modeInstructions =
      input.rephraseMode === "off"
        ? "Do NOT rephrase any content. Only reorder bullet points and adjust the summary."
        : input.rephraseMode === "honest"
          ? "Rephrase bullet points to better highlight relevant skills, but keep all claims truthful and verifiable."
          : "Maximize ATS keyword matching by rephrasing aggressively, but NEVER fabricate experience or qualifications.";

    const response = await this.llm.complete({
      taskType: "answer_generation",
      messages: [
        {
          role: "system",
          content:
            "You are an expert resume tailor. Always return valid JSON. Never include markdown formatting.",
        },
        {
          role: "user",
          content:
            TAILOR_RESUME_PROMPT +
            `\nRephrase mode: ${input.rephraseMode}\n${modeInstructions}\n\nResume data:\n${JSON.stringify(resume.parsedData, null, 2)}\n\nJob description:\n${input.jobDescription}`,
        },
      ],
      temperature: 0.2,
      maxTokens: 6000,
      responseFormat: "json",
    });

    const parsed = JSON.parse(response.content);

    // Step 3: Store variant
    const variant = await this.fitLabRepo.create({
      userId,
      baseResumeId: input.resumeId,
      taskId: input.taskId,
      jobUrl: input.jobUrl,
      variantData: parsed.variantData ?? {},
      diffData: parsed.diffData ?? {},
      matchScoreBefore: Math.round(beforeComparison.matchScore * 100),
      matchScoreAfter: parsed.matchScoreAfter
        ? Math.round(Number(parsed.matchScoreAfter) * 100)
        : null,
      keywordGaps: beforeComparison.keywordGaps,
      rephraseMode: input.rephraseMode,
    });

    this.logger.info(
      {
        variantId: variant.id,
        matchScoreBefore: beforeComparison.matchScore,
        matchScoreAfter: parsed.matchScoreAfter,
      },
      "Resume variant created",
    );

    return variant;
  }

  async getVariant(id: string, userId: string) {
    const variant = await this.fitLabRepo.findById(id, userId);
    if (!variant) throw AppError.notFound("Resume variant not found");
    return variant;
  }

  async listVariants(userId: string, resumeId?: string) {
    if (resumeId) {
      return this.fitLabRepo.findByResumeId(userId, resumeId);
    }
    return this.fitLabRepo.findByUserId(userId);
  }
}
