import * as jose from "jose";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import type Redis from "ioredis";
import { users, type Database } from "@valet/db";
import { AppError } from "../../common/errors.js";

interface GoogleTokenPayload {
  sub: string;
  email: string;
  name: string;
  picture: string;
  email_verified: boolean;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface UserData {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  subscriptionTier: string;
  createdAt: Date;
  updatedAt: Date;
}

interface AuthResult {
  tokens: TokenPair;
  user: UserData;
  isNewUser: boolean;
}

interface EmailServiceLike {
  sendVerificationEmail(to: string, name: string, token: string): Promise<void>;
  sendPasswordReset(to: string, name: string, token: string): Promise<void>;
  sendWelcome(to: string, name: string): Promise<void>;
}

const BCRYPT_ROUNDS = 12;
const EMAIL_VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// Google's JWKS endpoint for verifying ID tokens
const googleJWKS = jose.createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);


export class AuthService {
  private db: Database;
  private redis: Redis;
  private emailService: EmailServiceLike;
  private jwtSecret: Uint8Array;
  private jwtRefreshSecret: Uint8Array;

  constructor({
    db,
    redis,
    emailService,
  }: {
    db: Database;
    redis: Redis;
    emailService: EmailServiceLike;
  }) {
    this.db = db;
    this.redis = redis;
    this.emailService = emailService;

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error("JWT_SECRET environment variable is required");
    }
    this.jwtSecret = new TextEncoder().encode(jwtSecret);

    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!jwtRefreshSecret) {
      throw new Error("JWT_REFRESH_SECRET environment variable is required");
    }
    this.jwtRefreshSecret = new TextEncoder().encode(jwtRefreshSecret);
  }

  // ─── Email/Password Auth ───

  async registerWithEmail(
    email: string,
    password: string,
    name: string,
  ): Promise<void> {
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing[0]) {
      throw AppError.conflict("An account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const verificationToken = randomBytes(32).toString("hex");
    const verificationExpiry = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS);

    const created = await this.db
      .insert(users)
      .values({
        email,
        name,
        passwordHash,
        emailVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationExpiry: verificationExpiry,
      })
      .returning({ id: users.id, name: users.name });

    if (created[0]) {
      this.emailService
        .sendVerificationEmail(email, name, verificationToken)
        .catch(() => {});
    }
  }

  async loginWithEmail(email: string, password: string): Promise<AuthResult> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const user = rows[0];
    if (!user || !user.passwordHash) {
      throw AppError.unauthorized("Invalid email or password");
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw AppError.unauthorized("Invalid email or password");
    }

    if (!user.emailVerified) {
      throw AppError.badRequest(
        "Please verify your email before logging in. Check your inbox for a verification link.",
      );
    }

    if (!user.isActive) {
      throw AppError.unauthorized("Account is deactivated");
    }

    const tokens = await this.generateTokens(user.id, user.email, (user as unknown as Record<string, unknown>).role as string ?? "user");

    return {
      tokens,
      user: user as unknown as UserData,
      isNewUser: false,
    };
  }

  async verifyEmail(token: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.emailVerificationToken, token))
      .limit(1);

    const user = rows[0];
    if (!user) {
      throw AppError.badRequest("Invalid or expired verification token");
    }

    if (
      user.emailVerificationExpiry &&
      user.emailVerificationExpiry < new Date()
    ) {
      throw AppError.badRequest("Verification token has expired. Please register again.");
    }

    await this.db
      .update(users)
      .set({
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiry: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
  }

  async forgotPassword(email: string): Promise<void> {
    const rows = await this.db
      .select({ id: users.id, name: users.name, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const user = rows[0];
    // Always return success to prevent email enumeration
    if (!user || !user.passwordHash) {
      return;
    }

    const resetToken = randomBytes(32).toString("hex");
    const resetExpiry = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);

    await this.db
      .update(users)
      .set({
        passwordResetToken: resetToken,
        passwordResetExpiry: resetExpiry,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    this.emailService
      .sendPasswordReset(email, user.name, resetToken)
      .catch(() => {});
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.passwordResetToken, token))
      .limit(1);

    const user = rows[0];
    if (!user) {
      throw AppError.badRequest("Invalid or expired reset token");
    }

    if (user.passwordResetExpiry && user.passwordResetExpiry < new Date()) {
      throw AppError.badRequest("Reset token has expired. Please request a new one.");
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.db
      .update(users)
      .set({
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiry: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    // Revoke all existing sessions for security
    await this.revokeAllUserTokens(user.id);
  }

  // ─── Google OAuth ───

  async authenticateWithGoogle(
    code: string,
    redirectUri: string,
  ): Promise<AuthResult> {
    const googleUser = await this.exchangeGoogleCode(code, redirectUri);

    const { user, isNew } = await this.findOrCreateGoogleUser(googleUser);

    const tokens = await this.generateTokens(user.id, user.email, user.role ?? "user");

    return {
      tokens,
      user,
      isNewUser: isNew,
    };
  }

  // ─── Token Management ───

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    try {
      const { payload } = await jose.jwtVerify(
        refreshToken,
        this.jwtRefreshSecret,
        { algorithms: ["HS256"] },
      );

      if (!payload.sub || !payload.email) {
        throw new Error("Invalid refresh token payload");
      }

      // Check if this specific token has been blacklisted
      const tokenHash = this.hashToken(refreshToken);
      const isBlacklisted = await this.redis.get(`token:blacklist:${tokenHash}`);
      if (isBlacklisted) {
        throw new Error("Token has been revoked");
      }

      // Check if all tokens for this user have been revoked
      const currentVersion = await this.redis.get(`token:version:${payload.sub}`);
      if (currentVersion && payload.tokenVersion !== undefined) {
        if (Number(payload.tokenVersion) < Number(currentVersion)) {
          throw new Error("Token has been revoked");
        }
      }

      return this.generateTokens(
        payload.sub,
        payload.email as string,
        (payload.role as string) ?? "user",
      );
    } catch {
      throw new Error("Invalid or expired refresh token");
    }
  }

  async blacklistToken(token: string, expiresInSeconds: number): Promise<void> {
    const tokenHash = this.hashToken(token);
    await this.redis.set(`token:blacklist:${tokenHash}`, "1", "EX", expiresInSeconds);
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.redis.incr(`token:version:${userId}`);
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async verifyAccessToken(
    token: string,
  ): Promise<{ userId: string; email: string; role: string }> {
    const { payload } = await jose.jwtVerify(token, this.jwtSecret, {
      algorithms: ["HS256"],
    });

    return {
      userId: payload.sub!,
      email: payload.email as string,
      role: (payload.role as string) ?? "user",
    };
  }

  private async exchangeGoogleCode(
    code: string,
    redirectUri: string,
  ): Promise<GoogleTokenPayload> {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error(`Google token exchange failed (${tokenResponse.status}): ${errorBody}`);
      throw new Error(`Google token exchange failed: ${errorBody}`);
    }

    const tokenData = (await tokenResponse.json()) as { id_token: string };

    // Cryptographically verify the ID token using Google's public JWKS keys
    const { payload } = await jose.jwtVerify(tokenData.id_token, googleJWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    return {
      sub: payload.sub!,
      email: payload.email as string,
      name: payload.name as string,
      picture: payload.picture as string,
      email_verified: payload.email_verified as boolean,
    };
  }

  private async findOrCreateGoogleUser(
    googleUser: GoogleTokenPayload,
  ): Promise<{ user: UserData; isNew: boolean }> {
    // First check by googleId
    const existing = await this.db
      .select()
      .from(users)
      .where(eq(users.googleId, googleUser.sub))
      .limit(1);

    if (existing[0]) {
      return { user: existing[0] as unknown as UserData, isNew: false };
    }

    // Check if an email/password user exists with the same email — link accounts
    const byEmail = await this.db
      .select()
      .from(users)
      .where(eq(users.email, googleUser.email))
      .limit(1);

    if (byEmail[0]) {
      await this.db
        .update(users)
        .set({
          googleId: googleUser.sub,
          avatarUrl: byEmail[0].avatarUrl ?? googleUser.picture,
          emailVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, byEmail[0].id));

      const updated = await this.db
        .select()
        .from(users)
        .where(eq(users.id, byEmail[0].id))
        .limit(1);

      return { user: updated[0] as unknown as UserData, isNew: false };
    }

    const created = await this.db
      .insert(users)
      .values({
        email: googleUser.email,
        name: googleUser.name,
        avatarUrl: googleUser.picture,
        googleId: googleUser.sub,
        emailVerified: true,
      })
      .returning();

    return { user: created[0] as unknown as UserData, isNew: true };
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: string = "user",
  ): Promise<TokenPair> {
    const accessToken = await new jose.SignJWT({ sub: userId, email, role })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .setIssuer("valet-api")
      .sign(this.jwtSecret);

    const refreshToken = await new jose.SignJWT({ sub: userId, email, role })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .setIssuer("valet-api")
      .sign(this.jwtRefreshSecret);

    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
    };
  }
}
