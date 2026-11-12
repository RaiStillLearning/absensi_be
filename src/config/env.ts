import { z } from "zod";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {
    // ignore if .env file is not found
  }
}

const envSchema = z
  .object({
    APP_PORT: z.coerce.number().int().positive().default(3000),
    APP_ENV: z.enum(["development", "test", "production"]).default("development"),
    USE_EXTERNAL_POSTGRES: z
      .string()
      .default("true")
      .transform((v) => v === "true" || v === "1"),

    // ← WAJIB DIISI, TIDAK ADA DEFAULT
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
    STUDENT_DEFAULT_PASSWORD: z.string().min(5, "STUDENT_DEFAULT_PASSWORD is required"),
    POSTGRES_PASSWORD: z.string().min(1, "POSTGRES_PASSWORD is required"),

    // Password default akun guru yang dibuat otomatis (fallback ke STUDENT_DEFAULT_PASSWORD)
    TEACHER_DEFAULT_PASSWORD: z.string().min(5).optional(),

    // ← Masa berlaku token & sesi (detik). Default sesuai kebijakan keamanan sekolah.
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60), // 15 menit
    SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(24 * 60 * 60), // 24 jam
    REMEMBER_ME_TTL_SECONDS: z.coerce.number().int().positive().default(7 * 24 * 60 * 60), // 7 hari

    // ← Boleh punya default (non-sensitif)
    CORS_ORIGIN: z.string().default("http://localhost:5173"),
    POSTGRES_USER: z.string().default("absensi_user"),
    POSTGRES_DB: z.string().default("absensi_db"),
    POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  })
  .superRefine((data, ctx) => {
    if (data.APP_ENV === "production" && data.JWT_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_SECRET"],
        message: "JWT_SECRET must be at least 32 characters in production",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => ` - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    console.error(
      "❌ Environment validation error (missing or invalid required variables in .env):\n" +
        errorDetails
    );
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
