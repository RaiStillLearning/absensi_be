import { z } from "zod";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {
    // ignore if .env file is not found
  }
}

const envSchema = z.object({
  APP_PORT: z.coerce.number().int().positive().default(3000),
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  USE_EXTERNAL_POSTGRES: z
    .string()
    .default("true")
    .transform((v) => v === "true" || v === "1"),
  DATABASE_URL: z.string().default("postgresql://absensi_user:change_me@localhost:5432/absensi_db"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  POSTGRES_USER: z.string().default("absensi_user"),
  POSTGRES_PASSWORD: z.string().default("change_me"),
  POSTGRES_DB: z.string().default("absensi_db"),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters").default("ghama_caraka_secure_jwt_secret_key_2026"),
  STUDENT_DEFAULT_PASSWORD: z.string().min(6).default("Ghama123!"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => ` - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    console.error("❌ Environment validation error:\n" + errorDetails);
    throw new Error("Invalid application environment configuration. Please check your .env file.");
  }

  return result.data;
}

export const env = loadEnv();
