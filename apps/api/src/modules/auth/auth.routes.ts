import { initServer } from "@ts-rest/fastify";
import { authContract } from "@valet/contracts";
import { AppError } from "../../common/errors.js";

const s = initServer();

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
  google: async ({ body, request }) => {
    const { authService } = request.diScope.cradle;

    try {
      const result = await authService.authenticateWithGoogle(
        body.code,
        body.redirectUri,
      );

      const responseBody = {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        tokenType: "Bearer" as const,
        expiresIn: result.tokens.expiresIn,
        user: toUserResponse(result.user as unknown as Record<string, unknown>),
      };

      if (result.isNewUser) {
        return { status: 201 as const, body: responseBody };
      }
      return { status: 200 as const, body: responseBody };
    } catch {
      throw AppError.badRequest("Failed to authenticate with Google");
    }
  },

  refresh: async ({ body, request }) => {
    const { authService } = request.diScope.cradle;

    try {
      const tokens = await authService.refreshTokens(body.refreshToken);

      return {
        status: 200,
        body: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenType: "Bearer" as const,
          expiresIn: tokens.expiresIn,
        },
      };
    } catch {
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
});
