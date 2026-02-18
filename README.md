# WeKruit Valet

**Verified Automation. Limitless Execution. Trust.**

AI-powered job application system with dual-mode operation: **Copilot** (human reviews every field) and **Autopilot** (earned after trust is established). Paste a job URL, watch the AI fill forms, review with confidence scores, and submit.

## Quick Start

```bash
cp .env.example .env              # Configure environment variables
./scripts/setup.sh                # Install deps, validate env, run migrations
pnpm dev                          # Start all apps with hot-reload
```

| Service   | URL                        |
| --------- | -------------------------- |
| Dashboard | http://localhost:5173      |
| API       | http://localhost:8000      |
| API Docs  | http://localhost:8000/docs |

## Architecture

```
wekruit-valet/
├── apps/
│   ├── web/              @valet/web       React + Vite dashboard (SPA)
│   ├── api/              @valet/api       Fastify REST API + WebSocket
│   └── worker/           @valet/worker    GhostHands job dispatch worker
├── packages/
│   ├── shared/           @valet/shared    Zod schemas, types, constants, errors
│   ├── contracts/        @valet/contracts ts-rest API contract definitions
│   ├── db/               @valet/db        Drizzle ORM schema + migrations
│   ├── ui/               @valet/ui        shadcn/ui components (WeKruit themed)
│   └── llm/              @valet/llm       LLM provider router (Anthropic + OpenAI)
├── fly/                                   Fly.io deployment configs
├── infra/                                 Terraform + EC2 provisioning scripts
├── docker/                                Docker Compose for local infrastructure
├── tests/                                 E2E tests, fixtures, mock ATS pages
├── scripts/                               Dev setup and health check scripts
├── docs/                                  Technical documentation
├── core-docs/                             Architecture specs and research
└── .github/workflows/                     CI/CD pipeline
```

### Dependency DAG

```
contracts --> shared
db --> (standalone)
llm --> shared
ui --> shared
api --> contracts, db, shared, llm
web --> contracts, shared, ui
worker --> contracts, db, shared, llm
```

### How It Works

1. User submits a job URL via the web dashboard
2. API creates a task record and dispatches it to **GhostHands** (browser automation service on EC2)
3. GhostHands navigates the ATS, fills forms using the user's resume + QA bank, and sends progress callbacks
4. VALET relays real-time progress to the frontend via WebSocket (Redis pub/sub)
5. In **Copilot mode**, the user reviews fields before submission; in **Autopilot mode**, quality gates auto-approve
6. GhostHands submits the application and sends a completion callback with screenshots and confirmation

## Tech Stack

| Layer              | Technology                        |
| ------------------ | --------------------------------- |
| Language           | TypeScript (end-to-end)           |
| Monorepo           | Turborepo + pnpm workspaces       |
| Frontend           | React 18 + Vite + shadcn/ui       |
| Styling            | Tailwind CSS                      |
| Server State       | React Query (via ts-rest)         |
| Client State       | Zustand                           |
| API Framework      | Fastify 5.x                       |
| API Contracts      | ts-rest                           |
| Validation         | Zod                               |
| ORM                | Drizzle ORM                       |
| Database           | PostgreSQL 16 (Supabase)          |
| Cache / Pub-Sub    | Redis (Upstash)                   |
| Browser Automation | GhostHands (EC2)                  |
| Job Dispatch       | GhostHands API (REST)             |
| Auth               | Google OAuth 2.0 + JWT            |
| Object Storage     | Supabase Storage (S3 protocol)    |
| LLM Providers      | Anthropic + OpenAI                |
| CI/CD              | GitHub Actions + Fly.io           |
| Infrastructure     | Terraform (EC2 sandboxes)         |
| Testing            | Vitest                            |
| Linting            | ESLint 9 (flat config) + Prettier |

## Environment Variables

Copy `.env.example` to `.env` and configure. Key required variables:

| Variable               | Description                            |
| ---------------------- | -------------------------------------- |
| `DATABASE_URL`         | PostgreSQL connection string (pooler)  |
| `DATABASE_DIRECT_URL`  | PostgreSQL direct connection (for DDL) |
| `REDIS_URL`            | Redis/Upstash URL                      |
| `JWT_SECRET`           | JWT signing secret (min 32 chars)      |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID                 |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret             |
| `ANTHROPIC_API_KEY`    | Anthropic API key                      |
| `OPENAI_API_KEY`       | OpenAI API key                         |
| `S3_ENDPOINT`          | Supabase Storage S3 endpoint           |
| `GHOSTHANDS_API_URL`   | GhostHands API URL (EC2)               |
| `GH_SERVICE_SECRET`    | Service-to-service auth key            |

See `.env.example` for the full list with defaults.

## Development

```bash
pnpm test                          # Run all tests (Vitest)
pnpm lint                          # ESLint + Prettier across all workspaces
pnpm typecheck                     # TypeScript strict mode across all workspaces
pnpm --filter @valet/api test      # Run tests for a specific workspace
pnpm --filter @valet/db db:studio  # Open Drizzle Studio for database inspection
```

## Documentation

- `CLAUDE.md` -- Developer quick-reference guide
- `docs/CURRENT-STATE.md` -- Full technical state of the codebase
- `docs/architecture.md` -- Architecture deep-dive
- `docs/security-architecture.md` -- Security model
- `core-docs/` -- Architecture specs, research, and GhostHands integration docs
