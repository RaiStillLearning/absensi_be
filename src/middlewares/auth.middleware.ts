import type { Context, Next } from "hono";
import { verify } from "hono/jwt";
import { env } from "../config/env";
import { errorResponse } from "../shared/utils/response";

export interface JwtUserPayload {
  sub: string;
  username: string;
  role: string;
  student_id?: string | null;
  exp: number;
}

/**
 * Authentication Middleware
 * Validates JWT Bearer token from Authorization header.
 */
export async function requireAuth(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json(
      errorResponse("Akses ditolak: Token autentikasi tidak ditemukan"),
      401
    );
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return c.json(
      errorResponse("Akses ditolak: Format token tidak valid"),
      401
    );
  }

  try {
    const payload = (await verify(token, env.JWT_SECRET, "HS256")) as unknown as JwtUserPayload;

    if (!payload || !payload.sub) {
      return c.json(errorResponse("Token tidak valid atau kedaluwarsa"), 401);
    }

    c.set("jwtPayload", payload);
    return next();
  } catch (error) {
    return c.json(errorResponse("Token tidak valid atau kedaluwarsa"), 401);
  }
}

