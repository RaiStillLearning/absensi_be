import { z } from "@hono/zod-openapi";

/**
 * Login Request Schema
 * NISN or username used as identity.
 */
export const LoginRequestSchema = z
  .object({
    username: z
      .string()
      .min(1, "NISN / Username tidak boleh kosong")
      .openapi({
        example: "0097061219",
        description: "NISN siswa atau username akun",
      }),
    password: z
      .string()
      .min(1, "Password tidak boleh kosong")
      .openapi({
        example: "Ghama123!",
        description: "Password akun pengguna",
      }),
  })
  .openapi("LoginRequest");

/**
 * Student Basic Info Schema
 */
export const StudentBasicSchema = z
  .object({
    id: z.string().uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
    nisn: z.string().openapi({ example: "0097061219" }),
    full_name: z.string().openapi({ example: "Abdul Hafizh Rijki Tsaqafi" }),
    class_name: z.string().openapi({ example: "KELAS 11" }),
  })
  .openapi("StudentBasicInfo");

/**
 * Authenticated User Profile Schema
 */
export const AuthUserProfileSchema = z
  .object({
    id: z.string().uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440001" }),
    username: z.string().openapi({ example: "0097061219" }),
    role: z.string().openapi({ example: "siswa" }),
    student: StudentBasicSchema.nullable().optional(),
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

