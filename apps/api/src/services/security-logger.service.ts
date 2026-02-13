export const SECURITY_EVENT_TYPES = {
  AUTH_FAILURE: "AUTH_FAILURE",
  RATE_LIMIT_HIT: "RATE_LIMIT_HIT",
  SUSPICIOUS_INPUT: "SUSPICIOUS_INPUT",
  TOKEN_REVOKED: "TOKEN_REVOKED",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
} as const;

export type SecurityEventType =
  (typeof SECURITY_EVENT_TYPES)[keyof typeof SECURITY_EVENT_TYPES];

export interface SecurityEventDetails {
  userId?: string;
  ip?: string;
  userAgent?: string;
  path?: string;
  method?: string;
  reason?: string;
  [key: string]: unknown;
}

interface SecurityLoggerDeps {
  logger: {
    warn: (obj: object, msg: string) => void;
    error: (obj: object, msg: string) => void;
  };
}

export class SecurityLoggerService {
  private logger: SecurityLoggerDeps["logger"];

  constructor({ logger }: SecurityLoggerDeps) {
    this.logger = logger;
  }

  logEvent(type: SecurityEventType, details: SecurityEventDetails): void {
    const event = {
      security: true,
      event: type,
      timestamp: new Date().toISOString(),
      ...details,
    };

    if (type === SECURITY_EVENT_TYPES.AUTH_FAILURE || type === SECURITY_EVENT_TYPES.TOKEN_REVOKED) {
      this.logger.warn(event, `Security event: ${type}`);
    } else {
      this.logger.warn(event, `Security event: ${type}`);
    }
  }
}
