/**
 * Prompt template for field mapping.
 *
 * Given a form analysis and user data, map user data fields to
 * form fields with confidence scores.
 */
import type { LLMMessage } from "../providers/base.js";

export interface FieldMappingPromptInput {
  fields: Array<{
    name: string;
    label: string;
    type: string;
    required: boolean;
    options?: string[];
  }>;
  userData: Record<string, unknown>;
  qaAnswers?: Record<string, string>;
}

export function buildFieldMappingPrompt(
  input: FieldMappingPromptInput,
): LLMMessage[] {
  return [
    {
      role: "system",
      content: `You are an expert at mapping user profile data to job application form fields. Given a list of form fields and user data, determine the best value for each field.

Return a JSON array of mappings:
[
  {
    "fieldName": string,
    "value": string,
    "confidence": number (0.0-1.0),
    "source": "resume" | "qa_bank" | "llm_generated" | "user_input",
    "requiresReview": boolean,
    "reasoning": string
  }
]

Rules:
- Match fields by label semantics, not just exact name matches.
- For select/radio fields, pick the closest matching option from the available options.
- Set confidence based on how certain you are about the mapping.
- Set requiresReview=true for confidence < 0.75 or LLM-generated answers.
- For fields with no matching user data, generate a reasonable answer if possible, otherwise leave value empty.
- For EEO/demographic questions, default to "Prefer not to say" if available.`,
    },
    {
      role: "user",
      content: `Map user data to these form fields.\n\nForm fields:\n${JSON.stringify(input.fields, null, 2)}\n\nUser data:\n${JSON.stringify(input.userData, null, 2)}\n\nQ&A answers:\n${JSON.stringify(input.qaAnswers ?? {}, null, 2)}`,
    },
  ];
}
