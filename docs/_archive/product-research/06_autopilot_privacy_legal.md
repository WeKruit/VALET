# WeKruit Valet: Autopilot Mode -- Privacy, Waiver & Legal Framework

**Version:** 1.0
**Date:** 2026-02-11
**Status:** Research Complete -- Awaiting Legal Counsel Review
**Author:** Legal/Privacy Research
**Stakeholders:** Legal, Product, Engineering, Compliance

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Legal Liability Framework](#2-legal-liability-framework)
3. [Waiver & Consent Architecture](#3-waiver--consent-architecture)
4. [Privacy Implications](#4-privacy-implications)
5. [Risk Mitigation for Autopilot](#5-risk-mitigation-for-autopilot)
6. [Competitive Legal Analysis](#6-competitive-legal-analysis)
7. [Recommended Legal Documents](#7-recommended-legal-documents)
8. [Implementation Checklist](#8-implementation-checklist)
9. [Sources](#9-sources)

---

## 1. Executive Summary

### 1.1 The Fundamental Legal Shift

WeKruit AutoApply currently operates as a **Copilot** -- the AI fills forms, and the user reviews and approves each submission. This positions the product as an _assistive technology_, legally analogous to a password manager, screen reader, or form auto-filler. The user retains decisional control over every irreversible action.

**Autopilot mode fundamentally changes the legal posture.** When the system submits job applications without per-application human review, it transitions from assistive technology to **autonomous electronic agent**. This shift triggers a cascade of legal, privacy, and liability implications that do not apply to Copilot mode.

### 1.2 Key Differences: Copilot vs. Autopilot

| Dimension                  | Copilot Mode                | Autopilot Mode                                |
| -------------------------- | --------------------------- | --------------------------------------------- |
| **Legal classification**   | Assistive technology / tool | Electronic agent (UETA)                       |
| **User role**              | Active decision-maker       | Delegating principal                          |
| **Irreversible actions**   | User-approved               | System-initiated                              |
| **Liability allocation**   | Primarily user              | Shared: user + WeKruit                        |
| **GDPR Article 22**        | Likely not triggered        | Likely triggered                              |
| **Platform ToS risk**      | Lower (user-initiated)      | Higher (autonomous)                           |
| **Required consent level** | Standard ToS acceptance     | Enhanced informed consent + waiver            |
| **Error remediation**      | User catches before submit  | Post-hoc correction only                      |
| **Audit requirements**     | Standard logging            | Enhanced audit trail with explainability      |
| **Insurance implications** | Standard tech E&O           | Enhanced E&O + possible cyber liability rider |

### 1.3 Recommendation Summary

Autopilot mode is legally viable but requires significantly more legal infrastructure than Copilot mode. The core requirements are:

1. **Progressive consent architecture** with Autopilot-specific informed waiver
2. **Mandatory guardrails** (rate limits, quality gates, kill switch) that cannot be overridden
3. **Comprehensive audit trail** with per-submission explainability
4. **GDPR Article 22 compliance** including meaningful human review mechanism
5. **Enhanced ToS language** with specific Autopilot liability allocation
6. **Post-submission review window** with undo capability where possible
7. **Insurance review** for enhanced E&O coverage

---

## 2. Legal Liability Framework

### 2.1 UETA "Electronic Agent" Analysis

The Uniform Electronic Transactions Act (adopted in 49 states + DC; federal E-SIGN Act applies nationally) defines an "electronic agent" as:

> "A computer program or an electronic or other automated means used independently to initiate an action or respond to electronic records or performances in whole or in part, **without review or action by an individual.**"

**Copilot mode** does NOT meet this definition because the user reviews and approves each submission. The tool is a means of _assisting_ the user, not acting independently.

**Autopilot mode** squarely meets this definition. The system independently initiates actions (submitting job applications) without review by the user. Under UETA:

- **Section 14(1):** A contract may be formed by the interaction of electronic agents, even if no individual is aware of or reviews the agent's actions.
- **Section 14(2):** A contract formed by an electronic agent IS attributable to the person who used the agent.
- **Section 10(b) -- Critical:** When an electronic agent makes an error in a transaction, and the other party did not provide an opportunity to prevent or correct the error, the user has the right to **reverse the transaction**. This right CANNOT be waived by contract.

**Implications for WeKruit Autopilot:**

1. Applications submitted by Autopilot are legally attributable to the user who enabled Autopilot.
2. If Autopilot submits an application with incorrect information (an "error" under UETA Section 10(b)), and WeKruit did not provide a mechanism to prevent or correct the error before submission, the user may have legal grounds to demand reversal.
3. Since job applications are generally irrevocable once submitted to an employer's ATS, WeKruit must implement **pre-submission error prevention** (quality gates, confidence thresholds) to satisfy UETA Section 10(b) requirements.
4. WeKruit CANNOT simply disclaim liability for Autopilot errors via ToS -- UETA Section 10(b) is non-waivable.

**Recommended mitigation:**

- Implement mandatory quality gates that block Autopilot submissions below a confidence threshold (e.g., 80%)
- Provide a post-submission review window (24-hour summary) where users can flag errors
- Build a "withdraw application" feature that attempts to retract applications where the ATS supports it
- Document all quality gate decisions in the audit trail

### 2.2 CFAA Analysis: Does Autopilot Change the Calculus?

**Van Buren v. United States (2021)** established that "exceeds authorized access" under the CFAA means accessing areas of a computer that are completely "off-limits" -- not merely using authorized access in ways the ToS prohibits.

For Copilot mode, the CFAA analysis is straightforward: the user is accessing their own authenticated account and performing actions they could manually perform. Van Buren strongly protects this use case.

**Autopilot introduces a nuance.** The question becomes: when a user authorizes an AI agent to act on their behalf, does the _agent's_ access qualify as the _user's_ authorized access?

**The Amazon v. Perplexity case (2025-2026) is directly relevant.** Amazon sued Perplexity over its "Comet" AI agent, which -- when given a user's Amazon login credentials -- autonomously browses and makes purchases on the user's behalf. Amazon argues that:

1. Only Amazon can authorize access to its systems, regardless of user delegation
2. Automated access was explicitly prohibited in Amazon's ToS
3. Amazon sent cease-and-desist and implemented technical barriers
4. Continued automated access after C&D may cross the CFAA line

**The outcome of Amazon v. Perplexity will be dispositive for WeKruit Autopilot.** If courts hold that platform-prohibited automation exceeds authorized access even when the user consented, then Autopilot carries meaningfully higher CFAA risk than Copilot.

**Current assessment:**

| Factor                               | Copilot Risk                      | Autopilot Risk                                       |
| ------------------------------------ | --------------------------------- | ---------------------------------------------------- |
| User has legitimate account          | Protected                         | Protected                                            |
| User initiates each action           | Strong protection                 | N/A -- agent initiates                               |
| User reviews each action             | Strong protection                 | N/A -- no per-action review                          |
| Platform ToS prohibits automation    | Contractual risk only (Van Buren) | Contractual risk + emerging CFAA uncertainty         |
| Platform sends C&D to WeKruit        | Must comply; Copilot may survive  | Must immediately disable Autopilot for that platform |
| Platform implements technical blocks | Must not circumvent               | Must not circumvent                                  |

**Recommendation:** Autopilot does not fundamentally change the CFAA analysis under current Van Buren precedent, but it increases the _contractual_ risk and the _emerging_ CFAA risk from the Amazon v. Perplexity line of cases. If any platform sends a C&D specifically addressing automated submission, Autopilot for that platform must be disabled immediately. Copilot mode (user-reviewed) may survive such a C&D depending on the specific demands.

### 2.3 Liability for Incorrect Autopilot Submissions

When Autopilot submits an application with incorrect information, liability analysis is as follows:

**Scenario 1: AI fills salary expectation incorrectly ($50K instead of $150K)**

- User did not review before submission (Autopilot mode)
- Employer offers based on the stated salary
- User argues they never stated that salary

**Liability allocation:**

- **Under UETA:** The user authorized the electronic agent and is bound by its actions. However, UETA Section 10(b) may allow reversal if WeKruit did not provide error-prevention mechanisms.
- **WeKruit's liability:** If WeKruit's quality gates should have caught the error (e.g., salary was wildly inconsistent with user's profile data or stated range) but did not, WeKruit may share liability under negligence theory.
- **Disclaimer effectiveness:** A blanket "we are not liable for Autopilot errors" clause will be partially unenforceable under UETA Section 10(b). However, if WeKruit provides robust quality gates and the user chose to use Autopilot despite warnings, liability shifts significantly toward the user.

**Scenario 2: AI answers EEO/demographic question incorrectly**

- Autopilot selects a race, gender, or disability status that does not match the user
- This data is submitted to the employer

**Liability allocation:**

- This is significantly more serious because EEO data is sensitive under multiple laws (Title VII, ADA, GINA)
- WeKruit MUST implement a hard block: Autopilot should NEVER fill EEO/demographic fields automatically
- Default behavior: "Decline to answer" or skip entirely
- Any deviation requires explicit per-field user configuration in the Q&A bank

**Scenario 3: AI submits to wrong company or inappropriate role**

- Autopilot applies to a competitor of user's current employer
- Autopilot applies to a role requiring security clearance the user does not have

**Liability allocation:**

- Primarily user's responsibility (they set the job search criteria)
- WeKruit should implement "exclusion lists" (companies to never apply to) as a mandatory Autopilot setup step
- WeKruit should flag and block applications that contradict known user constraints

### 2.4 "User-Initiated" vs. "User-Authorized" Legal Distinction

This distinction is critical and is being actively developed in agentic AI law:

**User-Initiated (Copilot):**

- User takes an affirmative action to trigger each submission
- Each submission is a separate volitional act
- Analogous to signing each document individually
- Strongest legal position: user is the actor, tool is the instrument
- Under agency law: user is the principal performing the act directly

**User-Authorized (Autopilot):**

- User grants advance authorization for a category of actions
- Each submission is an act of the agent, not the user
- Analogous to signing a power of attorney
- Under agency law: agent acts on behalf of principal within scope of authority
- Key question: did the specific submission fall within the scope of the user's authorization?

**Legal framework (Proskauer, Stanford CodeX, DLA Piper 2025-2026 analysis):**

Under general agency principles, the principal (user) is bound by the acts of their agent (Autopilot) when:

1. The act falls within the scope of authority granted
2. The third party (employer/ATS) reasonably believes the agent has authority
3. The principal ratifies the act (e.g., by not objecting within the review window)

The scope of authority granted to Autopilot must be clearly defined in the consent form:

- Which platforms?
- Which types of roles?
- What salary range?
- Which companies to exclude?
- What maximum number per day/session?

If Autopilot acts outside this defined scope, the user has a stronger argument that the act was not authorized and should not be attributable to them.

### 2.5 LinkedIn ToS: Autopilot-Specific Risk Increase

LinkedIn's User Agreement explicitly prohibits:

> "Using bots or other automated methods to access the Services, add or download contacts, send or redirect messages, create, comment on, like, share, or re-share posts, or otherwise drive inauthentic engagement."

**Copilot risk:** Moderate. Each submission is user-initiated and reviewed. The tool assists but the user acts. This is closer to "using a form filler" than "using a bot."

**Autopilot risk:** HIGH. Submissions without per-action user review are squarely "automated methods to access the Services." LinkedIn cannot distinguish between a user who reviews each Easy Apply and one whose agent submits without review, but the _legal characterization_ changes:

- If LinkedIn discovers the account is using Autopilot, WeKruit cannot credibly argue "the user performed each action"
- LinkedIn enforcement against Autopilot users would be on stronger legal footing
- A C&D from LinkedIn would specifically target the autonomous submission feature

**Recommended approach:**

- Autopilot on LinkedIn should have the MOST conservative rate limits (10 applications/day maximum)
- Implement mandatory cool-down periods (minimum 3 minutes between LinkedIn Easy Apply submissions)
- Never enable Autopilot on LinkedIn by default -- require separate platform-specific consent
- Consider: LinkedIn Autopilot as a premium feature with additional disclaimers and lower limits
- Have a contingency plan to disable LinkedIn Autopilot entirely if C&D received, while maintaining Copilot mode

---

## 3. Waiver & Consent Architecture

### 3.1 Progressive Consent Model

The consent architecture must be layered, with each level requiring additional explicit consent:

```
LAYER 1: Account Registration
  └── Standard ToS + Privacy Policy acceptance
  └── Applies to: all users, all features
  └── Consent type: clickwrap

LAYER 2: Copilot Mode Activation (per-platform)
  └── Platform-specific legal disclaimer
  └── Acknowledges: ToS violation risk, account restriction risk
  └── Currently implemented in LegalDisclaimerModal.tsx
  └── Consent type: clickwrap with versioned acceptance

LAYER 3: Autopilot Mode Activation (REQUIRES NEW IMPLEMENTATION)
  └── Enhanced informed consent form (see Section 3.3)
  └── Acknowledges: autonomous submission, UETA implications, irrevocability
  └── Requires: active checkbox selections (not pre-checked)
  └── Requires: typed confirmation phrase
  └── Consent type: enhanced clickwrap with affirmative action

LAYER 4: Per-Session Autopilot Authorization
  └── Session-specific parameters (max apps, platforms, time limit)
  └── Confirmation of current settings before session starts
  └── Consent type: per-session confirmation

LAYER 5: Sensitive Field Handling (one-time setup)
  └── EEO/demographic field defaults
  └── Salary range authorization
  └── Company exclusion list
  └── Consent type: configuration-based consent
```

### 3.2 What Autopilot Requires That Copilot Does Not

| Consent Element                        | Copilot       | Autopilot            | Reason                                     |
| -------------------------------------- | ------------- | -------------------- | ------------------------------------------ |
| Standard ToS acceptance                | Yes           | Yes                  | Baseline                                   |
| Platform ToS risk acknowledgment       | Yes           | Yes                  | Baseline                                   |
| Autonomous submission authorization    | No            | **YES**              | UETA compliance                            |
| Irrevocability acknowledgment          | No            | **YES**              | Cannot undo submitted apps                 |
| Scope of authority definition          | No            | **YES**              | Agency law: define scope                   |
| Error responsibility allocation        | No            | **YES**              | UETA Section 10(b)                         |
| Post-submission review commitment      | No            | **YES**              | Error correction mechanism                 |
| Sensitive field handling defaults      | Optional      | **REQUIRED**         | Cannot fill EEO autonomously               |
| Company exclusion list setup           | Optional      | **REQUIRED**         | Prevent catastrophic misfires              |
| Maximum daily application limit        | Optional      | **REQUIRED**         | Guardrail against runaway                  |
| Session time limit                     | N/A           | **REQUIRED**         | Prevent indefinite operation               |
| Kill switch acknowledgment             | Informational | **REQUIRED**         | Must know how to stop                      |
| Data processing for LLM without review | Implied       | **EXPLICIT**         | GDPR: no human review of PII processing    |
| Screenshot/recording consent           | General       | **SESSION-SPECIFIC** | Every Autopilot session recorded           |
| Re-consent on any ToS/policy change    | Versioned     | **MANDATORY BLOCK**  | Cannot continue Autopilot on stale consent |

### 3.3 Per-Session vs. Permanent Authorization

**Recommendation: Per-session authorization with optional "remember my settings"**

**Per-session authorization** means each time the user activates Autopilot, they must:

1. Review their current profile/resume settings
2. Confirm the session parameters (platforms, limits, exclusions)
3. Acknowledge the Autopilot consent (can be a single "Start Autopilot" click if initial consent is on file)

**Permanent authorization** (not recommended for MVP) would allow users to schedule Autopilot sessions without per-session confirmation. This further reduces human oversight and increases legal risk. If implemented later:

- Require re-authorization every 30 days
- Require re-authorization after any profile change
- Require re-authorization after any ToS/privacy policy update
- Send daily summary emails during permanent authorization periods

### 3.4 Revocation: How Quickly Must the System Stop?

**GDPR Article 7(3):** "The data subject shall have the right to withdraw his or her consent at any time... It shall be as easy to withdraw as to give consent." Withdrawal has **immediate effect**.

**Technical requirements for Autopilot revocation:**

| Mechanism                               | Response Time | Implementation                                                                                                                              |
| --------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kill switch (UI button)**             | < 2 seconds   | Immediately cancels all queued and in-progress submissions. No pending forms are submitted. Current browser state preserved via screenshot. |
| **Keyboard shortcut** (Ctrl+Shift+K)    | < 2 seconds   | Same as kill switch button                                                                                                                  |
| **Browser extension uninstall**         | Immediate     | All Autopilot sessions terminated on extension removal detection                                                                            |
| **Account-level revocation** (settings) | < 5 seconds   | Disables Autopilot mode entirely. Requires re-consent to re-enable.                                                                         |
| **Email/support revocation**            | < 1 hour      | User emails support requesting Autopilot disable. Must be processed within 1 business hour.                                                 |
| **GDPR withdrawal**                     | < 72 hours    | Full data processing cessation + deletion per GDPR Article 17                                                                               |

**Critical implementation note:** The kill switch must work even if:

- The user's internet connection drops (local kill, not server-dependent)
- The server is down (client-side enforcement)
- The browser tab is closed (background process termination)
- The extension is in a crashed state (watchdog process)

### 3.5 Age Verification & Capacity to Consent

**Legal capacity to consent to Autopilot:**

- GDPR: Data processing consent requires age 16+ (some EU member states: 13+)
- COPPA (US): Under-13 protections apply to personal data collection
- UETA: Contract formation by electronic agent requires legal capacity of the principal
- General contract law: Minors (under 18 in most US jurisdictions) can void contracts

**Recommendation:**

- Require age 18+ for Autopilot mode (age 16+ for Copilot)
- Implement age verification at Autopilot consent stage (self-declaration + ToS warranty)
- Include in Autopilot consent: "I am at least 18 years of age and have the legal capacity to authorize an electronic agent to act on my behalf"

### 3.6 Re-Consent Triggers

Autopilot consent must be invalidated and re-obtained when:

| Trigger                                      | Action                                          | Rationale                             |
| -------------------------------------------- | ----------------------------------------------- | ------------------------------------- |
| WeKruit ToS updated                          | Block Autopilot until re-consent                | User agreed to old terms              |
| WeKruit Privacy Policy updated               | Block Autopilot until re-consent                | Data processing basis changed         |
| New platform added to Autopilot              | Require platform-specific consent               | Per-platform risk varies              |
| LLM provider changed                         | Notify + require acknowledgment                 | Data processing sub-processor changed |
| User changes resume/profile                  | Require session re-confirmation                 | Agent acting on stale data            |
| LEGAL_DISCLAIMER version changes             | Block all automation until re-consent           | Already implemented in codebase       |
| Regulatory change (GDPR/CCPA update)         | Block Autopilot until re-consent                | Legal basis may have changed          |
| 90 days since last consent                   | Require re-consent                              | Consent freshness                     |
| Account restriction detected on any platform | Block Autopilot permanently until manual review | Safety critical                       |

---

## 4. Privacy Implications

### 4.1 GDPR Article 22: Automated Individual Decision-Making

**Article 22(1):** "The data subject shall have the right not to be subject to a decision based solely on automated processing, including profiling, which produces legal effects concerning him or her or similarly significantly affects him or her."

**Does Autopilot trigger Article 22?**

**Analysis:**

| Element                                        | Copilot                                     | Autopilot                                                             |
| ---------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------- |
| Decision based solely on automated processing? | No -- user reviews and decides              | **Yes** -- system decides what to submit                              |
| Produces legal effects?                        | Borderline -- application is not a contract | Borderline -- same as Copilot                                         |
| Similarly significantly affects?               | No -- user controls quality                 | **Possibly yes** -- incorrect submissions could harm career prospects |

**Key consideration:** The "decision" in question is not the employer's hiring decision (which is the employer's Article 22 concern), but rather the decision to _submit a specific application with specific content_. When Autopilot makes this decision without human review:

- It determines what information represents the user to a potential employer
- An incorrect submission could lead to rejection, blacklisting, or reputational harm
- This "significantly affects" the data subject

**Assessment: Autopilot likely triggers GDPR Article 22.**

**Required compliance measures (Article 22(3)):**

1. **Right to obtain human intervention:** Users must be able to request human review of any Autopilot-submitted application after the fact
2. **Right to express their point of view:** Users must be able to annotate or dispute any Autopilot decision
3. **Right to contest the decision:** Users must be able to flag and potentially retract applications they disagree with
4. **Meaningful information about the logic involved:** Users must be able to see why Autopilot made each decision (explainability requirement -- see audit trail in Section 5.3)

**Exemption analysis:** Article 22(2) allows automated decision-making when:

- (a) Necessary for a contract -- arguable (user has a contract with WeKruit)
- (b) Authorized by law -- not applicable
- (c) **Based on explicit consent** -- this is our primary basis

If relying on explicit consent (Article 22(2)(c)), WeKruit must still implement the safeguards in Article 22(3): right to human intervention, right to express views, right to contest.

### 4.2 Right to Explanation & Audit Trail

If Autopilot triggers Article 22, every submission must have an explainable audit trail:

**Required audit data per Autopilot submission:**

```
Submission Audit Record:
{
  // Identity & Session
  submission_id: UUID,
  session_id: UUID,
  user_id: string,
  timestamp_started: ISO8601,
  timestamp_submitted: ISO8601,

  // What was submitted
  platform: string,
  job_url: string,
  company_name: string,
  position_title: string,

  // Decision rationale (explainability)
  match_score: number,               // Why this job was selected
  match_reasoning: string,           // LLM explanation of match
  resume_version_used: string,       // Which resume was selected
  cover_letter_generated: boolean,   // Was a cover letter created?

  // Per-field decisions
  field_decisions: [
    {
      field_name: string,
      field_type: string,            // text, select, checkbox, file
      value_submitted: string,       // What was submitted (redacted for PII)
      source: 'user_profile' | 'qa_bank' | 'llm_generated' | 'default',
      confidence_score: number,
      llm_model_used: string,        // Which model made this decision
      reasoning: string,             // Why this value was chosen
    }
  ],

  // Quality gate results
  quality_score: number,
  quality_gate_passed: boolean,
  quality_warnings: string[],

  // Screenshots (encrypted)
  pre_submit_screenshot_url: string,
  post_submit_screenshot_url: string,

  // Outcome
  submission_status: 'submitted' | 'confirmed' | 'failed' | 'blocked_by_quality',
  confirmation_method: string,       // How we verified submission success

  // User review (post-submission)
  user_reviewed: boolean,
  user_reviewed_at: ISO8601 | null,
  user_disputed: boolean,
  user_dispute_reason: string | null
}
```

**Retention:**

- Audit records: 2 years minimum (statute of limitations for contract claims in most jurisdictions)
- Screenshots: 90 days (configurable by user, max 1 year)
- LLM prompt/response logs: 90 days (for debugging and explainability)
- PII within audit records: subject to GDPR deletion requests, but may retain anonymized records

### 4.3 Data Processing Agreements with LLM Providers

**Copilot mode:** User reviews all LLM outputs before they are submitted. The LLM processes PII (resume data, form answers) but the user validates correctness. This is standard data processing.

**Autopilot mode:** LLM processes PII AND the output is submitted without human review. This means:

1. **LLM errors become submitted errors** -- there is no human filter
2. **PII is processed AND acted upon autonomously** -- higher GDPR processing risk
3. **Sub-processor liability increases** -- if the LLM hallucinates and WeKruit submits, both WeKruit and the LLM provider could be implicated

**Required DPA enhancements for Autopilot:**

| Requirement                | Standard DPA                  | Autopilot DPA Enhancement                                                           |
| -------------------------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| Data processing purpose    | Form-filling assistance       | Autonomous form-filling AND submission                                              |
| Processing lawful basis    | Legitimate interest + consent | **Explicit consent only** (Article 22 basis)                                        |
| Sub-processor notification | Standard notification         | **Prior notification** of any sub-processor change                                  |
| Data retention             | Per provider policy           | **Zero retention** for Autopilot submissions (request from providers)               |
| Incident notification      | 72 hours                      | **24 hours** (Autopilot errors are time-sensitive)                                  |
| Audit rights               | Annual audit right            | **Quarterly audit right**                                                           |
| Liability allocation       | Standard                      | **Enhanced** -- LLM provider shares liability for hallucinations in autonomous mode |

**Current provider positions:**

- **Anthropic API:** Data explicitly excluded from training. DPA incorporated into Commercial Terms. Zero retention available for enterprise. Compliance API for access controls.
- **OpenAI API:** API data not used for training by default. DPA available. 30-day retention for abuse monitoring (enterprise: zero retention). Enterprise privacy commitments.

**Recommendation:** Use enterprise-tier API access for Autopilot sessions with zero-retention agreements. Standard API tier may be acceptable for Copilot.

### 4.4 Screenshot/Recording Consent for Autopilot Sessions

**Copilot:** Screenshots are taken for audit trail, user reviews them in real-time.

**Autopilot:** Screenshots are taken without real-time user awareness. These screenshots contain PII visible on the form (name, email, phone, address, potentially salary, EEO responses).

**Requirements:**

- Explicit consent for screenshot capture during Autopilot sessions (part of Autopilot consent form)
- Screenshots must be encrypted at rest (AES-256) and in transit (TLS 1.3)
- Screenshots accessible only to the user and system admins (with audit log of admin access)
- Automatic deletion after retention period (30-90 days, user-configurable)
- User can request immediate deletion of all screenshots
- Screenshots must NOT be sent to LLM providers for analysis (keep processing local/server-side)

### 4.5 PII Handling in Autonomous Mode

**Sensitive fields that Autopilot may encounter:**

| Field Type                 | Risk Level   | Autopilot Policy                                                                                                     |
| -------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------- |
| Name, email, phone         | Low          | Fill from profile (verified data)                                                                                    |
| Address                    | Low          | Fill from profile (verified data)                                                                                    |
| Work history               | Medium       | Fill from resume (verified data)                                                                                     |
| Education                  | Medium       | Fill from resume (verified data)                                                                                     |
| Salary expectations        | **HIGH**     | Fill ONLY if user has set explicit range in Q&A bank. NEVER guess. If no range set, skip or use "Open to discussion" |
| EEO: Race/ethnicity        | **CRITICAL** | ALWAYS "Decline to answer" unless user has explicitly configured otherwise. NEVER auto-detect or infer.              |
| EEO: Gender                | **CRITICAL** | ALWAYS "Decline to answer" unless explicitly configured                                                              |
| EEO: Disability status     | **CRITICAL** | ALWAYS "Decline to answer" unless explicitly configured                                                              |
| EEO: Veteran status        | **CRITICAL** | ALWAYS "Decline to answer" unless explicitly configured                                                              |
| EEO: Sexual orientation    | **CRITICAL** | ALWAYS "Decline to answer" unless explicitly configured                                                              |
| SSN / National ID          | **CRITICAL** | NEVER fill. Block submission. Alert user.                                                                            |
| Background check consent   | **CRITICAL** | NEVER auto-consent. Block submission. Alert user.                                                                    |
| Drug test consent          | **CRITICAL** | NEVER auto-consent. Block submission. Alert user.                                                                    |
| Non-compete acknowledgment | **CRITICAL** | NEVER auto-agree. Block submission. Alert user.                                                                      |
| Relocation willingness     | HIGH         | Fill ONLY if explicitly configured in preferences                                                                    |
| Visa/work authorization    | HIGH         | Fill ONLY from verified profile data                                                                                 |
| References                 | **HIGH**     | NEVER auto-fill reference contact info. Skip or alert user.                                                          |
| Portfolio/work samples     | Medium       | Fill from profile links if configured                                                                                |
| Custom/free-text questions | HIGH         | Fill from Q&A bank match or LLM generation, but with minimum 70% confidence threshold                                |

**Hard blocks (Autopilot must STOP and notify user):**

- Any field requesting SSN, national ID, or financial information
- Any field requiring a legal consent/agreement (background check, drug test, non-compete, arbitration)
- Any field requesting third-party PII (references' contact information)
- Any field the LLM cannot fill with > 50% confidence and no Q&A bank match

---

## 5. Risk Mitigation for Autopilot

### 5.1 Mandatory Guardrails

These guardrails are NON-NEGOTIABLE for Autopilot mode. They cannot be overridden by the user, administrator, or any configuration:

**Rate Limits:**

| Platform               | Max/Day (Autopilot) | Max/Hour | Min Gap Between Apps | Cool-Down After 5 Apps |
| ---------------------- | ------------------- | -------- | -------------------- | ---------------------- |
| LinkedIn Easy Apply    | 10                  | 4        | 3 minutes            | 15-minute pause        |
| Greenhouse             | 15                  | 6        | 2 minutes            | 10-minute pause        |
| Lever                  | 15                  | 6        | 2 minutes            | 10-minute pause        |
| Workday                | 8                   | 3        | 5 minutes            | 20-minute pause        |
| All platforms combined | 25                  | 8        | 2 minutes            | N/A                    |

**Quality Gates (must pass ALL before Autopilot submission):**

1. Overall confidence score >= 80% (weighted average of all field confidences)
2. No individual field confidence < 50%
3. No CRITICAL fields filled by LLM inference (only profile data or Q&A bank)
4. Resume-job match score >= 60%
5. No hard-block fields encountered (SSN, legal consents, etc.)
6. Company not on user's exclusion list
7. Role title not contradicting user's profile (e.g., "Intern" for a 15-year veteran)
8. Application not a duplicate (same job URL within 90 days)
9. Salary range (if stated) within user's configured bounds

**If any quality gate fails:** Application is NOT submitted. It is queued for user review with an explanation of why it was blocked.

**Session Limits:**

| Parameter                     | Default | User-Configurable Range |
| ----------------------------- | ------- | ----------------------- |
| Max session duration          | 2 hours | 30 minutes - 4 hours    |
| Max applications per session  | 15      | 5 - 25                  |
| Mandatory break after session | 1 hour  | 30 minutes - 4 hours    |
| Max sessions per day          | 3       | 1 - 3                   |

### 5.2 Kill Switch Requirements

**Implementation specification:**

```
KILL SWITCH BEHAVIOR:

Trigger mechanisms:
  1. Red "STOP" button -- always visible in extension UI during Autopilot
  2. Keyboard shortcut: Ctrl+Shift+K (configurable)
  3. Browser extension icon click during active session
  4. Account settings: "Disable Autopilot" toggle
  5. Server-side: admin kill switch (per-user or global)
  6. Automatic: on any account restriction signal

Behavior on trigger:
  1. ALL in-progress form fills STOP immediately (< 1 second)
  2. NO pending submissions are sent (form is abandoned, NOT submitted)
  3. ALL queued applications are cancelled
  4. Browser state is preserved (screenshot taken)
  5. Audit log records: kill switch activated, reason, timestamp
  6. User notification: "Autopilot stopped. [X] applications submitted. [Y] cancelled."
  7. Post-mortem summary generated and emailed within 5 minutes
  8. Kill switch state persists across page reloads and browser restarts

Edge cases:
  - Form is mid-submission (HTTP request in flight):
    → Cannot be stopped. Log as "submitted during kill switch."
    → Include in post-mortem: "1 application may have been submitted during shutdown."
  - Network is down:
    → Kill switch works locally (client-side enforcement)
    → Server-side catch-up on reconnect
  - Extension crashed:
    → Watchdog process detects crash → auto-kill all pending tasks
    → No submissions can occur without active extension process
```

### 5.3 Audit Trail Requirements

Every Autopilot submission MUST log the following (see also Section 4.2 for the full audit record schema):

**Minimum required fields per submission:**

1. Unique submission ID
2. Session ID (links all submissions in one Autopilot session)
3. User ID
4. Timestamp (start, submit, confirm)
5. Platform and job URL
6. Company name and position title
7. Resume version used
8. Cover letter (if generated): full text + generation parameters
9. Every form field: name, value submitted, source (profile/Q&A/LLM), confidence score
10. Quality gate results: overall score, per-gate pass/fail, any warnings
11. Pre-submission screenshot (encrypted, linked)
12. Post-submission screenshot (encrypted, linked)
13. Submission status (success/fail/uncertain)
14. Any errors encountered during the application process
15. LLM model and prompt used for each AI-generated answer

**Audit trail access:**

- User: full access to their own audit trail via dashboard
- WeKruit support: access with user permission (support ticket)
- WeKruit admin: access with audit log of admin access
- Legal/compliance: access for regulatory response (documented procedure)
- Export: user can export full audit trail as JSON/CSV (GDPR Article 20)

### 5.4 Cool-Down Periods

**Between individual submissions:**

- Same platform: minimum 2-5 minutes (randomized within range)
- Different platforms: minimum 1-2 minutes
- Same company: minimum 24 hours (different role at same company)
- Same exact job URL: BLOCKED (duplicate detection)

**Between sessions:**

- Mandatory 1-hour minimum break between Autopilot sessions
- After a session with > 10 submissions: 2-hour mandatory break
- After any quality gate failure: 30-minute pause (allows user to review and adjust)

**After incidents:**

- After kill switch activation: Autopilot disabled until user manually re-enables
- After account restriction signal: Autopilot permanently disabled until manual review
- After 3+ quality gate failures in one session: session auto-terminated
- After LLM error: 5-minute pause, then retry with fallback model

### 5.5 Post-Submission Review Window

**Mandatory 24-hour summary email:**

After every Autopilot session, the user receives an email within 1 hour containing:

```
Subject: WeKruit Autopilot Session Summary - [Date]

Session Duration: 1h 23m
Applications Submitted: 12
Applications Blocked (quality gates): 3
Applications Cancelled (kill switch / session end): 2

=== SUBMITTED APPLICATIONS ===

1. Software Engineer at Acme Corp
   Platform: Greenhouse
   Confidence: 94%
   Salary Stated: $120K-$150K (from your settings)
   AI-Generated Answers: 3 (all > 85% confidence)
   [View Full Audit] [Flag Issue] [Request Withdrawal]

2. Senior Developer at TechCo
   Platform: LinkedIn Easy Apply
   Confidence: 87%
   ⚠ Note: Cover letter was AI-generated
   [View Full Audit] [Flag Issue] [Request Withdrawal]

...

=== BLOCKED APPLICATIONS (not submitted) ===

1. Chief Technology Officer at StartupXYZ
   Reason: Role level mismatch (your profile: 5 years exp, role requires: 15+ years)
   [Override & Submit Manually]

=== YOUR ACTION ITEMS ===
- Review AI-generated answers for accuracy
- Flag any applications you want to dispute/withdraw
- Update your Q&A bank if AI answers were suboptimal
```

**"Request Withdrawal" feature:**

- Attempts to withdraw the application via the ATS (if supported)
- Sends a withdrawal email to the employer's listed contact (if available)
- Logs the withdrawal request in the audit trail
- NOT guaranteed to succeed (most ATS platforms do not support programmatic withdrawal)
- User is informed of the withdrawal attempt's success/failure

### 5.6 Insurance Implications

**Current coverage (Copilot only):**

- Standard tech E&O (Errors & Omissions) / Professional Liability insurance
- Standard cyber liability insurance
- Adequate for: software bugs, service outages, data breaches

**Additional coverage needed for Autopilot:**

| Coverage Type                             | Reason                                                                                     | Estimated Cost Impact                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------- |
| **Enhanced E&O**                          | Autopilot acting as agent increases professional liability                                 | 20-40% premium increase                       |
| **Cyber liability rider**                 | Autonomous PII processing without human review                                             | 10-20% premium increase                       |
| **Product liability**                     | Autopilot is a "product" that takes actions, not just displays information                 | May require separate product liability policy |
| **Employment practices liability (EPLI)** | If Autopilot submissions cause employment-related harm (EEO violations, misrepresentation) | Case-by-case                                  |
| **Regulatory defense coverage**           | GDPR enforcement actions, CCPA violations                                                  | Included in some cyber policies               |

**Recommendation:**

- Consult insurance broker BEFORE launching Autopilot
- Provide broker with: feature description, user volume projections, data processing flows, existing guardrails
- Budget for 30-50% increase in total insurance costs
- Consider whether Autopilot revenue justifies the increased insurance expense

---

## 6. Competitive Legal Analysis

### 6.1 Competitor Approaches to Automated Submission

#### LazyApply

**Product approach:** Fully autonomous -- applies to thousands of jobs in a single click. "Spray and pray" model.

**Legal approach (from public ToS):**

- Service provided "as is" and "as available" without any warranty
- Expressly disclaims all warranties including merchantability and fitness for purpose
- No representation that service will meet requirements, achieve intended results, or be error-free
- Standard limitation of liability and indemnification clauses
- No specific language addressing UETA electronic agent status
- No specific language addressing GDPR Article 22
- No explicit per-submission consent mechanism

**Assessment:** LazyApply takes a "minimal legal infrastructure" approach, relying on broad disclaimers. This is legally aggressive and leaves significant exposure, particularly under UETA Section 10(b) (non-waivable error correction rights) and GDPR Article 22. Their approach is NOT recommended for WeKruit.

#### Sonara

**Product approach:** AI-curated job queue where users can modify selections. Applies on user's behalf with option to delete/modify before submission.

**Legal approach (from public ToS):**

- Service provided "as is" with standard disclaimers
- Encourages users to exercise due diligence when selecting jobs
- Notes that job postings may expire between submission and receipt
- Disclaims control over employer websites and cannot guarantee proper application receipt
- No explicit UETA or Article 22 compliance language visible

**Assessment:** Sonara's model is closer to Copilot (users can review/modify) but with autonomous submission if user does not intervene. Their legal approach is slightly more sophisticated than LazyApply's but still lacks the infrastructure needed for full compliance.

**Note:** Sonara suspended services on February 1, 2024, reportedly due to funding issues -- not legal action. However, the lack of robust legal infrastructure may have contributed to investor concerns.

#### Massive

**Product approach:** Subscription-based platform that automates the entire application process. Users create a profile once and the tool handles everything.

**Legal approach:** Terms available at usemassive.com/terms. The platform finds openings, fills applications, and generates custom resumes/cover letters. Specific legal language not publicly analyzed in detail.

**Assessment:** Massive operates a fully autonomous model similar to LazyApply. No publicly reported legal actions, but the same UETA and GDPR concerns apply.

### 6.2 Have Any Been Sued or Received C&Ds?

**As of February 2026, no public evidence of:**

- Lawsuits against LazyApply, Sonara, or Massive specifically for automated job application submission
- Cease-and-desist orders from LinkedIn, Greenhouse, or other platforms directed at these tools
- Regulatory enforcement actions (GDPR, FTC) against job auto-apply tools

**However:**

- Sonara shut down (Feb 2024) -- officially due to funding, but timing coincides with increased platform enforcement
- LazyApply has extensive negative user reviews citing account bans, incorrect applications, and quality issues
- LinkedIn has been aggressive against data scrapers (Proxycurl shutdown July 2025, hiQ $500K judgment) -- job application automation is a natural next enforcement target
- The Amazon v. Perplexity case (2025-2026) may set precedent that applies directly to these tools
- LinkedIn's 2025-2026 enforcement ramp-up specifically targets "browser-based extensions" and bot-like behavior

**Risk trajectory:** The absence of enforcement actions to date does NOT indicate safety. The trend is clearly toward increased enforcement, and the first major enforcement action against a job auto-apply tool could come at any time. WeKruit should build legal infrastructure proactively, not reactively.

### 6.3 WeKruit Competitive Legal Positioning

WeKruit should differentiate from competitors on legal rigor:

| Feature                     | LazyApply | Sonara  | Massive | **WeKruit (Target)**             |
| --------------------------- | --------- | ------- | ------- | -------------------------------- |
| Explicit UETA compliance    | No        | No      | Unknown | **Yes**                          |
| GDPR Article 22 compliance  | No        | No      | Unknown | **Yes**                          |
| Per-submission audit trail  | No        | Partial | Unknown | **Yes, comprehensive**           |
| Quality gates before submit | No        | Partial | Unknown | **Yes, mandatory**               |
| Kill switch                 | No        | Unknown | Unknown | **Yes, < 2 second**              |
| Post-submission review      | No        | Partial | Unknown | **Yes, 24h summary**             |
| Typed consent confirmation  | No        | No      | Unknown | **Yes**                          |
| Sensitive field protections | No        | Unknown | Unknown | **Yes, hard blocks**             |
| Company exclusion list      | No        | Yes     | Unknown | **Yes, mandatory for Autopilot** |
| Insurance for Autopilot     | Unknown   | Unknown | Unknown | **Yes, enhanced E&O**            |

This positions WeKruit as the "responsible Autopilot" -- automation with guardrails, transparency, and legal compliance. This is a competitive differentiator, not just a cost.

---

## 7. Recommended Legal Documents

### 7.1 Terms of Service -- Autopilot-Specific Clauses

The following clauses should be ADDED to WeKruit's existing Terms of Service when Autopilot mode is launched:

---

**SECTION [X]: AUTOPILOT MODE**

**[X].1 Definition and Scope**

"Autopilot Mode" is an optional feature of the WeKruit AutoApply Service that, when activated by the User, enables the Service to automatically submit job applications on the User's behalf without requiring the User's review or approval of each individual application prior to submission. Autopilot Mode operates within the parameters defined by the User during the Autopilot Consent process, including but not limited to: target platforms, job search criteria, maximum number of applications per session, salary range, and company exclusion lists (collectively, "Autopilot Parameters").

**[X].2 Electronic Agent Authorization**

By activating Autopilot Mode, the User acknowledges and agrees that:

(a) The Service will function as an "electronic agent" as defined under the Uniform Electronic Transactions Act (UETA) and the federal Electronic Signatures in Global and National Commerce Act (E-SIGN), acting on the User's behalf to submit job applications within the defined Autopilot Parameters.

(b) Under UETA Section 14, job applications submitted by the Service in Autopilot Mode are legally attributable to the User as if the User had submitted each application manually.

(c) The User is responsible for defining accurate and appropriate Autopilot Parameters before each Autopilot session. The Service will operate within these parameters but cannot guarantee that every application will perfectly match the User's intent.

(d) The User acknowledges that job applications, once submitted, are generally irrevocable. While the Service will provide tools to attempt application withdrawal where technically feasible, WeKruit cannot guarantee the success of any withdrawal request.

**[X].3 Quality Assurance and Error Prevention**

(a) The Service implements mandatory quality gates that evaluate each application before submission in Autopilot Mode. Applications that do not meet minimum quality thresholds will not be submitted and will be queued for User review.

(b) In accordance with UETA Section 10(b), the Service provides the following error-prevention mechanisms: (i) confidence scoring for all AI-generated form responses; (ii) minimum confidence thresholds that must be met before automated submission; (iii) mandatory hard blocks on sensitive fields including but not limited to Social Security Numbers, legal consent forms, background check authorizations, and Equal Employment Opportunity demographic questions (unless the User has explicitly configured responses for such fields); (iv) post-submission review summaries delivered within 24 hours of each Autopilot session.

(c) Notwithstanding the above, the User acknowledges that no automated system is error-free. The User agrees to review post-submission summaries within 48 hours of receipt and to promptly flag any applications that contain errors or were submitted to unintended recipients.

**[X].4 Limitation of Liability for Autopilot Mode**

(a) To the maximum extent permitted by applicable law, WeKruit's total liability for claims arising from Autopilot Mode shall not exceed the fees paid by the User for the Autopilot feature during the twelve (12) months preceding the claim.

(b) WeKruit shall not be liable for: (i) consequences arising from the User's failure to maintain accurate profile information, Q&A bank responses, or Autopilot Parameters; (ii) actions taken by employers or job platforms in response to applications submitted by the Service; (iii) account restrictions, suspensions, or bans imposed by third-party platforms as a result of automated activity; (iv) lost job opportunities resulting from applications that were blocked by quality gates or not submitted due to system limitations.

(c) THE USER ACKNOWLEDGES THAT CERTAIN PROTECTIONS UNDER UETA SECTION 10(b) REGARDING ERROR CORRECTION IN AUTOMATED TRANSACTIONS CANNOT BE WAIVED BY AGREEMENT. NOTHING IN THESE TERMS IS INTENDED TO WAIVE SUCH NON-WAIVABLE RIGHTS.

**[X].5 Indemnification**

The User agrees to indemnify, defend, and hold harmless WeKruit, its officers, directors, employees, and agents from and against any claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys' fees) arising from or related to: (i) the User's use of Autopilot Mode; (ii) applications submitted by Autopilot Mode on the User's behalf; (iii) the User's violation of any third-party platform's terms of service through use of Autopilot Mode; (iv) any misrepresentation in the User's profile data, Q&A bank, or Autopilot Parameters that results in incorrect application submissions.

**[X].6 Revocation and Termination**

(a) The User may revoke Autopilot authorization at any time by activating the kill switch (available in the extension interface or via keyboard shortcut), disabling Autopilot in account settings, or contacting support. Revocation takes effect within two (2) seconds for in-session kill switch activation and within one (1) business hour for support-initiated revocations.

(b) WeKruit reserves the right to disable Autopilot Mode for any User at any time, without prior notice, if WeKruit determines in its sole discretion that: (i) the User's account has been flagged by any third-party platform; (ii) the User's Autopilot activity poses a risk to WeKruit or other users; (iii) applicable law or regulatory guidance requires such action; (iv) a third-party platform has sent a cease-and-desist or similar demand.

---

### 7.2 Privacy Policy -- Automated Decision-Making Section

The following section should be ADDED to WeKruit's Privacy Policy:

---

**SECTION [Y]: AUTOMATED DECISION-MAKING AND PROFILING (AUTOPILOT MODE)**

**[Y].1 Automated Decision-Making**

When you use Autopilot Mode, the Service makes automated decisions about:

- Which job application form fields to fill and what values to enter
- Whether a job application meets quality thresholds for automated submission
- Which resume version and cover letter content to use for each application
- Whether to skip, block, or submit each application based on your defined parameters

These automated decisions are made using artificial intelligence (large language models) that analyze your profile data, Q&A bank responses, and the job posting to generate appropriate form responses.

**[Y].2 Your Rights Under GDPR Article 22**

If you are located in the European Economic Area (EEA) or the United Kingdom, you have the right not to be subject to decisions based solely on automated processing that produce legal effects or similarly significantly affect you.

WeKruit processes Autopilot submissions on the legal basis of your **explicit consent** (GDPR Article 22(2)(c)), which you provide through the Autopilot Consent Form.

Even with your consent, you retain the following rights:

(a) **Right to human intervention:** You may request that a WeKruit team member review any application submitted by Autopilot Mode. To exercise this right, use the "Flag Issue" feature in your post-submission summary or contact support@wekruit.com.

(b) **Right to express your point of view:** You may annotate, dispute, or provide additional context for any Autopilot-submitted application through the application audit trail in your dashboard.

(c) **Right to contest the decision:** You may challenge any automated decision made by Autopilot Mode. We will review contested decisions within five (5) business days and take appropriate corrective action.

(d) **Right to meaningful explanation:** For every application submitted by Autopilot Mode, you can access a detailed audit trail showing: which AI model made each decision, the confidence score for each response, the source of each form value (your profile, Q&A bank, or AI-generated), and the reasoning behind the overall match score.

**[Y].3 Data Processing in Autopilot Mode**

During Autopilot Mode, the following data is processed:

| Data Category               | Purpose                        | Legal Basis         | Retention                      |
| --------------------------- | ------------------------------ | ------------------- | ------------------------------ |
| Resume/profile data         | Populate application forms     | Explicit consent    | Until account deletion         |
| Q&A bank responses          | Answer screening questions     | Explicit consent    | Until account deletion         |
| Job posting content         | Match and analyze requirements | Legitimate interest | 90 days                        |
| AI-generated form responses | Complete applications          | Explicit consent    | 90 days                        |
| Screenshots of submissions  | Audit trail and verification   | Explicit consent    | 30-90 days (user-configurable) |
| LLM prompts and responses   | Generate form answers          | Explicit consent    | 90 days                        |
| Submission metadata         | Track application status       | Legitimate interest | 2 years                        |

**[Y].4 Sub-Processors**

In Autopilot Mode, your data may be processed by the following AI sub-processors:

| Provider               | Purpose                               | Data Sent                                              | Retention by Provider            |
| ---------------------- | ------------------------------------- | ------------------------------------------------------ | -------------------------------- |
| Anthropic (Claude API) | Form analysis and response generation | Resume text, job posting text, form field descriptions | Zero retention (enterprise tier) |
| OpenAI (GPT API)       | Fallback form analysis                | Same as above                                          | Zero retention (enterprise tier) |

Your personal data sent to AI sub-processors is processed via API (not consumer chat interfaces) and is NOT used for model training. We maintain signed Data Processing Agreements with all sub-processors.

**[Y].5 Withdrawal of Consent**

You may withdraw your consent for automated decision-making at any time by:

- Deactivating Autopilot Mode in your account settings
- Using the kill switch during an active session
- Contacting privacy@wekruit.com

Withdrawal of consent does not affect the lawfulness of processing carried out before withdrawal.

---

### 7.3 Autopilot Consent Form

This is the actual consent form shown to users when they first activate Autopilot mode. It should be presented as a modal dialog that cannot be dismissed without either accepting or canceling.

---

**WEKRUIT AUTOPILOT MODE -- INFORMED CONSENT AND AUTHORIZATION**

**What is Autopilot Mode?**

Autopilot Mode allows WeKruit to automatically submit job applications on your behalf without requiring your review of each individual application before submission. The system will:

- Find job listings matching your criteria
- Fill out application forms using your profile data, Q&A bank, and AI-generated responses
- Submit applications that pass our quality checks
- Skip applications that do not meet quality thresholds

**What you need to understand before activating Autopilot:**

**1. Applications are submitted without your individual review.**
Once Autopilot submits an application, it cannot be guaranteed to be retrievable. You will receive a summary of all submitted applications within 24 hours, but some applications may not be reversible.

**2. AI-generated responses may contain errors.**
While our system uses quality gates and confidence scoring, no AI system is perfect. There is a risk that the system may submit responses that do not accurately reflect your qualifications, preferences, or intent.

**3. Third-party platform risks.**
The platforms where applications are submitted (LinkedIn, Greenhouse, Lever, Workday, etc.) may prohibit automated submission in their Terms of Service. Using Autopilot Mode may result in account restrictions, suspensions, or bans on these platforms. WeKruit is not responsible for actions taken by these platforms.

**4. You are legally responsible for submitted applications.**
Under applicable law (including the Uniform Electronic Transactions Act), applications submitted by Autopilot Mode on your behalf are legally attributable to you, as if you had submitted them manually.

**5. You have the right to stop at any time.**
You can stop Autopilot immediately using the kill switch (the red STOP button or Ctrl+Shift+K). All pending applications will be cancelled within 2 seconds.

**Please confirm each of the following by checking the box:**

[ ] I understand that Autopilot Mode will submit job applications on my behalf without my individual review of each application.

[ ] I understand that submitted applications may contain AI-generated content that could be inaccurate, and I accept responsibility for reviewing post-submission summaries.

[ ] I understand that using automated tools may violate the Terms of Service of third-party platforms and could result in account restrictions or bans.

[ ] I understand that applications submitted by Autopilot are legally attributable to me under applicable law.

[ ] I am at least 18 years of age and have the legal capacity to authorize an electronic agent to act on my behalf.

[ ] I have configured my Q&A bank and profile to accurately reflect my qualifications and preferences, including salary expectations and EEO response preferences.

[ ] I consent to WeKruit capturing and storing screenshots of applications submitted in Autopilot Mode for my audit trail.

[ ] I understand that I can revoke this authorization at any time by using the kill switch or disabling Autopilot in my account settings.

**To confirm your authorization, please type the following phrase:**

"I authorize WeKruit to submit applications on my behalf"

[ Text input field ]

**By clicking "Activate Autopilot," you agree to the Autopilot-specific terms in our Terms of Service (Section [X]) and the automated decision-making disclosures in our Privacy Policy (Section [Y]).**

[Cancel] [Activate Autopilot]

_Consent version: v1.0 | Date: [auto-populated] | Your consent will be recorded with timestamp and session metadata._

---

### 7.4 Legal Disclaimer Modal (Pre-First-Use)

This modal is shown the FIRST time a user attempts to activate Autopilot mode, BEFORE the consent form. It is informational only and must be acknowledged before proceeding to the consent form.

---

**IMPORTANT: READ BEFORE ENABLING AUTOPILOT MODE**

**Autopilot Mode is different from Copilot Mode.**

In Copilot Mode, you review every application before it is submitted. In Autopilot Mode, applications are submitted automatically based on your settings and our AI's analysis.

**Key risks specific to Autopilot Mode:**

**Platform Account Risk - ELEVATED**
Autopilot's automated submissions are more likely to trigger platform detection systems than user-reviewed Copilot submissions. We implement conservative rate limits and human-like timing, but the risk of account restrictions is higher in Autopilot Mode than in Copilot Mode. This risk is especially elevated on LinkedIn.

**Application Quality Risk**
Without your per-application review, there is a higher chance that an application may contain suboptimal AI-generated responses. Our quality gates catch most issues, but no system is infallible.

**Irrevocability Risk**
Once an application is submitted, it generally cannot be retrieved. In Copilot Mode, you can catch errors before submission. In Autopilot Mode, errors are caught only after submission, during your review of the post-session summary.

**Legal Attribution Risk**
Applications submitted by Autopilot are legally attributable to you. If the system submits an application to an unintended employer, with an incorrect salary expectation, or with an inaccurate response to a screening question, you bear the legal consequences of that submission.

**We strongly recommend that you:**

- Start with Copilot Mode to build confidence in the system's accuracy
- Configure your Q&A bank thoroughly before using Autopilot
- Set conservative limits for your first Autopilot session (5 applications maximum)
- Review your first post-session summary carefully before increasing limits
- Maintain an up-to-date company exclusion list

[View Terms of Service - Section X: Autopilot Mode]
[View Privacy Policy - Section Y: Automated Decision-Making]

[Cancel -- Stay in Copilot Mode] [I Understand -- Proceed to Autopilot Consent]

---

### 7.5 Per-Session Confirmation Dialog

This dialog appears at the START of each Autopilot session:

---

**START AUTOPILOT SESSION**

**Session Parameters:**

- Platforms: [LinkedIn, Greenhouse] (configured in settings)
- Maximum applications this session: [10] [Edit]
- Session time limit: [2 hours] [Edit]
- Resume: [Software_Engineer_Resume_v3.pdf] [Change]
- Salary range: [$120K - $150K] [Edit]

**Exclusion list:** 7 companies blocked [View/Edit]
**Q&A bank:** 42 questions configured [View/Edit]

**Quality threshold:** 80% minimum confidence (not editable)

**Sensitive field handling:**

- EEO questions: Decline to answer [Change]
- Background check consent: Block and notify me [Not editable]
- SSN/ID fields: Block and notify me [Not editable]

**Kill switch reminder:** Press Ctrl+Shift+K or click the red STOP button at any time to immediately stop Autopilot.

[Cancel] [Start Autopilot Session]

---

## 8. Implementation Checklist

### 8.1 Before Autopilot Launch

**Legal:**

- [ ] Outside counsel review of all documents in Section 7
- [ ] ToS updated with Autopilot-specific clauses (Section 7.1)
- [ ] Privacy Policy updated with Article 22 section (Section 7.2)
- [ ] DPIA (Data Protection Impact Assessment) completed for Autopilot mode
- [ ] Insurance review with broker -- enhanced E&O coverage
- [ ] Legal questions LQ1-LQ5 from PRD resolved (especially UETA registration)
- [ ] Binding arbitration clause decision (PRD LQ3)
- [ ] Jurisdictional analysis: which states/countries can use Autopilot?

**Engineering:**

- [ ] Autopilot consent form implemented (Section 7.3)
- [ ] Legal disclaimer modal implemented (Section 7.4)
- [ ] Per-session confirmation dialog implemented (Section 7.5)
- [ ] Kill switch implemented per specification (Section 5.2)
- [ ] Quality gates implemented per specification (Section 5.1)
- [ ] Rate limits enforced per platform table (Section 5.1)
- [ ] Cool-down periods enforced (Section 5.4)
- [ ] Audit trail logging per schema (Section 4.2)
- [ ] Post-submission summary email system (Section 5.5)
- [ ] Sensitive field hard blocks implemented (Section 4.5)
- [ ] Company exclusion list feature (mandatory for Autopilot)
- [ ] Consent versioning and re-consent triggers (Section 3.6)
- [ ] Consent revocation mechanisms (Section 3.4)
- [ ] Screenshot capture and encrypted storage for Autopilot sessions
- [ ] Application withdrawal attempt feature

**Compliance:**

- [ ] DPA review with Anthropic for Autopilot-tier processing
- [ ] DPA review with OpenAI for Autopilot-tier processing
- [ ] Zero-retention agreements in place for enterprise API tiers
- [ ] GDPR Article 22 compliance documentation
- [ ] Data retention policies implemented per Section 4.2
- [ ] User data export endpoint includes Autopilot audit data

**Operations:**

- [ ] Support team trained on Autopilot-specific issues
- [ ] Escalation procedure for Autopilot disputes/complaints
- [ ] Monitoring dashboards for Autopilot quality metrics
- [ ] Incident response procedure for platform C&D letters
- [ ] Platform-specific Autopilot kill switch (admin-side)

### 8.2 Ongoing Compliance

- [ ] Monthly review of quality gate effectiveness (false positive/negative rates)
- [ ] Quarterly DPIA review
- [ ] Quarterly audit trail integrity check
- [ ] Monitor Amazon v. Perplexity case outcome and adjust CFAA risk assessment
- [ ] Monitor for any enforcement actions against auto-apply competitors
- [ ] Annual insurance policy review
- [ ] Re-consent on any ToS/privacy policy changes

---

## 9. Sources

### Legal Framework & UETA

- [Contract Law in the Age of Agentic AI (Proskauer)](https://www.proskauer.com/blog/contract-law-in-the-age-of-agentic-ai-whos-really-clicking-accept)
- [Autonomous Agents and UETA (MIT Computational Law Report)](https://law.mit.edu/pub/1999-ueta-deliberations)
- [AI Agents and Electronic Contracts: The Laws Already Say "Yes"](https://rnwy.group/ai-agents-and-electronic-contracts-the-laws-already-say-yes/)
- [My Agent Messed Up! Understanding Errors and Recourse in AI Transactions (Consumer Reports)](https://innovation.consumerreports.org/my-agent-messed-up-understanding-errors-and-recourse-in-ai-transactions/)
- [From Fine Print to Machine Code: AI Agents Rewriting the Rules (Stanford CodeX)](https://law.stanford.edu/2025/01/21/from-fine-print-to-machine-code-how-ai-agents-are-rewriting-the-rules-of-engagement-2/)
- [Legal Challenges of Agentic AI: User Liability (nquiringminds)](https://nquiringminds.com/ai-legal-news/legal-challenges-of-agentic-ai-user-liability-and-existing-frameworks/)
- [Rise of Agentic AI: Potential Legal Risks (DLA Piper)](https://www.dlapiper.com/en/insights/publications/ai-outlook/2025/the-rise-of-agentic-ai--potential-new-legal-and-organizational-risks)
- [When AI Agents Conduct Transactions (Dazza Greenwood)](https://www.dazzagreenwood.com/p/when-ai-agents-conduct-transactions)

### CFAA & Van Buren

- [Van Buren v. United States - Wikipedia](https://en.wikipedia.org/wiki/Van_Buren_v._United_States)
- [How 2 Tech Statutes Are Being Applied to Agentic AI (Mondaq/Weil)](https://www.mondaq.com/unitedstates/new-technology/1741716/how-2-tech-statutes-are-being-applied-to-agentic-ai)
- [CFAA After Van Buren (ACS)](https://www.acslaw.org/analysis/acs-journal/2020-2021-acs-supreme-court-review/the-computer-fraud-and-abuse-act-after-van-buren/)
- [SCOTUS Limits CFAA Reach (DWT)](https://www.dwt.com/blogs/media-law-monitor/2021/10/scotus-cfaa-decision)
- [Van Buren: Implications of What is Left Unsaid (IAPP)](https://iapp.org/news/a/van-buren-the-implications-of-what-is-left-unsaid)

### GDPR Article 22 & Automated Decision-Making

- [Art. 22 GDPR - Automated Individual Decision-Making (gdpr-info.eu)](https://gdpr-info.eu/art-22-gdpr/)
- [Automated Decision Making: Overview of GDPR Article 22 (GDPR Local)](https://gdprlocal.com/automated-decision-making-gdpr/)
- [AI Gets Personal: CCPA vs. GDPR on Automated Decision-Making (Berkeley Tech Law Journal)](https://btlj.org/2025/04/ccpa-vs-gdpr-on-automated-decision-making/)
- [UK's New Automated Decision-Making Rules (Debevoise)](https://www.debevoisedatablog.com/2025/11/19/the-uks-new-automated-decision-making-rules-and-how-they-compare-to-the-eu-gdpr/)
- [Understanding Right to Explanation in GDPR and AI Act (TechPolicy.Press)](https://www.techpolicy.press/understanding-right-to-explanation-and-automated-decisionmaking-in-europes-gdpr-and-ai-act/)
- [Algorithmic Recruitment and Automated Decision-Making in the EU (SAGE Journals)](https://journals.sagepub.com/doi/10.1177/20319525221093815)

### GDPR Consent & Withdrawal

- [How to Easily Withdraw Consent (GDPR Local)](https://gdprlocal.com/withdraw-consent/)
- [Article 7 GDPR - Conditions for Consent (GDPRhub)](https://gdprhub.eu/Article_7_GDPR)
- [Right to Withdraw Consent - Article 7(3) (noyb.eu)](https://noyb.eu/en/your-right-withdraw-your-consent-article-73)
- [Engineering GDPR Compliance in the Age of Agentic AI (IAPP)](https://iapp.org/news/a/engineering-gdpr-compliance-in-the-age-of-agentic-ai)
- [How to Make AI Agents GDPR-Compliant (heyData)](https://heydata.eu/en/magazine/how-to-make-ai-agents-gdpr-compliant/)

### LinkedIn & Platform Enforcement

- [LinkedIn Prohibited Software and Extensions](https://www.linkedin.com/help/linkedin/answer/a1341387)
- [LinkedIn User Agreement](https://www.linkedin.com/legal/user-agreement)
- [LinkedIn Wins Against Proxycurl (2025)](https://www.socialmediatoday.com/news/linkedin-wins-legal-case-data-scrapers-proxycurl/756101/)
- [LinkedIn Takes Legal Action to Defend Member Privacy](https://news.linkedin.com/2025/linkedin-takes-legal-action-to-defend-member-privacy)
- [hiQ Labs v. LinkedIn](https://en.wikipedia.org/wiki/HiQ_Labs_v._LinkedIn)

### Competitor Analysis

- [LazyApply Terms of Service](https://lazyapply.com/terms)
- [LazyApply Privacy Policy](https://lazyapply.com/privacy)
- [Sonara Terms of Service](https://www.sonara.ai/terms-conditions)
- [Massive Auto-Apply](https://usemassive.com/auto-apply-wizard)
- [2025's Best Auto-Apply Tools (Jobright)](https://jobright.ai/blog/2025s-best-auto-apply-tools-for-tech-job-seekers/)
- [Is Sonara AI Shutting Down? (Medium/Jobsolv)](https://medium.com/@jobsolv/is-sonara-ai-shutting-down-top-notch-sonara-ai-alternatives-8d950dfaa4b2)

### Insurance

- [2025 Guide to Tech E&O Insurance Requirements (MoneyGeek)](https://www.moneygeek.com/insurance/business/tech-e-o-insurance/)
- [Do You Need E&O Insurance - Guide for 2026 (MoneyGeek)](https://www.moneygeek.com/insurance/business/coverage/do-you-need-e-and-o/)
- [E&O Insurance for Employment/Recruiting](https://www.errorsandomissionsonline.com/EmploymentRecruiting.php)

### Internal References

- [WeKruit Safety, Legal & Integration Architecture](/research/10_safety_legal_architecture.md)
- [WeKruit PRD - Risks & Mitigations (Section 10)](/product-research/03_complete_prd.md)
- [LegalDisclaimerModal.tsx](/src/components/content-script/components/platform-specific/linkedin/LegalDisclaimerModal.tsx)
- [usageLimitsConfig.ts](/src/components/content-script/components/platform-specific/linkedin/utils/usageLimitsConfig.ts)

---

_This document is for internal planning and research purposes. All draft legal language must be reviewed by qualified legal counsel before use. This document does not constitute legal advice._

_End of document._
