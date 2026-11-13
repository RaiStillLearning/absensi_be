import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { env } from "../config/env";
import {
  AUTH_COOKIE,
  CSRF_HEADER,
  findActiveSession,
  getClientIp,
  safeEqual,
  type AccessTokenClaims,
  type AuthRole,
} from "../modules/auth/session_service";

export interface DecodedAuthToken {
  /** ID domain sesuai role (admin: users.id, guru: teachers.id, siswa: NISN) — dipertahankan untuk kompatibilitas. */
  sub: string;
  /** users.id */
  uid: string;
  /** auth_sessions.id */
  sid: string;
  username: string;
  role: AuthRole;
  isWalas?: boolean;
  exp?: number;
  mustChangePassword?: boolean;
  authSource: "bearer" | "cookie";
}

/**
 * Helper to retrieve authenticated user payload from Hono context
 */
export function getAuthUser(c: Context): DecodedAuthToken | undefined {
  return c.get("authUser") as DecodedAuthToken | undefined;
}

// ============================================================
// Rate Limiting Login (per IP + per identitas akun)
// ============================================================

interface Bucket {
  count: number;
  resetAt: number;
}

const ipBuckets = new Map<string, Bucket>();
const identifierFailures = new Map<string, Bucket>();

export const LOGIN_RATE_LIMIT = {
  /** Maksimal percobaan login (berhasil/gagal) per IP dalam satu jendela waktu. */
  MAX_ATTEMPTS_PER_IP: 20,
  /** Maksimal percobaan GAGAL per akun/identitas sebelum dikunci sementara. */
  MAX_FAILURES_PER_IDENTIFIER: 5,
  WINDOW_MS: 15 * 60 * 1000,
};

function sweep(map: Map<string, Bucket>, now: number) {
  if (map.size < 5000) return;
  for (const [key, bucket] of map) {
    if (now > bucket.resetAt) map.delete(key);
  }
}

function normalizeIdentifierKey(identifier: string): string {
  return identifier.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 150);
}

export function isRateLimitDisabled(): boolean {
  return env.APP_ENV === "test";
}

/**
 * Periksa apakah identitas login sedang dikunci karena terlalu banyak percobaan gagal.
 * Mengembalikan sisa detik penguncian (0 = boleh mencoba).
 */
export function getIdentifierLockSeconds(identifier: string): number {
  if (isRateLimitDisabled()) return 0;
  const key = normalizeIdentifierKey(identifier);
  const bucket = identifierFailures.get(key);
  const now = Date.now();
  if (!bucket || now > bucket.resetAt) return 0;
  if (bucket.count >= LOGIN_RATE_LIMIT.MAX_FAILURES_PER_IDENTIFIER) {
    return Math.ceil((bucket.resetAt - now) / 1000);
  }
  return 0;
}

export function recordLoginFailure(identifier: string): void {
  if (isRateLimitDisabled()) return;
  const key = normalizeIdentifierKey(identifier);
  const now = Date.now();
  sweep(identifierFailures, now);
  const bucket = identifierFailures.get(key);
  if (!bucket || now > bucket.resetAt) {
    identifierFailures.set(key, { count: 1, resetAt: now + LOGIN_RATE_LIMIT.WINDOW_MS });
  } else {
    bucket.count += 1;
  }
}

export function resetLoginFailures(identifier: string): void {
  identifierFailures.delete(normalizeIdentifierKey(identifier));
}

/**
 * Middleware rate limit per IP untuk endpoint autentikasi.
 */
export function rateLimitAuth(
  maxAttempts = LOGIN_RATE_LIMIT.MAX_ATTEMPTS_PER_IP,
  windowMs = LOGIN_RATE_LIMIT.WINDOW_MS,
  scope = "login"
) {
  return async (c: Context, next: Next) => {
    if (isRateLimitDisabled()) {
      await next();
      return;
    }

    const clientIp = getClientIp(c);
    const isLocal = clientIp === "127.0.0.1" || clientIp === "::1" || clientIp === "localhost";
    if (env.APP_ENV !== "production" && isLocal) {
      await next();
      return;
    }

    const key = `${scope}:${clientIp}`;
    const now = Date.now();
    sweep(ipBuckets, now);
    const entry = ipBuckets.get(key);

    if (!entry || now > entry.resetAt) {
      ipBuckets.set(key, { count: 1, resetAt: now + windowMs });
    } else {
      entry.count += 1;
      if (entry.count > maxAttempts) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        c.header("Retry-After", String(retryAfter));
        return c.json(
          {
            success: false,
            message: "Terlalu banyak percobaan. Silakan coba lagi beberapa saat.",
            retry_after: retryAfter,
          },
          429
        );
      }
    }

    await next();
  };
}

// ============================================================
// HTTPS enforcement (production)
// ============================================================

export function enforceHttps() {
  return async (c: Context, next: Next) => {
    if (env.APP_ENV === "production") {
      const proto =
        c.req.header("x-forwarded-proto")?.split(",")[0]?.trim() ||
        new URL(c.req.url).protocol.replace(":", "");
      if (proto !== "https") {
        return c.json(
          { success: false, message: "Koneksi tidak aman. Gunakan HTTPS untuk mengakses API." },
          403
        );
      }
      c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    await next();
  };
}

// ============================================================
// CSRF Protection (Origin check + Double-Submit Cookie)
// ============================================================

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function allowedOrigins(): string[] {
  return env.CORS_ORIGIN.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * Untuk request yang mengubah data dan diautentikasi lewat cookie:
 * 1. Header Origin (jika ada) wajib termasuk daftar CORS_ORIGIN.
 * 2. Header X-CSRF-Token wajib sama dengan cookie CSRF (double-submit).
 * Request dengan Authorization: Bearer (klien API non-browser) tidak memakai cookie sehingga tidak rentan CSRF.
 */
export function csrfProtection(options: { exemptPaths?: RegExp[] } = {}) {
  return async (c: Context, next: Next) => {
    if (SAFE_METHODS.has(c.req.method)) {
      await next();
      return;
    }

    const origin = c.req.header("origin");
    if (origin && !allowedOrigins().includes(origin)) {
      return c.json({ success: false, message: "Permintaan ditolak: origin tidak diizinkan." }, 403);
    }

    const hasBearer = /^Bearer\s+/i.test(c.req.header("Authorization") || "");
    const usesAuthCookies = Boolean(
      getCookie(c, AUTH_COOKIE.ACCESS) || getCookie(c, AUTH_COOKIE.REFRESH)
    );
    const path = new URL(c.req.url).pathname;
    const isExempt = options.exemptPaths?.some((re) => re.test(path)) ?? false;

    if (!hasBearer && usesAuthCookies && !isExempt) {
      const cookieToken = getCookie(c, AUTH_COOKIE.CSRF) || "";
      const headerToken = c.req.header(CSRF_HEADER) || "";
      if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
        return c.json(
          {
            success: false,
            code: "CSRF_INVALID",
            message: "Permintaan ditolak: token CSRF tidak valid. Muat ulang halaman lalu coba lagi.",
          },
          403
        );
      }
    }

    await next();
  };
}

// ============================================================
// Autentikasi JWT + RBAC
// ============================================================

function extractAccessToken(c: Context): { token: string; source: "bearer" | "cookie" } | null {
  const authHeader = c.req.header("Authorization");
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (token) return { token, source: "bearer" };
  }
  const cookieToken = getCookie(c, AUTH_COOKIE.ACCESS);
  if (cookieToken) return { token: cookieToken, source: "cookie" };
  return null;
}

/**
 * Verifikasi access token (signature, masa berlaku 15 menit, tipe token) dan status sesi di database.
 * Mengembalikan null bila token tidak valid, kedaluwarsa, atau sesinya sudah dicabut/berakhir.
 */
export async function authenticateRequest(c: Context): Promise<DecodedAuthToken | null> {
  const extracted = extractAccessToken(c);
  if (!extracted) return null;

  let claims: AccessTokenClaims;
  try {
    claims = (await verify(extracted.token, env.JWT_SECRET, "HS256")) as unknown as AccessTokenClaims;
  } catch {
    return null;
  }

  if (!claims || claims.typ !== "access" || !claims.role || !claims.sid || !claims.uid) {
    return null;
  }

  const session = await findActiveSession(claims.sid);
  if (!session || session.user_id !== claims.uid) return null;

  return {
    sub: String(claims.sub),
    uid: claims.uid,
    sid: claims.sid,
    username: claims.username,
    role: claims.role,
    isWalas: Boolean(claims.isWalas),
    exp: claims.exp,
    mustChangePassword: session.must_change_password,
    authSource: extracted.source,
  };
}

/**
 * Middleware untuk memvalidasi JWT (Bearer header atau HttpOnly cookie) dan otorisasi role.
 */
export function requireAuth(allowedRoles?: string[]) {
  return async (c: Context, next: Next) => {
    const decoded = await authenticateRequest(c);

    if (!decoded) {
      return c.json(
        {
          success: false,
          code: "UNAUTHENTICATED",
          message: "Sesi autentikasi telah kedaluwarsa atau tidak valid. Silakan login kembali.",
        },
        401
      );
    }

    if (allowedRoles && allowedRoles.length > 0) {
      const userRole = decoded.role;
      const isWalas = Boolean(decoded.isWalas);
      const hasAccess =
        allowedRoles.includes(userRole) ||
        (allowedRoles.includes("walas") && isWalas) ||
        userRole === "admin";

      if (!hasAccess) {
        return c.json(
          {
            success: false,
            code: "FORBIDDEN",
            message: "Akses dilarang: Anda tidak memiliki izin untuk mengakses resource ini.",
          },
          403
        );
      }
    }

    c.set("authUser", decoded);
    await next();
  };
}
