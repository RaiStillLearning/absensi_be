import { z } from "@hono/zod-openapi";

/**
 * Universal Login Request Schema
 * Supports various field naming conventions from frontend:
 * - `nisn_atau_username` & `kata_sandi` (from lib/api/index.ts)
 * - `username` & `password` (standard REST)
 * - `nisn` & `password` (from student auth)
 * - `nip` & `password` (from teacher auth)
 */
export const LoginRequestSchema = z
  .object({
    nisn_atau_username: z.string().max(150).optional(),
    username: z.string().max(150).optional(),
    nisn: z.string().max(150).optional(),
    nip: z.string().max(150).optional(),
    kata_sandi: z.string().max(128).optional(),
    password: z.string().max(128).optional(),
    remember_me: z.boolean().optional(),
    rememberMe: z.boolean().optional(),
  })
  .refine(
    (data) => {
      const id = (data.nisn_atau_username || data.username || data.nisn || data.nip || "").trim();
      return id.length > 0;
    },
    { message: "NISN, NIP, Nama Siswa, atau Username wajib diisi" }
  )
  .refine(
    (data) => {
      const pass = (data.kata_sandi || data.password || "").trim();
      return pass.length > 0;
    },
    { message: "Password / Kata Sandi wajib diisi" }
  )
  .openapi("LoginRequest");

export const ChangePasswordRequestSchema = z
  .object({
    current_password: z.string().min(1, "Password saat ini wajib diisi").max(128),
    new_password: z
      .string()
      .min(6, "Password baru minimal 6 karakter")
      .max(128, "Password baru maksimal 128 karakter"),
    confirm_password: z.string().min(1, "Konfirmasi password baru wajib diisi").max(128),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Konfirmasi password baru tidak cocok",
    path: ["confirm_password"],
  })
  .openapi("ChangePasswordRequest");

/**
 * Authenticated User Details Schema
 */
export const AuthUserProfileSchema = z
  .object({
    id: z.string().openapi({ example: "1" }),
    username: z.string().openapi({ example: "admin" }),
    role: z.string().openapi({ example: "admin" }),
    peran: z.string().openapi({ example: "Administrator" }),
    nama_lengkap: z.string().openapi({ example: "Admin" }),
    email: z.string().optional().openapi({ example: "admin@sekolah.example" }),
    foto_profil: z.string().optional(),
    isWalas: z.boolean().optional(),
    kelasWalas: z.string().optional(),
    kelas_diampu: z.string().optional(),
    mata_pelajaran: z.string().optional(),
    nip: z.string().optional(),
    nisn: z.string().optional(),
    nis: z.string().optional(),
    kelas: z.string().optional(),
    jurusan: z.string().optional(),
    must_change_password: z.boolean().optional(),
    student: z
      .object({
        id: z.string(),
        nisn: z.string(),
        full_name: z.string(),
        class_name: z.string(),
      })
      .optional(),
  })
  .openapi("AuthUserProfile");

/**
 * Login Response Data Schema
 */
export const LoginSuccessDataSchema = z
  .object({
    access_token: z.string().openapi({
      example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      description: "Short-lived JWT access token (15 minutes)",
    }),
    token_type: z.literal("Bearer").openapi({ example: "Bearer" }),
    expires_in: z.number().int().openapi({ example: 900 }),
    remember_me: z.boolean().openapi({ example: false }),
    session_expires_at: z.string().openapi({ example: "2026-11-13T23:30:00.000Z" }),
    user: AuthUserProfileSchema,
  })
  .openapi("LoginSuccessData");

/**
 * Login Success Response Wrapper Schema
 */
export const LoginSuccessResponseSchema = z
  .object({
    success: z.boolean().openapi({ example: true }),
    message: z.string().openapi({ example: "Login berhasil" }),
    data: LoginSuccessDataSchema,
    access_token: z.string().optional(),
    user: AuthUserProfileSchema.optional(),
  })
  .openapi("LoginSuccessResponse");

/**
 * User Profile Response Wrapper Schema
 */
export const AuthProfileResponseSchema = z
  .object({
    success: z.boolean().openapi({ example: true }),
    message: z.string().openapi({ example: "Profil berhasil diambil" }),
    data: AuthUserProfileSchema,
  })
  .openapi("AuthProfileResponse");
