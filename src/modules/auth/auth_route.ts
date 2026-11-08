import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { requireAuth, type JwtUserPayload } from "../../middlewares/auth.middleware";
import { API_TAGS } from "../../shared/constants";
import { ErrorResponseSchema } from "../../shared/types/api";
import {
  AuthProfileResponseSchema,
  LoginRequestSchema,
  LoginSuccessResponseSchema,
} from "./auth_schema";
import { authenticateUser, getUserProfile } from "./auth_service";

/**
 * Route definition for user login
 */
export const loginRoute = createRoute({
  method: "post",
  path: "/login",
  tags: [API_TAGS.AUTHENTICATION],
  summary: "User & Student Login via NISN/Username",
  description:
    "Authenticates student using their NISN and password. Returns signed JWT Bearer access token and safe student profile.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: LoginRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Login successful",
      content: {
        "application/json": {
          schema: LoginSuccessResponseSchema,
        },
      },
    },
    400: {
      description: "Validation error",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    401: {
      description: "Invalid credentials or unauthorized",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: "Account deactivated",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

/**
 * Route definition for authenticated profile
 */
export const meRoute = createRoute({
  method: "get",
  path: "/me",
  tags: [API_TAGS.AUTHENTICATION],
  summary: "Get Current Authenticated User Profile",
  description: "Retrieves profile and student information for currently authenticated user.",
  security: [{ BearerAuth: [] }],
  responses: {
    200: {
      description: "Profile retrieved successfully",
      content: {
        "application/json": {
          schema: AuthProfileResponseSchema,
        },
      },
    },
    401: {
      description: "Missing or invalid Bearer token",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: "User not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

export const authRouter = new OpenAPIHono();

// Login handler
authRouter.openapi(loginRoute, async (c) => {
  const { username, password } = c.req.valid("json");

  const result = await authenticateUser(username, password);

  if (result.status === "invalid_credentials") {
    return c.json(
      {
        success: false,
        message: result.message,
      },
      401
    );
  }

  if (result.status === "inactive") {
    return c.json(
      {
        success: false,
        message: result.message,
      },
      403
    );
  }

  return c.json(
    {
      success: true,
      message: "Login berhasil",
      data: result.data,
    },
    200
  );
});

// /me handler protected by requireAuth middleware
authRouter.use("/me", requireAuth);
authRouter.openapi(meRoute, async (c) => {
  const jwtPayload = c.get("jwtPayload" as any) as JwtUserPayload;

  const profile = await getUserProfile(jwtPayload.sub);
  if (!profile) {
    return c.json(
      {
        success: false,
        message: "Pengguna tidak ditemukan atau sudah tidak aktif",
      },
      404
    );
  }

  return c.json(
    {
      success: true,
      message: "Profil pengguna berhasil diambil",
      data: profile,
    },
    200
  );
});

