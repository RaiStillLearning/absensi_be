import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  authenticateRequest,
  getAuthUser,
  getIdentifierLockSeconds,
  rateLimitAuth,
  recordLoginFailure,
  requireAuth,
  resetLoginFailures,
} from "../../middlewares/auth";
import { API_TAGS } from "../../shared/constants";
import { ErrorResponseSchema } from "../../shared/types/api";
import {
  deleteLocalAvatarIfOwned,
  saveValidatedAvatarFile,
} from "../../shared/utils/upload";
import {
  AuthProfileResponseSchema,
  ChangePasswordRequestSchema,
  LoginRequestSchema,
  LoginSuccessResponseSchema,
} from "./auth_schema";
import {
  authenticateUser,
  changeUserPassword,
  getUserProfile,
  issueAccessTokenForUser,
  updateUserProfilePhoto,
  type LoginResult,
} from "./auth_service";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  clearAuthCookies,
  findActiveSession,
  findSessionByRefreshToken,
  generateOpaqueToken,
  getClientIp,
  readRefreshTokenFromRequest,
  revokeAllUserSessions,
  revokeSession,
  rotateRefreshToken,
  setAccessCookie,
  setSessionCookies,
} from "./session_service";

export const authRouter = new OpenAPIHono();

authRouter.use("/login", rateLimitAuth(20, 15 * 60 * 1000, "login"));
authRouter.use("/guru/login", rateLimitAuth(20, 15 * 60 * 1000, "login_guru"));
authRouter.use("/siswa/login", rateLimitAuth(20, 15 * 60 * 1000, "login_siswa"));
authRouter.use("/refresh", rateLimitAuth(60, 15 * 60 * 1000, "refresh"));
authRouter.use("/change-password", rateLimitAuth(15, 15 * 60 * 1000, "change_password"));
authRouter.use("/change-password", requireAuth());
authRouter.use("/profil/*", requireAuth());

async function handleLoginAttempt(
  c: any,
  username: string,
  password: string,
  rememberMe: boolean,
  successMessage: string
) {
  const lockSec = getIdentifierLockSeconds(username);
  if (lockSec > 0) {
    c.header("Retry-After", String(lockSec));
    return c.json(
      {
        success: false,
        message: "Terlalu banyak percobaan login gagal. Silakan coba lagi beberapa menit lagi.",
      },
      429
    );
  }

  const result: LoginResult = await authenticateUser(username, password, {
    rememberMe,
    userAgent: c.req.header("user-agent") || "",
    ipAddress: getClientIp(c),
  });

  if (result.status === "ambiguous_identity") {
    return c.json({ success: false, code: "AMBIGUOUS_NAME", message: result.message }, 409);
  }

  if (result.status === "invalid_credentials") {
    recordLoginFailure(username);
    return c.json({ success: false, message: result.message }, 401);
  }

  if (result.status === "inactive") {
    return c.json({ success: false, message: result.message }, 403);
  }

  if (result.status !== "success") {
    return c.json({ success: false, message: "Kredensial login tidak valid." }, 401);
  }

  resetLoginFailures(username);

  setAccessCookie(c, result.access_token, result.session.expiresAt);
  setSessionCookies(c, {
    refreshToken: result.session.refreshToken,
    csrfToken: generateOpaqueToken(24),
    sessionExpiresAt: result.session.expiresAt,
  });

  return c.json(
    {
      success: true,
      message: successMessage,
      data: result.data,
      access_token: result.access_token,
      user: result.user,
    },
    200
  );
}

/**
 * 1. POST /api/v1/auth/login (Universal Login)
 */
export const loginRoute = createRoute({
  method: "post",
  path: "/login",
  tags: [API_TAGS.AUTHENTICATION],
  summary: "Unified Login for Admin, Guru, and Siswa",
  description:
    "Authenticates user (Admin, Guru, Walas, or Siswa by NISN/Nama), issues 15m JWT access token & HttpOnly session cookies.",
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
    409: {
      description: "Ambiguous student name (must login with NISN)",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    429: {
      description: "Too many login attempts",
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
  const rememberMe = Boolean(body.remember_me ?? body.rememberMe);
  return handleLoginAttempt(c, username, password, rememberMe, "Login berhasil");
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
            nip: z.string().max(150).optional(),
            nipInput: z.string().max(150).optional(),
            password: z.string().min(1).max(128),
            remember_me: z.boolean().optional(),
            rememberMe: z.boolean().optional(),
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
    429: {
      description: "Too many attempts",
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
  const rememberMe = Boolean(body.remember_me ?? body.rememberMe);
  return handleLoginAttempt(c, username, password, rememberMe, "Login Guru berhasil");
});

/**
 * 3. POST /api/v1/auth/siswa/login
 */
export const siswaLoginRoute = createRoute({
  method: "post",
  path: "/siswa/login",
  tags: [API_TAGS.AUTHENTICATION, API_TAGS.SISWA],
  summary: "Student Direct Login (NISN or Nama Siswa)",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            nisn: z.string().min(1).max(150),
            password: z.string().min(1).max(128),
            remember_me: z.boolean().optional(),
            rememberMe: z.boolean().optional(),
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
    409: {
      description: "Ambiguous student name",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    429: {
      description: "Too many attempts",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

authRouter.openapi(siswaLoginRoute, async (c) => {
  const { nisn, password, remember_me, rememberMe } = c.req.valid("json");
  return handleLoginAttempt(
    c,
    nisn,
    password,
    Boolean(remember_me ?? rememberMe),
    "Login Siswa berhasil"
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
  const authUser = await authenticateRequest(c);
  if (!authUser) {
    return c.json(
      { success: false, message: "Sesi autentikasi tidak valid atau telah kedaluwarsa" },
      401
    );
  }
  const profile = await getUserProfile(authUser.sub, authUser.role, authUser.uid);
  if (!profile) {
    return c.json({ success: false, message: "Profil pengguna tidak ditemukan" }, 401);
  }
  const activeSession = await findActiveSession(authUser.sid);
  return c.json(
    {
      success: true,
      message: "Profil berhasil diambil",
      data: profile,
      session: activeSession
        ? {
            remember_me: activeSession.remember_me,
            expires_at: activeSession.expires_at.toISOString(),
          }
        : undefined,
    },
    200
  );
});

/**
 * 5. POST /api/v1/auth/refresh (with Refresh Token Rotation)
 */
export const refreshRoute = createRoute({
  method: "post",
  path: "/refresh",
  tags: [API_TAGS.AUTHENTICATION],
  summary: "Refresh JWT Access Token & Rotate Refresh Token",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z
            .object({
              refresh_token: z.string().optional(),
            })
            .optional(),
        },
      },
      required: false,
    },
  },
  responses: {
    200: {
      description: "Token refreshed & rotated",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            access_token: z.string(),
            expires_in: z.number(),
            remember_me: z.boolean(),
            session_expires_at: z.string(),
            user: z.any().optional(),
          }),
        },
      },
    },
    401: {
      description: "Invalid or expired refresh token",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

authRouter.openapi(refreshRoute, async (c) => {
  let bodyToken: string | undefined;
  try {
    const raw = await c.req.json();
    bodyToken = typeof raw?.refresh_token === "string" ? raw.refresh_token : undefined;
  } catch {
    bodyToken = undefined;
  }

  const presentedToken = readRefreshTokenFromRequest(c, bodyToken);
  if (!presentedToken) {
    clearAuthCookies(c);
    return c.json(
      { success: false, message: "Refresh token tidak ditemukan. Silakan login kembali." },
      401
    );
  }

  const rotation = await rotateRefreshToken(presentedToken, {
    userAgent: c.req.header("user-agent") || "",
    ipAddress: getClientIp(c),
  });

  if (rotation.status === "invalid" || rotation.status === "reuse_detected") {
    clearAuthCookies(c);
    return c.json(
      {
        success: false,
        message: "Sesi login telah berakhir atau tidak valid. Silakan login kembali.",
      },
      401
    );
  }

  const issued = await issueAccessTokenForUser(rotation.userId, rotation.sessionId);
  if (!issued) {
    await revokeSession(rotation.sessionId, "user_unavailable");
    clearAuthCookies(c);
    return c.json({ success: false, message: "Akun tidak aktif atau tidak ditemukan." }, 401);
  }

  setAccessCookie(c, issued.accessToken, rotation.expiresAt);
  if (rotation.status === "rotated") {
    setSessionCookies(c, {
      refreshToken: rotation.refreshToken,
      csrfToken: generateOpaqueToken(24),
      sessionExpiresAt: rotation.expiresAt,
    });
  }

  return c.json(
    {
      success: true,
      access_token: issued.accessToken,
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      remember_me: rotation.rememberMe,
      session_expires_at: rotation.expiresAt.toISOString(),
      user: issued.user,
    },
    200
  );
});

/**
 * 6. POST /api/v1/auth/logout
 * Mengakhiri seluruh sesi terkait dan mencabut Refresh Token di database serta menghapus cookie.
 */
authRouter.post("/logout", async (c) => {
  const authUser = await authenticateRequest(c);
  if (authUser) {
    await revokeAllUserSessions(authUser.uid, "manual_logout");
  } else {
    const rt = readRefreshTokenFromRequest(c);
    if (rt) {
      const session = await findSessionByRefreshToken(rt);
      if (session) {
        await revokeAllUserSessions(session.user_id, "manual_logout");
      }
    }
  }

  clearAuthCookies(c);
  return c.json(
    {
      success: true,
      message: "Logout berhasil. Sesi Anda telah diakhiri.",
    },
    200
  );
});

/**
 * 7. POST /api/v1/auth/change-password
 * Mengganti password pengguna terotentikasi (siswa/guru/admin). Password default tidak lagi berlaku setelah diganti.
 */
authRouter.openapi(
  createRoute({
    method: "post",
    path: "/change-password",
    tags: [API_TAGS.AUTHENTICATION],
    summary: "Change Authenticated User Password",
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: ChangePasswordRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Password updated",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              message: z.string(),
            }),
          },
        },
      },
      400: {
        description: "Validation or current password error",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
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
      404: {
        description: "User not found",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const authUser = getAuthUser(c);
    if (!authUser) {
      return c.json({ success: false, message: "Autentikasi diperlukan" }, 401);
    }
    const body = c.req.valid("json");
    const result = await changeUserPassword({
      userId: authUser.uid,
      sessionId: authUser.sid,
      currentPassword: body.current_password,
      newPassword: body.new_password,
    });
    if (!result.ok) {
      if (result.status === 404) {
        return c.json({ success: false, message: result.message }, 404);
      }
      return c.json({ success: false, message: result.message }, 400);
    }

    // Terbitkan access token baru untuk sesi saat ini agar klaim tetap segar
    const reissued = await issueAccessTokenForUser(authUser.uid, authUser.sid);
    const activeSession = await findActiveSession(authUser.sid);
    if (reissued && activeSession) {
      setAccessCookie(c, reissued.accessToken, activeSession.expires_at);
    }

    return c.json(
      {
        success: true,
        message: "Password berhasil diubah. Password lama/default tidak dapat digunakan lagi.",
      },
      200
    );
  }
);

/**
 * 8. POST /api/v1/auth/profil/foto
 */
authRouter.post("/profil/foto", async (c) => {
  const authUser = getAuthUser(c);
  if (!authUser) {
    return c.json({ success: false, message: "Akses ditolak: Token autentikasi diperlukan" }, 401);
  }

  let body: Record<string, string | File>;
  try {
    body = await c.req.parseBody();
  } catch {
    return c.json(
      { success: false, message: "Request upload tidak valid. Gunakan multipart/form-data." },
      400
    );
  }

  const candidate = body.foto ?? body.file ?? body.avatar;
  if (!candidate || typeof candidate === "string") {
    return c.json(
      { success: false, message: "File foto wajib dilampirkan pada field 'foto'." },
      400
    );
  }

  try {
    const ownerKey = `${authUser.role}_${authUser.username || authUser.sub}`;
    const saved = await saveValidatedAvatarFile(candidate, ownerKey);
    const updated = await updateUserProfilePhoto(
      String(authUser.sub),
      authUser.role,
      authUser.username,
      saved.publicUrl
    );

    if (!updated) {
      await deleteLocalAvatarIfOwned(saved.publicUrl);
      return c.json({ success: false, message: "Akun pengguna tidak ditemukan." }, 404);
    }

    if (updated.previousFoto && updated.previousFoto !== saved.publicUrl) {
      await deleteLocalAvatarIfOwned(updated.previousFoto);
    }

    return c.json(
      {
        success: true,
        message: "Foto profil berhasil diperbarui.",
        data: {
          foto_profil: saved.publicUrl,
        },
      },
      200
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Gagal memproses foto profil yang diunggah.";
    return c.json({ success: false, message }, 400);
  }
});

/**
 * 9. DELETE /api/v1/auth/profil/foto
 */
authRouter.delete("/profil/foto", async (c) => {
  const authUser = getAuthUser(c);
  if (!authUser) {
    return c.json({ success: false, message: "Akses ditolak: Token autentikasi diperlukan" }, 401);
  }

  const updated = await updateUserProfilePhoto(
    String(authUser.sub),
    authUser.role,
    authUser.username,
    ""
  );

  if (!updated) {
    return c.json({ success: false, message: "Akun pengguna tidak ditemukan." }, 404);
  }

  if (updated.previousFoto) {
    await deleteLocalAvatarIfOwned(updated.previousFoto);
  }

  return c.json(
    {
      success: true,
      message: "Foto profil berhasil dihapus.",
      data: {
        foto_profil: "",
      },
    },
    200
  );
});
