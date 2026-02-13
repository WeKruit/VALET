/**
 * Consent text strings for the 5-layer progressive consent model.
 *
 * Aligned with doc 06 Section 3 (Waiver & Consent Architecture).
 * Each layer requires explicit, informed, un-pre-checked consent.
 *
 * All consent text is versioned. When any text changes, the version
 * must be incremented and users must re-consent before continuing.
 */

// ---------------------------------------------------------------------------
// Layer 1: Registration (ToS + Privacy Policy acceptance)
// ---------------------------------------------------------------------------

export const LAYER_1_REGISTRATION = {
  version: "1.0",
  type: "tos_acceptance" as const,
  title: "Terms and Privacy",
  checkboxLabel:
    'By creating an account, I agree to the <a href="/legal/terms" target="_blank">Terms of Service</a> and <a href="/legal/privacy" target="_blank">Privacy Policy</a>.',
  description:
    "You must accept the Terms of Service and Privacy Policy to create a WeKruit account. These documents describe how we collect, process, and protect your data.",
} as const;

// ---------------------------------------------------------------------------
// Layer 2: Copilot Disclaimer (platform risk acknowledgment)
// ---------------------------------------------------------------------------

export const LAYER_2_COPILOT_DISCLAIMER = {
  version: "1.0",
  type: "copilot_disclaimer" as const,
  title: "Copilot Mode — Important Information",
  preamble:
    "Before using WeKruit Copilot to assist with job applications, please read and acknowledge the following:",
  risks: [
    {
      heading: "Platform Terms of Service",
      body: "Job platforms such as LinkedIn, Greenhouse, Lever, and Workday may prohibit the use of automated tools in their Terms of Service. Using WeKruit Copilot may violate these terms and could result in account warnings, restrictions, or permanent bans on those platforms.",
    },
    {
      heading: "Account Restrictions",
      body: "WeKruit implements conservative rate limits and human-like timing to minimize detection risk, but no automated tool can guarantee that your account will not be flagged. You assume the risk of any actions taken by third-party platforms in response to your use of this service.",
    },
    {
      heading: "Application Accuracy",
      body: "WeKruit uses AI to fill application forms. While you review every field before submission in Copilot mode, the AI-generated suggestions may contain errors. You are responsible for reviewing and correcting all information before approving each submission.",
    },
    {
      heading: "Data Processing",
      body: "Your resume, profile data, and application responses are processed by AI language models (Anthropic Claude, OpenAI GPT) via their API services. Your data is not used for model training. See our Privacy Policy for full details on data processing and sub-processors.",
    },
  ],
  checkboxLabel:
    "I understand and accept the risks described above, including the possibility of account restrictions on third-party platforms.",
  cancelLabel: "Cancel",
  acceptLabel: "I Accept — Enable Copilot",
} as const;

// ---------------------------------------------------------------------------
// Layer 3: Autopilot Opt-In (typed confirmation, enhanced informed consent)
// ---------------------------------------------------------------------------

export const LAYER_3_AUTOPILOT_CONSENT = {
  version: "1.0",
  type: "autopilot_consent" as const,
  title: "Autopilot Mode — Informed Consent and Authorization",
  preamble:
    "Autopilot Mode allows WeKruit to automatically submit job applications on your behalf without requiring your review of each individual application before submission.",
  explanationItems: [
    {
      heading: "Applications are submitted without your individual review",
      body: "Once Autopilot submits an application, it cannot be guaranteed to be retrievable. You will receive a summary of all submitted applications within 24 hours, but some applications may not be reversible.",
    },
    {
      heading: "AI-generated responses may contain errors",
      body: "While our system uses quality gates and confidence scoring, no AI system is perfect. There is a risk that the system may submit responses that do not accurately reflect your qualifications, preferences, or intent.",
    },
    {
      heading: "Third-party platform risks are elevated",
      body: "Automated submissions without per-application user review are more likely to trigger platform detection systems than Copilot mode. The risk of account restrictions is higher in Autopilot mode, especially on LinkedIn.",
    },
    {
      heading: "You are legally responsible for submitted applications",
      body: "Under applicable law (including the Uniform Electronic Transactions Act), applications submitted by Autopilot on your behalf are legally attributable to you, as if you had submitted them manually.",
    },
    {
      heading: "You can stop at any time",
      body: 'You can stop Autopilot immediately using the kill switch (the red STOP button or Ctrl+Shift+K). All pending applications will be cancelled within 2 seconds.',
    },
  ],
  checkboxes: [
    {
      id: "consent_autopilot_submission",
      label:
        "I understand that Autopilot Mode will submit job applications on my behalf without my individual review of each application.",
    },
    {
      id: "consent_ai_content",
      label:
        "I understand that submitted applications may contain AI-generated content that could be inaccurate, and I accept responsibility for reviewing post-submission summaries.",
    },
    {
      id: "consent_platform_risk",
      label:
        "I understand that using automated tools may violate the Terms of Service of third-party platforms and could result in account restrictions or bans.",
    },
    {
      id: "consent_legal_attribution",
      label:
        "I understand that applications submitted by Autopilot are legally attributable to me under applicable law.",
    },
    {
      id: "consent_age_capacity",
      label:
        "I am at least 18 years of age and have the legal capacity to authorize an electronic agent to act on my behalf.",
    },
    {
      id: "consent_profile_accuracy",
      label:
        "I have configured my Q&A bank and profile to accurately reflect my qualifications and preferences, including salary expectations and EEO response preferences.",
    },
    {
      id: "consent_screenshots",
      label:
        "I consent to WeKruit capturing and storing screenshots of applications submitted in Autopilot Mode for my audit trail.",
    },
    {
      id: "consent_revocation",
      label:
        "I understand that I can revoke this authorization at any time by using the kill switch or disabling Autopilot in my account settings.",
    },
  ],
  typedConfirmation: {
    instruction: "To confirm your authorization, please type the following phrase:",
    phrase: "I authorize WeKruit to submit applications on my behalf",
    placeholder: "Type the phrase above to confirm...",
  },
  legalNote:
    'By clicking "Activate Autopilot," you agree to the Autopilot-specific terms in our Terms of Service and the automated decision-making disclosures in our Privacy Policy.',
  consentVersionNote:
    "Your consent will be recorded with timestamp, IP address, and session metadata.",
  cancelLabel: "Cancel",
  acceptLabel: "Activate Autopilot",
} as const;

// ---------------------------------------------------------------------------
// Layer 4: Per-Session Autopilot Consent (parameter review and confirmation)
// ---------------------------------------------------------------------------

export const LAYER_4_SESSION_CONSENT = {
  version: "1.0",
  type: "autopilot_session" as const,
  title: "Start Autopilot Session",
  description:
    "Review your session parameters before starting Autopilot. These settings determine what the system will do during this session.",
  editableParameters: [
    {
      key: "platforms",
      label: "Platforms",
      description: "Which platforms to target this session",
    },
    {
      key: "maxApplications",
      label: "Maximum applications this session",
      description: "The system will stop after reaching this limit",
      min: 5,
      max: 25,
      default: 15,
    },
    {
      key: "sessionTimeLimit",
      label: "Session time limit",
      description: "The session will end after this duration",
      options: ["30 minutes", "1 hour", "2 hours", "4 hours"],
      default: "2 hours",
    },
    {
      key: "resumeId",
      label: "Resume",
      description: "The resume to use for applications in this session",
    },
    {
      key: "salaryRange",
      label: "Salary range",
      description: "Only applied if the application asks for salary expectations",
    },
  ],
  fixedParameters: [
    {
      label: "Quality threshold",
      value: "80% minimum confidence",
      editable: false,
      reason: "This threshold cannot be lowered to protect application quality.",
    },
    {
      label: "Background check consent",
      value: "Block and notify me",
      editable: false,
      reason: "Legal consent fields are never auto-filled.",
    },
    {
      label: "SSN / ID fields",
      value: "Block and notify me",
      editable: false,
      reason: "Sensitive identity fields are never auto-filled.",
    },
  ],
  killSwitchReminder:
    "Press Ctrl+Shift+K or click the red STOP button at any time to immediately stop Autopilot.",
  cancelLabel: "Cancel",
  startLabel: "Start Autopilot Session",
} as const;

// ---------------------------------------------------------------------------
// Layer 5: Configuration (limits, preferences, sensitive field handling)
// ---------------------------------------------------------------------------

export const LAYER_5_CONFIGURATION = {
  version: "1.0",
  type: "autopilot_configuration" as const,
  title: "Autopilot Configuration",
  description:
    "Configure your Autopilot preferences. These settings are saved and used for all future sessions unless you change them.",
  sections: [
    {
      heading: "EEO / Demographic Questions",
      description:
        'Choose how Autopilot handles Equal Employment Opportunity questions. We strongly recommend "Decline to answer" to avoid any risk of misrepresentation.',
      fields: [
        {
          key: "eeo_race",
          label: "Race / Ethnicity",
          default: "decline_to_answer",
          options: ["decline_to_answer", "use_configured_value"],
        },
        {
          key: "eeo_gender",
          label: "Gender",
          default: "decline_to_answer",
          options: ["decline_to_answer", "use_configured_value"],
        },
        {
          key: "eeo_disability",
          label: "Disability Status",
          default: "decline_to_answer",
          options: ["decline_to_answer", "use_configured_value"],
        },
        {
          key: "eeo_veteran",
          label: "Veteran Status",
          default: "decline_to_answer",
          options: ["decline_to_answer", "use_configured_value"],
        },
      ],
    },
    {
      heading: "Company Exclusion List",
      description:
        "Companies on this list will never receive Autopilot applications. This is mandatory for Autopilot mode — add at minimum your current employer.",
      required: true,
      placeholder: "Add company names...",
    },
    {
      heading: "Salary Preferences",
      description:
        "If an application asks for salary expectations, Autopilot will use this range. If not set, Autopilot will skip salary fields or use 'Open to discussion'.",
      fields: [
        { key: "salary_min", label: "Minimum", placeholder: "$0" },
        { key: "salary_max", label: "Maximum", placeholder: "$0" },
        { key: "salary_currency", label: "Currency", default: "USD" },
      ],
    },
    {
      heading: "Daily Limits",
      description:
        "Maximum number of applications Autopilot can submit per day across all sessions. Platform-specific limits also apply.",
      fields: [
        {
          key: "max_daily_total",
          label: "Total daily limit",
          min: 5,
          max: 25,
          default: 25,
        },
        {
          key: "max_daily_linkedin",
          label: "LinkedIn daily limit",
          min: 1,
          max: 10,
          default: 10,
        },
      ],
    },
  ],
  saveLabel: "Save Configuration",
} as const;

// ---------------------------------------------------------------------------
// Aggregate export for convenience
// ---------------------------------------------------------------------------

export const CONSENT_LAYERS = {
  REGISTRATION: LAYER_1_REGISTRATION,
  COPILOT_DISCLAIMER: LAYER_2_COPILOT_DISCLAIMER,
  AUTOPILOT_CONSENT: LAYER_3_AUTOPILOT_CONSENT,
  SESSION_CONSENT: LAYER_4_SESSION_CONSENT,
  CONFIGURATION: LAYER_5_CONFIGURATION,
} as const;
