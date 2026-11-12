import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sign } from "hono/jwt";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { db } from "../../config/database";
import { env } from "../../config/env";
import { auth_sessions, users } from "../../config/schema";

// ============================================================
// Konstanta Sesi & Cookie
// ============================================================

export const ACCESS_TOKEN_TTL_SECONDS = env.ACCESS_TOKEN_TTL_SECONDS;
export const SESSION_TTL_SECONDS = env.SESSION_TTL_SECONDS;
export const REMEMBER_ME_TTL_SECONDS = env.REMEMBER_ME_TTL_SECONDS;

/** Rentang waktu (detik) di mana refresh token lama masih ditoleransi akibat request paralel. */
export const REFRESH_REUSE_GRACE_SECONDS = 30;

export const AUTH_COOKIE = {
  ACCESS: "absensi_at",
  REFRESH: "absensi_rt",
  CSRF: "absensi_csrf",
} as const;

export const CSRF_HEADER = "x-csrf-token";

const isProduction = env.APP_ENV === "production";

export type AuthRole = "admin" | "guru" | "siswa" | "walas";

export interface AccessTokenClaims {
  sub: string;
  uid: string;
  sid: string;
  username: string;
  role: AuthRole;
  isWalas?: boolean;
  typ: "access";
  iat: number;
  exp: number;
}

// ============================================================
// Helper Kriptografi
// ============================================================

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateOpaqueToken(bytes = 48): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function signAccessToken(
  claims: Omit<AccessTokenClaims, "typ" | "iat" | "exp">
): Promise<{ token: string; expiresAt: Date }> {
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = nowSec + ACCESS_TOKEN_TTL_SECONDS;
  const payload: AccessTokenClaims = { ...claims, typ: "access", iat: nowSec, exp };
  const token = await sign(payload as unknown as Record<string, unknown>, env.JWT_SECRET, "HS256");
  return { token, expiresAt: new Date(exp * 1000) };
}

// ============================================================
// Manajemen Sesi (tabel auth_sessions)
// ============================================================

export interface CreatedSession {
  sessionId: string;
  refreshToken: string;
  expiresAt: Date;
  rememberMe: boolean;
}

export async function createSession(input: {
  userId: string;
  rememberMe: boolean;
  userAgent?: string;
  ipAddress?: string;
}): Promise<CreatedSession> {
  const ttl = input.rememberMe ? REMEMBER_ME_TTL_SECONDS : SESSION_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttl * 1000);
  const refreshToken = generateOpaqueToken();

  const [row] = await db
    .insert(auth_sessions)
    .values({
      user_id: input.userId,
      refresh_token_hash: hashToken(refreshToken),
      remember_me: input.rememberMe,
      expires_at: expiresAt,
      user_agent: (input.userAgent || "").slice(0, 255),
      ip_address: (input.ipAddress || "").slice(0, 64),
    })
    .returning({ id: auth_sessions.id });

  if (!row) throw new Error("Gagal membuat sesi login");
  return { sessionId: row.id, refreshToken, expiresAt, rememberMe: input.rememberMe };
}

export type RotateResult =
  | {
      status: "rotated";
      sessionId: string;
      userId: string;
      refreshToken: string;
      expiresAt: Date;
      rememberMe: boolean;
    }
  | {
      /** Refresh token lama dipakai lagi dalam masa toleransi (request paralel) — hanya terbitkan access token. */
      status: "grace";
      sessionId: string;
      userId: string;
      expiresAt: Date;
      rememberMe: boolean;
    }
  | { status: "reuse_detected" }
  | { status: "invalid" };

/**
 * Refresh Token Rotation:
 * - Token valid → diganti token baru (token lama disimpan sebagai `previous_refresh_token_hash`).
 * - Token lama dipakai ulang di luar masa toleransi → indikasi pencurian, seluruh sesi dicabut.
 */
export async function rotateRefreshToken(
  presentedToken: string,
  meta: { userAgent?: string; ipAddress?: string } = {}
): Promise<RotateResult> {
  if (!presentedToken || presentedToken.length > 256) return { status: "invalid" };
  const presentedHash = hashToken(presentedToken);
  const now = new Date();

  const [current] = await db
    .select()
    .from(auth_sessions)
    .where(eq(auth_sessions.refresh_token_hash, presentedHash))
    .limit(1);

  if (current) {
    if (current.revoked_at || current.expires_at.getTime() <= now.getTime()) {
      return { status: "invalid" };
    }

    const newToken = generateOpaqueToken();
    const updated = await db
      .update(auth_sessions)
      .set({
        refresh_token_hash: hashToken(newToken),
        previous_refresh_token_hash: presentedHash,
        rotated_at: now,
        last_used_at: now,
        ...(meta.userAgent ? { user_agent: meta.userAgent.slice(0, 255) } : {}),
        ...(meta.ipAddress ? { ip_address: meta.ipAddress.slice(0, 64) } : {}),
      })
      .where(
        and(
          eq(auth_sessions.id, current.id),
          eq(auth_sessions.refresh_token_hash, presentedHash),
          isNull(auth_sessions.revoked_at)
        )
      )
      .returning({ id: auth_sessions.id });

    if (updated.length === 1) {
      return {
        status: "rotated",
        sessionId: current.id,
        userId: current.user_id,
        refreshToken: newToken,
        expiresAt: current.expires_at,
        rememberMe: current.remember_me,
      };
    }
    // Kalah balapan dengan request paralel → periksa jalur toleransi di bawah.
  }

  const [previous] = await db
    .select()
    .from(auth_sessions)
    .where(eq(auth_sessions.previous_refresh_token_hash, presentedHash))
    .limit(1);

  if (!previous) return { status: "invalid" };

  if (previous.revoked_at || previous.expires_at.getTime() <= now.getTime()) {
    return { status: "invalid" };
  }

  const rotatedAgoMs = previous.rotated_at ? now.getTime() - previous.rotated_at.getTime() : Infinity;
  if (rotatedAgoMs <= REFRESH_REUSE_GRACE_SECONDS * 1000) {
    return {
      status: "grace",
      sessionId: previous.id,
      userId: previous.user_id,
      expiresAt: previous.expires_at,
      rememberMe: previous.remember_me,
    };
  }

  await revokeSession(previous.id, "refresh_token_reuse");
  return { status: "reuse_detected" };
}

/**
 * Validasi sesi aktif untuk setiap request terotentikasi.
 * Sesi harus ada, belum dicabut, belum melewati batas absolut, dan akunnya aktif.
 */
export async function findActiveSession(sessionId: string): Promise<{
  id: string;
  user_id: string;
  remember_me: boolean;
  expires_at: Date;
  must_change_password: boolean;
} | null> {
  if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
  const [row] = await db
    .select({
      id: auth_sessions.id,
      user_id: auth_sessions.user_id,
      remember_me: auth_sessions.remember_me,
      expires_at: auth_sessions.expires_at,
      must_change_password: users.must_change_password,
    })
    .from(auth_sessions)
    .innerJoin(users, eq(users.id, auth_sessions.user_id))
    .where(
      and(
        eq(auth_sessions.id, sessionId),
        isNull(auth_sessions.revoked_at),
        gt(auth_sessions.expires_at, sql`now()`),
        eq(users.is_active, true)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function findSessionByRefreshToken(refreshToken: string) {
  if (!refreshToken || refreshToken.length > 256) return null;
  const [row] = await db
    .select()
    .from(auth_sessions)
    .where(eq(auth_sessions.refresh_token_hash, hashToken(refreshToken)))
    .limit(1);
  return row ?? null;
}

export async function revokeSession(sessionId: string, reason: string): Promise<void> {
  await db
    .update(auth_sessions)
    .set({ revoked_at: new Date(), revoked_reason: reason.slice(0, 50) })
    .where(and(eq(auth_sessions.id, sessionId), isNull(auth_sessions.revoked_at)));
}

export async function revokeAllUserSessions(
  userId: string,
  reason: string,
  exceptSessionId?: string
): Promise<void> {
  const conditions = [eq(auth_sessions.user_id, userId), isNull(auth_sessions.revoked_at)];
  if (exceptSessionId) conditions.push(ne(auth_sessions.id, exceptSessionId));
  await db
    .update(auth_sessions)
    .set({ revoked_at: new Date(), revoked_reason: reason.slice(0, 50) })
    .where(and(...conditions));
}

// ============================================================
// Cookie Helpers (HttpOnly + Secure di production + SameSite)
// ============================================================

function remainingSeconds(expiresAt: Date): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
}

export function setAccessCookie(c: Context, accessToken: string, sessionExpiresAt: Date): void {
  // Access cookie tidak boleh hidup lebih lama dari JWT-nya maupun dari sesinya.
  const maxAge = Math.min(ACCESS_TOKEN_TTL_SECONDS, remainingSeconds(sessionExpiresAt));
  setCookie(c, AUTH_COOKIE.ACCESS, accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "Lax",
    path: "/",
    maxAge,
  });
}

export function setSessionCookies(
  c: Context,
  input: { refreshToken: string; csrfToken: string; sessionExpiresAt: Date }
): void {
  // Refresh & CSRF cookie mengikuti batas absolut sesi (24 jam / 7 hari) secara persis.
  const maxAge = remainingSeconds(input.sessionExpiresAt);
  setCookie(c, AUTH_COOKIE.REFRESH, input.refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "Lax",
    path: "/",
    maxAge,
    expires: input.sessionExpiresAt,
  });
  setCookie(c, AUTH_COOKIE.CSRF, input.csrfToken, {
    httpOnly: false, // harus bisa dibaca JS untuk dikirim ulang via header X-CSRF-Token (double-submit)
    secure: isProduction,
    sameSite: "Lax",
    path: "/",
    maxAge,
    expires: input.sessionExpiresAt,
  });
}

export function clearAuthCookies(c: Context): void {
  for (const name of [AUTH_COOKIE.ACCESS, AUTH_COOKIE.REFRESH, AUTH_COOKIE.CSRF]) {
    deleteCookie(c, name, { path: "/", secure: isProduction, sameSite: "Lax" });
  }
}

export function readRefreshTokenFromRequest(c: Context, bodyToken?: string): string {
  return getCookie(c, AUTH_COOKIE.REFRESH) || bodyToken || "";
}

export function getClientIp(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "local"
  );
}
