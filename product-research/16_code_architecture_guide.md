# WeKruit Valet -- Code Architecture Guide

> **VALET** — Verified Automation. Limitless Execution. Trust.

**Version:** 1.0
**Date:** 2026-02-12
**Status:** Ready for Implementation
**Audience:** All engineers on the team

---

## 1. Monorepo Structure (Canonical)

```
wekruit-valet/
├── turbo.json
├── pnpm-workspace.yaml
├── package.json                    # Root scripts (dev, build, lint, typecheck, db:*)
├── .env.example
├── .gitignore
│
├── apps/
│   ├── web/                        # React + Vite frontend (SPA)
│   ├── api/                        # Fastify backend (REST + WebSocket)
│   └── worker/                     # Hatchet background worker
│
├── packages/
│   ├── contracts/                  # ts-rest API contracts (THE source of truth)
│   ├── shared/                     # Zod schemas, DTOs, error classes, constants
│   ├── db/                         # Drizzle schema, migrations, client factory
│   ├── ui/                         # shadcn/ui components (WeKruit themed)
│   └── llm/                        # LLM provider abstraction + routing
│
├── docker/
│   └── docker-compose.yml          # PostgreSQL, Redis, Hatchet, MinIO
├── tests/
│   ├── e2e/                        # Playwright E2E tests
│   ├── fixtures/                   # Shared test factories
│   └── mock-ats/                   # Static HTML mock ATS pages
├── scripts/
│   ├── setup-dev.sh
│   └── health-check.sh
└── .github/workflows/
    └── ci.yml
```

### Dependency DAG (strict, no cycles)

```
contracts ──→ shared (schemas only)
db ──→ (standalone)
llm ──→ shared
ui ──→ shared

api ──→ contracts, db, shared, llm
web ──→ contracts, shared, ui
worker ──→ contracts, db, shared, llm
```

Enforce with `eslint-plugin-import/no-cycle` in CI.

---

## 2. DTO Pattern: Zod as Single Source of Truth

### Principle

Define Zod schemas ONCE in `packages/shared/`. Derive all TypeScript types via `z.infer<>`. Never hand-write a type that Zod can generate.

### Layer Map

| Layer | Artifact | Location |
|-------|----------|----------|
| **DB Schema** | Drizzle table definitions | `packages/db/src/schema/` |
| **DTOs** | Zod schemas (request/response) | `packages/shared/src/schemas/` |
| **API Contract** | ts-rest router definitions | `packages/contracts/src/` |
| **Domain Logic** | Service classes | `apps/api/src/modules/` |
| **Repository** | Drizzle query classes | `apps/api/src/modules/` |

### Example: Task DTO

```typescript
// packages/shared/src/schemas/task.schema.ts
import { z } from "zod";

// ─── Enums ───
export const taskStatus = z.enum([
  "created", "queued", "in_progress", "waiting_human",
  "completed", "failed", "cancelled",
]);
export const platform = z.enum([
  "linkedin", "greenhouse", "lever", "workday", "unknown",
]);
export const applicationMode = z.enum(["copilot", "autopilot"]);

// ─── Base Entity (mirrors DB row, minus internal-only fields) ───
export const taskSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  jobUrl: z.string().url(),
  platform: platform,
  status: taskStatus,
  mode: applicationMode,
  progress: z.number().min(0).max(100),
  currentStep: z.string().nullable(),
  confidenceScore: z.number().min(0).max(1).nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable(),
});

// ─── Request DTOs ───
export const createTaskRequest = z.object({
  jobUrl: z.string().url().transform((s) => s.trim()),
  mode: applicationMode.default("copilot"),
  resumeId: z.string().uuid(),
  notes: z.string().max(1000).optional(),
});

export const taskListQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: taskStatus.optional(),
  platform: platform.optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// ─── Response DTOs ───
export const taskResponse = taskSchema;

export const taskListResponse = z.object({
  data: z.array(taskResponse),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

// ─── Inferred Types (NEVER hand-write these) ───
export type Task = z.infer<typeof taskSchema>;
export type CreateTaskRequest = z.infer<typeof createTaskRequest>;
export type TaskListQuery = z.infer<typeof taskListQuery>;
export type TaskResponse = z.infer<typeof taskResponse>;
export type TaskListResponse = z.infer<typeof taskListResponse>;
```

### Package Exports (subpath, NOT barrel files)

```json
// packages/shared/package.json
{
  "name": "@valet/shared",
  "exports": {
    "./schemas": "./src/schemas/index.ts",
    "./constants": "./src/constants/index.ts",
    "./errors": "./src/errors/index.ts",
    "./types": "./src/types/index.ts"
  }
}
```

Import: `import { createTaskRequest } from "@valet/shared/schemas"` — proper tree-shaking, no barrel bloat.

---

## 3. API Contract: ts-rest (End-to-End Type Safety)

### Why ts-rest

| Approach | Pros | Cons |
|----------|------|------|
| **ts-rest** | End-to-end types, Zod validation, React Query hooks, OpenAPI generation | Small learning curve |
| tRPC | Great DX | Non-standard protocol, can't expose as public REST API |
| Manual fetch + types | Simple | No runtime validation on frontend, types can drift |

### Contract Definition

```typescript
// packages/contracts/src/tasks.ts
import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  createTaskRequest, taskResponse, taskListResponse, taskListQuery,
} from "@valet/shared/schemas";

const c = initContract();

export const taskContract = c.router({
  list: {
    method: "GET",
    path: "/api/v1/tasks",
    query: taskListQuery,
    responses: { 200: taskListResponse },
  },
  getById: {
    method: "GET",
    path: "/api/v1/tasks/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: taskResponse,
      404: z.object({ error: z.string(), message: z.string() }),
    },
  },
  create: {
    method: "POST",
    path: "/api/v1/tasks",
    body: createTaskRequest,
    responses: {
      201: taskResponse,
      400: z.object({ error: z.string(), message: z.string(), details: z.unknown().optional() }),
    },
  },
  cancel: {
    method: "DELETE",
    path: "/api/v1/tasks/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: { 204: z.void() },
  },
});
```

### Fastify Server (uses contract)

```typescript
// apps/api/src/modules/tasks/task.routes.ts
import { initServer } from "@ts-rest/fastify";
import { taskContract } from "@valet/contracts";

const s = initServer();

export const taskRouter = s.router(taskContract, {
  list: async ({ query }, { request }) => {
    const { taskService } = request.diScope.cradle;
    const result = await taskService.list(query);
    return { status: 200, body: result };
  },
  getById: async ({ params }, { request }) => {
    const { taskService } = request.diScope.cradle;
    const task = await taskService.getById(params.id, request.userId);
    return { status: 200, body: task };
  },
  create: async ({ body }, { request }) => {
    const { taskService } = request.diScope.cradle;
    const task = await taskService.create(body, request.userId);
    return { status: 201, body: task };
  },
  cancel: async ({ params }, { request }) => {
    const { taskService } = request.diScope.cradle;
    await taskService.cancel(params.id, request.userId);
    return { status: 204, body: undefined };
  },
});
```

### React Client (type-safe, with React Query)

```typescript
// apps/web/src/lib/api-client.ts
import { initQueryClient } from "@ts-rest/react-query";
import { apiContract } from "@valet/contracts";

export const api = initQueryClient(apiContract, {
  baseUrl: import.meta.env.VITE_API_URL,
  baseHeaders: {},
});
```

```typescript
// Usage in component -- fully typed, no manual fetch
const { data, isLoading } = api.tasks.list.useQuery(
  ["tasks", { page: 1 }],
  { query: { page: 1, pageSize: 20, status: "in_progress" } },
);
// data.body.data is Task[], data.body.pagination is typed
```

---

## 4. Backend Architecture (Feature-Based Modules)

```
apps/api/src/
├── modules/                      # Feature-based (one folder per domain)
│   ├── auth/
│   │   ├── auth.routes.ts        # POST /auth/google, POST /auth/refresh
│   │   └── auth.service.ts       # Google OAuth, JWT generation
│   ├── tasks/
│   │   ├── task.routes.ts        # ts-rest router (see above)
│   │   ├── task.service.ts       # Business logic
│   │   ├── task.repository.ts    # Drizzle queries
│   │   └── task.errors.ts        # TaskNotFoundError, etc.
│   ├── resumes/
│   │   ├── resume.routes.ts
│   │   ├── resume.service.ts     # Upload, parse (pdf-parse/mammoth)
│   │   └── resume.repository.ts
│   ├── qa-bank/
│   │   ├── qa-bank.routes.ts
│   │   ├── qa-bank.service.ts
│   │   └── qa-bank.repository.ts
│   ├── users/
│   │   ├── user.routes.ts
│   │   ├── user.service.ts
│   │   └── user.repository.ts
│   └── consent/
│       ├── consent.routes.ts
│       └── consent.service.ts
├── common/
│   ├── errors.ts                 # AppError base class
│   └── middleware/
│       ├── auth.ts               # JWT validation
│       ├── error-handler.ts      # Global error handler
│       ├── rate-limit.ts         # Per-user, per-platform
│       └── request-logger.ts     # pino structured logging
├── plugins/
│   ├── container.ts              # @fastify/awilix DI setup
│   ├── database.ts               # DB connection plugin
│   ├── swagger.ts                # @fastify/swagger OpenAPI
│   └── security.ts               # @fastify/helmet, CORS, CSP
├── websocket/
│   └── handler.ts                # WS event dispatcher (Redis Pub/Sub)
├── app.ts                        # Fastify app factory
└── server.ts                     # Entry point
```

### Error Handling Pattern

```typescript
// apps/api/src/common/errors.ts
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }

  static badRequest(msg: string, details?: Record<string, unknown>) {
    return new AppError(400, "BAD_REQUEST", msg, details);
  }
  static unauthorized(msg = "Unauthorized") {
    return new AppError(401, "UNAUTHORIZED", msg);
  }
  static notFound(msg = "Not found") {
    return new AppError(404, "NOT_FOUND", msg);
  }
  static conflict(msg: string) {
    return new AppError(409, "CONFLICT", msg);
  }
  static tooManyRequests(msg = "Rate limit exceeded") {
    return new AppError(429, "RATE_LIMIT_EXCEEDED", msg);
  }
  static internal(msg = "Internal server error") {
    return new AppError(500, "INTERNAL_ERROR", msg);
  }
}

// apps/api/src/common/middleware/error-handler.ts
export function errorHandler(error: Error, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
      ...(error.details && { details: error.details }),
    });
  }
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: "VALIDATION_ERROR",
      message: "Invalid request data",
      details: error.flatten(),
    });
  }
  request.log.error(error);
  return reply.status(500).send({
    error: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
  });
}
```

### Dependency Injection (@fastify/awilix)

```typescript
// apps/api/src/plugins/container.ts
import { diContainer, fastifyAwilixPlugin } from "@fastify/awilix";
import { asClass, asFunction, Lifetime } from "awilix";

export default fp(async (fastify) => {
  await fastify.register(fastifyAwilixPlugin, {
    disposeOnClose: true,
    disposeOnResponse: true,
  });

  diContainer.register({
    db: asFunction(() => fastify.db, { lifetime: Lifetime.SINGLETON }),
    taskRepo: asClass(TaskRepository, { lifetime: Lifetime.SINGLETON }),
    taskService: asClass(TaskService, { lifetime: Lifetime.SINGLETON }),
    userRepo: asClass(UserRepository, { lifetime: Lifetime.SINGLETON }),
    userService: asClass(UserService, { lifetime: Lifetime.SINGLETON }),
    // ...other repos and services
  });
});

// Usage in any route handler:
const { taskService } = request.diScope.cradle;
```

---

## 5. Frontend Architecture (Feature-Based)

```
apps/web/src/
├── features/                     # Feature-based grouping
│   ├── auth/
│   │   ├── components/
│   │   │   └── login-page.tsx
│   │   └── hooks/
│   │       └── use-auth.ts
│   ├── dashboard/
│   │   ├── components/
│   │   │   ├── stats-cards.tsx
│   │   │   ├── active-tasks.tsx
│   │   │   └── recent-applications.tsx
│   │   └── pages/
│   │       └── dashboard-page.tsx
│   ├── tasks/
│   │   ├── components/
│   │   │   ├── task-list.tsx
│   │   │   ├── task-list.test.tsx     # Co-located test
│   │   │   ├── task-detail.tsx
│   │   │   └── task-progress.tsx
│   │   ├── hooks/
│   │   │   ├── use-tasks.ts
│   │   │   └── use-task-websocket.ts
│   │   └── pages/
│   │       ├── tasks-page.tsx
│   │       └── task-detail-page.tsx
│   ├── apply/
│   ├── onboarding/
│   └── settings/
├── components/                   # Truly shared layout components
│   ├── layout/
│   │   ├── sidebar.tsx
│   │   └── header.tsx
│   └── common/
│       └── loading-spinner.tsx
├── stores/                       # Zustand (CLIENT state only)
│   ├── ui.store.ts               # Sidebar, modals, theme
│   └── realtime.store.ts         # WebSocket connection + notifications
├── lib/
│   ├── api-client.ts             # ts-rest React Query client
│   └── utils.ts
├── styles/
│   └── globals.css               # WeKruit tokens + Tailwind
└── main.tsx
```

### State Management Rules

| State Type | Tool | NOT |
|-----------|------|-----|
| Server data (tasks, users, resumes) | React Query (via ts-rest) | NOT Zustand |
| Client UI (sidebar, modals, theme) | Zustand | NOT React Query |
| URL state (page, tab, filters) | URL search params (`nuqs`) | NOT Zustand |
| Form state | React Hook Form + Zod | NOT Zustand |
| Real-time (WebSocket events) | Zustand → invalidate React Query | N/A |

---

## 6. Database Layer

```
packages/db/src/
├── schema/
│   ├── users.ts
│   ├── tasks.ts
│   ├── task-events.ts
│   ├── resumes.ts
│   ├── qa-bank.ts
│   ├── consent-records.ts
│   ├── browser-profiles.ts
│   ├── relations.ts              # Drizzle relations between tables
│   └── index.ts                  # Re-exports for drizzle-kit
├── migrations/                   # Auto-generated by drizzle-kit
├── client.ts                     # createDatabase() factory
├── seed.ts                       # Dev seed data
├── drizzle.config.ts
└── index.ts                      # Public exports: schema + client + types
```

### Key Rules
- `packages/db` exports schema definitions and client factory
- Repositories (query logic) live in `apps/api/src/modules/*/`
- Schema changes flow: edit schema → `drizzle-kit generate` → commit both
- All tables include `userId` column for RLS-style query filtering

---

## 7. Naming Conventions

| What | Convention | Example |
|------|-----------|---------|
| Files | kebab-case | `task-list.tsx`, `user.service.ts` |
| Directories | kebab-case | `qa-bank/`, `mock-ats/` |
| React components | PascalCase (in code) | `export function TaskList()` |
| Functions | camelCase | `createTask()`, `useTaskWebSocket()` |
| Types/Interfaces | PascalCase | `type CreateTaskRequest` |
| Constants | UPPER_SNAKE_CASE | `MAX_UPLOAD_SIZE`, `TASK_STATUS` |
| Zod schemas | camelCase | `createTaskRequest`, `taskListQuery` |
| DB columns | snake_case | `created_at`, `user_id` |
| Package names | @valet/kebab-case | `@valet/shared`, `@valet/db` |

### Barrel Exports
- **In `packages/`**: Use subpath exports in `package.json` (NOT `index.ts` barrels)
- **In `apps/`**: No barrel files. Import directly from source.
- **Exception**: A package's top-level `index.ts` for the primary export

---

## 8. WebSocket Message Types

```typescript
// packages/shared/src/types/ws.ts
import { z } from "zod";

export const wsMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("state_change"),
    taskId: z.string().uuid(),
    from: z.string(),
    to: z.string(),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal("progress"),
    taskId: z.string().uuid(),
    step: z.string(),
    pct: z.number().min(0).max(100),
    message: z.string(),
  }),
  z.object({
    type: z.literal("field_review"),
    taskId: z.string().uuid(),
    fields: z.array(z.object({
      name: z.string(),
      value: z.string(),
      confidence: z.number().min(0).max(1),
      source: z.enum(["resume", "qa_bank", "llm_generated"]),
    })),
  }),
  z.object({
    type: z.literal("human_needed"),
    taskId: z.string().uuid(),
    reason: z.string(),
    vncUrl: z.string().url().optional(),
  }),
  z.object({
    type: z.literal("completed"),
    taskId: z.string().uuid(),
    confirmationId: z.string().optional(),
    screenshotUrl: z.string().url().optional(),
  }),
  z.object({
    type: z.literal("error"),
    taskId: z.string().uuid(),
    code: z.string(),
    message: z.string(),
    recoverable: z.boolean(),
  }),
]);

export type WSMessage = z.infer<typeof wsMessageSchema>;
```

---

## 9. Environment Validation

```typescript
// packages/shared/src/env.ts
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "staging", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  HATCHET_CLIENT_TOKEN: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-"),
  OPENAI_API_KEY: z.string().startsWith("sk-"),
  S3_ENDPOINT: z.string().url(),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_REGION: z.string().default("us-east-1"),
  SENTRY_DSN: z.string().url().optional(),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  PORT: z.coerce.number().default(8000),
});

export function validateEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:", result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export type Env = z.infer<typeof envSchema>;
```

All apps call `validateEnv()` on startup. Fail-fast if any required variable is missing.

---

## 10. Key Architecture Decisions Summary

| Decision | Choice | Why |
|----------|--------|-----|
| API contracts | ts-rest | End-to-end types, React Query integration, OpenAPI |
| Schema validation | Zod (single source of truth) | Shared between frontend + backend, runtime validation |
| ORM | Drizzle | TypeScript-first, schema-as-code, great migrations |
| DI framework | @fastify/awilix | Official Fastify plugin, clean DI without decorators |
| Error handling (API) | Thrown AppError classes | Works with Fastify's setErrorHandler, structured responses |
| State management | React Query (server) + Zustand (client) | Separation of concerns, no cache duplication |
| File naming | kebab-case everywhere | Filesystem-safe, URL-friendly, modern standard |
| Barrel exports | Subpath exports in package.json | Proper tree-shaking, no circular dependency risk |
| Folder structure | Feature-based modules | Colocation of related code, easy to navigate |
| TypeScript config | Project references via pnpm workspaces | Incremental builds, enforced boundaries |
