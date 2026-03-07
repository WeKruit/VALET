import { createHash, randomBytes } from "node:crypto";

const RUNTIME_GRANT_PREFIX = "lwrg_v1_";

export class ManagedRuntimeAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManagedRuntimeAuthError";
  }
}

export function createManagedRuntimeGrant(): string {
  return `${RUNTIME_GRANT_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function normalizeManagedRuntimeGrant(token: string): string {
  const value = token.trim();
  if (!value.startsWith(RUNTIME_GRANT_PREFIX)) {
    throw new ManagedRuntimeAuthError("Missing managed runtime grant prefix");
  }

  const encoded = value.slice(RUNTIME_GRANT_PREFIX.length);
  if (!encoded) {
    throw new ManagedRuntimeAuthError("Managed runtime grant is malformed");
  }

  return value;
}

export function hashManagedRuntimeGrant(token: string): string {
  return createHash("sha256").update(normalizeManagedRuntimeGrant(token)).digest("hex");
}
