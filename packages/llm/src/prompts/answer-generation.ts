/**
 * Prompt template for screening answer generation.
 *
 * Given a screening question and context (job description, user data,
 * previous answers), generate a natural-sounding answer.
 */
import type { LLMMessage } from "../providers/base.js";

export interface AnswerGenerationPromptInput {
  question: string;
  jobTitle: string;
  company: string;
  jobDescription?: string;
  userData: Record<string, unknown>;
  previousAnswers?: Record<string, string>;
}

export function buildAnswerGenerationPrompt(
  input: AnswerGenerationPromptInput,
): LLMMessage[] {
  return [
    {
      role: "system",
      content: `You are an expert career coach helping a job applicant answer screening questions. Generate natural, honest, and compelling answers based on the applicant's profile and the job context.

Return a JSON object:
{
  "answer": string,
  "confidence": number (0.0-1.0),
  "reasoning": string,
  "alternativeAnswers": string[] (2-3 alternatives if confidence < 0.8)
}

Rules:
- Be truthful. Do not fabricate experience, skills, or qualifications.
- Be concise. Most screening answers should be 1-3 sentences.
- For yes/no questions, answer directly then briefly elaborate.
- For numeric questions (years of experience, salary), use the user's actual data.
- For open-ended questions, highlight relevant experience from the user's profile.
- If the question is about salary expectations, give a range if the user has one, otherwise provide a reasonable market estimate and note low confidence.
- For work authorization questions, only answer "Yes" if the user's data confirms it.
- Confidence should reflect how well the user's data supports the answer.`,
    },
    {
      role: "user",
      content: `Generate an answer for this screening question.\n\nQuestion: "${input.question}"\n\nJob: ${input.jobTitle} at ${input.company}\n${input.jobDescription ? `\nJob description:\n${input.jobDescription}\n` : ""}\nApplicant profile:\n${JSON.stringify(input.userData, null, 2)}\n${input.previousAnswers ? `\nPrevious answers for context:\n${JSON.stringify(input.previousAnswers, null, 2)}` : ""}`,
    },
  ];
}
