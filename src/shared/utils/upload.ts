import { mkdir, unlink, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const MAX_PROFILE_PHOTO_BYTES = 1 * 1024 * 1024; // 1 MB
export const AVATAR_UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "avatars");
export const AVATAR_PUBLIC_PREFIX = "/api/v1/uploads/avatars/";

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);

export interface ValidatedAvatarResult {
  extension: "jpg" | "png";
  mimeType: "image/jpeg" | "image/png";
  buffer: Buffer;
}

/**
 * Inspects binary magic bytes to verify the buffer is actually a JPEG or PNG image.
 */
export function detectImageTypeFromMagicBytes(
  buffer: Buffer,
): { extension: "jpg" | "png"; mimeType: "image/jpeg" | "image/png" } | null {
  if (buffer.length < 4) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { extension: "png", mimeType: "image/png" };
  }

  return null;
}

/**
 * Validates an uploaded File object against size (<= 1 MB), extension, MIME type, and magic bytes.
 */
export async function validateAvatarFile(file: File): Promise<ValidatedAvatarResult> {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("File foto tidak valid.");
  }

  if (file.size === 0) {
    throw new Error("File foto kosong. Silakan pilih file gambar yang valid.");
  }

  if (file.size > MAX_PROFILE_PHOTO_BYTES) {
    const sizeInMb = (file.size / (1024 * 1024)).toFixed(2);
    throw new Error(
      `Ukuran file (${sizeInMb} MB) melebihi batas maksimal 1 MB. Silakan kompres atau pilih foto lain.`,
    );
  }

  const ext = path.extname(file.name || "").toLowerCase();
  if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error("Format file tidak didukung. Gunakan file JPG, JPEG, atau PNG.");
  }

  const mime = (file.type || "").toLowerCase();
  if (mime && !ALLOWED_MIME_TYPES.has(mime)) {
    throw new Error("Tipe file tidak didukung. Hanya JPG, JPEG, dan PNG yang diperbolehkan.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length > MAX_PROFILE_PHOTO_BYTES) {
    throw new Error("Ukuran file melebihi batas maksimal 1 MB.");
  }

  const detected = detectImageTypeFromMagicBytes(buffer);
  if (!detected) {
    throw new Error(
      "Isi file tidak valid atau bukan gambar JPG/JPEG/PNG asli. Silakan pilih foto lain.",
    );
  }

  return {
    extension: detected.extension,
    mimeType: detected.mimeType,
    buffer,
  };
}

/**
 * Saves a validated avatar image into uploads/avatars and returns its public API path.
 */
export async function saveValidatedAvatarFile(
  file: File,
  ownerKey: string,
): Promise<{ publicUrl: string; filename: string; mimeType: string; size: number }> {
  const validated = await validateAvatarFile(file);

  if (!existsSync(AVATAR_UPLOAD_DIR)) {
    await mkdir(AVATAR_UPLOAD_DIR, { recursive: true });
  }

  const safeOwner = ownerKey.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40) || "user";
  const randomToken = crypto.randomBytes(6).toString("hex");
  const filename = `${safeOwner}_${Date.now()}_${randomToken}.${validated.extension}`;
  const fullPath = path.join(AVATAR_UPLOAD_DIR, filename);

  await writeFile(fullPath, validated.buffer);

  return {
    publicUrl: `${AVATAR_PUBLIC_PREFIX}${filename}`,
    filename,
    mimeType: validated.mimeType,
    size: validated.buffer.length,
  };
}

/**
 * Deletes an old locally-hosted avatar file if it belongs to AVATAR_PUBLIC_PREFIX.
 */
export async function deleteLocalAvatarIfOwned(fotoUrl?: string | null): Promise<void> {
  if (!fotoUrl) return;
  const cleanUrl = fotoUrl.split("?")[0] ?? "";
  if (!cleanUrl.startsWith(AVATAR_PUBLIC_PREFIX)) return;

  const filename = cleanUrl.slice(AVATAR_PUBLIC_PREFIX.length);
  // Proteksi Path Traversal & Ekstensi Gambar
  if (!/^[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png)$/i.test(filename)) return;

  const fullPath = path.join(AVATAR_UPLOAD_DIR, filename);
  if (existsSync(fullPath)) {
    await unlink(fullPath).catch(() => {});
  }
}

/**
 * Reads an uploaded avatar file safely for HTTP serving.
 */
export async function readLocalAvatarFile(
  filename: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  // Proteksi Path Traversal & Ekstensi Gambar
  if (!/^[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png)$/i.test(filename)) return null;
  const fullPath = path.join(AVATAR_UPLOAD_DIR, filename);
  if (!existsSync(fullPath)) return null;

  const buffer = await readFile(fullPath);
  const detected = detectImageTypeFromMagicBytes(buffer);
  const mimeType =
    detected?.mimeType ?? (filename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");

  return { buffer, mimeType };
}

/**
 * Validates `foto_profil` field sent via JSON PUT profile routes.
 * Allows empty string, known local asset/upload paths, or valid base64 data URL (JPG/JPEG/PNG <= 1 MB).
 */
export function validateProfilePhotoValue(value: unknown): { valid: true } | { valid: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { valid: true };
  }

  if (typeof value !== "string") {
    return { valid: false, error: "Format foto profil tidak valid." };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: true };
  }

  if (trimmed.startsWith(AVATAR_PUBLIC_PREFIX) || trimmed.startsWith("/avatar-")) {
    return { valid: true };
  }

  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
    return { valid: true };
  }

  const dataUrlMatch = /^data:(image\/(?:jpeg|jpg|png));base64,([A-Za-z0-9+/=]+)$/i.exec(trimmed);
  if (!dataUrlMatch) {
    return {
      valid: false,
      error: "Format foto tidak didukung. Gunakan file gambar JPG, JPEG, atau PNG.",
    };
  }

  const base64Data = dataUrlMatch[2] ?? "";
  const buffer = Buffer.from(base64Data, "base64");

  if (buffer.length === 0) {
    return { valid: false, error: "Data foto tidak valid atau kosong." };
  }

  if (buffer.length > MAX_PROFILE_PHOTO_BYTES) {
    const sizeInMb = (buffer.length / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `Ukuran foto (${sizeInMb} MB) melebihi batas maksimal 1 MB.`,
    };
  }

  const detected = detectImageTypeFromMagicBytes(buffer);
  if (!detected) {
    return {
      valid: false,
      error: "Isi gambar tidak valid. Pastikan file benar-benar berformat JPG, JPEG, atau PNG.",
    };
  }

  return { valid: true };
}
