import * as jose from "jose";

const RUNTIME_TOKEN_PREFIX = "lwrt_v1_";

export interface LocalWorkerRuntimeTokenPayload {
  kind: "desktop_local_worker";
  accessToken: string;
  sessionToken: string;
  leaseId: string;
}

export function parseLocalWorkerRuntimeToken(token: string): LocalWorkerRuntimeTokenPayload {
  if (!token.startsWith(RUNTIME_TOKEN_PREFIX)) {
    throw new Error("Missing managed runtime token prefix");
  }

  const encoded = token.slice(RUNTIME_TOKEN_PREFIX.length);
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new Error("Managed runtime token is malformed");
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    (payload as Record<string, unknown>).kind !== "desktop_local_worker" ||
    typeof (payload as Record<string, unknown>).accessToken !== "string" ||
    typeof (payload as Record<string, unknown>).sessionToken !== "string" ||
    typeof (payload as Record<string, unknown>).leaseId !== "string"
  ) {
    throw new Error("Managed runtime token payload is invalid");
  }

  return payload as LocalWorkerRuntimeTokenPayload;
}

export async function verifyRuntimeAccessToken(
  accessToken: string,
): Promise<{ userId: string; email: string }> {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET is not configured");
  }

  const secret = new TextEncoder().encode(jwtSecret);
  const { payload } = await jose.jwtVerify(accessToken, secret, {
    algorithms: ["HS256"],
  });

  if (!payload.sub || typeof payload.email !== "string") {
    throw new Error("Managed runtime token access JWT is missing required claims");
  }

  return { userId: payload.sub, email: payload.email };
}
