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
    nisn_atau_username: z.string().optional(),
    username: z.string().optional(),
    nisn: z.string().optional(),
    nip: z.string().optional(),
    kata_sandi: z.string().optional(),
    password: z.string().optional(),
  })
  .refine(
    (data) => Boolean(data.nisn_atau_username || data.username || data.nisn || data.nip),
    { message: "NISN, NIP, atau Username wajib diisi" }
  )
  .refine(
    (data) => Boolean(data.kata_sandi || data.password),
    { message: "Password / Kata Sandi wajib diisi" }
  )
  .openapi("LoginRequest");

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
    mata_pelajaran: z.string().optional(),
    nisn: z.string().optional(),
    kelas: z.string().optional(),
    jurusan: z.string().optional(),
  })
  .openapi("AuthUserProfile");

/**
 * Login Response Data Schema
 */
export const LoginSuccessDataSchema = z
  .object({
    access_token: z.string().openapi({
      example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      description: "JWT access token valid for API requests",
    }),
    token_type: z.literal("Bearer").openapi({ example: "Bearer" }),
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
