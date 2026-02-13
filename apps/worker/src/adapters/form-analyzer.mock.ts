/**
 * Mock form analyzer.
 *
 * Simulates LLM-powered form analysis, field mapping, and
 * answer generation with realistic confidence scores.
 */
import type {
  IFormAnalyzer,
  FormAnalysis,
  UserData,
  FieldMapping,
  AnswerContext,
  GeneratedAnswer,
} from "@valet/shared/types";
import { randomDelay } from "./base.js";

export class FormAnalyzerMock implements IFormAnalyzer {
  async analyzeForm(_html: string): Promise<FormAnalysis> {
    await randomDelay(1000, 2500); // LLM call simulation
    return {
      url: "https://example.com/apply",
      platform: "unknown",
      totalPages: 1,
      fields: [
        {
          name: "fullName",
          label: "Full Name",
          type: "text",
          required: true,
          selector: "#full-name",
        },
        {
          name: "email",
          label: "Email Address",
          type: "email",
          required: true,
          selector: "#email",
        },
        {
          name: "phone",
          label: "Phone Number",
          type: "phone",
          required: false,
          selector: "#phone",
        },
        {
          name: "experience",
          label: "Years of relevant experience",
          type: "select",
          required: true,
          selector: "#experience",
          options: ["0-1", "1-3", "3-5", "5-10", "10+"],
        },
        {
          name: "resume",
          label: "Resume",
          type: "file",
          required: true,
          selector: "input[type='file']",
        },
      ],
      submitSelector: "button[type='submit']",
      hasFileUpload: true,
      hasCaptcha: false,
      analysisConfidence: 0.92,
    };
  }

  async mapFields(
    analysis: FormAnalysis,
    userData: UserData,
  ): Promise<FieldMapping[]> {
    await randomDelay(500, 1200);
    return analysis.fields.map((field) => {
      const value = this.resolveValue(field.name, userData);
      const confidence = value ? 0.8 + Math.random() * 0.2 : 0.3;
      return {
        field,
        value: value ?? "",
        confidence: {
          value: confidence,
          source: confidence > 0.7 ? "resume" : "llm_generated",
        },
        source: confidence > 0.7 ? ("resume" as const) : ("llm_generated" as const),
        requiresReview: confidence < 0.75,
      };
    });
  }

  async generateAnswer(
    question: string,
    context: AnswerContext,
  ): Promise<GeneratedAnswer> {
    await randomDelay(800, 2000); // LLM call simulation

    const answers: Record<string, string> = {
      "years of experience": `${context.userData.yearsOfExperience ?? 5} years`,
      "work authorization": "Yes, I am authorized to work.",
      sponsorship: "No, I do not require sponsorship.",
      salary: "$150,000 - $180,000",
      "start date": "Within 2 weeks of offer acceptance",
    };

    const key = Object.keys(answers).find((k) =>
      question.toLowerCase().includes(k),
    );
    const answer = key ? answers[key]! : `Based on my experience at ${context.company}, I would say...`;

    return {
      answer,
      confidence: key ? 0.9 : 0.65,
      reasoning: key
        ? `Matched known question pattern: "${key}"`
        : "Generated from context using LLM",
      source: key ? "qa_bank" : "llm_generated",
      alternativeAnswers: key ? undefined : ["I am flexible on this.", answer],
    };
  }

  async scoreConfidence(field: FieldMapping): Promise<number> {
    await randomDelay(50, 150);
    // Boost confidence for fields with known sources
    const baseScore = field.confidence.value;
    if (field.source === "resume") return Math.min(1.0, baseScore + 0.05);
    if (field.source === "qa_bank") return Math.min(1.0, baseScore + 0.03);
    return baseScore;
  }

  private resolveValue(
    fieldName: string,
    userData: UserData,
  ): string | undefined {
    const mapping: Record<string, string | undefined> = {
      fullName: `${userData.firstName} ${userData.lastName}`,
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
      phone: userData.phone,
      experience:
        userData.yearsOfExperience !== undefined
          ? userData.yearsOfExperience >= 10
            ? "10+"
            : userData.yearsOfExperience >= 5
              ? "5-10"
              : userData.yearsOfExperience >= 3
                ? "3-5"
                : userData.yearsOfExperience >= 1
                  ? "1-3"
                  : "0-1"
          : undefined,
    };
    return mapping[fieldName];
  }
}
