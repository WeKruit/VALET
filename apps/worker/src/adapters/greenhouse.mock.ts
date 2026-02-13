/**
 * Mock Greenhouse adapter.
 *
 * Simulates a single-page application form typical of
 * Greenhouse-hosted job boards.
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
import { randomDelay, fakeId } from "./base.js";

export class GreenhouseMockAdapter implements IPlatformAdapter {
  readonly platform = "greenhouse" as const;

  async detectPlatform(url: string): Promise<PlatformDetection> {
    await randomDelay(200, 500);
    const isGreenhouse =
      url.includes("greenhouse.io") || url.includes("boards.greenhouse");
    return {
      platform: isGreenhouse ? "greenhouse" : "unknown",
      confidence: isGreenhouse ? 0.97 : 0.1,
      version: "2024",
    };
  }

  async getFormFlow(url: string): Promise<FormFlow> {
    await randomDelay(600, 1200);
    return {
      platform: "greenhouse",
      url,
      totalPages: 1,
      pages: [
        {
          pageIndex: 0,
          fields: [
            {
              name: "firstName",
              label: "First Name",
              type: "text",
              required: true,
              selector: "#first_name",
            },
            {
              name: "lastName",
              label: "Last Name",
              type: "text",
              required: true,
              selector: "#last_name",
            },
            {
              name: "email",
              label: "Email",
              type: "email",
              required: true,
              selector: "#email",
            },
            {
              name: "phone",
              label: "Phone",
              type: "phone",
              required: false,
              selector: "#phone",
            },
            {
              name: "resume",
              label: "Resume/CV",
              type: "file",
              required: true,
              selector: "input[type='file']#resume",
            },
            {
              name: "coverLetter",
              label: "Cover Letter",
              type: "file",
              required: false,
              selector: "input[type='file']#cover_letter",
            },
            {
              name: "linkedin",
              label: "LinkedIn Profile",
              type: "url",
              required: false,
              selector: "#linkedin_profile",
            },
            {
              name: "portfolio",
              label: "Website",
              type: "url",
              required: false,
              selector: "#website",
            },
            {
              name: "howDidYouHear",
              label: "How did you hear about this job?",
              type: "select",
              required: false,
              selector: "#job_source",
              options: [
                "LinkedIn",
                "Indeed",
                "Company Website",
                "Referral",
                "Job Board",
                "Other",
              ],
            },
            {
              name: "workAuthorization",
              label: "Are you legally authorized to work in the country where this job is based?",
              type: "select",
              required: true,
              selector: "#work_auth",
              options: ["Yes", "No"],
            },
            {
              name: "gender",
              label: "Gender (voluntary, for EEO purposes)",
              type: "select",
              required: false,
              selector: "#gender",
              options: [
                "Male",
                "Female",
                "Non-binary",
                "Prefer not to say",
              ],
            },
            {
              name: "race",
              label: "Race/Ethnicity (voluntary, for EEO purposes)",
              type: "select",
              required: false,
              selector: "#race",
              options: [
                "Asian",
                "Black or African American",
                "Hispanic or Latino",
                "White",
                "Two or more races",
                "Prefer not to say",
              ],
            },
          ],
          submitSelector: "#submit_app",
          isLastPage: true,
        },
      ],
      metadata: {
        jobTitle: "Full Stack Developer",
        company: "TechStartup Inc",
        location: "Remote",
        department: "Engineering",
      },
    };
  }

  async fillForm(flow: FormFlow, data: UserData): Promise<FillResult> {
    const filledFields: FieldMapping[] = [];

    for (const page of flow.pages) {
      for (const field of page.fields) {
        await randomDelay(80, 250);
        const value = this.resolveFieldValue(field.name, data);
        if (value !== undefined) {
          filledFields.push({
            field,
            value: String(value),
            confidence: {
              value: 0.88 + Math.random() * 0.12,
              source: "resume",
            },
            source: "resume",
            requiresReview: false,
          });
        }
      }
    }

    return {
      success: true,
      filledFields,
      skippedFields: [],
      errors: [],
      screenshotUrl: `https://mock-screenshots.local/${fakeId()}.png`,
    };
  }

  async submitApplication(_flow: FormFlow): Promise<SubmitResult> {
    await randomDelay(800, 1500);

    const success = Math.random() > 0.03; // 97% success rate
    return {
      success,
      confirmationId: success ? `GH-${Date.now()}-${Math.floor(Math.random() * 10000)}` : undefined,
      confirmationMessage: success
        ? "Thank you for applying! We will review your application and get back to you."
        : undefined,
      screenshotUrl: `https://mock-screenshots.local/${fakeId()}.png`,
    };
  }

  async verifySubmission(_flow: FormFlow): Promise<VerificationResult> {
    await randomDelay(400, 800);
    return {
      submitted: true,
      confirmationFound: true,
      confirmationId: `GH-${Date.now()}`,
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
      linkedin: data.linkedinUrl,
      portfolio: data.portfolioUrl,
      howDidYouHear: "LinkedIn",
      workAuthorization: "Yes",
      gender: "Prefer not to say",
      race: "Prefer not to say",
    };
    return mapping[fieldName];
  }
}
