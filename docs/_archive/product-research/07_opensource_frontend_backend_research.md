# Open-Source Frontend & Backend Research for WeKruit AutoApply Copilot

**Date:** 2026-02-11
**Purpose:** Evaluate open-source projects that WeKruit can leverage instead of building from scratch.
**Tech Stack Context:** React 18 + TypeScript + Tailwind CSS | FastAPI + PostgreSQL + Hatchet | Google OAuth 2.0 + JWT | WebSocket | S3-compatible storage

---

## Table of Contents

1. [Category 1: Full Admin/Dashboard Templates (React + Tailwind)](#category-1-full-admindashboard-templates)
2. [Category 2: Backend Admin Frameworks (Python/FastAPI)](#category-2-backend-admin-frameworks)
3. [Category 3: Real-Time Task/Job Monitoring UIs](#category-3-real-time-taskjob-monitoring-uis)
4. [Category 4: Billing/Subscription Systems](#category-4-billingsubscription-systems)
5. [Category 5: Resume Parsing Libraries](#category-5-resume-parsing-libraries)
6. [Category 6: noVNC / Remote Browser Viewer Components](#category-6-novnc--remote-browser-viewer-components)
7. [Category 7: Notification System Libraries](#category-7-notification-system-libraries)
8. [Category 8: Form Builder / Dynamic Form Libraries](#category-8-form-builder--dynamic-form-libraries)
9. [Build vs Buy vs Integrate Matrix](#build-vs-buy-vs-integrate-matrix)
10. [Recommended Stack](#recommended-stack)

---

## Category 1: Full Admin/Dashboard Templates

### 1A. shadcn-admin (by satnaing) -- RECOMMENDED

| Attribute       | Details                                                       |
| --------------- | ------------------------------------------------------------- |
| **GitHub**      | https://github.com/satnaing/shadcn-admin                      |
| **Stars**       | ~10.9k                                                        |
| **License**     | MIT                                                           |
| **Last Commit** | Active (2025-2026)                                            |
| **Tech Stack**  | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Radix UI |

**What it gives us for free:**

- Complete admin layout with sidebar navigation, responsive design
- Auth pages (sign-in, sign-up, forgot password, OTP)
- Dashboard with charts and analytics widgets
- Data tables with sorting, filtering, pagination (TanStack Table)
- User settings and profile pages
- Dark/light mode toggle
- Notification system skeleton
- Form components with validation
- Error handling pages (403, 404, 500)
- Breadcrumb navigation

**Integration effort:** LOW (1-2 weeks). This is essentially a drop-in starter. Built on shadcn/ui which is the same component system we would use. Vite-based, React 18 + TypeScript + Tailwind CSS -- exact match to our stack. We fork it and customize.

**Estimated dev weeks saved:** 6-8 weeks

**Why this over alternatives:** Unlike Refine or React Admin, shadcn-admin is a UI template, not a framework. This means zero vendor lock-in, full control over every component, and no opinionated data-fetching layer that fights with our existing FastAPI backend. shadcn/ui components are copy-paste, so we own the code.

---

### 1B. Refine

| Attribute       | Details                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| **GitHub**      | https://github.com/refinedev/refine                                     |
| **Stars**       | ~30.5k                                                                  |
| **License**     | MIT                                                                     |
| **Last Commit** | Active (weekly)                                                         |
| **Tech Stack**  | React, TypeScript, headless (supports Ant Design, MUI, Chakra, Mantine) |

**What it gives us for free:**

- Headless CRUD framework with hooks for data fetching, auth, access control
- Pre-built data providers for REST and GraphQL APIs
- Authentication hooks (useLogin, useLogout, useRegister, usePermissions)
- Real-time data support (WebSocket-compatible)
- i18n, audit logging, notifications baked in
- CLI scaffolding for CRUD pages

**Integration effort:** MEDIUM (3-4 weeks). Refine is a framework, not a template. It requires adopting its data provider pattern to connect to our FastAPI backend. The headless approach means we can use any UI, but we need to write custom data providers.

**Estimated dev weeks saved:** 8-12 weeks (if fully adopted)

**Trade-offs:** Heavy abstraction layer. If our app evolves beyond standard CRUD patterns (which it will with automation workflows, real-time browser viewing, etc.), Refine's opinions may become constraints. Best for internal admin tools, less ideal for user-facing product dashboards.

---

### 1C. React Admin (by Marmelab)

| Attribute       | Details                                 |
| --------------- | --------------------------------------- |
| **GitHub**      | https://github.com/marmelab/react-admin |
| **Stars**       | ~26.5k                                  |
| **License**     | MIT                                     |
| **Last Commit** | Active (weekly)                         |
| **Tech Stack**  | React, TypeScript, Material UI          |

**What it gives us for free:**

- Complete admin framework with 45+ backend adapters
- Declarative CRUD screens with filters, data grids, forms, navigation
- Authentication, authorization, roles and permissions
- Rich text editor, notifications, theming, caching
- Enterprise edition available for additional modules

**Integration effort:** MEDIUM-HIGH (3-5 weeks). Material UI is not our stack (we use Tailwind). Would require either accepting MUI or significant restyling effort. The data provider pattern would need a custom adapter for FastAPI.

**Estimated dev weeks saved:** 8-10 weeks

**Trade-offs:** MUI dependency creates significant styling divergence from our Tailwind-based design system. The Enterprise features require a paid license.

---

### 1D. TailAdmin React

| Attribute       | Details                                                          |
| --------------- | ---------------------------------------------------------------- |
| **GitHub**      | https://github.com/TailAdmin/free-react-tailwind-admin-dashboard |
| **Stars**       | ~1.8k                                                            |
| **License**     | MIT                                                              |
| **Last Commit** | Active (2025-2026)                                               |
| **Tech Stack**  | React, TypeScript, Tailwind CSS                                  |

**What it gives us for free:**

- 200+ UI components (charts, tables, forms, modals, cards, navbars)
- Dashboard layout with sidebar navigation
- Calendar, profile, settings pages
- Auth pages
- Dark mode

**Integration effort:** LOW (1-2 weeks). Direct React + Tailwind match. However, components are less polished than shadcn-admin and don't use Radix UI primitives for accessibility.

**Estimated dev weeks saved:** 4-6 weeks

---

### 1E. Tremor (Chart/Analytics Components)

| Attribute       | Details                                             |
| --------------- | --------------------------------------------------- |
| **GitHub**      | https://github.com/tremorlabs/tremor                |
| **Stars**       | ~16k+                                               |
| **License**     | Apache 2.0                                          |
| **Last Commit** | Oct 2025 (main repo), Jan 2025 (npm package)        |
| **Tech Stack**  | React, TypeScript, Tailwind CSS, Radix UI, Recharts |

**What it gives us for free:**

- 35+ customizable chart and dashboard components
- Built on Tailwind CSS and Radix UI (exact match to shadcn ecosystem)
- Area charts, bar charts, donut charts, progress bars, KPI cards
- Copy-paste component model (like shadcn)
- Dark mode support

**Integration effort:** VERY LOW (days). These are drop-in chart components. Use alongside shadcn-admin for the analytics/dashboard views.

**Estimated dev weeks saved:** 2-3 weeks (specifically for analytics UI)

**Note:** Tremor has shifted to a copy-paste model similar to shadcn, so components can be customized freely. Perfect complement to shadcn-admin for the admin analytics section.

---

### Category 1 Verdict

**Primary choice: shadcn-admin + Tremor charts**

Fork shadcn-admin as the dashboard shell. Add Tremor components for analytics and data visualization. This gives us a complete, modern, accessible admin dashboard with zero vendor lock-in, built entirely on our exact tech stack (React 18 + TS + Tailwind + Vite).

---

## Category 2: Backend Admin Frameworks

### 2A. SQLAdmin -- RECOMMENDED

| Attribute       | Details                                           |
| --------------- | ------------------------------------------------- |
| **GitHub**      | https://github.com/aminalaee/sqladmin             |
| **Stars**       | ~2.3k                                             |
| **License**     | BSD-3-Clause                                      |
| **Last Commit** | Feb 4, 2026 (v0.23.0)                             |
| **Tech Stack**  | Python, FastAPI, Starlette, SQLAlchemy, Tabler UI |

**What it gives us for free:**

- Auto-generated admin UI from SQLAlchemy models
- CRUD operations on all database tables
- Search, filtering, sorting out of the box
- Relationship handling (foreign keys, many-to-many)
- Custom actions on model rows
- Authentication integration
- File upload support
- Export to CSV

**Integration effort:** VERY LOW (1-2 days). Mount SQLAdmin as a sub-application in our FastAPI app. Define ModelAdmin classes for each SQLAlchemy model. Done. This is a Django-admin equivalent for FastAPI.

**Estimated dev weeks saved:** 3-4 weeks (for internal admin tooling)

**Use case for WeKruit:** Internal operations admin panel. Not user-facing. Let the ops team manage users, job applications, audit logs, feature flags, etc. without building custom admin UIs.

---

### 2B. Starlette Admin

| Attribute       | Details                                                 |
| --------------- | ------------------------------------------------------- |
| **GitHub**      | https://github.com/jowilf/starlette-admin               |
| **Stars**       | ~961                                                    |
| **License**     | MIT                                                     |
| **Last Commit** | May 2025                                                |
| **Tech Stack**  | Python, Starlette, FastAPI, SQLAlchemy/SQLModel/MongoDB |

**What it gives us for free:**

- Admin interface for Starlette/FastAPI applications
- Works with multiple ORMs/ODMs (SQLAlchemy, SQLModel, MongoDB, ODMantic)
- Custom data layer support
- File upload with S3 support
- Authentication and authorization
- i18n support

**Integration effort:** LOW (2-3 days). Similar to SQLAdmin but supports a wider range of data backends.

**Estimated dev weeks saved:** 3-4 weeks

**Trade-offs:** Smaller community than SQLAdmin. Last commit was May 2025, so slightly less active.

---

### 2C. FastAPI-Amis-Admin

| Attribute       | Details                                          |
| --------------- | ------------------------------------------------ |
| **GitHub**      | https://github.com/amisadmin/fastapi-amis-admin  |
| **Stars**       | ~1.5k                                            |
| **License**     | Apache 2.0                                       |
| **Last Commit** | Active (2025)                                    |
| **Tech Stack**  | Python, FastAPI, SQLModel, Amis (Baidu) frontend |

**What it gives us for free:**

- Django-admin-like functionality for FastAPI
- Auto-generated APIs and admin UI from models
- RBAC authentication (FastAPI-User-Auth extension)
- Scheduled task management (FastAPI-Scheduler extension)
- Dynamic configuration management
- Front-end/back-end separation with Amis rendering

**Integration effort:** LOW-MEDIUM (3-5 days). The Amis frontend is rendered by Baidu's Amis framework, which may have localization and customization limitations. Good for internal tools.

**Estimated dev weeks saved:** 3-5 weeks

**Trade-offs:** Amis frontend is less customizable than building our own. Smaller English-language community.

---

### Category 2 Verdict

**Primary choice: SQLAdmin**

SQLAdmin is the clear winner: actively maintained (last release Feb 2026), BSD license, directly integrates with our FastAPI + SQLAlchemy stack, and provides a production-ready internal admin panel in under a day. Use this for internal ops, not for the user-facing dashboard.

---

## Category 3: Real-Time Task/Job Monitoring UIs

### 3A. Hatchet Built-in Dashboard -- RECOMMENDED

| Attribute       | Details                                     |
| --------------- | ------------------------------------------- |
| **GitHub**      | https://github.com/hatchet-dev/hatchet      |
| **Stars**       | ~6.5k                                       |
| **License**     | MIT                                         |
| **Last Commit** | Feb 6, 2026                                 |
| **Tech Stack**  | Go (backend), React (dashboard), PostgreSQL |

**What it gives us for free (since we already use Hatchet):**

- Web dashboard for workflow monitoring and management
- Real-time execution status tracking
- Throughput and latency monitoring
- Step-level activity logs (searchable, filterable)
- Scheduled run management
- Workflow trigger configuration
- REST API for programmatic access
- Performance bottleneck identification

**Integration effort:** ZERO (already part of our stack). Hatchet's dashboard is built in and accessible at a configurable URL. We just need to expose it to our ops team and optionally embed key metrics into our user-facing dashboard via Hatchet's REST API.

**Estimated dev weeks saved:** 4-6 weeks (we do NOT need to build a separate task monitoring UI)

**Key insight:** Since WeKruit already uses Hatchet for task orchestration, the built-in dashboard covers 80% of our task monitoring needs. For user-facing progress indicators, we pull status from Hatchet's API and display via WebSocket to the React frontend.

---

### 3B. Flower (Celery Monitor)

| Attribute       | Details                        |
| --------------- | ------------------------------ |
| **GitHub**      | https://github.com/mher/flower |
| **Stars**       | ~6.9k                          |
| **License**     | BSD-3-Clause                   |
| **Last Commit** | Active                         |
| **Tech Stack**  | Python, Tornado                |

**What it gives us for free:**

- Real-time Celery worker and task monitoring
- Task history and results
- Worker management (shutdown, restart, pool scaling)
- HTTP REST API for cluster management
- Prometheus/Grafana integration
- Rate limiting and authentication

**Integration effort:** N/A -- We use Hatchet, not Celery. Listed for completeness.

**Relevance to WeKruit:** Only relevant if we add Celery workers alongside Hatchet. Not recommended for our architecture.

---

### 3C. Temporal UI

| Attribute       | Details                          |
| --------------- | -------------------------------- |
| **GitHub**      | https://github.com/temporalio/ui |
| **Stars**       | ~1.5k+                           |
| **License**     | MIT                              |
| **Last Commit** | Active                           |
| **Tech Stack**  | TypeScript, Svelte               |

**What it gives us for free:**

- Workflow execution visualization
- Activity and task tracking
- OAuth2/OIDC authentication support
- Configurable session management
- Grafana/DataDog dashboard templates

**Integration effort:** N/A -- We use Hatchet, not Temporal. Listed for reference.

---

### Category 3 Verdict

**Primary choice: Hatchet's built-in dashboard**

No need to adopt additional job monitoring tools. Hatchet already provides everything we need. For user-facing progress tracking, build a thin WebSocket layer that reads Hatchet's API and pushes updates to the React frontend.

---

## Category 4: Billing/Subscription Systems

### 4A. Stripe Official Components + use-stripe-subscription -- RECOMMENDED

| Attribute             | Details                                                |
| --------------------- | ------------------------------------------------------ |
| **GitHub (React.js)** | https://github.com/stripe/react-stripe-js              |
| **GitHub (hooks)**    | https://github.com/clerk/use-stripe-subscription       |
| **Stars**             | react-stripe-js: ~1.8k; use-stripe-subscription: ~500+ |
| **License**           | MIT                                                    |
| **Last Commit**       | Active                                                 |
| **Tech Stack**        | React, TypeScript                                      |

**What it gives us for free:**

- `@stripe/react-stripe-js`: Official React bindings for Stripe Elements (payment forms, card inputs)
- `<stripe-pricing-table>`: No-code embeddable pricing table from Stripe Dashboard
- `use-stripe-subscription`: React hooks for subscription management, feature gating, checkout redirects
- `<Gate>` component for feature gating based on subscription tier
- `redirectToCheckout()` for subscription purchases
- `customerHasFeature()` for access control

**Integration effort:** LOW (1-2 weeks). Stripe's official components handle PCI compliance, payment processing, and webhook handling. The `use-stripe-subscription` library adds subscription-specific React hooks. We build the billing page UI ourselves, but all payment logic is handled.

**Estimated dev weeks saved:** 4-6 weeks

**What we still need to build custom:**

- Usage metering display (track AI credits, auto-apply counts)
- Invoice history page
- Subscription management page (upgrade/downgrade/cancel)
- Admin billing analytics

---

### 4B. Lago

| Attribute       | Details                               |
| --------------- | ------------------------------------- |
| **GitHub**      | https://github.com/getlago/lago       |
| **Stars**       | ~7k+                                  |
| **License**     | AGPL v3 (WARNING)                     |
| **Last Commit** | Active (2026)                         |
| **Tech Stack**  | Ruby on Rails (API), React (frontend) |

**What it gives us for free:**

- Usage-based billing and metering
- Subscription management
- Invoice generation
- Payment orchestration (Stripe, Adyen, GoCardless)
- Revenue analytics
- Self-hosted or cloud deployment
- API-first architecture

**Integration effort:** HIGH (4-6 weeks). Lago is a full billing platform, not a library. It runs as a separate service (Ruby on Rails backend + PostgreSQL). Requires Docker deployment, API integration, webhook setup.

**Estimated dev weeks saved:** 8-12 weeks (for complex billing scenarios)

**CRITICAL WARNING:** AGPL v3 license. For a SaaS product, AGPL requires that any service interacting with Lago over a network must also be open-sourced, OR you must purchase a commercial license. This is a non-starter unless we use their cloud offering or negotiate a commercial license.

**When it makes sense:** Only if WeKruit's billing becomes complex enough to warrant a dedicated billing service (e.g., per-application pricing, overage charges, multi-currency). For MVP, Stripe direct integration is sufficient.

---

### 4C. Kill Bill

| Attribute       | Details                              |
| --------------- | ------------------------------------ |
| **GitHub**      | https://github.com/killbill/killbill |
| **Stars**       | ~5.3k                                |
| **License**     | Apache 2.0                           |
| **Last Commit** | Active (2026)                        |
| **Tech Stack**  | Java, SQL                            |

**What it gives us for free:**

- Full subscription billing platform
- Usage-based billing, recurring, one-off plans
- Native Stripe/Adyen/Braintree/PayPal integration
- Real-time analytics and financial reports
- Multi-tenancy support
- Plugin system for custom logic

**Integration effort:** VERY HIGH (6-8 weeks). Kill Bill is a Java application. Running it alongside our Python/FastAPI stack adds significant operational complexity. It is a separate service requiring its own deployment, database, and maintenance.

**Estimated dev weeks saved:** 10-15 weeks (if billing complexity warrants it)

**Trade-offs:** Massive overkill for an early-stage product. The Java stack adds operational burden. Only consider this if WeKruit scales to enterprise billing needs.

---

### Category 4 Verdict

**Primary choice: Stripe React components + use-stripe-subscription**

For MVP and early growth, direct Stripe integration via their official React components is the fastest path. Build a simple billing page with Stripe's pricing table embed, use `use-stripe-subscription` for feature gating, and handle webhooks in FastAPI. Revisit Lago (via cloud/commercial license) only when billing complexity demands it.

---

## Category 5: Resume Parsing Libraries

### 5A. LLM-Based Parsing (LangChain + Pydantic) -- RECOMMENDED

| Attribute      | Details                                   |
| -------------- | ----------------------------------------- |
| **GitHub**     | https://github.com/langchain-ai/langchain |
| **Stars**      | ~100k+                                    |
| **License**    | MIT                                       |
| **Tech Stack** | Python, supports any LLM provider         |

**What it gives us for free:**

- Define resume schema as Pydantic models
- LLM extracts structured data from unstructured resume text
- Handles diverse resume formats without retraining
- Works with PDFs, DOCX, plain text
- Can use any LLM (OpenAI, Anthropic, local models)
- Automatic prompt generation from Pydantic schema

**Integration effort:** LOW-MEDIUM (1-2 weeks). We already use LLMs in our pipeline. Add a resume parsing chain: PDF/DOCX -> text extraction (via `pdfplumber` or `python-docx`) -> LLM structured extraction via LangChain -> Pydantic validation -> database storage.

**Estimated dev weeks saved:** 3-4 weeks vs building a custom NLP parser

**Why LLM-based over traditional NLP:**

- Handles any resume format without rules/templates
- Better accuracy on non-standard layouts
- Schema-first approach (define what we want, LLM figures out extraction)
- Already have LLM infrastructure in place

---

### 5B. OpenResume (Parser Component)

| Attribute       | Details                                 |
| --------------- | --------------------------------------- |
| **GitHub**      | https://github.com/xitanggg/open-resume |
| **Stars**       | ~8k                                     |
| **License**     | AGPL v3 (WARNING)                       |
| **Last Commit** | Active                                  |
| **Tech Stack**  | Next.js, TypeScript, PDF.js, React-PDF  |

**What it gives us for free:**

- Resume PDF parser (extracts text sections: name, education, experience, skills)
- Resume builder (generates formatted PDFs)
- ATS-friendly formatting
- Privacy-first (client-side processing)

**Integration effort:** MEDIUM (2-3 weeks). The parser logic could be extracted and adapted. However, it's Next.js-based and runs client-side, which doesn't fit our server-side processing needs.

**CRITICAL WARNING:** AGPL v3 license. Same SaaS concerns as Lago. We cannot use this in a commercial SaaS without open-sourcing our code or obtaining a commercial license.

**Useful reference:** Study their parsing approach (PDF.js text extraction + heuristic section detection) even if we don't use the code directly.

---

### 5C. pyresparser

| Attribute       | Details                                    |
| --------------- | ------------------------------------------ |
| **GitHub**      | https://github.com/OmkarPathak/pyresparser |
| **Stars**       | ~1.5k                                      |
| **License**     | MIT                                        |
| **Last Commit** | December 2019 (ABANDONED)                  |
| **Tech Stack**  | Python, spaCy, NLTK                        |

**What it gives us for free:**

- Extracts name, email, phone, skills, experience, education
- Supports PDF and DOCX
- Simple API: `ResumeParser(file).get_extracted_data()`

**Integration effort:** LOW but fragile. The library is unmaintained since 2019. Dependencies are outdated. Extraction accuracy is limited to English resumes with standard formats.

**NOT RECOMMENDED:** Abandoned project. Use LLM-based approach instead.

---

### Category 5 Verdict

**Primary choice: LLM-based parsing with LangChain + Pydantic**

Since WeKruit already has LLM infrastructure, adding a resume parsing chain is straightforward and produces far better results than any traditional NLP library. Define the resume schema as Pydantic models, use `pdfplumber` for PDF text extraction, and let the LLM handle the structured extraction. This handles edge cases that rule-based parsers cannot.

---

## Category 6: noVNC / Remote Browser Viewer Components

### 6A. react-vnc -- RECOMMENDED

| Attribute            | Details                                 |
| -------------------- | --------------------------------------- |
| **GitHub**           | https://github.com/roerohan/react-vnc   |
| **NPM**              | https://www.npmjs.com/package/react-vnc |
| **Stars**            | ~145                                    |
| **License**          | MIT                                     |
| **Last Commit**      | Active (within last 3 months)           |
| **Weekly Downloads** | ~1,666                                  |
| **Tech Stack**       | React, TypeScript, noVNC                |

**What it gives us for free:**

- React component wrapper around noVNC
- `<VncScreen>` component with extensive props
- WebSocket connection management
- Configurable scaling, quality, resize behavior
- Event callbacks for connect/disconnect/clipboard
- TypeScript definitions included

**Integration effort:** LOW (3-5 days). Import `<VncScreen>`, point at the websockified VNC server, configure dimensions and scaling. The component handles the noVNC lifecycle.

**Estimated dev weeks saved:** 2-3 weeks

**What we still need:**

- Backend: websockify proxy to convert VNC -> WebSocket
- Browser automation server running VNC (e.g., headless Chrome in a Docker container with a VNC server)
- Security: authenticate VNC sessions per user

---

### 6B. noVNC (Core Library)

| Attribute       | Details                             |
| --------------- | ----------------------------------- |
| **GitHub**      | https://github.com/novnc/noVNC      |
| **Stars**       | ~13.3k                              |
| **License**     | MPL-2.0                             |
| **Last Commit** | Nov 2025 (v1.7.0-beta)              |
| **Tech Stack**  | JavaScript, HTML5 Canvas, WebSocket |

**What it gives us for free:**

- Full VNC client running in the browser
- HTML5 Canvas rendering (no plugins)
- WebSocket transport
- Clipboard sharing, scaling, encryption support
- Broad browser compatibility

**Integration effort:** MEDIUM (1-2 weeks). noVNC is not React-aware. We'd need to create our own React wrapper, manage lifecycle events, handle resizing. react-vnc (above) already does this.

**When to use directly:** If react-vnc doesn't meet our needs or we need deeper control over the VNC client behavior.

---

### 6C. Neko (WebRTC-based Virtual Browser)

| Attribute       | Details                       |
| --------------- | ----------------------------- |
| **GitHub**      | https://github.com/m1k1o/neko |
| **Stars**       | ~8k+                          |
| **License**     | Apache 2.0                    |
| **Last Commit** | Active                        |
| **Tech Stack**  | Go, Docker, WebRTC, GStreamer |

**What it gives us for free:**

- Self-hosted virtual browser in Docker
- WebRTC streaming (smoother than VNC/WebSocket)
- Built-in audio support (VNC has no audio)
- Multi-participant viewing and control
- Lower latency than noVNC
- Admin controls (give/take control, kick users)

**Integration effort:** MEDIUM-HIGH (2-3 weeks). Neko runs as a Docker container. We'd need to build a React component to embed the WebRTC stream, manage session lifecycle, and integrate with our auth system.

**Estimated dev weeks saved:** 3-4 weeks (vs building WebRTC streaming from scratch)

**When to consider:** If we want higher-quality browser streaming with audio support and lower latency. Neko is a better long-term solution than VNC for watching browser automation in real-time.

---

### Category 6 Verdict

**Short-term: react-vnc (for MVP)**
**Long-term: Neko (for production quality)**

For the MVP, react-vnc provides the fastest path to a "watch the bot work" experience. As we scale, evaluate migrating to Neko for WebRTC-based streaming, which provides smoother video, audio support, and better scalability.

---

## Category 7: Notification System Libraries

### 7A. Novu -- RECOMMENDED (In-App Notifications)

| Attribute       | Details                             |
| --------------- | ----------------------------------- |
| **GitHub**      | https://github.com/novuhq/novu      |
| **Stars**       | ~38.5k                              |
| **License**     | MIT (core), Commercial (enterprise) |
| **Last Commit** | Active (weekly)                     |
| **Tech Stack**  | TypeScript, React, Node.js          |

**What it gives us for free:**

- Embeddable notification inbox React component (`@novu/react`)
- Multi-channel delivery: in-app, email, SMS, push, Slack
- Unified API for all notification channels
- Template management with variables
- Subscriber preference management
- Real-time WebSocket delivery
- Digest/batching of notifications
- Self-hosted or cloud deployment

**Integration effort:** LOW-MEDIUM (1-2 weeks). Install `@novu/react`, add the `<Inbox>` component to our dashboard header. Backend: install `novu` Python SDK, trigger notifications from FastAPI endpoints. For self-hosted: Docker Compose deployment.

**Estimated dev weeks saved:** 6-8 weeks (building a notification system from scratch is surprisingly complex)

**What we still need to build:**

- Notification content templates (what messages to send when)
- Preference UI customization
- Integration with our specific events (application submitted, interview scheduled, etc.)

---

### 7B. Sonner -- RECOMMENDED (Toast Notifications)

| Attribute       | Details                                |
| --------------- | -------------------------------------- |
| **GitHub**      | https://github.com/emilkowalski/sonner |
| **Stars**       | ~10k+                                  |
| **License**     | MIT                                    |
| **Last Commit** | Active                                 |
| **Tech Stack**  | React, TypeScript                      |

**What it gives us for free:**

- Beautiful toast notifications out of the box
- Adopted by shadcn/ui as the official toast component
- Smooth animations, stacking, swipe-to-dismiss
- Promise-based toasts (loading -> success/error)
- Dark mode support
- TypeScript-first API
- Tiny bundle size

**Integration effort:** VERY LOW (hours). `npm install sonner`, add `<Toaster />` to the app root, call `toast()` anywhere. Literally a one-line integration since shadcn-admin already supports it.

**Estimated dev weeks saved:** 1 week

**Use case:** Instant feedback for user actions (form submitted, file uploaded, error occurred). Complements Novu's persistent notification inbox.

---

### 7C. React Email -- RECOMMENDED (Email Templates)

| Attribute       | Details                               |
| --------------- | ------------------------------------- |
| **GitHub**      | https://github.com/resend/react-email |
| **Stars**       | ~18k                                  |
| **License**     | MIT                                   |
| **Last Commit** | Active (Feb 2026)                     |
| **Tech Stack**  | React, TypeScript                     |

**What it gives us for free:**

- Build email templates using React components
- Preview server for email template development
- Responsive email rendering
- Dark mode support for emails
- Pre-built templates (welcome, receipt, notification, etc.)
- Works with any email provider (Resend, SendGrid, AWS SES, etc.)

**Integration effort:** LOW (1 week). Create email templates as React components. Render to HTML on the backend (or use a Node.js sidecar). Send via any SMTP provider.

**Estimated dev weeks saved:** 2-3 weeks

**Trade-off:** React Email is designed for Node.js rendering. Since our backend is Python/FastAPI, we either (a) run a small Node.js service for email rendering, (b) use react-email's CLI to pre-render templates to HTML, or (c) use Python email templating (Jinja2) instead.

**Practical approach:** Pre-render email templates during build time using react-email CLI, store as HTML templates with variables, and render with Jinja2 on the Python backend.

---

### Category 7 Verdict

**Recommended stack:**

- **In-app notifications:** Novu (persistent inbox, multi-channel)
- **Toast notifications:** Sonner (instant feedback)
- **Email templates:** React Email (build-time rendering) or Jinja2 (runtime)

This three-layer approach covers all notification needs: transient UI feedback (Sonner), persistent in-app notifications (Novu), and email/SMS/push delivery (Novu).

---

## Category 8: Form Builder / Dynamic Form Libraries

### 8A. React Hook Form + Zod -- RECOMMENDED

| Attribute        | Details                                            |
| ---------------- | -------------------------------------------------- |
| **GitHub (RHF)** | https://github.com/react-hook-form/react-hook-form |
| **GitHub (Zod)** | https://github.com/colinhacks/zod                  |
| **Stars**        | RHF: ~42k+; Zod: ~35k+                             |
| **License**      | MIT                                                |
| **Last Commit**  | Active (weekly)                                    |
| **Tech Stack**   | React, TypeScript                                  |

**What it gives us for free:**

- High-performance form state management (uncontrolled inputs, minimal re-renders)
- Schema-based validation via Zod
- TypeScript type inference from schemas
- Multi-step form support via useFormContext
- Conditional field rendering
- Field arrays for dynamic lists
- Integration with shadcn/ui form components
- @hookform/resolvers for Zod integration

**Integration effort:** VERY LOW (already standard). This is the de facto standard for React forms. shadcn-admin already uses React Hook Form + Zod. Zero additional setup needed.

**Estimated dev weeks saved:** 3-4 weeks (vs building form infrastructure from scratch)

---

### 8B. react-jsonschema-form (RJSF)

| Attribute       | Details                                            |
| --------------- | -------------------------------------------------- |
| **GitHub**      | https://github.com/rjsf-team/react-jsonschema-form |
| **Stars**       | ~15.2k                                             |
| **License**     | Apache 2.0                                         |
| **Last Commit** | Active (Feb 2026)                                  |
| **Tech Stack**  | React, TypeScript, JSON Schema                     |

**What it gives us for free:**

- Generate forms automatically from JSON Schema
- Dynamic fields based on form data (conditional dependencies)
- UI Schema for controlling rendering
- Validation from JSON Schema constraints
- Multiple theme packages (MUI, Ant Design, Chakra, Semantic UI, Bootstrap, Fluentui)
- Store schemas in backend, render dynamically in frontend

**Integration effort:** MEDIUM (1-2 weeks). No built-in shadcn/ui theme. We would need to create custom widgets for our design system or adapt an existing theme.

**Estimated dev weeks saved:** 4-6 weeks (specifically for the Q&A bank / screening question UI)

**When this shines:** If WeKruit needs a dynamic form builder where non-developers can create screening questions. Store the JSON Schema in the database, render the form dynamically. This is the standard approach for form-builder products.

**Practical approach:** Use RJSF for the Q&A bank where questions are defined as JSON Schemas. Use React Hook Form + Zod for all other forms (auth, settings, profile).

---

### 8C. FormSCN (shadcn/ui Form Builder)

| Attribute      | Details                                                                   |
| -------------- | ------------------------------------------------------------------------- |
| **GitHub**     | Available on GitHub (community project)                                   |
| **License**    | MIT (free, no tiers)                                                      |
| **Tech Stack** | React, Next.js, shadcn/ui, Tailwind CSS, TypeScript, Zod, React Hook Form |

**What it gives us for free:**

- Visual form builder using shadcn/ui components
- Multi-step wizard support
- Automatic state management per step
- Per-step validation
- Code generation from visual builder

**Integration effort:** LOW (3-5 days). Direct match to our component library.

**Use case:** Internal tooling for building forms quickly. Less useful for runtime dynamic forms (use RJSF for that).

---

### Category 8 Verdict

**Primary choice: React Hook Form + Zod (for all standard forms)**
**Secondary choice: react-jsonschema-form (for dynamic Q&A bank / screening questions)**

React Hook Form + Zod is already the standard in our stack via shadcn-admin. For the specific use case of dynamic screening questions (where the schema is stored in the database and rendered at runtime), adopt RJSF with custom shadcn/ui widgets.

---

## Build vs Buy vs Integrate Matrix

| Component                     | Decision                | Project/Approach                  | Effort                      | Dev Weeks Saved |
| ----------------------------- | ----------------------- | --------------------------------- | --------------------------- | --------------- |
| **Dashboard Shell & Layout**  | INTEGRATE               | shadcn-admin (fork)               | 1-2 weeks                   | 6-8             |
| **Charts & Analytics UI**     | INTEGRATE               | Tremor components                 | 2-3 days                    | 2-3             |
| **Internal Admin Panel**      | INTEGRATE               | SQLAdmin                          | 1-2 days                    | 3-4             |
| **Task Monitoring**           | USE EXISTING            | Hatchet Dashboard                 | 0 (already have it)         | 4-6             |
| **User-facing Task Progress** | BUILD                   | Custom WebSocket + React          | 1-2 weeks                   | --              |
| **Billing & Subscriptions**   | INTEGRATE               | Stripe React + hooks              | 1-2 weeks                   | 4-6             |
| **Usage Metering Display**    | BUILD                   | Custom (read from DB)             | 1 week                      | --              |
| **Resume Parsing**            | BUILD (with libs)       | LangChain + pdfplumber + Pydantic | 1-2 weeks                   | 3-4             |
| **Browser Viewer (MVP)**      | INTEGRATE               | react-vnc                         | 3-5 days                    | 2-3             |
| **Browser Viewer (Prod)**     | INTEGRATE               | Neko (WebRTC)                     | 2-3 weeks                   | 3-4             |
| **In-App Notifications**      | INTEGRATE               | Novu                              | 1-2 weeks                   | 6-8             |
| **Toast Notifications**       | INTEGRATE               | Sonner                            | hours                       | 1               |
| **Email Templates**           | INTEGRATE               | React Email (pre-rendered)        | 1 week                      | 2-3             |
| **Standard Forms**            | INTEGRATE               | React Hook Form + Zod             | 0 (comes with shadcn-admin) | 3-4             |
| **Dynamic Q&A Forms**         | INTEGRATE               | react-jsonschema-form             | 1-2 weeks                   | 4-6             |
| **Auth Flow**                 | BUILD                   | Custom (Google OAuth + JWT)       | 2 weeks                     | --              |
| **User Settings**             | BUILD (on template)     | Customize shadcn-admin pages      | 1 week                      | --              |
| **Subscription Mgmt Page**    | BUILD                   | Custom + Stripe API               | 1-2 weeks                   | --              |
| **Admin Analytics Dashboard** | BUILD (with components) | Custom pages + Tremor charts      | 2-3 weeks                   | --              |

---

## Recommended Stack

### Tier 1: Adopt Immediately (High Impact, Low Effort)

| Project                   | Purpose                                               | License    | Integration Time               |
| ------------------------- | ----------------------------------------------------- | ---------- | ------------------------------ |
| **shadcn-admin**          | Dashboard shell, layout, auth pages, tables, settings | MIT        | Fork + 1-2 weeks customization |
| **Tremor**                | Chart components for analytics                        | Apache 2.0 | Drop-in, days                  |
| **SQLAdmin**              | Internal admin panel                                  | BSD-3      | 1-2 days                       |
| **Sonner**                | Toast notifications                                   | MIT        | Hours                          |
| **React Hook Form + Zod** | Form validation (included in shadcn-admin)            | MIT        | Already included               |
| **Hatchet Dashboard**     | Task monitoring                                       | MIT        | Already have it                |

### Tier 2: Adopt for MVP (Medium Effort, High Value)

| Project                                    | Purpose                              | License    | Integration Time |
| ------------------------------------------ | ------------------------------------ | ---------- | ---------------- |
| **react-vnc**                              | Browser automation viewer            | MIT        | 3-5 days         |
| **Novu**                                   | In-app + multi-channel notifications | MIT        | 1-2 weeks        |
| **Stripe React + use-stripe-subscription** | Payment and subscription             | MIT        | 1-2 weeks        |
| **React Email**                            | Email templates                      | MIT        | 1 week           |
| **react-jsonschema-form**                  | Dynamic screening question forms     | Apache 2.0 | 1-2 weeks        |

### Tier 3: Evaluate Later (When Complexity Warrants)

| Project                     | Purpose                     | When to Consider                                     |
| --------------------------- | --------------------------- | ---------------------------------------------------- |
| **Neko**                    | WebRTC browser streaming    | When VNC quality is insufficient                     |
| **Lago** (cloud/commercial) | Complex usage-based billing | When billing > 3 plan tiers or usage metering needed |
| **Refine**                  | Full admin framework        | If we build multiple internal tools                  |

### What We Still Build Custom

1. **Application pipeline UI** -- The core auto-apply workflow visualization is unique to WeKruit
2. **AI agent configuration screens** -- Custom per-platform bot configuration
3. **User-facing task progress** -- Thin WebSocket layer reading Hatchet API
4. **Resume parsing pipeline** -- LangChain + Pydantic schema extraction
5. **Usage metering display** -- Custom dashboard component reading from our DB
6. **Subscription management page** -- Custom UI backed by Stripe API
7. **Auth flow** -- Google OAuth 2.0 + JWT (custom but straightforward)
8. **Platform-specific automation views** -- LinkedIn, Indeed, etc. specific UIs

### Estimated Total Savings

| Metric                                    | Value                                                   |
| ----------------------------------------- | ------------------------------------------------------- |
| **Total dev weeks saved by OSS adoption** | 45-62 weeks                                             |
| **Total integration effort**              | 8-12 weeks                                              |
| **Net savings**                           | 33-50 weeks (~8-12 months of solo developer time)       |
| **All licenses compatible with SaaS**     | Yes (MIT, Apache 2.0, BSD-3)                            |
| **AGPL projects avoided**                 | Lago (use cloud instead), OpenResume (use LLM approach) |

### Architecture Diagram (Integration Points)

```
+-----------------------------------------------------------+
|                    React Frontend                          |
|  +------------------+  +-------------+  +--------------+  |
|  | shadcn-admin     |  | Tremor      |  | react-vnc    |  |
|  | (dashboard shell)|  | (charts)    |  | (VNC viewer) |  |
|  +------------------+  +-------------+  +--------------+  |
|  +------------------+  +-------------+  +--------------+  |
|  | Novu @novu/react |  | Sonner      |  | RJSF         |  |
|  | (notification    |  | (toasts)    |  | (dynamic     |  |
|  |  inbox)          |  |             |  |  forms)      |  |
|  +------------------+  +-------------+  +--------------+  |
|  +------------------+  +----------------------------------+
|  | RHF + Zod        |  | Stripe React Components         |
|  | (forms)          |  | (payment, pricing table)        |
|  +------------------+  +----------------------------------+
+-----------------------------------------------------------+
                          |  WebSocket / REST
+-----------------------------------------------------------+
|                    FastAPI Backend                          |
|  +------------------+  +-------------+  +--------------+  |
|  | SQLAdmin         |  | Hatchet SDK |  | Novu Python  |  |
|  | (internal admin) |  | (tasks)     |  | SDK          |  |
|  +------------------+  +-------------+  +--------------+  |
|  +------------------+  +----------------------------------+
|  | LangChain +      |  | Stripe Python SDK               |
|  | pdfplumber       |  | (billing logic)                 |
|  | (resume parsing) |  |                                 |
|  +------------------+  +----------------------------------+
+-----------------------------------------------------------+
                          |
+-----------------------------------------------------------+
|                    Infrastructure                           |
|  +------------------+  +-------------+  +--------------+  |
|  | PostgreSQL       |  | Hatchet     |  | S3 Storage   |  |
|  |                  |  | (+ its      |  |              |  |
|  |                  |  |  dashboard) |  |              |  |
|  +------------------+  +-------------+  +--------------+  |
|  +------------------+  +----------------------------------+
|  | Novu Server      |  | React Email (pre-rendered HTML) |
|  | (self-hosted)    |  |                                 |
|  +------------------+  +----------------------------------+
+-----------------------------------------------------------+
```

---

## Key Decisions Summary

1. **Do NOT adopt a full admin framework (Refine/React Admin)** -- Too opinionated, fights our existing backend. Use shadcn-admin template instead for maximum flexibility.

2. **Do NOT use AGPL-licensed projects in SaaS** -- Avoid Lago and OpenResume in our codebase. Use Stripe direct integration and LLM-based parsing instead.

3. **Leverage Hatchet's built-in dashboard** -- No need for separate job monitoring UI. Already part of our stack.

4. **Novu for notifications over building from scratch** -- The complexity of multi-channel notifications (in-app + email + push + SMS) with preferences, digests, and real-time delivery is massively underestimated. Novu handles all of this.

5. **LLM-based resume parsing over traditional NLP** -- Since we already have LLM infrastructure, adding structured extraction via LangChain + Pydantic is the most accurate and maintainable approach.

6. **react-vnc for MVP, evaluate Neko for production** -- VNC is simpler to set up but WebRTC (Neko) provides better quality. Start simple, upgrade later.

---

_Research conducted 2026-02-11. Star counts and activity metrics are approximate and based on web search data. Verify current status before adoption decisions._
