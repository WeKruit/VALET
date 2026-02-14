import { initServer } from "@ts-rest/fastify";
import { authContract } from "@valet/contracts";
import { AppError } from "../../common/errors.js";

const s = initServer();

const REFRESH_COOKIE_NAME = "valet_refresh";
const REFRESH_COOKIE_PATH = "/api/v1/auth";
const REFRESH_TOKEN_MAX_AGE_S = 7 * 24 * 60 * 60; // 7 days

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: REFRESH_COOKIE_PATH,
  maxAge: REFRESH_TOKEN_MAX_AGE_S,
};

function toUserResponse(user: Record<string, unknown>) {
  return {
    id: user.id as string,
    email: user.email as string,
    name: user.name as string,
    avatarUrl: (user.avatarUrl as string | null) ?? null,
    subscriptionTier: (user.subscriptionTier as string) as "free" | "starter" | "pro" | "enterprise",
    createdAt: user.createdAt as Date,
    updatedAt: user.updatedAt as Date,
  };
}

export const authRouter = s.router(authContract, {
  google: async ({ body, request, reply }) => {
    const { authService, emailService } = request.diScope.cradle;

    try {
      const result = await authService.authenticateWithGoogle(
        body.code,
        body.redirectUri,
      );

      reply.setCookie(REFRESH_COOKIE_NAME, result.tokens.refreshToken, REFRESH_COOKIE_OPTIONS);

      const responseBody = {
        accessToken: result.tokens.accessToken,
        tokenType: "Bearer" as const,
        expiresIn: result.tokens.expiresIn,
        user: toUserResponse(result.user as unknown as Record<string, unknown>),
      };

      if (result.isNewUser) {
        // Fire-and-forget welcome email for new signups
        emailService.sendWelcome(result.user.email, result.user.name).catch(() => {});
        return { status: 201 as const, body: responseBody };
      }
      return { status: 200 as const, body: responseBody };
    } catch (error) {
      request.log.error({ err: error }, "Google auth failed");
      throw AppError.badRequest("Failed to authenticate with Google");
    }
  },

  register: async ({ body, request }) => {
    const { authService } = request.diScope.cradle;

    await authService.registerWithEmail(body.email, body.password, body.name);

    return {
      status: 201 as const,
      body: {
        message: "Account created. Please check your email to verify your address.",
      },
    };
  },

  login: async ({ body, request, reply }) => {
    const { authService } = request.diScope.cradle;

    const result = await authService.loginWithEmail(body.email, body.password);

    reply.setCookie(REFRESH_COOKIE_NAME, result.tokens.refreshToken, REFRESH_COOKIE_OPTIONS);

    return {
      status: 200 as const,
      body: {
        accessToken: result.tokens.accessToken,
        tokenType: "Bearer" as const,
        expiresIn: result.tokens.expiresIn,
        user: toUserResponse(result.user as unknown as Record<string, unknown>),
      },
    };
  },

  verifyEmail: async ({ body, request }) => {
    const { authService } = request.diScope.cradle;

    await authService.verifyEmail(body.token);

    return {
      status: 200 as const,
      body: { message: "Email verified successfully. You can now log in." },
    };
  },

  forgotPassword: async ({ body, request }) => {
    const { authService } = request.diScope.cradle;

    await authService.forgotPassword(body.email);

    return {
      status: 200 as const,
      body: {
        message: "If an account exists with that email, a password reset link has been sent.",
      },
    };
  },

  resetPassword: async ({ body, request }) => {
    const { authService } = request.diScope.cradle;

    await authService.resetPassword(body.token, body.password);

    return {
      status: 200 as const,
      body: { message: "Password reset successfully. You can now log in with your new password." },
    };
  },

  refresh: async ({ request, reply }) => {
    const { authService } = request.diScope.cradle;
    const refreshToken = request.cookies[REFRESH_COOKIE_NAME];

    if (!refreshToken) {
      throw AppError.unauthorized("Missing refresh token");
    }

    try {
      const tokens = await authService.refreshTokens(refreshToken);

      reply.setCookie(REFRESH_COOKIE_NAME, tokens.refreshToken, REFRESH_COOKIE_OPTIONS);

      return {
        status: 200,
        body: {
          accessToken: tokens.accessToken,
          tokenType: "Bearer" as const,
          expiresIn: tokens.expiresIn,
        },
      };
    } catch {
      reply.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
      throw AppError.unauthorized("Invalid or expired refresh token");
    }
  },

  me: async ({ request }) => {
    const { userService } = request.diScope.cradle;
    const user = await userService.getById(request.userId);
    if (!user) throw AppError.unauthorized("User not found");

    return {
      status: 200,
      body: toUserResponse(user as unknown as Record<string, unknown>),
    };
  },

  logout: async ({ request, reply }) => {
    const { authService } = request.diScope.cradle;
    const refreshToken = request.cookies[REFRESH_COOKIE_NAME];

    if (refreshToken) {
      await authService.blacklistToken(refreshToken, REFRESH_TOKEN_MAX_AGE_S);
    }

    reply.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });

    return { status: 200, body: { success: true } };
  },

  revokeAll: async ({ request, reply }) => {
    const { authService } = request.diScope.cradle;

    await authService.revokeAllUserTokens(request.userId);
    reply.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });

    return { status: 200, body: { success: true } };
  },
});
