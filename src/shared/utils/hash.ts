import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Hash a password using scrypt with a random salt
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Verify a plain password against a stored scrypt hash or bcrypt hash.
 * Plaintext fallback is strictly disabled for security.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    if (!storedHash) return false;

    // Check if stored as salt:hash (scrypt)
    if (storedHash.includes(":")) {
      const [salt, hash] = storedHash.split(":");
      if (!salt || !hash) return false;
      const computed = scryptSync(password, salt, 64).toString("hex");
      return timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(hash, "hex"));
    }

    // Check if bcrypt hash in Bun runtime
    if (storedHash.startsWith("$2") && typeof (globalThis as any).Bun !== "undefined") {
      return (globalThis as any).Bun.password.verifySync(password, storedHash);
    }

    return false;
  } catch {
    return false;
  }
}
