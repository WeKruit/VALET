/**
 * Prompt template for form analysis.
 *
 * Given HTML of a job application page, identify all form fields,
 * their types, selectors, and whether they are required.
 */
import type { LLMMessage } from "../providers/base.js";

export interface FormAnalysisPromptInput {
  html: string;
  url: string;
  platform?: string;
}

export function buildFormAnalysisPrompt(
  input: FormAnalysisPromptInput,
): LLMMessage[] {
  return [
    {
      role: "system",
      content: `You are an expert at analyzing HTML job application forms. Given the HTML source of a job application page, extract all form fields with their properties.

Return a JSON object with this exact structure:
{
  "url": string,
  "platform": "linkedin" | "greenhouse" | "lever" | "workday" | "unknown",
  "totalPages": number,
  "fields": [
    {
      "name": string,
      "label": string,
      "type": "text" | "textarea" | "select" | "radio" | "checkbox" | "file" | "date" | "number" | "phone" | "email" | "url",
      "required": boolean,
      "selector": string (CSS selector),
      "options": string[] | null (for select/radio/checkbox),
      "placeholder": string | null,
      "maxLength": number | null,
      "groupName": string | null,
      "pageIndex": number
    }
  ],
  "submitSelector": string,
  "hasFileUpload": boolean,
  "hasCaptcha": boolean,
  "analysisConfidence": number (0.0-1.0)
}

Rules:
- Use the most specific CSS selector possible.
- Identify hidden fields and skip them.
- Detect CAPTCHA iframes (reCAPTCHA, hCaptcha, Turnstile).
- For multi-page forms, set pageIndex accordingly.
- Confidence should reflect how certain you are about the analysis.`,
    },
    {
      role: "user",
      content: `Analyze this job application form.\n\nURL: ${input.url}\nPlatform hint: ${input.platform ?? "unknown"}\n\nHTML:\n${input.html}`,
    },
  ];
}
