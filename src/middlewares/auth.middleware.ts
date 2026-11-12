/**
 * @deprecated Gunakan `requireAuth()` dari `./auth`.
 * File ini dipertahankan agar import lama tetap berfungsi, namun seluruh validasi
 * (JWT, masa berlaku, status sesi di database, RBAC) didelegasikan ke implementasi tunggal di `./auth`.
 */
import type { Context, Next } from "hono";
import { requireAuth as requireAuthWithRoles } from "./auth";

export type { DecodedAuthToken as JwtUserPayload } from "./auth";

const delegate = requireAuthWithRoles();

export async function requireAuth(c: Context, next: Next) {
  return delegate(c, next);
}
