import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/config/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://absensi_user:change_me@localhost:5432/absensi_db",
  },
  verbose: true,
  strict: true,
});

