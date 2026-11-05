import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "./env";
import * as schema from "./schema";

/**
 * PostgreSQL client configured with connection pooling
 */
export const queryClient = postgres(env.DATABASE_URL, {
  max: env.APP_ENV === "production" ? 20 : 5,
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {}, // Suppress notice logs in production/dev
});

/**
 * Drizzle ORM database instance initialized with schema
 */
export const db = drizzle(queryClient, { schema });

/**
 * Verifies database connectivity.
 * Executes a lightweight `SELECT 1` query to validate connection.
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await queryClient`SELECT 1`;
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Database connection check failed:", message);
    return false;
  }
}

/**
 * Gracefully close database connection pool
 */
export async function closeDatabaseConnection(): Promise<void> {
  await queryClient.end();
}

