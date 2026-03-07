import { z } from "zod";

export const LOCAL_WORKER_PROFILE_SCHEMA_VERSION = "local_worker_profile.v1" as const;
export type LocalWorkerProfileSchemaVersion = typeof LOCAL_WORKER_PROFILE_SCHEMA_VERSION;

export const LocalWorkerEducationEntryV1Schema = z.object({
  school: z.string(),
  degree: z.string(),
  field: z.string(),
  gpa: z.string().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
});

export const LocalWorkerExperienceEntryV1Schema = z.object({
  company: z.string(),
  title: z.string(),
  location: z.string().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  description: z.string(),
});

export const LocalWorkerProfileV1Schema = z
  .object({
    firstName: z.string().min(1, "firstName is required"),
    lastName: z.string().min(1, "lastName is required"),
    email: z.string().min(1, "email is required"),
    phone: z.string(),
    linkedIn: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
    education: z.array(LocalWorkerEducationEntryV1Schema),
    experience: z.array(LocalWorkerExperienceEntryV1Schema),
    skills: z.array(z.string()).optional(),
    qaAnswers: z.record(z.string(), z.string()).optional(),
    workAuthorization: z.string().optional(),
    visaSponsorship: z.string().optional(),
    gender: z.string().optional(),
    raceEthnicity: z.string().optional(),
    veteranStatus: z.string().optional(),
    disabilityStatus: z.string().optional(),
  })
  .passthrough();

export type LocalWorkerProfileV1 = z.infer<typeof LocalWorkerProfileV1Schema>;
export type LocalWorkerProfileSource = "canonical" | "legacy_user_data";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const filtered = value.filter((item): item is string => typeof item === "string");
  return filtered.length > 0 ? filtered : undefined;
}

function yearString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const yearMatch = trimmed.match(/\d{4}/);
    return yearMatch?.[0];
  }

  return undefined;
}

function mapEducation(value: unknown): LocalWorkerProfileV1["education"] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      const obj = asRecord(entry) ?? {};
      const graduationYear = yearString(obj.graduation_year);
      const school = asString(obj.school ?? obj.institution);
      const startDate = asString(obj.startDate ?? obj.start_date) || graduationYear || "";
      const endDate = asOptionalString(obj.endDate ?? obj.end_date) ?? graduationYear;

      return {
        school,
        degree: asString(obj.degree),
        field: asString(obj.field ?? obj.field_of_study ?? obj.fieldOfStudy),
        gpa: asOptionalString(obj.gpa),
        startDate,
        endDate,
      };
    })
    .filter((e) => e.school.length > 0);
}

function mapExperience(value: unknown): LocalWorkerProfileV1["experience"] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      const obj = asRecord(entry) ?? {};
      return {
        company: asString(obj.company),
        title: asString(obj.title),
        location: asOptionalString(obj.location),
        startDate: asString(obj.startDate ?? obj.start_date),
        endDate: asOptionalString(obj.endDate ?? obj.end_date),
        description: asString(obj.description),
      };
    })
    .filter((e) => e.company.length > 0);
}

export function parseLocalWorkerProfileV1(value: unknown): LocalWorkerProfileV1 {
  return LocalWorkerProfileV1Schema.parse(value);
}

export function safeParseLocalWorkerProfileV1(value: unknown) {
  return LocalWorkerProfileV1Schema.safeParse(value);
}

export function fromGhUserDataToLocalProfile(raw: unknown): LocalWorkerProfileV1 {
  const source = asRecord(raw);
  if (!source) {
    throw new Error("Local worker profile conversion requires an object payload");
  }

  const qaRaw = source.qaAnswers ?? source.qa_overrides;
  const qaAnswers = asRecord(qaRaw);

  const profile: LocalWorkerProfileV1 = {
    firstName: asString(source.firstName ?? source.first_name),
    lastName: asString(source.lastName ?? source.last_name),
    email: asString(source.email),
    phone: asString(source.phone),
    linkedIn: asOptionalString(source.linkedIn ?? source.linkedin_url),
    address: asOptionalString(source.address),
    city: asOptionalString(source.city),
    state: asOptionalString(source.state),
    zipCode: asOptionalString(source.zipCode ?? source.zip_code),
    education: mapEducation(source.education),
    experience: mapExperience(source.experience ?? source.work_history),
    skills: asStringArray(source.skills),
    qaAnswers: qaAnswers ? (qaAnswers as Record<string, string>) : undefined,
    workAuthorization: asOptionalString(source.workAuthorization ?? source.work_authorization),
    visaSponsorship: asOptionalString(source.visaSponsorship ?? source.visa_sponsorship),
    gender: asOptionalString(source.gender),
    raceEthnicity: asOptionalString(source.raceEthnicity ?? source.race_ethnicity),
    veteranStatus: asOptionalString(source.veteranStatus ?? source.veteran_status),
    disabilityStatus: asOptionalString(source.disabilityStatus ?? source.disability_status),
  };

  return parseLocalWorkerProfileV1(profile);
}

export function fromLocalProfileToGhUserData(raw: unknown): Record<string, unknown> {
  const profile = parseLocalWorkerProfileV1(raw);

  return {
    first_name: profile.firstName,
    last_name: profile.lastName,
    email: profile.email,
    phone: profile.phone || undefined,
    linkedin_url: profile.linkedIn,
    work_authorization: profile.workAuthorization,
    visa_sponsorship: profile.visaSponsorship,
    gender: profile.gender,
    race_ethnicity: profile.raceEthnicity,
    veteran_status: profile.veteranStatus,
    disability_status: profile.disabilityStatus,
    skills: profile.skills,
    education: profile.education.map((entry) => ({
      // GH expects numeric graduation_year.
      graduation_year: (() => {
        const year = yearString(entry.endDate ?? entry.startDate);
        return year ? Number(year) : undefined;
      })(),
      institution: entry.school,
      degree: entry.degree,
      field: entry.field,
    })),
    work_history: profile.experience.map((entry) => ({
      company: entry.company,
      title: entry.title,
      location: entry.location,
      start_date: entry.startDate,
      end_date: entry.endDate,
      description: entry.description,
    })),
  };
}

export function parseLocalWorkerProfileFromInputData(inputData: Record<string, unknown>): {
  profile: LocalWorkerProfileV1;
  source: LocalWorkerProfileSource;
} {
  const schemaVersion = inputData.profile_schema_version;
  if (schemaVersion !== undefined && schemaVersion !== null) {
    if (typeof schemaVersion !== "string") {
      throw new Error("profile_schema_version must be a string");
    }
    if (schemaVersion !== LOCAL_WORKER_PROFILE_SCHEMA_VERSION) {
      throw new Error(`Unsupported local worker profile schema version: ${schemaVersion}`);
    }
    if (!("local_worker_profile" in inputData)) {
      throw new Error("profile_schema_version requires local_worker_profile payload");
    }
  }

  if ("local_worker_profile" in inputData) {
    const parsedCanonical = safeParseLocalWorkerProfileV1(inputData.local_worker_profile);
    if (!parsedCanonical.success) {
      throw new Error(`local_worker_profile invalid: ${parsedCanonical.error.message}`);
    }
    return { profile: parsedCanonical.data, source: "canonical" };
  }

  return {
    profile: fromGhUserDataToLocalProfile(inputData.user_data),
    source: "legacy_user_data",
  };
}
