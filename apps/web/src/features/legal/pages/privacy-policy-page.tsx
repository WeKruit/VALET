import * as React from "react";
import { LegalLayout } from "../components/legal-layout";
import { Link } from "react-router-dom";

export function PrivacyPolicyPage() {
  return (
    <LegalLayout
      title="WeKruit Valet — Privacy Policy"
      version="1.0"
      lastUpdated="February 2025"
    >
      <Section id="introduction" heading="1. Introduction">
        <p>
          WeKruit, Inc. ("WeKruit," "we," "us," "our") is committed to
          protecting your privacy. This Privacy Policy describes how we collect,
          use, store, and share your personal data when you use the WeKruit Valet
          service ("Service"), including our website, API, and browser extension.
        </p>
        <p>
          This policy applies to all users of the Service worldwide. If you are
          located in the European Economic Area (EEA), United Kingdom (UK), or
          Switzerland, please see Section 10 for information about your
          additional rights under the General Data Protection Regulation (GDPR).
        </p>
        <p>
          By using the Service, you consent to the data practices described in
          this policy. If you do not agree, you must not use the Service.
        </p>
      </Section>

      <Section id="data-controller" heading="2. Data Controller">
        <p>
          The data controller for personal data processed through the Service is:
        </p>
        <p>
          <strong>WeKruit, Inc.</strong>
          <br />
          Email:{" "}
          <a
            href="mailto:privacy@wekruit.com"
            className="underline underline-offset-2"
          >
            privacy@wekruit.com
          </a>
        </p>
        <p>
          For GDPR-related inquiries, you may also contact our Data Protection
          Officer at{" "}
          <a
            href="mailto:dpo@wekruit.com"
            className="underline underline-offset-2"
          >
            dpo@wekruit.com
          </a>
          .
        </p>
      </Section>

      <Section id="data-collected" heading="3. Data We Collect">
        <h3 className="font-semibold mt-4 mb-2">3.1 Data You Provide</h3>
        <Table
          headers={["Category", "Examples", "Purpose"]}
          rows={[
            [
              "Account information",
              "Name, email address, Google profile picture",
              "Account creation and authentication",
            ],
            [
              "Resume data",
              "Work history, education, skills, certifications, contact details",
              "Populating job application forms",
            ],
            [
              "Profile information",
              "Phone number, location, LinkedIn URL, portfolio URL",
              "Completing application fields",
            ],
            [
              "Q&A bank responses",
              "Answers to screening questions (work authorization, salary expectations, availability)",
              "Automated form completion",
            ],
            [
              "Autopilot configuration",
              "Company exclusion list, salary range, EEO preferences, daily limits",
              "Constraining Autopilot behavior",
            ],
          ]}
        />

        <h3 className="font-semibold mt-6 mb-2">
          3.2 Data Generated Through Service Use
        </h3>
        <Table
          headers={["Category", "Examples", "Purpose"]}
          rows={[
            [
              "Application data",
              "Job URLs, platform identifiers, form field values, submission status",
              "Core service delivery and application tracking",
            ],
            [
              "AI-generated content",
              "Form responses, cover letter text, match scores, confidence ratings",
              "Filling application forms",
            ],
            [
              "Screenshots",
              "Pre- and post-submission screenshots of application forms",
              "Audit trail and verification",
            ],
            [
              "Audit trail",
              "Event logs, state transitions, quality gate results, LLM decision reasoning",
              "Compliance, debugging, GDPR Article 22 explainability",
            ],
            [
              "LLM interaction logs",
              "Prompts sent to and responses received from AI models",
              "Service delivery, debugging, cost tracking",
            ],
            [
              "Usage metadata",
              "Timestamps, session duration, applications per session, success/failure rates",
              "Service improvement and analytics",
            ],
          ]}
        />

        <h3 className="font-semibold mt-6 mb-2">
          3.3 Data Collected Automatically
        </h3>
        <Table
          headers={["Category", "Examples", "Purpose"]}
          rows={[
            [
              "Device and browser data",
              "IP address, browser type, operating system",
              "Security, rate limiting, consent records",
            ],
            [
              "Cookies and similar technologies",
              "Session cookies (httpOnly), authentication tokens",
              "Authentication and session management",
            ],
          ]}
        />
        <p>
          We do not use advertising cookies or third-party tracking pixels.
        </p>
      </Section>

      <Section id="data-use" heading="4. How We Use Your Data">
        <p>
          We process your personal data for the following purposes:
        </p>
        <Table
          headers={["Purpose", "Legal Basis (GDPR)"]}
          rows={[
            [
              "Providing the Service (form filling, application submission)",
              "Performance of contract; Explicit consent (Autopilot)",
            ],
            [
              "Account creation and authentication",
              "Performance of contract",
            ],
            [
              "AI-powered resume parsing and form response generation",
              "Performance of contract; Explicit consent (Autopilot)",
            ],
            [
              "Screenshot capture for audit trail",
              "Legitimate interest (Copilot); Explicit consent (Autopilot)",
            ],
            [
              "Quality gate evaluation and confidence scoring",
              "Performance of contract",
            ],
            [
              "Security (fraud prevention, rate limiting, abuse detection)",
              "Legitimate interest",
            ],
            [
              "Legal compliance (consent records, audit trail retention)",
              "Legal obligation",
            ],
            [
              "Service improvement and analytics (aggregated, anonymized)",
              "Legitimate interest",
            ],
          ]}
        />
      </Section>

      <Section id="ai-processing" heading="5. AI Processing and Sub-Processors">
        <h3 className="font-semibold mt-4 mb-2">
          5.1 How AI Processes Your Data
        </h3>
        <p>
          The Service uses large language models (LLMs) to analyze job postings,
          generate form responses, score application quality, and extract
          structured data from resumes. Your personal data — including resume
          text, profile information, and job posting content — is sent to AI
          providers via their API services for processing.
        </p>
        <p>
          <strong>What AI sees:</strong> Resume content, job posting text, form
          field descriptions and labels, Q&A bank responses relevant to the
          current application, and session parameters.
        </p>
        <p>
          <strong>What AI does not see:</strong> Your authentication credentials,
          payment information, or internal system identifiers.
        </p>

        <h3 className="font-semibold mt-6 mb-2">5.2 Sub-Processors</h3>
        <Table
          headers={[
            "Provider",
            "Purpose",
            "Retention by Provider",
          ]}
          rows={[
            [
              "Anthropic (Claude API)",
              "Primary AI: form analysis, response generation, resume parsing",
              "Zero retention (enterprise API)",
            ],
            [
              "OpenAI (GPT API)",
              "Fallback AI: form analysis, response generation",
              "Zero retention (enterprise API)",
            ],
            [
              "Supabase (PostgreSQL)",
              "Database hosting",
              "Per hosting agreement",
            ],
            [
              "Supabase (Storage)",
              "Object storage (resumes, screenshots)",
              "Until deletion",
            ],
            [
              "Sentry",
              "Error tracking",
              "90 days",
            ],
          ]}
        />
        <p>
          Your personal data sent to AI sub-processors is processed via API (not
          consumer chat interfaces) and is{" "}
          <strong>not used for AI model training</strong>. We maintain signed Data
          Processing Agreements (DPAs) with all sub-processors.
        </p>
      </Section>

      <Section id="retention" heading="6. Data Retention">
        <p>
          We retain your personal data only as long as necessary for the purposes
          described in this policy:
        </p>
        <Table
          headers={["Data Category", "Retention Period"]}
          rows={[
            ["Account information", "Until account deletion + 30-day grace period"],
            ["Resume files", "Until account deletion"],
            ["Profile information", "Until account deletion"],
            ["Q&A bank responses", "Until account deletion"],
            ["Screenshots", "30 days (user-configurable, maximum 90 days)"],
            ["Application metadata", "365 days from completion"],
            ["Task/application events", "90 days"],
            ["LLM interaction logs", "90 days"],
            ["Audit trail records", "730 days (2 years)"],
            ["Consent records", "Life of account + 730 days"],
          ]}
        />
        <p>
          After the retention period expires, data is permanently deleted.
          Anonymized, aggregated data may be retained indefinitely for analytics
          purposes.
        </p>
      </Section>

      <Section id="security" heading="7. Data Security">
        <p>
          We implement appropriate technical and organizational measures to
          protect your personal data:
        </p>
        <ul>
          <li>
            <strong>Encryption in transit:</strong> All data is transmitted using
            TLS 1.2+ (HTTPS/WSS).
          </li>
          <li>
            <strong>Encryption at rest:</strong> Files stored in object storage
            use server-side encryption (SSE-S3, AES-256).
          </li>
          <li>
            <strong>Authentication:</strong> Google OAuth 2.0 with JWT RS256
            tokens stored in httpOnly, Secure, SameSite cookies.
          </li>
          <li>
            <strong>Access control:</strong> All database queries are scoped to
            the authenticated user. No user can access another user's data.
          </li>
          <li>
            <strong>PII redaction:</strong> Personally identifiable information
            is redacted from error tracking and logging services.
          </li>
        </ul>
        <p>
          Despite these measures, no system is completely secure. If we discover a
          data breach that affects your personal data, we will notify you within
          72 hours as required by applicable law.
        </p>
      </Section>

      <Section id="sharing" heading="8. Data Sharing">
        <p>
          We do not sell, rent, or trade your personal data to third parties.
        </p>
        <p>
          We share your personal data only in the following circumstances:
        </p>
        <ul>
          <li>
            <strong>With AI sub-processors</strong> to provide the Service (see
            Section 5.2).
          </li>
          <li>
            <strong>With third-party platforms</strong> when you use the Service
            to submit job applications — the application content you approve (or
            that Autopilot submits on your behalf) is transmitted to the target
            employer/platform.
          </li>
          <li>
            <strong>To comply with legal obligations</strong>, including court
            orders, subpoenas, or regulatory requests.
          </li>
          <li>
            <strong>To protect rights and safety</strong>, including enforcing our{" "}
            <Link to="/legal/terms" className="underline underline-offset-2">
              Terms of Service
            </Link>{" "}
            and protecting against fraud or security threats.
          </li>
          <li>
            <strong>In connection with a business transfer</strong>, if WeKruit
            is acquired, merged, or sells assets, your data may be transferred to
            the successor entity with prior notice.
          </li>
        </ul>
      </Section>

      <Section id="rights" heading="9. Your Rights (All Users)">
        <p>
          Regardless of your location, you have the following rights:
        </p>
        <ul>
          <li>
            <strong>Access:</strong> Request a copy of the personal data we hold
            about you.
          </li>
          <li>
            <strong>Correction:</strong> Request correction of inaccurate
            personal data.
          </li>
          <li>
            <strong>Deletion:</strong> Request deletion of your account and
            associated personal data, subject to legal retention requirements.
          </li>
          <li>
            <strong>Data export:</strong> Download your data in a structured,
            machine-readable format (JSON).
          </li>
          <li>
            <strong>Opt-out of Autopilot:</strong> Disable Autopilot Mode at any
            time via account settings or the kill switch.
          </li>
          <li>
            <strong>Withdraw consent:</strong> Withdraw any consent you have
            given, without affecting the lawfulness of prior processing.
          </li>
        </ul>
        <p>
          To exercise these rights, contact{" "}
          <a
            href="mailto:privacy@wekruit.com"
            className="underline underline-offset-2"
          >
            privacy@wekruit.com
          </a>{" "}
          or use the self-service options in your account settings.
        </p>
      </Section>

      <Section id="gdpr" heading="10. Additional Rights for EEA/UK Users (GDPR)">
        <p>
          If you are located in the EEA or UK, you have additional rights under
          the GDPR:
        </p>
        <h3 className="font-semibold mt-4 mb-2">
          10.1 Right to Restriction of Processing
        </h3>
        <p>
          You may request that we restrict processing of your personal data in
          certain circumstances, such as when you contest its accuracy.
        </p>

        <h3 className="font-semibold mt-4 mb-2">10.2 Right to Object</h3>
        <p>
          You may object to processing based on legitimate interest. We will
          cease processing unless we demonstrate compelling legitimate grounds.
        </p>

        <h3 className="font-semibold mt-4 mb-2">
          10.3 Right to Data Portability
        </h3>
        <p>
          You have the right to receive your personal data in a structured,
          commonly used, machine-readable format (JSON) and to transmit it to
          another controller.
        </p>

        <h3 className="font-semibold mt-4 mb-2">
          10.4 Automated Decision-Making (GDPR Article 22)
        </h3>
        <p>
          <strong>Copilot Mode:</strong> The final decision to submit each
          application rests with you. This does not constitute solely automated
          decision-making under Article 22.
        </p>
        <p>
          <strong>Autopilot Mode:</strong> When you use Autopilot Mode, the
          Service makes automated decisions about which applications to submit.
          This constitutes automated decision-making under GDPR Article 22. We
          rely on your <strong>explicit consent</strong> (Article 22(2)(c)) as
          the legal basis.
        </p>
        <p>Even with your consent, you retain the following rights:</p>
        <ol type="a">
          <li>
            <strong>Right to human intervention:</strong> You may request that a
            WeKruit team member review any application submitted by Autopilot.
          </li>
          <li>
            <strong>Right to express your point of view:</strong> You may
            annotate, dispute, or provide additional context for any
            Autopilot-submitted application through the audit trail.
          </li>
          <li>
            <strong>Right to contest the decision:</strong> You may challenge any
            automated decision. We will review contested decisions within five
            (5) business days.
          </li>
          <li>
            <strong>Right to meaningful explanation:</strong> For every
            Autopilot-submitted application, you can access a detailed audit
            trail showing which AI model made each decision.
          </li>
        </ol>

        <h3 className="font-semibold mt-4 mb-2">
          10.5 International Data Transfers
        </h3>
        <p>
          Your data may be processed in the United States and other countries
          where our sub-processors operate. For transfers from the EEA/UK, we
          rely on Standard Contractual Clauses (SCCs) approved by the European
          Commission.
        </p>

        <h3 className="font-semibold mt-4 mb-2">
          10.6 Supervisory Authority
        </h3>
        <p>
          If you are in the EEA or UK, you have the right to lodge a complaint
          with your local data protection authority.
        </p>
      </Section>

      <Section id="ccpa" heading="11. California Privacy Rights (CCPA/CPRA)">
        <p>
          If you are a California resident, you have additional rights under the
          CCPA and CPRA:
        </p>
        <ul>
          <li>
            <strong>Right to know</strong> what personal information we collect
            and how it is used.
          </li>
          <li>
            <strong>Right to delete</strong> your personal information, subject
            to legal exceptions.
          </li>
          <li>
            <strong>Right to opt out</strong> of the sale or sharing of personal
            information. We do not sell or share your personal information for
            cross-context behavioral advertising.
          </li>
          <li>
            <strong>Right to non-discrimination</strong> for exercising your
            privacy rights.
          </li>
        </ul>
        <p>
          To exercise these rights, contact{" "}
          <a
            href="mailto:privacy@wekruit.com"
            className="underline underline-offset-2"
          >
            privacy@wekruit.com
          </a>
          .
        </p>
      </Section>

      <Section id="children" heading="12. Children's Privacy">
        <p>
          The Service is not directed to children under 16. We do not knowingly
          collect personal data from children under 16. If we discover that we
          have collected personal data from a child under 16, we will promptly
          delete it.
        </p>
        <p>
          Autopilot Mode requires users to be at least 18 years of age.
        </p>
      </Section>

      <Section id="cookies" heading="13. Cookies">
        <p>
          We use only essential cookies required for the Service to function:
        </p>
        <Table
          headers={["Cookie", "Type", "Purpose", "Duration"]}
          rows={[
            [
              "session",
              "httpOnly, Secure, SameSite=Lax",
              "Authentication session",
              "15 minutes (refreshable)",
            ],
            [
              "refresh_token",
              "httpOnly, Secure, SameSite=Strict",
              "Token renewal",
              "7 days",
            ],
          ]}
        />
        <p>
          We do not use analytics, advertising, or third-party tracking cookies.
        </p>
      </Section>

      <Section id="changes" heading="14. Changes to This Policy">
        <p>
          We will notify you of material changes to this Privacy Policy by email
          and by posting a notice on the Service at least 30 days before the
          changes take effect.
        </p>
        <p>
          If you are using Autopilot Mode, changes to this Privacy Policy that
          affect data processing for automated decision-making will require your
          re-consent before Autopilot can be reactivated.
        </p>
      </Section>

      <Section id="contact" heading="15. Contact Us">
        <p>For privacy-related questions or to exercise your rights:</p>
        <ul>
          <li>
            <strong>Email:</strong>{" "}
            <a
              href="mailto:privacy@wekruit.com"
              className="underline underline-offset-2"
            >
              privacy@wekruit.com
            </a>
          </li>
          <li>
            <strong>Data Protection Officer:</strong>{" "}
            <a
              href="mailto:dpo@wekruit.com"
              className="underline underline-offset-2"
            >
              dpo@wekruit.com
            </a>
          </li>
        </ul>
        <p>
          We will respond to all requests within 30 days (or the shorter period
          required by applicable law).
        </p>
      </Section>
    </LegalLayout>
  );
}

function Section({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-10">
      <h2 className="font-display text-xl font-semibold mb-4">{heading}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-[var(--wk-text-primary)]">
        {children}
      </div>
    </section>
  );
}

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto my-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                className="border border-[var(--wk-border-default)] bg-[var(--wk-surface-sunken)] px-3 py-2 text-left font-semibold"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="border border-[var(--wk-border-default)] px-3 py-2"
                >
                  {j === 0 ? <strong>{cell}</strong> : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
