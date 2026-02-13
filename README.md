# WeKruit Valet

**Verified Automation. Limitless Execution. Trust.**

AI-powered job application system with dual-mode operation: **Copilot** (human reviews every field) and **Autopilot** (earned after trust is established). Paste a job URL, watch the AI fill forms, review with confidence scores, and submit.

## Quick Start

```bash
cp .env.example .env              # Configure environment variables
./scripts/setup-dev.sh            # Start infrastructure (Postgres, Redis, Hatchet, MinIO)
pnpm install                      # Install all workspace dependencies
pnpm db:migrate                   # Run database migrations
pnpm db:seed                      # Load development seed data
pnpm dev                          # Start all apps with hot-reload
```

| Service          | URL                          |
|------------------|------------------------------|
| Dashboard        | http://localhost:5173        |
| API              | http://localhost:8000        |
| API Docs         | http://localhost:8000/api/docs |
| Hatchet UI       | http://localhost:8888        |
| MinIO Console    | http://localhost:9001        |

## Architecture

```
wekruit-valet/
├── apps/
│   ├── web/              @valet/web       React + Vite dashboard (SPA)
│   ├── api/              @valet/api       Fastify REST API + WebSocket
│   └── worker/           @valet/worker    Hatchet background worker
├── packages/
│   ├── shared/           @valet/shared    Zod schemas, types, constants, errors
│   ├── contracts/        @valet/contracts ts-rest API contract definitions
│   ├── db/               @valet/db        Drizzle ORM schema + migrations
│   ├── ui/               @valet/ui        shadcn/ui components (WeKruit themed)
│   └── llm/              @valet/llm       LLM provider router (Anthropic + OpenAI)
├── docker/                                Docker Compose for infrastructure
├── tests/                                 E2E tests, fixtures, mock ATS pages
├── scripts/                               Dev setup and health check scripts
└── .github/workflows/                     CI/CD pipeline
```

### Dependency DAG

```
contracts ──→ shared
db ──→ (standalone)
llm ──→ shared
ui ──→ shared
api ──→ contracts, db, shared, llm
web ──→ contracts, shared, ui
worker ──→ contracts, db, shared, llm
```

## Packages

### @valet/shared

Zod schemas as the single source of truth for all DTOs. Types are derived via `z.infer<>` and never hand-written. Includes WebSocket message types, environment validation, error classes, and shared constants.

```typescript
import { createTaskRequest, TaskStatus } from "@valet/shared/schemas";
import { AppError } from "@valet/shared/errors";
import { RATE_LIMITS } from "@valet/shared/constants";
import { validateEnv } from "@valet/shared/env";
```

### @valet/contracts

ts-rest API contract definitions consumed by both the Fastify server and the React Query client. Provides end-to-end type safety with runtime validation.

```typescript
import { apiContract, taskContract } from "@valet/contracts";
```

### @valet/db

Drizzle ORM schema definitions and database client factory. Tables: users, tasks, task-events, resumes, qa-bank, consent-records, browser-profiles, proxy-bindings, application-results.

```typescript
import { createDatabase, users, tasks } from "@valet/db";
```

### @valet/ui

shadcn/ui components themed with WeKruit design tokens. Copy-paste model with full ownership.

### @valet/llm

3-tier LLM model router: Claude Sonnet 4.5 (premium), GPT-4.1 mini (mid-tier), GPT-4.1 nano (budget). Automatic fallback on provider errors, per-request token usage tracking, and monthly budget enforcement.

## Apps

### apps/web

React 18 + Vite SPA with feature-based architecture. Server state via React Query (ts-rest), client state via Zustand, forms via React Hook Form + Zod. Routes: `/login`, `/dashboard`, `/apply`, `/settings`, `/onboarding/*`.

### apps/api

Fastify 5.x with ts-rest router integration, @fastify/awilix DI, JWT authentication (Google OAuth), WebSocket for real-time task progress, and structured error handling.

### apps/worker

Hatchet TypeScript SDK worker for durable workflow execution. Handles job application workflows with pause/resume for human-in-the-loop review. Stagehand browser automation interfaces are stubbed for Sprint 0-1.

## Environment Variables

Copy `.env.example` to `.env` and configure. Required variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection for pub/sub and queues |
| `JWT_SECRET` | JWT signing secret (min 32 chars) |
| `JWT_REFRESH_SECRET` | Refresh token signing secret |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `HATCHET_CLIENT_TOKEN` | Hatchet SDK token (from dashboard) |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `S3_ENDPOINT` | S3-compatible endpoint (MinIO in dev) |
| `S3_ACCESS_KEY` | S3 access key |
| `S3_SECRET_KEY` | S3 secret key |

See `.env.example` for the full list with defaults.

## Development Workflow

### Branch Naming

```
feature/S0-01-shadcn-admin-fork
fix/S1-05-websocket-reconnect
```

### Commit Conventions

```
[S0-01] Fork shadcn-admin and apply WeKruit tokens
[S1-05] Fix WebSocket reconnect on token expiry
```

### CI/CD

GitHub Actions runs on every PR:
- `pnpm lint` -- ESLint + Prettier
- `pnpm typecheck` -- TypeScript strict mode
- `pnpm test` -- Vitest across all workspaces

Staging deploy on merge to `main`.

## Testing

```bash
pnpm test                          # Run all tests (Vitest)
pnpm lint                          # ESLint + Prettier across all workspaces
pnpm typecheck                     # TypeScript strict mode across all workspaces
pnpm --filter @valet/api test      # Run tests for a specific workspace
pnpm --filter @valet/db db:studio  # Open Drizzle Studio for database inspection
```

## Design System

WeKruit espresso theme applied via Tailwind CSS custom properties:

| Token | Value | Usage |
|-------|-------|-------|
| Heading font | Halant (serif) | h1-h4, modal titles |
| Body font | Geist Sans | Body text, labels, buttons |
| Mono font | Geist Mono | Code, technical values |
| Copilot color | `#1E40AF` | Copilot mode indicators |
| Autopilot color | `#7C3AED` | Autopilot mode indicators |

Dark mode via `[data-theme="dark"]` attribute on `<html>`. CSS custom properties redefine automatically.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (end-to-end) |
| Monorepo | Turborepo + pnpm workspaces |
| Frontend | React 18 + Vite + shadcn/ui |
| Styling | Tailwind CSS 3 |
| Server State | React Query (via ts-rest) |
| Client State | Zustand |
| API Framework | Fastify 5.x |
| API Contracts | ts-rest |
| Validation | Zod |
| ORM | Drizzle ORM |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis 7 |
| Orchestration | Hatchet (TypeScript SDK) |
| Auth | Google OAuth 2.0 + JWT |
| Object Storage | MinIO (dev) / S3 (prod) |
| LLM Providers | Anthropic + OpenAI |
| CI/CD | GitHub Actions |
| Testing | Vitest + Playwright |
| Linting | ESLint 9 (flat config) + Prettier |
