import { defineConfig } from "drizzle-kit";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {
    // ignore if .env file is not found
  }
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/config/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
