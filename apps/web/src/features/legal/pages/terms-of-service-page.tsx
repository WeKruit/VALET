import * as React from "react";
import { LegalLayout } from "../components/legal-layout";
import { Link } from "react-router-dom";

export function TermsOfServicePage() {
  return (
    <LegalLayout
      title="WeKruit Valet — Terms of Service"
      version="1.0"
      lastUpdated="February 2025"
    >
      <Section id="acceptance" heading="1. Acceptance of Terms">
        <p>
          By accessing or using the WeKruit Valet service ("Service"), including
          our website, API, browser extension, and any related applications, you
          ("User," "you") agree to be bound by these Terms of Service ("Terms").
          If you do not agree to these Terms, you must not use the Service.
        </p>
        <p>
          WeKruit, Inc. ("WeKruit," "we," "us," "our") reserves the right to
          update these Terms at any time. We will notify you of material changes
          by email and by posting a notice on the Service. Your continued use of
          the Service after such changes constitutes acceptance of the updated
          Terms. If you are using Autopilot Mode, material changes to these Terms
          will require your re-consent before Autopilot can be reactivated.
        </p>
      </Section>

      <Section id="description" heading="2. Description of Service">
        <p>WeKruit Valet is a dual-mode AI-assisted job application tool:</p>
        <ul>
          <li>
            <strong>Copilot Mode</strong> (default): The Service uses artificial
            intelligence to analyze job postings, fill application forms, and
            generate responses to screening questions. In Copilot Mode, you
            review every field and explicitly approve every application before
            submission.
          </li>
          <li>
            <strong>Autopilot Mode</strong> (optional, earned): After meeting
            eligibility requirements, you may activate Autopilot Mode, which
            allows the Service to submit applications on your behalf within
            parameters you define, without per-application review. Autopilot Mode
            is subject to additional terms in Section 10.
          </li>
        </ul>
        <p>
          The Service operates using anti-detect browser technology, residential
          proxies, and large language models (LLMs) to automate the job
          application process on third-party platforms including, but not limited
          to, LinkedIn, Greenhouse, Lever, and Workday.
        </p>
      </Section>

      <Section id="eligibility" heading="3. Eligibility">
        <p>
          You must be at least 16 years of age to use the Service in Copilot
          Mode. You must be at least 18 years of age and have the legal capacity
          to authorize an electronic agent to act on your behalf to use Autopilot
          Mode. By using the Service, you represent and warrant that you meet the
          applicable age requirements.
        </p>
      </Section>

      <Section id="account" heading="4. Account Registration and Security">
        <p>
          4.1. You must register for an account using a valid Google account via
          OAuth 2.0 authentication. You are responsible for maintaining the
          security of your account credentials.
        </p>
        <p>
          4.2. You agree to provide accurate, current, and complete information
          during registration and to update such information as necessary.
        </p>
        <p>
          4.3. You are solely responsible for all activity that occurs under your
          account. You must notify us immediately of any unauthorized use of your
          account.
        </p>
        <p>
          4.4. We reserve the right to suspend or terminate accounts that we
          reasonably believe are being used fraudulently or in violation of these
          Terms.
        </p>
      </Section>

      <Section id="acceptable-use" heading="5. Acceptable Use">
        <p>
          5.1. You agree to use the Service only for legitimate job-seeking
          purposes. You must not use the Service to:
        </p>
        <ul>
          <li>
            Submit applications to positions for which you are clearly
            unqualified with the intent to waste employer resources.
          </li>
          <li>
            Submit false, misleading, or fraudulent information in any
            application.
          </li>
          <li>
            Interfere with or disrupt third-party platforms, their
            infrastructure, or other users' experiences.
          </li>
          <li>
            Circumvent technical measures implemented by third-party platforms
            designed to prevent automated access, including but not limited to
            CAPTCHAs, rate limits, and bot detection systems, except as
            facilitated by normal use of the Service.
          </li>
          <li>
            Use the Service in any manner that violates applicable law or
            regulation.
          </li>
          <li>
            Resell, sublicense, or provide access to the Service to third
            parties.
          </li>
        </ul>
        <p>
          5.2. You acknowledge that the Service is designed for individual use.
          Each account must correspond to a single natural person who is the
          actual job applicant.
        </p>
      </Section>

      <Section id="third-party" heading="6. Third-Party Platform Risks">
        <p>
          6.1. The Service interacts with third-party job platforms ("Platforms")
          that are not owned, controlled, or operated by WeKruit. These Platforms
          have their own Terms of Service, which may prohibit or restrict
          automated tools.
        </p>
        <p>
          <strong>6.2. You acknowledge and agree that:</strong>
        </p>
        <ol type="a">
          <li>
            Using the Service may violate the Terms of Service of one or more
            Platforms.
          </li>
          <li>
            Platforms may take action against your account, including warnings,
            temporary restrictions, permanent suspensions, or bans, in response
            to automated activity.
          </li>
          <li>
            WeKruit has no control over Platform enforcement decisions and cannot
            guarantee the continued availability of your accounts on any
            Platform.
          </li>
          <li>
            WeKruit is not responsible for any consequences arising from Platform
            enforcement actions, including but not limited to loss of account
            access, loss of connections or data, reputational harm, or missed job
            opportunities.
          </li>
        </ol>
        <p>
          6.3. WeKruit implements conservative rate limiting, human-like timing
          patterns, and anti-detection measures to minimize the risk of Platform
          enforcement. However, these measures cannot eliminate the risk entirely.
        </p>
        <p>
          6.4. If any Platform sends a cease-and-desist or similar demand to
          WeKruit, we may be required to disable Service functionality for that
          Platform immediately, with or without notice.
        </p>
      </Section>

      <Section id="data" heading="7. Data Processing and Privacy">
        <p>
          7.1. Your use of the Service is also governed by our{" "}
          <Link to="/legal/privacy" className="underline underline-offset-2">
            Privacy Policy
          </Link>
          , which is incorporated by reference into these Terms.
        </p>
        <p>
          7.2. To provide the Service, we process the following categories of
          data:
        </p>
        <ul>
          <li>Resume and profile information you upload or provide.</li>
          <li>Job posting content from Platforms you target.</li>
          <li>
            Form responses generated by AI and approved by you (Copilot) or
            submitted by the Service (Autopilot).
          </li>
          <li>Screenshots of application submissions for your audit trail.</li>
          <li>
            Usage metadata including timestamps, Platform identifiers, and
            performance metrics.
          </li>
        </ul>
        <p>
          7.3. Your data is processed by AI sub-processors (Anthropic, OpenAI)
          via their enterprise API services. Your data is not used for AI model
          training. See our Privacy Policy for complete sub-processor
          disclosures.
        </p>
      </Section>

      <Section id="ip" heading="8. Intellectual Property">
        <p>
          8.1. The Service, including all software, algorithms, interfaces,
          documentation, and branding, is the intellectual property of WeKruit
          and is protected by copyright, trademark, and other intellectual
          property laws.
        </p>
        <p>
          8.2. Subject to these Terms, we grant you a limited, non-exclusive,
          non-transferable, revocable license to use the Service for your
          personal, non-commercial job-seeking purposes.
        </p>
        <p>
          8.3. You retain all rights to the content you provide to the Service,
          including your resume, profile data, and Q&A bank responses. You grant
          us a limited license to process this content solely for the purpose of
          providing the Service.
        </p>
      </Section>

      <Section id="copilot" heading="9. Copilot Mode Terms">
        <p>
          9.1. In Copilot Mode, you initiate each application by providing a
          specific job URL. The Service analyzes the job posting, fills
          application forms using your profile data and AI-generated responses,
          and presents the completed form for your review.
        </p>
        <p>
          9.2. <strong>You are responsible for reviewing all fields before
          approving submission.</strong> The Service provides confidence scores
          and source indicators for each field to assist your review, but the
          final decision to submit rests with you.
        </p>
        <p>
          9.3. By approving a submission in Copilot Mode, you represent that you
          have reviewed the application and that the information is accurate to
          the best of your knowledge.
        </p>
      </Section>

      <Section id="autopilot" heading="10. Autopilot Mode Terms">
        <p>
          <strong>10.1. Definition and Scope.</strong> Autopilot Mode enables the
          Service to automatically submit job applications on your behalf without
          requiring your review or approval of each individual application prior
          to submission. Autopilot operates within the parameters you define
          during the Autopilot consent process, including target platforms, job
          criteria, maximum applications per session, salary range, and company
          exclusion lists ("Autopilot Parameters").
        </p>
        <p>
          <strong>10.2. Electronic Agent Authorization.</strong> By activating
          Autopilot Mode, you acknowledge and agree that:
        </p>
        <ol type="a">
          <li>
            The Service will function as an "electronic agent" as defined under
            the Uniform Electronic Transactions Act (UETA) and the federal
            Electronic Signatures in Global and National Commerce Act (E-SIGN),
            acting on your behalf within the defined Autopilot Parameters.
          </li>
          <li>
            Under UETA Section 14, job applications submitted by the Service in
            Autopilot Mode are legally attributable to you as if you had
            submitted each application manually.
          </li>
          <li>
            You are responsible for defining accurate and appropriate Autopilot
            Parameters before each session. The Service will operate within these
            parameters but cannot guarantee that every application will perfectly
            match your intent.
          </li>
          <li>
            Job applications, once submitted, are generally irrevocable. While
            the Service provides tools to attempt application withdrawal where
            technically feasible, we cannot guarantee the success of any
            withdrawal request.
          </li>
        </ol>
        <p>
          <strong>10.3. Quality Assurance and Error Prevention.</strong> In
          accordance with UETA Section 10(b), the Service provides
          error-prevention mechanisms including:
        </p>
        <ol type="a">
          <li>
            Confidence scoring for all AI-generated form responses with a
            mandatory minimum threshold of 80%.
          </li>
          <li>
            Hard blocks on sensitive fields including Social Security Numbers,
            legal consent forms, background check authorizations, and Equal
            Employment Opportunity demographic questions (unless you have
            explicitly configured responses).
          </li>
          <li>
            Post-submission review summaries delivered within 24 hours of each
            session.
          </li>
          <li>
            Nine mandatory quality gates that must all pass before any
            application is submitted.
          </li>
        </ol>
        <p>
          <strong>10.4. Your Obligations.</strong> You agree to:
        </p>
        <ol type="a">
          <li>
            Review post-submission summaries within 48 hours and promptly flag
            any applications that contain errors.
          </li>
          <li>
            Maintain accurate and up-to-date profile information, Q&A bank
            responses, and Autopilot Parameters.
          </li>
          <li>
            Configure your company exclusion list before activating Autopilot.
          </li>
          <li>
            Start with conservative session limits and increase only after
            reviewing initial results.
          </li>
        </ol>
        <p>
          <strong>10.5. Revocation.</strong> You may revoke Autopilot
          authorization at any time using the kill switch (under 2 seconds),
          account settings, or by contacting support. We reserve the right to
          disable Autopilot for any user if we determine it poses a risk to you,
          other users, or WeKruit.
        </p>
        <p>
          <strong>10.6. Non-Waivable Rights.</strong> Certain protections under
          UETA Section 10(b) regarding error correction in automated transactions
          cannot be waived by agreement. Nothing in these Terms is intended to
          waive such non-waivable rights.
        </p>
      </Section>

      <Section id="fees" heading="11. Fees and Billing">
        <p>
          11.1. The Service may offer free and paid subscription tiers. Current
          pricing is available on our website.
        </p>
        <p>
          11.2. Paid subscriptions are billed in advance on a monthly or annual
          basis. All fees are non-refundable except as required by applicable
          law.
        </p>
        <p>
          11.3. We reserve the right to change pricing with 30 days' prior notice
          to existing subscribers.
        </p>
      </Section>

      <Section id="liability" heading="12. Limitation of Liability">
        <p className="uppercase text-xs font-semibold leading-relaxed">
          12.1. TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, WEKRUIT'S
          TOTAL LIABILITY FOR ALL CLAIMS ARISING FROM OR RELATED TO THE SERVICE
          SHALL NOT EXCEED THE GREATER OF (A) THE FEES PAID BY YOU IN THE TWELVE
          (12) MONTHS PRECEDING THE CLAIM, OR (B) ONE HUNDRED U.S. DOLLARS
          ($100).
        </p>
        <p className="uppercase text-xs font-semibold leading-relaxed">
          12.2. WEKRUIT SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
          SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED
          TO LOSS OF PROFITS, DATA, BUSINESS OPPORTUNITIES, OR GOODWILL,
          REGARDLESS OF WHETHER SUCH DAMAGES WERE FORESEEABLE.
        </p>
        <p>12.3. Without limiting the foregoing, WeKruit shall not be liable for:</p>
        <ol type="a">
          <li>
            Consequences arising from your failure to maintain accurate profile
            information or Autopilot Parameters.
          </li>
          <li>
            Actions taken by Platforms in response to your use of the Service.
          </li>
          <li>
            Account restrictions, suspensions, or bans imposed by third-party
            Platforms.
          </li>
          <li>
            Lost job opportunities resulting from applications blocked by quality
            gates or Service limitations.
          </li>
          <li>
            Errors in AI-generated content that you approved (Copilot) or that
            passed quality gates (Autopilot).
          </li>
        </ol>
      </Section>

      <Section id="indemnification" heading="13. Indemnification">
        <p>
          You agree to indemnify, defend, and hold harmless WeKruit, its
          officers, directors, employees, and agents from and against any claims,
          damages, losses, liabilities, costs, and expenses (including reasonable
          attorneys' fees) arising from or related to:
        </p>
        <ol type="a">
          <li>Your use of the Service, including Autopilot Mode.</li>
          <li>Applications submitted by the Service on your behalf.</li>
          <li>
            Your violation of any Platform's Terms of Service through use of the
            Service.
          </li>
          <li>
            Any misrepresentation in your profile data, Q&A bank, or Autopilot
            Parameters.
          </li>
          <li>Your violation of these Terms or applicable law.</li>
        </ol>
      </Section>

      <Section id="disclaimers" heading="14. Disclaimers">
        <p className="uppercase text-xs font-semibold leading-relaxed">
          14.1. THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT
          WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT
          LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
          PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
        </p>
        <p>
          14.2. WeKruit does not warrant that the Service will be uninterrupted,
          error-free, secure, or that applications will be successfully submitted
          or received by employers.
        </p>
        <p>
          14.3. WeKruit does not guarantee any particular outcome from using the
          Service, including but not limited to interviews, job offers, or
          employment.
        </p>
      </Section>

      <Section id="termination" heading="15. Termination">
        <p>
          15.1. You may terminate your account at any time through your account
          settings or by contacting support. Upon termination, your data will be
          handled in accordance with our Privacy Policy and applicable data
          retention requirements.
        </p>
        <p>
          15.2. We may suspend or terminate your access to the Service at any
          time, with or without cause, upon notice to you. Grounds for
          termination include but are not limited to violation of these Terms,
          abusive use, or legal requirements.
        </p>
        <p>
          15.3. Upon termination, your right to use the Service ceases
          immediately. Sections 6, 12, 13, 14, and 16-18 survive termination.
        </p>
      </Section>

      <Section id="disputes" heading="16. Dispute Resolution">
        <p>
          16.1. These Terms are governed by and construed in accordance with the
          laws of the State of Delaware, without regard to its conflict of law
          principles.
        </p>
        <p>
          16.2. Any dispute arising from these Terms or the Service shall first
          be subject to good-faith negotiation for a period of 30 days.
        </p>
        <p>
          16.3. If negotiation fails, disputes shall be resolved by binding
          arbitration administered by the American Arbitration Association (AAA)
          under its Commercial Arbitration Rules. The arbitration shall be
          conducted in English. Judgment on the arbitration award may be entered
          in any court of competent jurisdiction.
        </p>
        <p>
          16.4. Notwithstanding the above, either party may seek injunctive or
          equitable relief in a court of competent jurisdiction to protect its
          intellectual property rights.
        </p>
        <p className="uppercase text-xs font-semibold leading-relaxed">
          16.5. YOU AGREE THAT ANY CLAIMS WILL BE BROUGHT IN YOUR INDIVIDUAL
          CAPACITY AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS
          OR REPRESENTATIVE PROCEEDING.
        </p>
      </Section>

      <Section id="miscellaneous" heading="17. Miscellaneous">
        <p>
          17.1. <strong>Entire Agreement.</strong> These Terms, together with the
          Privacy Policy, constitute the entire agreement between you and WeKruit
          regarding the Service.
        </p>
        <p>
          17.2. <strong>Severability.</strong> If any provision of these Terms is
          found unenforceable, the remaining provisions continue in full force
          and effect.
        </p>
        <p>
          17.3. <strong>Waiver.</strong> Failure to enforce any provision of
          these Terms does not constitute a waiver of that provision.
        </p>
        <p>
          17.4. <strong>Assignment.</strong> You may not assign these Terms
          without our written consent. We may assign these Terms in connection
          with a merger, acquisition, or sale of assets.
        </p>
        <p>
          17.5. <strong>Force Majeure.</strong> WeKruit shall not be liable for
          any failure to perform due to circumstances beyond its reasonable
          control, including but not limited to natural disasters, war, government
          actions, or internet infrastructure failures.
        </p>
      </Section>

      <Section id="contact" heading="18. Contact Information">
        <p>For questions about these Terms:</p>
        <ul>
          <li>
            <strong>Email:</strong>{" "}
            <a href="mailto:legal@wekruit.com" className="underline underline-offset-2">
              legal@wekruit.com
            </a>
          </li>
        </ul>
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
