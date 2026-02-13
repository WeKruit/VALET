# WeKruit Valet — Privacy Policy

**Effective Date:** [DATE]
**Version:** 1.0
**Last Updated:** [DATE]

---

## 1. Introduction

WeKruit, Inc. ("WeKruit," "we," "us," "our") is committed to protecting your privacy. This Privacy Policy describes how we collect, use, store, and share your personal data when you use the WeKruit Valet service ("Service"), including our website, API, and browser extension.

This policy applies to all users of the Service worldwide. If you are located in the European Economic Area (EEA), United Kingdom (UK), or Switzerland, please see Section 10 for information about your additional rights under the General Data Protection Regulation (GDPR).

By using the Service, you consent to the data practices described in this policy. If you do not agree, you must not use the Service.

## 2. Data Controller

The data controller for personal data processed through the Service is:

**WeKruit, Inc.**
Email: privacy@wekruit.com
Address: [Company Address]

For GDPR-related inquiries, you may also contact our Data Protection Officer at dpo@wekruit.com.

## 3. Data We Collect

### 3.1 Data You Provide

| Category | Examples | Purpose |
|----------|----------|---------|
| **Account information** | Name, email address, Google profile picture | Account creation and authentication |
| **Resume data** | Work history, education, skills, certifications, contact details | Populating job application forms |
| **Profile information** | Phone number, location, LinkedIn URL, portfolio URL | Completing application fields |
| **Q&A bank responses** | Answers to screening questions (work authorization, salary expectations, availability) | Automated form completion |
| **Autopilot configuration** | Company exclusion list, salary range, EEO preferences, daily limits | Constraining Autopilot behavior |

### 3.2 Data Generated Through Service Use

| Category | Examples | Purpose |
|----------|----------|---------|
| **Application data** | Job URLs, platform identifiers, form field values, submission status | Core service delivery and application tracking |
| **AI-generated content** | Form responses, cover letter text, match scores, confidence ratings | Filling application forms |
| **Screenshots** | Pre- and post-submission screenshots of application forms | Audit trail and verification |
| **Audit trail** | Event logs, state transitions, quality gate results, LLM decision reasoning | Compliance, debugging, GDPR Article 22 explainability |
| **LLM interaction logs** | Prompts sent to and responses received from AI models (including model identifier and token counts) | Service delivery, debugging, cost tracking |
| **Usage metadata** | Timestamps, session duration, applications per session, success/failure rates | Service improvement and analytics |

### 3.3 Data Collected Automatically

| Category | Examples | Purpose |
|----------|----------|---------|
| **Device and browser data** | IP address, browser type, operating system | Security, rate limiting, consent records |
| **Cookies and similar technologies** | Session cookies (httpOnly), authentication tokens | Authentication and session management |

We do not use advertising cookies or third-party tracking pixels.

## 4. How We Use Your Data

We process your personal data for the following purposes:

| Purpose | Legal Basis (GDPR) |
|---------|-------------------|
| Providing the Service (form filling, application submission) | Performance of contract; Explicit consent (Autopilot) |
| Account creation and authentication | Performance of contract |
| AI-powered resume parsing and form response generation | Performance of contract; Explicit consent (Autopilot) |
| Screenshot capture for audit trail | Legitimate interest (Copilot); Explicit consent (Autopilot) |
| Quality gate evaluation and confidence scoring | Performance of contract |
| Post-submission summary generation | Performance of contract |
| Security (fraud prevention, rate limiting, abuse detection) | Legitimate interest |
| Legal compliance (consent records, audit trail retention) | Legal obligation |
| Service improvement and analytics (aggregated, anonymized) | Legitimate interest |
| Customer support | Performance of contract |

## 5. AI Processing and Sub-Processors

### 5.1 How AI Processes Your Data

The Service uses large language models (LLMs) to analyze job postings, generate form responses, score application quality, and extract structured data from resumes. Your personal data — including resume text, profile information, and job posting content — is sent to AI providers via their API services for processing.

**What AI sees:** Resume content, job posting text, form field descriptions and labels, Q&A bank responses relevant to the current application, and session parameters.

**What AI does not see:** Your authentication credentials, payment information, or internal system identifiers.

### 5.2 Sub-Processors

| Provider | Purpose | Data Sent | Retention by Provider | DPA in Place |
|----------|---------|-----------|----------------------|-------------|
| **Anthropic (Claude API)** | Primary AI: form analysis, response generation, resume parsing | Resume text, job posting text, form field descriptions | Zero retention (enterprise API) | Yes |
| **OpenAI (GPT API)** | Fallback AI: form analysis, response generation | Resume text, job posting text, form field descriptions | Zero retention (enterprise API) | Yes |
| **Neon / PostgreSQL** | Database hosting | All structured application data | Per hosting agreement | Yes |
| **Cloudflare R2** | Object storage (resumes, screenshots) | Uploaded files, encrypted screenshots | Until deletion | Yes |
| **Sentry** | Error tracking | Error metadata, stack traces (PII redacted) | 90 days | Yes |
| **Better Stack** | Uptime monitoring, logging | Application logs (PII redacted) | Per plan retention | Yes |

Your personal data sent to AI sub-processors is processed via API (not consumer chat interfaces) and is **not used for AI model training**. We maintain signed Data Processing Agreements (DPAs) with all sub-processors.

We will notify you before adding new sub-processors that handle personal data. If you object to a new sub-processor, you may terminate your account.

## 6. Data Retention

We retain your personal data only as long as necessary for the purposes described in this policy:

| Data Category | Retention Period | Basis |
|--------------|-----------------|-------|
| Account information | Until account deletion + 30-day grace period | Contract performance |
| Resume files | Until account deletion | Contract performance |
| Profile information | Until account deletion | Contract performance |
| Q&A bank responses | Until account deletion | Contract performance |
| Screenshots | 30 days (user-configurable, maximum 90 days) | Legitimate interest / Explicit consent |
| Application metadata | 365 days from completion | Legitimate interest |
| Task/application events | 90 days | Legitimate interest |
| LLM interaction logs | 90 days | Debugging and explainability |
| Audit trail records | 730 days (2 years) | Legal obligation (statute of limitations) |
| Consent records | Life of account + 730 days | Legal obligation |

After the retention period expires, data is permanently deleted. Anonymized, aggregated data may be retained indefinitely for analytics purposes.

## 7. Data Security

We implement appropriate technical and organizational measures to protect your personal data:

- **Encryption in transit:** All data is transmitted using TLS 1.2+ (HTTPS/WSS).
- **Encryption at rest:** Files stored in object storage use server-side encryption (SSE-S3, AES-256).
- **Authentication:** Google OAuth 2.0 with JWT RS256 tokens stored in httpOnly, Secure, SameSite cookies.
- **Access control:** All database queries are scoped to the authenticated user (RLS-style userId filtering). No user can access another user's data.
- **Infrastructure security:** Helmet.js security headers, Content Security Policy (CSP), CORS restrictions, rate limiting per user and per platform.
- **PII redaction:** Personally identifiable information is redacted from error tracking and logging services.
- **Dependency security:** Automated vulnerability scanning (npm audit) in our CI/CD pipeline.

Despite these measures, no system is completely secure. If we discover a data breach that affects your personal data, we will notify you within 72 hours as required by applicable law.

## 8. Data Sharing

We do not sell, rent, or trade your personal data to third parties.

We share your personal data only in the following circumstances:

- **With AI sub-processors** to provide the Service (see Section 5.2).
- **With third-party platforms** when you use the Service to submit job applications — the application content you approve (or that Autopilot submits on your behalf) is transmitted to the target employer/platform.
- **To comply with legal obligations**, including court orders, subpoenas, or regulatory requests.
- **To protect rights and safety**, including enforcing our Terms of Service and protecting against fraud or security threats.
- **In connection with a business transfer**, if WeKruit is acquired, merged, or sells assets, your data may be transferred to the successor entity with prior notice.

## 9. Your Rights (All Users)

Regardless of your location, you have the following rights:

- **Access:** Request a copy of the personal data we hold about you.
- **Correction:** Request correction of inaccurate personal data.
- **Deletion:** Request deletion of your account and associated personal data, subject to legal retention requirements.
- **Data export:** Download your data in a structured, machine-readable format (JSON).
- **Opt-out of Autopilot:** Disable Autopilot Mode at any time via account settings or the kill switch.
- **Withdraw consent:** Withdraw any consent you have given, without affecting the lawfulness of prior processing.

To exercise these rights, contact privacy@wekruit.com or use the self-service options in your account settings.

## 10. Additional Rights for EEA/UK Users (GDPR)

If you are located in the EEA or UK, you have additional rights under the GDPR:

### 10.1 Right to Restriction of Processing

You may request that we restrict processing of your personal data in certain circumstances, such as when you contest its accuracy.

### 10.2 Right to Object

You may object to processing based on legitimate interest. We will cease processing unless we demonstrate compelling legitimate grounds.

### 10.3 Right to Data Portability

You have the right to receive your personal data in a structured, commonly used, machine-readable format (JSON) and to transmit it to another controller.

### 10.4 Automated Decision-Making (GDPR Article 22)

**Copilot Mode:** The final decision to submit each application rests with you. While AI generates form responses, you review and approve all content. This does not constitute solely automated decision-making under Article 22.

**Autopilot Mode:** When you use Autopilot Mode, the Service makes automated decisions about which applications to submit and what content to include. This constitutes automated decision-making under GDPR Article 22. We rely on your **explicit consent** (Article 22(2)(c)) as the legal basis.

Even with your consent, you retain the following rights under Article 22(3):

  (a) **Right to human intervention:** You may request that a WeKruit team member review any application submitted by Autopilot. Use the "Flag Issue" feature in your post-submission summary or contact support@wekruit.com.

  (b) **Right to express your point of view:** You may annotate, dispute, or provide additional context for any Autopilot-submitted application through the audit trail in your dashboard.

  (c) **Right to contest the decision:** You may challenge any automated decision. We will review contested decisions within five (5) business days and take appropriate corrective action.

  (d) **Right to meaningful explanation:** For every Autopilot-submitted application, you can access a detailed audit trail showing which AI model made each decision, the confidence score, the source of each form value, and the reasoning behind the match score.

### 10.5 International Data Transfers

Your data may be processed in the United States and other countries where our sub-processors operate. For transfers from the EEA/UK, we rely on Standard Contractual Clauses (SCCs) approved by the European Commission and UK addendums where applicable.

### 10.6 Supervisory Authority

If you are in the EEA or UK, you have the right to lodge a complaint with your local data protection authority.

## 11. California Privacy Rights (CCPA/CPRA)

If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA):

- **Right to know** what personal information we collect and how it is used.
- **Right to delete** your personal information, subject to legal exceptions.
- **Right to opt out** of the sale or sharing of personal information. We do not sell or share your personal information for cross-context behavioral advertising.
- **Right to non-discrimination** for exercising your privacy rights.

To exercise these rights, contact privacy@wekruit.com.

## 12. Children's Privacy

The Service is not directed to children under 16. We do not knowingly collect personal data from children under 16. If we discover that we have collected personal data from a child under 16, we will promptly delete it.

Autopilot Mode requires users to be at least 18 years of age.

## 13. Cookies

We use only essential cookies required for the Service to function:

| Cookie | Type | Purpose | Duration |
|--------|------|---------|----------|
| `session` | httpOnly, Secure, SameSite=Lax | Authentication session | 15 minutes (refreshable) |
| `refresh_token` | httpOnly, Secure, SameSite=Strict | Token renewal | 7 days |

We do not use analytics, advertising, or third-party tracking cookies.

## 14. Changes to This Policy

We will notify you of material changes to this Privacy Policy by email and by posting a notice on the Service at least 30 days before the changes take effect.

If you are using Autopilot Mode, changes to this Privacy Policy that affect data processing for automated decision-making will require your re-consent before Autopilot can be reactivated.

## 15. Contact Us

For privacy-related questions or to exercise your rights:

- **Email:** privacy@wekruit.com
- **Data Protection Officer:** dpo@wekruit.com
- **Address:** [Company Address]

We will respond to all requests within 30 days (or the shorter period required by applicable law).

---

*This Privacy Policy is a draft for internal review and development purposes. All content must be reviewed and approved by qualified legal counsel and a data protection advisor before use in production.*
