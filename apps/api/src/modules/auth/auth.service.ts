import * as jose from "jose";
import { eq } from "drizzle-orm";
import { users, type Database } from "@valet/db";

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
  subscriptionTier: string;
  createdAt: Date;
  updatedAt: Date;
}

interface AuthResult {
  tokens: TokenPair;
  user: UserData;
  isNewUser: boolean;
}

export class AuthService {
  private db: Database;
  private jwtSecret: Uint8Array;
  private jwtRefreshSecret: Uint8Array;

  constructor({ db }: { db: Database }) {
    this.db = db;
    this.jwtSecret = new TextEncoder().encode(
      process.env.JWT_SECRET ?? "dev-secret-change-me-in-production-min-32ch",
    );
    this.jwtRefreshSecret = new TextEncoder().encode(
      process.env.JWT_REFRESH_SECRET ??
        "dev-refresh-secret-change-me-in-production",
    );
  }

  async authenticateWithGoogle(
    code: string,
    redirectUri: string,
  ): Promise<AuthResult> {
    const googleUser = await this.exchangeGoogleCode(code, redirectUri);

    const { user, isNew } = await this.findOrCreateUser(googleUser);

    const tokens = await this.generateTokens(user.id, user.email);

    return {
      tokens,
      user,
      isNewUser: isNew,
    };
  }

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

      return this.generateTokens(
        payload.sub,
        payload.email as string,
      );
    } catch {
      throw new Error("Invalid or expired refresh token");
    }
  }

  async verifyAccessToken(
    token: string,
  ): Promise<{ userId: string; email: string }> {
    const { payload } = await jose.jwtVerify(token, this.jwtSecret, {
      algorithms: ["HS256"],
    });

    return {
      userId: payload.sub!,
      email: payload.email as string,
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
      throw new Error("Failed to exchange Google authorization code");
    }

    const tokenData = (await tokenResponse.json()) as { id_token: string };
    const claims = jose.decodeJwt(tokenData.id_token) as unknown as GoogleTokenPayload;

    return claims;
  }

  private async findOrCreateUser(
    googleUser: GoogleTokenPayload,
  ): Promise<{ user: UserData; isNew: boolean }> {
    const existing = await this.db
      .select()
      .from(users)
      .where(eq(users.googleId, googleUser.sub))
      .limit(1);

    if (existing[0]) {
      return { user: existing[0] as UserData, isNew: false };
    }

    const created = await this.db
      .insert(users)
      .values({
        email: googleUser.email,
        name: googleUser.name,
        avatarUrl: googleUser.picture,
        googleId: googleUser.sub,
      })
      .returning();

    return { user: created[0] as UserData, isNew: true };
  }

  private async generateTokens(
    userId: string,
    email: string,
  ): Promise<TokenPair> {
    const accessToken = await new jose.SignJWT({ sub: userId, email })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .setIssuer("valet-api")
      .sign(this.jwtSecret);

    const refreshToken = await new jose.SignJWT({ sub: userId, email })
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
