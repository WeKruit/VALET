/**
 * Mock LinkedIn Easy Apply adapter.
 *
 * Simulates a 4-page Easy Apply flow with realistic field data
 * and delays. Used for frontend/backend integration testing while
 * Stagehand implementation is deferred.
 */
import type {
  IPlatformAdapter,
  PlatformDetection,
  FormFlow,
  FillResult,
  SubmitResult,
  VerificationResult,
  UserData,
  FieldMapping,
} from "@valet/shared/types";
import { delay, randomDelay, fakeId } from "./base.js";

export class LinkedInMockAdapter implements IPlatformAdapter {
  readonly platform = "linkedin" as const;

  async detectPlatform(url: string): Promise<PlatformDetection> {
    await randomDelay(200, 500);
    const isLinkedIn = url.includes("linkedin.com");
    return {
      platform: isLinkedIn ? "linkedin" : "unknown",
      confidence: isLinkedIn ? 0.98 : 0.1,
      version: "2024",
      isEasyApply: isLinkedIn && (url.includes("easy-apply") || !url.includes("external")),
    };
  }

  async getFormFlow(url: string): Promise<FormFlow> {
    await randomDelay(800, 1500);
    return {
      platform: "linkedin",
      url,
      totalPages: 4,
      pages: [
        {
          pageIndex: 0,
          fields: [
            {
              name: "firstName",
              label: "First name",
              type: "text",
              required: true,
              selector: "input[name='firstName']",
            },
            {
              name: "lastName",
              label: "Last name",
              type: "text",
              required: true,
              selector: "input[name='lastName']",
            },
            {
              name: "email",
              label: "Email address",
              type: "email",
              required: true,
              selector: "input[name='email']",
            },
            {
              name: "phone",
              label: "Phone number",
              type: "phone",
              required: true,
              selector: "input[name='phone']",
            },
          ],
          nextSelector: "button[aria-label='Continue to next step']",
          isLastPage: false,
        },
        {
          pageIndex: 1,
          fields: [
            {
              name: "resume",
              label: "Upload resume",
              type: "file",
              required: true,
              selector: "input[type='file']",
            },
          ],
          nextSelector: "button[aria-label='Continue to next step']",
          isLastPage: false,
        },
        {
          pageIndex: 2,
          fields: [
            {
              name: "yearsExperience",
              label: "How many years of experience do you have with React?",
              type: "select",
              required: true,
              selector: "select[name='yearsExperience']",
              options: ["Less than 1", "1-3", "3-5", "5-7", "7+"],
            },
            {
              name: "workAuthorization",
              label: "Are you authorized to work in the United States?",
              type: "radio",
              required: true,
              selector: "fieldset[data-field='workAuthorization']",
              options: ["Yes", "No"],
            },
            {
              name: "sponsorship",
              label: "Will you now or in the future require sponsorship?",
              type: "radio",
              required: true,
              selector: "fieldset[data-field='sponsorship']",
              options: ["Yes", "No"],
            },
          ],
          nextSelector: "button[aria-label='Continue to next step']",
          isLastPage: false,
        },
        {
          pageIndex: 3,
          fields: [
            {
              name: "coverLetter",
              label: "Cover letter (optional)",
              type: "textarea",
              required: false,
              selector: "textarea[name='coverLetter']",
              maxLength: 2000,
            },
          ],
          submitSelector: "button[aria-label='Submit application']",
          isLastPage: true,
        },
      ],
      metadata: {
        jobTitle: "Senior Software Engineer",
        company: "Acme Corp",
        location: "San Francisco, CA",
        postedDate: "2 days ago",
        applicantCount: 142,
      },
    };
  }

  async fillForm(flow: FormFlow, data: UserData): Promise<FillResult> {
    const filledFields: FieldMapping[] = [];
    const skippedFields: { field: string; error: string }[] = [];

    for (const page of flow.pages) {
      await randomDelay(500, 1000); // page navigation delay
      for (const field of page.fields) {
        await randomDelay(100, 300); // per-field fill delay

        const value = this.resolveFieldValue(field.name, data);
        if (value !== undefined) {
          filledFields.push({
            field,
            value: String(value),
            confidence: {
              value: field.type === "file" ? 1.0 : 0.85 + Math.random() * 0.15,
              source: field.name === "coverLetter" ? "llm_generated" : "resume",
            },
            source: field.name === "coverLetter" ? "llm_generated" : "resume",
            requiresReview: field.name === "coverLetter",
          });
        }
      }
    }

    return {
      success: true,
      filledFields,
      skippedFields: [],
      errors: skippedFields,
      screenshotUrl: `https://mock-screenshots.local/${fakeId()}.png`,
    };
  }

  async submitApplication(_flow: FormFlow): Promise<SubmitResult> {
    await randomDelay(1000, 2000);

    // 95% success rate
    const success = Math.random() > 0.05;
    return {
      success,
      confirmationId: success ? `LI-${Date.now()}-${Math.floor(Math.random() * 10000)}` : undefined,
      confirmationMessage: success
        ? "Your application was sent to Acme Corp"
        : undefined,
      screenshotUrl: `https://mock-screenshots.local/${fakeId()}.png`,
      redirectUrl: success ? "https://www.linkedin.com/jobs/applied/" : undefined,
    };
  }

  async verifySubmission(_flow: FormFlow): Promise<VerificationResult> {
    await randomDelay(500, 1000);
    return {
      submitted: true,
      confirmationFound: true,
      confirmationId: `LI-${Date.now()}`,
      errorMessages: [],
      screenshotUrl: `https://mock-screenshots.local/${fakeId()}.png`,
    };
  }

  private resolveFieldValue(
    fieldName: string,
    data: UserData,
  ): string | undefined {
    const mapping: Record<string, string | undefined> = {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      resume: data.resumeUrl,
      yearsExperience:
        data.yearsOfExperience !== undefined
          ? data.yearsOfExperience >= 7
            ? "7+"
            : data.yearsOfExperience >= 5
              ? "5-7"
              : data.yearsOfExperience >= 3
                ? "3-5"
                : data.yearsOfExperience >= 1
                  ? "1-3"
                  : "Less than 1"
          : "3-5",
      workAuthorization: "Yes",
      sponsorship: "No",
      coverLetter: undefined, // LLM-generated later
    };
    return mapping[fieldName];
  }
}
