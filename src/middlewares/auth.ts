import { Context, Next } from "hono";
import { verify } from "hono/jwt";
import { env } from "../config/env";

export interface DecodedAuthToken {
  sub: string;
  username: string;
  role: "admin" | "guru" | "siswa" | "walas";
  isWalas?: boolean;
  exp?: number;
}

/**
 * Middleware untuk memvalidasi JWT Bearer token dan otorisasi role
 */
export function requireAuth(allowedRoles?: string[]) {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json(
        {
          success: false,
          message: "Akses ditolak: Token autentikasi (Bearer token) diperlukan",
        },
        401
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    try {
      const decoded = (await verify(token, env.JWT_SECRET, "HS256")) as unknown as DecodedAuthToken;

      if (!decoded || !decoded.role) {
        return c.json(
          {
            success: false,
            message: "Token autentikasi tidak valid atau telah kedaluwarsa",
          },
          401
        );
      }

      // Validasi pembatasan role jika ditentukan
      if (allowedRoles && allowedRoles.length > 0) {
        const userRole = decoded.role;
        const isWalas = Boolean(decoded.isWalas);
        const hasAccess =
          allowedRoles.includes(userRole) ||
          (allowedRoles.includes("walas") && (isWalas || userRole === "guru")) ||
          (allowedRoles.includes("guru") && isWalas) ||
          userRole === "admin"; // Admin memiliki akses supervisor

        if (!hasAccess) {
          return c.json(
            {
              success: false,
              message: `Akses dilarang: Peran '${userRole}' tidak memiliki izin untuk mengakses resource ini`,
            },
            403
          );
        }
      }

      // Simpan payload user yang terotentikasi ke context
      c.set("authUser", decoded);
      await next();
    } catch {
      return c.json(
        {
          success: false,
          message: "Sesi autentikasi telah kedaluwarsa atau tidak valid. Silakan login kembali.",
        },
        401
      );
    }
  };
}

