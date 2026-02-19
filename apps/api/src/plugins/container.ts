import fp from "fastify-plugin";
import { diContainer, fastifyAwilixPlugin } from "@fastify/awilix";
import { asClass, asFunction, Lifetime } from "awilix";
import type { FastifyInstance } from "fastify";
import type { Database } from "@valet/db";
import type Redis from "ioredis";
import { S3Client } from "@aws-sdk/client-s3";

import { TaskRepository } from "../modules/tasks/task.repository.js";
import { TaskService } from "../modules/tasks/task.service.js";
import { UserRepository } from "../modules/users/user.repository.js";
import { UserService } from "../modules/users/user.service.js";
import { ResumeRepository } from "../modules/resumes/resume.repository.js";
import { ResumeService } from "../modules/resumes/resume.service.js";
import { QaBankRepository } from "../modules/qa-bank/qa-bank.repository.js";
import { QaBankService } from "../modules/qa-bank/qa-bank.service.js";
import { AuthService } from "../modules/auth/auth.service.js";
import { ConsentService } from "../modules/consent/consent.service.js";
import { GdprService } from "../modules/gdpr/gdpr.service.js";
import { TaskEventRepository } from "../modules/task-events/task-event.repository.js";
import { TaskEventService } from "../modules/task-events/task-event.service.js";
import { EmailService } from "../services/email.service.js";
import { SecurityLoggerService } from "../services/security-logger.service.js";
import { BillingService } from "../modules/billing/billing.service.js";
import { DashboardService } from "../modules/dashboard/dashboard.service.js";
import { NotificationRepository } from "../modules/notifications/notification.repository.js";
import { NotificationService } from "../modules/notifications/notification.service.js";
import { SandboxRepository } from "../modules/sandboxes/sandbox.repository.js";
import { SandboxService } from "../modules/sandboxes/sandbox.service.js";
import { SandboxHealthMonitor } from "../modules/sandboxes/sandbox-health-monitor.js";
import { EC2Service } from "../modules/sandboxes/ec2.service.js";
import { AutoStopMonitor } from "../modules/sandboxes/auto-stop-monitor.js";
import { GhostHandsClient } from "../modules/ghosthands/ghosthands.client.js";
import { GhAutomationJobRepository } from "../modules/ghosthands/gh-automation-job.repository.js";
import { GhBrowserSessionRepository } from "../modules/ghosthands/gh-browser-session.repository.js";
import { GhJobEventRepository } from "../modules/ghosthands/gh-job-event.repository.js";
import { DeployService } from "../modules/sandboxes/deploy.service.js";
import { Ec2SandboxProvider } from "../modules/sandboxes/providers/ec2-sandbox.provider.js";
import { MacOsSandboxProvider } from "../modules/sandboxes/providers/macos-sandbox.provider.js";
import { SandboxProviderFactory } from "../modules/sandboxes/providers/provider-factory.js";
import { AuditLogRepository } from "../modules/sandboxes/audit-log.repository.js";
import { AuditLogService } from "../modules/sandboxes/audit-log.service.js";
import { SandboxAgentClient } from "../modules/sandboxes/agent/sandbox-agent.client.js";
import { DeployHistoryRepository } from "../modules/sandboxes/deploy-history.repository.js";

export interface AppCradle {
  db: Database;
  redis: Redis;
  logger: FastifyInstance["log"];
  s3: S3Client;
  taskRepo: TaskRepository;
  taskService: TaskService;
  userRepo: UserRepository;
  userService: UserService;
  resumeRepo: ResumeRepository;
  resumeService: ResumeService;
  qaBankRepo: QaBankRepository;
  qaBankService: QaBankService;
  authService: AuthService;
  consentService: ConsentService;
  gdprService: GdprService;
  taskEventRepo: TaskEventRepository;
  taskEventService: TaskEventService;
  emailService: EmailService;
  securityLogger: SecurityLoggerService;
  billingService: BillingService;
  dashboardService: DashboardService;
  notificationRepo: NotificationRepository;
  notificationService: NotificationService;
  sandboxRepo: SandboxRepository;
  sandboxService: SandboxService;
  sandboxHealthMonitor: SandboxHealthMonitor;
  ec2Service: EC2Service;
  autoStopMonitor: AutoStopMonitor;
  ghosthandsClient: GhostHandsClient;
  ghJobRepo: GhAutomationJobRepository;
  ghSessionRepo: GhBrowserSessionRepository;
  ghJobEventRepo: GhJobEventRepository;
  deployService: DeployService;
  ec2SandboxProvider: Ec2SandboxProvider;
  macosSandboxProvider: MacOsSandboxProvider;
  sandboxProviderFactory: SandboxProviderFactory;
  auditLogRepo: AuditLogRepository;
  auditLogService: AuditLogService;
  sandboxAgentClient: SandboxAgentClient;
  deployHistoryRepo: DeployHistoryRepository;
}

declare module "@fastify/awilix" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Cradle extends AppCradle {}
}

export default fp(async (fastify: FastifyInstance) => {
  await fastify.register(fastifyAwilixPlugin, {
    disposeOnClose: true,
    disposeOnResponse: true,
  });

  diContainer.register({
    db: asFunction(() => fastify.db, { lifetime: Lifetime.SINGLETON }),
    redis: asFunction(() => fastify.redis, { lifetime: Lifetime.SINGLETON }),
    logger: asFunction(() => fastify.log, { lifetime: Lifetime.SINGLETON }),
    s3: asFunction(
      () =>
        new S3Client({
          endpoint: process.env.S3_ENDPOINT,
          region: process.env.S3_REGION ?? "us-east-1",
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY!,
            secretAccessKey: process.env.S3_SECRET_KEY!,
          },
          forcePathStyle: true,
        }),
      { lifetime: Lifetime.SINGLETON },
    ),
    taskRepo: asClass(TaskRepository, { lifetime: Lifetime.SINGLETON }),
    taskService: asClass(TaskService, { lifetime: Lifetime.SINGLETON }),
    userRepo: asClass(UserRepository, { lifetime: Lifetime.SINGLETON }),
    userService: asClass(UserService, { lifetime: Lifetime.SINGLETON }),
    resumeRepo: asClass(ResumeRepository, { lifetime: Lifetime.SINGLETON }),
    resumeService: asClass(ResumeService, { lifetime: Lifetime.SINGLETON }),
    qaBankRepo: asClass(QaBankRepository, { lifetime: Lifetime.SINGLETON }),
    qaBankService: asClass(QaBankService, { lifetime: Lifetime.SINGLETON }),
    authService: asClass(AuthService, { lifetime: Lifetime.SINGLETON }),
    consentService: asClass(ConsentService, { lifetime: Lifetime.SINGLETON }),
    gdprService: asClass(GdprService, { lifetime: Lifetime.SINGLETON }),
    taskEventRepo: asClass(TaskEventRepository, { lifetime: Lifetime.SINGLETON }),
    taskEventService: asClass(TaskEventService, { lifetime: Lifetime.SINGLETON }),
    emailService: asClass(EmailService, { lifetime: Lifetime.SINGLETON }),
    securityLogger: asClass(SecurityLoggerService, { lifetime: Lifetime.SINGLETON }),
    billingService: asClass(BillingService, { lifetime: Lifetime.SINGLETON }),
    dashboardService: asClass(DashboardService, { lifetime: Lifetime.SINGLETON }),
    notificationRepo: asClass(NotificationRepository, { lifetime: Lifetime.SINGLETON }),
    notificationService: asClass(NotificationService, { lifetime: Lifetime.SINGLETON }),
    sandboxRepo: asClass(SandboxRepository, { lifetime: Lifetime.SINGLETON }),
    sandboxService: asClass(SandboxService, { lifetime: Lifetime.SINGLETON }),
    sandboxHealthMonitor: asClass(SandboxHealthMonitor, { lifetime: Lifetime.SINGLETON }),
    ec2Service: asClass(EC2Service, { lifetime: Lifetime.SINGLETON }),
    autoStopMonitor: asClass(AutoStopMonitor, { lifetime: Lifetime.SINGLETON }),
    ghJobRepo: asClass(GhAutomationJobRepository, { lifetime: Lifetime.SINGLETON }),
    ghSessionRepo: asClass(GhBrowserSessionRepository, { lifetime: Lifetime.SINGLETON }),
    ghJobEventRepo: asClass(GhJobEventRepository, { lifetime: Lifetime.SINGLETON }),
    deployService: asClass(DeployService, { lifetime: Lifetime.SINGLETON }),
    ec2SandboxProvider: asClass(Ec2SandboxProvider, { lifetime: Lifetime.SINGLETON }),
    macosSandboxProvider: asClass(MacOsSandboxProvider, { lifetime: Lifetime.SINGLETON }),
    sandboxProviderFactory: asFunction(
      ({ ec2SandboxProvider, macosSandboxProvider }) =>
        new SandboxProviderFactory([ec2SandboxProvider, macosSandboxProvider]),
      { lifetime: Lifetime.SINGLETON },
    ),
    deployHistoryRepo: asClass(DeployHistoryRepository, { lifetime: Lifetime.SINGLETON }),
    auditLogRepo: asClass(AuditLogRepository, { lifetime: Lifetime.SINGLETON }),
    auditLogService: asClass(AuditLogService, { lifetime: Lifetime.SINGLETON }),
    sandboxAgentClient: asFunction(
      () => new SandboxAgentClient(process.env.GH_DEPLOY_SECRET ?? ""),
      { lifetime: Lifetime.SINGLETON },
    ),
    ghosthandsClient: asFunction(
      ({ logger }) =>
        new GhostHandsClient({
          ghosthandsApiUrl: process.env.GHOSTHANDS_API_URL ?? "http://localhost:3100",
          ghosthandsServiceKey: process.env.GH_SERVICE_SECRET ?? "",
          logger,
        }),
      { lifetime: Lifetime.SINGLETON },
    ),
  });
});
