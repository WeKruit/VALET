# Repository Fit Assessment

> **Status:** Phase 1 deliverable
> **Purpose:** Define reuse boundaries, integration patterns, and decision gates for three
> external repositories evaluated against the VALET UX chain.
> **Depends on:** `docs/ux-onboarding.md` (Phase 0), `docs/ux-chain.md` (Phase 0)

---

## Table of Contents

1. [Assessment Summary](#1-assessment-summary)
2. [Resume-Matcher](#2-resume-matcher)
3. [DengNaichen/job](#3-dengnaichenjob)
4. [Metabase](#4-metabase)
5. [UX Chain Stage Mapping](#5-ux-chain-stage-mapping)
6. [Decision Gates](#6-decision-gates)

---

## 1. Assessment Summary

| Repository                                                | License    | UX Chain Stage                            | Relationship       | Direct Dependency? |
| --------------------------------------------------------- | ---------- | ----------------------------------------- | ------------------ | ------------------ |
| [Resume-Matcher](https://github.com/srbhr/Resume-Matcher) | Apache 2.0 | Stage 4 (Fit Lab)                         | Pattern reuse      | No                 |
| [DengNaichen/job](https://github.com/DengNaichen/job)     | Unlicensed | Auxiliary (`/jobs`) + Stage 3 (Workbench) | Workflow reference | No                 |
| [Metabase](https://github.com/metabase/metabase)          | AGPL v3    | Stage 9 (Insights)                        | Decision gate      | TBD                |

**Key rule:** None of these repositories are imported as runtime dependencies. Resume-Matcher
and DengNaichen/job inform VALET's design patterns. Metabase is an operational tool whose
exposure level requires an explicit decision.

---

## 2. Resume-Matcher

**Repo:** https://github.com/srbhr/Resume-Matcher
**License:** Apache 2.0
**Stack:** FastAPI + Next.js 15 + TinyDB + LiteLLM (multi-provider)

### What It Does

LLM-powered resume tailoring. User uploads a master resume, pastes a job description,
and receives AI-generated improvements with a structured diff showing exactly what changed.
Multi-pass refinement validates that no fabricated content is introduced.

### Patterns to Reuse

#### 2a. Resume Diff Model

Resume-Matcher computes a structured diff between original and improved resumes
(`calculate_resume_diff()` in `improver.py`). The diff output is a list of
`ResumeFieldDiff` objects:

```
ResumeFieldDiff {
  field_path:  "workExperience[0].description"
  field_type:  "description" | "skill" | "certification" | "summary" | ...
  change_type: "added" | "removed" | "modified"
  original_value: string | null
  new_value: string | null
  confidence: "high" | "medium" | "low"
}
```

With a summary:

```
ResumeDiffSummary {
  total_changes: number
  skills_added: number
  skills_removed: number
  descriptions_modified: number
  certifications_added: number
  high_risk_changes: number
}
```

**VALET mapping:** This maps directly to the `tailoringSummary` field in our task
response schema (`matchScoreBefore`, `matchScoreAfter`, `changedSections`). The Fit Lab
panel (Stage 4, `/apply?panel=fitlab`) will display these diffs inline so the user sees
exactly which resume sections were modified for a given job.

**Implementation:** Re-implement in TypeScript using `packages/llm` for the LLM calls.
The diff comparison logic (SequenceMatcher for ordered lists, set comparison for
unordered lists like skills) is straightforward to port. Do not use Python difflib --
use a JS equivalent or custom implementation.

#### 2b. Keyword Gap Analysis

Resume-Matcher splits missing keywords into two categories:

- **Injectable:** Keywords that exist in the master resume but are missing from the
  tailored version. Safe to add because they are factually true.
- **Non-injectable:** Keywords required by the JD that do not appear anywhere in the
  master resume. Adding them would be fabrication.

**VALET mapping:** This directly informs the `resumeRephraseMode` enum from
`autonomy.schema.ts`:

| Mode      | Behavior                    | Injectable keywords | Non-injectable keywords                      |
| --------- | --------------------------- | ------------------- | -------------------------------------------- |
| `off`     | No tailoring                | Ignored             | Ignored                                      |
| `honest`  | Conservative                | Added where natural | Never added                                  |
| `ats_max` | Aggressive ATS optimization | Always added        | Flagged for user review, never auto-inserted |

#### 2c. Alignment Validation

Resume-Matcher validates the improved resume against the master to catch LLM
fabrication. Violation types: `fabricated_skill`, `fabricated_cert`,
`fabricated_company`, `invented_content`. An `AlignmentReport` returns a boolean
`is_aligned` plus a list of violations with severity.

**VALET mapping:** This is critical for user trust (UX chain principle: "no hidden
actions"). Before submitting a tailored resume, VALET must run alignment validation
and surface any violations in the Fit Lab panel. If violations are detected in
`ats_max` mode, the user must explicitly approve.

#### 2d. Enrichment Q&A Flow

Resume-Matcher has an interactive enrichment flow: AI identifies weak resume items,
generates clarifying questions (max 6), user answers, AI generates enhanced bullet
points (additive, not replacement).

**VALET mapping:** This pattern could inform the onboarding profile-strengthening step
(Step 6 in `ux-onboarding.md`) or a future "Resume Strengthener" feature. Not needed
for initial Fit Lab MVP but worth noting as a Phase 4+ enhancement.

#### 2e. Prompt Injection Sanitization

Resume-Matcher sanitizes user-supplied text (JDs, resume content) before embedding in
LLM prompts. Pattern-based regex removal of common injection phrases.

**VALET mapping:** Apply the same pattern in any VALET service that passes user text
to `packages/llm`. Relevant for Fit Lab keyword extraction and resume improvement prompts.

### What NOT to Reuse

| Component                              | Reason                                                                |
| -------------------------------------- | --------------------------------------------------------------------- |
| TinyDB storage                         | We use Supabase Postgres                                              |
| Next.js frontend                       | We re-implement all UI in VALET's Radix + Tailwind design system      |
| PDF generation (Playwright + Chromium) | Not needed -- resume variants are stored as structured data, not PDFs |
| LiteLLM abstraction                    | We have `packages/llm`                                                |
| FastAPI backend                        | We have Fastify + ts-rest                                             |

### Reuse Boundary

Resume-Matcher is a **pattern source**, not a dependency. We study its algorithms and
data structures, then re-implement in TypeScript within VALET's existing architecture.
No code is copied verbatim. The Apache 2.0 license permits this without restriction.

---

## 3. DengNaichen/job

**Repo:** https://github.com/DengNaichen/job
**License:** None specified (treat as reference only)
**Stack:** FastAPI + PostgreSQL + async SQLAlchemy + Alembic + pgvector

### What It Does

Job aggregation microservice that fetches listings from ATS APIs (Greenhouse, Lever,
Ashby, SmartRecruiters, Eightfold, Apple, Uber, TikTok), normalizes them into a
unified schema, stores in Postgres with pgvector embeddings, and provides a
multi-stage matching/recommendation API.

### Patterns to Reuse

#### 3a. Fetcher/Mapper Architecture

DengNaichen/job has a clean separation between fetching and normalization:

```
ingest/fetchers/greenhouse.py   extends BaseFetcher
ingest/mappers/greenhouse.py    extends BaseMapper
```

Each platform has exactly one fetcher (API-specific) and one mapper (normalizes to
`JobCreate` schema). New platforms are added by implementing the two interfaces.

**VALET mapping:** This pattern maps to the Job Inbox (`/jobs`, auxiliary route in
`ux-chain.md`). When VALET ingests job leads (from user-pasted URLs, API integrations,
or future job board partnerships), each source needs a fetcher + mapper pair. The
`job_leads` table (from the DB migration task) stores normalized output.

#### 3b. Multi-Stage Scoring Pipeline

DengNaichen/job uses a three-stage scoring pipeline:

1. **Vector recall:** pgvector cosine similarity on Gemini embeddings of structured JDs
2. **Hard filters:** sponsorship eligibility, minimum degree rank, experience years gap
3. **Deterministic reranking:** weighted composite score

```
final_score = 0.70 * cosine_similarity
            + 0.15 * skill_overlap_score
            + 0.10 * domain_match_score
            + 0.05 * seniority_match_score
            - experience_penalty
            - education_penalty
```

Plus an optional **LLM reranking** pass on the top-N results:

```
LLM recommendation: strong_yes | yes | maybe | stretch | no
Score adjustment: +0.03 (strong_yes) to -0.03 (no)
```

The LLM also returns `reasons`, `gaps`, and `resume_focus_points` for each
recommendation.

**VALET mapping:** This informs how we rank leads in the Job Inbox. The composite
scoring formula and its weight distribution (70% semantic, 15% skills, 10% domain,
5% seniority) are a useful starting point. The hard filter stage maps to our
`autonomyReadinessSchema.platformReadiness` -- jobs on platforms where the user has
no credentials get deprioritized.

The LLM reranking output (`gaps`, `resume_focus_points`) maps to Fit Lab content:
these are the signals that tell the user "here's what to improve on your resume
for this specific job."

#### 3c. Domain Adjacency Map

DengNaichen/job defines which job domains are "adjacent" for matching:

```
software_engineering <-> data_ai, product_program
data_ai <-> software_engineering, operations, finance_treasury
product_program <-> software_engineering, operations
```

Adjacent domains get 0.5 score (vs 1.0 for exact match, 0.0 for no relationship).

**VALET mapping:** Useful for the Fit Lab's match scoring. A software engineer
applying to a data engineering role should see a "moderate fit" label, not "no match."

#### 3d. SyncRun Audit Trail

Every job sync run records: `fetched_count`, `mapped_count`, `unique_count`,
`deduped_by_external_id`, `inserted_count`, `updated_count`, `closed_count`,
`failed_count`. Overlap protection prevents concurrent syncs per source.

**VALET mapping:** Reference for tracking Job Inbox refresh cycles. When VALET
periodically re-scans a user's saved job sources, we need similar audit metadata
to debug sync issues and show freshness indicators in the UI.

### What NOT to Reuse

| Component                      | Reason                                                 |
| ------------------------------ | ------------------------------------------------------ |
| Python codebase                | VALET is TypeScript end-to-end                         |
| SQLAlchemy + Alembic           | We use Drizzle ORM                                     |
| pgvector embeddings            | May evaluate separately; not part of initial Job Inbox |
| Gemini-specific embedding code | We have `packages/llm`                                 |
| Direct ATS API integrations    | Future work; initial Job Inbox is URL-paste-based      |

### Reuse Boundary

DengNaichen/job is a **workflow-structure reference**. We study its pipeline topology
(fetch -> normalize -> filter -> score -> rerank) and scoring weights, then build
equivalent TypeScript services within VALET's architecture. No code import. The lack
of an explicit license means we cannot copy code even if we wanted to -- we reference
the design patterns only.

---

## 4. Metabase

**Repo:** https://github.com/metabase/metabase
**License:** AGPL v3 (open source edition) / Metabase Commercial License (paid)

### What It Does

Open-source business intelligence and analytics tool. Self-hostable, provides SQL
querying, dashboards, charts, and an embedding API for third-party applications.

### Licensing Analysis

| Path                            | License                                         | Cost                                                  | Constraint                                                                                                                                                      |
| ------------------------------- | ----------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A: Internal-only**            | AGPL v3                                         | Free                                                  | Metabase dashboards accessible only to VALET team (admin routes). No customer exposure. No AGPL propagation.                                                    |
| **B: Customer-facing embedded** | Commercial                                      | Paid (Embedding License or Premium Embedding License) | Required if Metabase iframes appear in customer-facing routes. Free tier requires "Powered by Metabase" badge. Premium tier removes badge and AGPL propagation. |
| **C: Hybrid (recommended)**     | AGPL v3 for internal; native VALET for customer | Free                                                  | Internal dashboards via self-hosted Metabase (admin panel only). Customer-facing analytics via native VALET charts in the Insights page. No AGPL question.      |

### Decision Gate

The exposure decision must be made before implementing Stage 9 (Insights, `/insights`).

**Question:** Will any Metabase UI (iframe, embedded dashboard, or embedded question)
ever render inside a customer-facing route?

| Answer              | Path                    | Action                                                                                                                                               |
| ------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No** (default)    | Path C (hybrid)         | Self-host Metabase for internal admin analytics. Build `/insights` page with native charts (Recharts/D3, already partially used in dashboard stats). |
| **Yes, with badge** | Path B (free embedding) | Apply for Metabase Embedding License. All embedded artifacts show "Powered by Metabase."                                                             |
| **Yes, no badge**   | Path B (premium)        | Purchase Premium Embedding License. Budget TBD.                                                                                                      |

**Recommendation:** Start with Path C. Build the Insights page shell with native
charts. If analytics requirements grow beyond what's practical to build natively,
revisit the Metabase embedding decision with cost-benefit analysis.

### VALET Mapping

| Usage                                                 | Route               | Audience | Source                            |
| ----------------------------------------------------- | ------------------- | -------- | --------------------------------- |
| Application trends, success rates, platform breakdown | `/insights`         | Customer | Native VALET charts               |
| System health, task throughput, error rates           | `/admin/monitoring` | Internal | Metabase (self-hosted) or Grafana |
| User cohort analysis, conversion funnels              | Internal dashboard  | Internal | Metabase (self-hosted)            |

### What NOT to Reuse

Metabase is not a code-level dependency in any scenario. It is either:

- A self-hosted service accessed by the VALET team via browser, or
- An embedded iframe in VALET's web app (requiring commercial license)

---

## 5. UX Chain Stage Mapping

How each repository maps to specific stages from `docs/ux-chain.md`:

| Chain Stage          | Route                 | Repository                   | What It Informs                                             |
| -------------------- | --------------------- | ---------------------------- | ----------------------------------------------------------- |
| Stage 2: Onboarding  | `/onboarding`         | Resume-Matcher (2d)          | Future enrichment Q&A for profile strengthening             |
| Stage 3: Workbench   | `/apply`              | DengNaichen/job (3b)         | Scoring formula for job-resume match indicator in left rail |
| Stage 4: Fit Lab     | `/apply?panel=fitlab` | Resume-Matcher (2a, 2b, 2c)  | Diff model, keyword gap analysis, alignment validation      |
| Auxiliary: Job Inbox | `/jobs`               | DengNaichen/job (3a, 3b, 3d) | Fetcher/mapper pattern, multi-stage scoring, sync audit     |
| Stage 9: Insights    | `/insights`           | Metabase (decision gate)     | Analytics engine decision                                   |

Stages not touched by any external repo: Landing (1), Live Execution (5),
Intervention (6), Proof Pack (7), Tracker (8), Settings (10).

---

## 6. Decision Gates

### Gate 1: Metabase Exposure (blocks Stage 9 implementation)

- **Decision:** Internal-only vs customer-facing embedded
- **Default:** Path C (hybrid) -- no Metabase in customer routes
- **Revisit trigger:** Product request for analytics features that exceed native charting
- **Owner:** Product + Engineering lead
- **Linear ticket:** Create when Stage 9 implementation starts

### Gate 2: ATS API Integrations (blocks Job Inbox beyond URL-paste)

- **Decision:** Which ATS APIs to integrate first
- **Default:** URL-paste only for Job Inbox MVP
- **Revisit trigger:** User demand for auto-discovery of jobs
- **Reference:** DengNaichen/job fetcher/mapper patterns
- **Owner:** Engineering lead

### Gate 3: Resume Rephrase Mode Guardrails (blocks `ats_max` mode)

- **Decision:** What level of resume modification is acceptable in `ats_max`
- **Default:** `honest` mode only at launch; `ats_max` behind feature flag
- **Revisit trigger:** User testing shows demand for aggressive optimization
- **Reference:** Resume-Matcher alignment validation pattern
- **Owner:** Product + Legal
