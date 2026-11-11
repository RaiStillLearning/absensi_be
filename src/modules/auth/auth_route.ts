import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { verify } from "hono/jwt";
import { env } from "../../config/env";
import { API_TAGS } from "../../shared/constants";
import { ErrorResponseSchema } from "../../shared/types/api";
import {
  AuthProfileResponseSchema,
  LoginRequestSchema,
  LoginSuccessResponseSchema,
} from "./auth_schema";
import { authenticateUser, getUserProfile } from "./auth_service";

export const authRouter = new OpenAPIHono();

/**
 * 1. POST /api/v1/auth/login (Universal Login)
 */
export const loginRoute = createRoute({
  method: "post",
  path: "/login",
  tags: [API_TAGS.AUTHENTICATION],
  summary: "Unified Login for Admin, Guru, and Siswa",
  description: "Authenticates any school user and returns signed JWT access token and user profile",
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
    401: {
      description: "Invalid credentials",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: "Account inactive",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

authRouter.openapi(loginRoute, async (c) => {
  const body = c.req.valid("json");
  const username = body.nisn_atau_username || body.username || body.nisn || body.nip || "";
  const password = body.kata_sandi || body.password || "";

  const result = await authenticateUser(username, password);

  if (result.status === "invalid_credentials") {
    return c.json({ success: false, message: result.message }, 401);
  }

  if (result.status === "inactive") {
    return c.json({ success: false, message: result.message }, 403);
  }

  return c.json(
    {
      success: true,
      message: "Login berhasil",
      data: result.data,
      access_token: result.data.access_token,
      user: result.data.user,
    },
    200
  );
});

/**
 * 2. POST /api/v1/auth/guru/login
 */
export const guruLoginRoute = createRoute({
  method: "post",
  path: "/guru/login",
  tags: [API_TAGS.AUTHENTICATION, API_TAGS.GURU],
  summary: "Teacher Direct Login",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            nip: z.string().optional(),
            nipInput: z.string().optional(),
            password: z.string(),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Teacher login successful",
      content: {
        "application/json": {
          schema: LoginSuccessResponseSchema,
        },
      },
    },
    401: {
      description: "Invalid credentials",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: "Account inactive",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

authRouter.openapi(guruLoginRoute, async (c) => {
  const body = c.req.valid("json");
  const username = body.nip || body.nipInput || "";
  const password = body.password || "";

  const result = await authenticateUser(username, password);
  if (result.status === "invalid_credentials") {
    return c.json({ success: false, message: result.message }, 401);
  }
  if (result.status === "inactive") {
    return c.json({ success: false, message: result.message }, 403);
  }

  return c.json(
    {
      success: true,
      message: "Login Guru berhasil",
      data: result.data,
      access_token: result.data.access_token,
      user: result.data.user,
    },
    200
  );
});

/**
 * 3. POST /api/v1/auth/siswa/login
 */
export const siswaLoginRoute = createRoute({
  method: "post",
  path: "/siswa/login",
  tags: [API_TAGS.AUTHENTICATION, API_TAGS.SISWA],
  summary: "Student Direct Login",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            nisn: z.string(),
            password: z.string(),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Student login successful",
      content: {
        "application/json": {
          schema: LoginSuccessResponseSchema,
        },
      },
    },
    401: {
      description: "Invalid credentials",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: "Account inactive",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

authRouter.openapi(siswaLoginRoute, async (c) => {
  const { nisn, password } = c.req.valid("json");
  const result = await authenticateUser(nisn, password);
  if (result.status === "invalid_credentials") {
    return c.json({ success: false, message: result.message }, 401);
  }
  if (result.status === "inactive") {
    return c.json({ success: false, message: result.message }, 403);
  }

  return c.json(
    {
      success: true,
      message: "Login Siswa berhasil",
      data: result.data,
      access_token: result.data.access_token,
      user: result.data.user,
    },
    200
  );
});

/**
 * 4. GET /api/v1/auth/me
 */
export const meRoute = createRoute({
  method: "get",
  path: "/me",
  tags: [API_TAGS.AUTHENTICATION],
  summary: "Get Current Authenticated User Profile",
  security: [{ BearerAuth: [] }],
  responses: {
    200: {
      description: "Profile retrieved",
      content: {
        "application/json": {
          schema: AuthProfileResponseSchema,
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

authRouter.openapi(meRoute, async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ success: false, message: "Akses ditolak: Token autentikasi diperlukan" }, 401);
  }
  let userId = "1";
  let role = "admin";
  try {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const payload = (await verify(token, env.JWT_SECRET, "HS256")) as any;
    if (!payload || !payload.role) {
      return c.json({ success: false, message: "Token tidak valid" }, 401);
    }
    userId = String(payload.sub || "1");
    role = String(payload.role);
  } catch {
    return c.json({ success: false, message: "Token tidak valid atau telah kedaluwarsa" }, 401);
  }
  const profile = await getUserProfile(userId, role);
  return c.json(
    {
      success: true,
      message: "Profil berhasil diambil",
      data: profile,
    },
    200
  );
});
