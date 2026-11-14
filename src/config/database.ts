import { createHash, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { and, count, eq, isNull, or } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
  initialAdminProfile,
  initialAktivitasTerbaru,
  initialGuru,
  initialJadwal,
  initialKelas,
  initialSiswaPerKelas,
  initialSiswaProfile,
} from "../shared/data/initial_data";
import { initialWalasSiswaList } from "../shared/data/store";
import { hashPassword, verifyPassword } from "../shared/utils/hash";
import { env } from "./env";
import * as schema from "./schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PG_DATA_DIR = join(__dirname, "../../pgdata");
const MIGRATIONS_FOLDER = join(__dirname, "../../drizzle");

const useExternalPg = env.USE_EXTERNAL_POSTGRES;

export let pgliteClient: PGlite | null = useExternalPg ? null : new PGlite(PG_DATA_DIR);

export let queryClient: ReturnType<typeof postgres> | null = useExternalPg
  ? postgres(env.DATABASE_URL, {
      max: env.APP_ENV === "production" ? 20 : 5,
      idle_timeout: 20,
      connect_timeout: 2,
      onnotice: () => {},
    })
  : null;

type DrizzleDb = ReturnType<typeof drizzlePostgres<typeof schema>>;

let activeDb: DrizzleDb = useExternalPg
  ? drizzlePostgres(queryClient!, { schema })
  : (drizzlePglite(pgliteClient!, { schema }) as unknown as DrizzleDb);

/**
 * Drizzle ORM database instance initialized with PostgreSQL schema.
 * Automatically delegates to Docker PostgreSQL when reachable, or PGlite fallback.
 */
export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    const value = Reflect.get(activeDb as object, prop, receiver);
    return typeof value === "function" ? value.bind(activeDb) : value;
  },
});

let initPromise: Promise<void> | null = null;

async function syncPostgresBaselineMigrationIfTablesExist(
  client: ReturnType<typeof postgres>,
  migrationsFolder: string
): Promise<void> {
  try {
    const checkResult = await client`
      SELECT count(*)::int as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('activity_logs', 'classes', 'users', 'teachers', 'students');
    `;
    const existingTableCount = checkResult[0]?.count ?? 0;

    if (existingTableCount < 2) {
      return;
    }

    const migrations = readMigrationFiles({ migrationsFolder });
    const baseline = migrations[0];
    if (!baseline) {
      return;
    }

    await client`CREATE SCHEMA IF NOT EXISTS drizzle;`;
    await client`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      );
    `;

    const existingMigrations = await client`
      SELECT id, hash, created_at 
      FROM drizzle.__drizzle_migrations 
      WHERE created_at >= ${baseline.folderMillis} OR hash = ${baseline.hash}
    `;

    if (existingMigrations.length === 0) {
      console.warn(
        `⚠️ Terdeteksi ${existingTableCount} tabel inti sudah ada di PostgreSQL Docker, tetapi migrasi baseline (${baseline.hash.slice(0, 8)}...) belum tercatat di drizzle.__drizzle_migrations.`
      );
      console.log(
        "🔄 Menyinkronkan riwayat migrasi baseline agar Drizzle tidak membuat ulang tabel yang sudah ada..."
      );

      await client`DELETE FROM drizzle.__drizzle_migrations WHERE created_at < ${baseline.folderMillis};`;
      await client`
        INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at")
        VALUES (${baseline.hash}, ${baseline.folderMillis});
      `;
      console.log("✅ Riwayat migrasi baseline berhasil disinkronkan.");
    }
  } catch (syncErr) {
    console.warn("⚠️ Catatan sinkronisasi migrasi awal PostgreSQL:", syncErr);
  }
}

async function syncPgliteBaselineMigrationIfTablesExist(
  client: PGlite,
  migrationsFolder: string
): Promise<void> {
  try {
    const checkResult = await client.query<{ count: number }>(`
      SELECT count(*)::int as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('activity_logs', 'classes', 'users', 'teachers', 'students');
    `);
    const existingTableCount = Number(checkResult.rows[0]?.count ?? 0);
    if (existingTableCount < 2) return;

    const migrations = readMigrationFiles({ migrationsFolder });
    const baseline = migrations[0];
    if (!baseline) return;

    await client.exec(`
      CREATE SCHEMA IF NOT EXISTS drizzle;
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      );
    `);

    const existingMigrations = await client.query<{ id: number }>(
      `SELECT id FROM drizzle.__drizzle_migrations WHERE created_at >= $1 OR hash = $2;`,
      [baseline.folderMillis, baseline.hash]
    );

    if (existingMigrations.rows.length === 0) {
      await client.query(`DELETE FROM drizzle.__drizzle_migrations WHERE created_at < $1;`, [baseline.folderMillis]);
      await client.query(
        `INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at") VALUES ($1, $2);`,
        [baseline.hash, baseline.folderMillis]
      );
    }
  } catch (syncErr) {
    console.warn("⚠️ Catatan sinkronisasi migrasi awal PGlite:", syncErr);
  }
}

async function runMigrationsAndSeed(): Promise<void> {
  if (queryClient) {
    let isConnected = false;
    try {
      await queryClient`SELECT 1`;
      isConnected = true;
    } catch {
      console.warn(
        "⚠️ Docker PostgreSQL (localhost:5432) belum aktif — beralih otomatis ke Embedded PostgreSQL (PGlite) di ./pgdata"
      );
      try {
        await queryClient.end({ timeout: 1 });
      } catch {
        // ignore close error
      }
      queryClient = null;
      pgliteClient = new PGlite(PG_DATA_DIR);
      const pgliteDb = drizzlePglite(pgliteClient, { schema });
      activeDb = pgliteDb as unknown as DrizzleDb;
      try {
        await syncPgliteBaselineMigrationIfTablesExist(pgliteClient, MIGRATIONS_FOLDER);
        await migratePglite(pgliteDb, { migrationsFolder: MIGRATIONS_FOLDER });
      } catch (pgliteMigrationErr: any) {
        const code = pgliteMigrationErr?.code || pgliteMigrationErr?.cause?.code;
        const msg = String(pgliteMigrationErr?.message || "") + " " + String(pgliteMigrationErr?.cause?.message || "");
        const isDuplicate =
          code === "42P07" ||
          code === "42710" ||
          msg.includes("already exists");
        if (!isDuplicate) throw pgliteMigrationErr;
      }
    }

    if (isConnected && queryClient) {
      console.log("🐘 Terhubung ke External PostgreSQL (Docker PG). Menjalankan migrasi Drizzle...");
      try {
        await syncPostgresBaselineMigrationIfTablesExist(queryClient, MIGRATIONS_FOLDER);
        await migratePostgres(activeDb, { migrationsFolder: MIGRATIONS_FOLDER });
      } catch (migrationErr: any) {
        const code = migrationErr?.code || migrationErr?.cause?.code;
        const msg = String(migrationErr?.message || "") + " " + String(migrationErr?.cause?.message || "");
        const isDuplicateRelation =
          code === "42P07" ||
          code === "42710" ||
          msg.includes("already exists");

        if (isDuplicateRelation && queryClient) {
          console.warn(
            "⚠️ Skema tabel sudah ada di PostgreSQL Docker (code 42P07 / duplicate relation). Menyelesaikan sinkronisasi migrasi baseline..."
          );
          try {
            const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
            const baseline = migrations[0];
            if (baseline) {
              await queryClient`CREATE SCHEMA IF NOT EXISTS drizzle;`;
              await queryClient`
                CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
                  id SERIAL PRIMARY KEY,
                  hash text NOT NULL,
                  created_at bigint
                );
              `;
              await queryClient`DELETE FROM drizzle.__drizzle_migrations WHERE created_at < ${baseline.folderMillis};`;
              await queryClient`
                INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at")
                VALUES (${baseline.hash}, ${baseline.folderMillis});
              `;
            }
            console.log("✅ Skema database PostgreSQL berhasil diverifikasi & disinkronkan.");
          } catch (fallbackSyncErr) {
            console.error("Gagal fallback sinkronisasi migrasi:", fallbackSyncErr);
            throw migrationErr;
          }
        } else {
          console.error(
            "❌ Gagal menjalankan migrasi Drizzle pada External PostgreSQL:",
            migrationErr
          );
          throw migrationErr;
        }
      }
    }
  } else if (pgliteClient) {
    const pgliteDb = drizzlePglite(pgliteClient, { schema });
    activeDb = pgliteDb as unknown as DrizzleDb;
    try {
      await syncPgliteBaselineMigrationIfTablesExist(pgliteClient, MIGRATIONS_FOLDER);
      await migratePglite(pgliteDb, { migrationsFolder: MIGRATIONS_FOLDER });
    } catch (pgliteMigrationErr: any) {
      const isDuplicate =
        pgliteMigrationErr?.code === "42P07" ||
        pgliteMigrationErr?.code === "42710" ||
        String(pgliteMigrationErr?.message || "").includes("already exists");
      if (!isDuplicate) throw pgliteMigrationErr;
    }
  }

  // 1. Ensure KELAS 11 exists if classes is empty
  const existingClasses = await db.select({ value: count() }).from(schema.classes);
  if ((existingClasses[0]?.value ?? 0) === 0) {
    await db.insert(schema.classes).values({
      name: "KELAS 11",
      tingkat: "XI",
      jurusan: "Rekayasa Perangkat Lunak",
      tahun_ajaran: "2026/2027",
    });
  }

  // Auto-seeding of dummy teachers, schedules, and logs has been disabled
  // Teachers and schedules will be added exclusively through Web Admin.

  // 5. Ensure default Admin user exists if users table is empty
  const existingUsers = await db.select({ value: count() }).from(schema.users);
  if ((existingUsers[0]?.value ?? 0) === 0) {
    await db.insert(schema.users).values({
      username: "admin",
      role: "admin",
      nama_lengkap: initialAdminProfile.nama_lengkap,
      email: initialAdminProfile.email,
      foto_profil: initialAdminProfile.foto_profil || "",
      password_hash: hashPassword("admin123"),
      is_active: true,
    });
  }

  // 6. Sinkronkan akun siswa yang masih memakai password default lama ("siswa123" / "Ghama123!") ke default baru ("gc123")
  // Hanya menyentuh akun siswa yang belum pernah mengganti password secara mandiri (`password_changed_at IS NULL`).
  const targetDefaultPwd = env.STUDENT_DEFAULT_PASSWORD || "gc123";
  const untouchedStudents = await db
    .select({
      id: schema.users.id,
      password_hash: schema.users.password_hash,
      must_change_password: schema.users.must_change_password,
    })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.role, "siswa"),
        isNull(schema.users.password_changed_at),
        eq(schema.users.must_change_password, false)
      )
    );

  for (const stUser of untouchedStudents) {
    const usesTargetDefault = verifyPassword(targetDefaultPwd, stUser.password_hash);
    const usesLegacyDefault =
      verifyPassword("siswa123", stUser.password_hash) ||
      verifyPassword("Ghama123!", stUser.password_hash);

    if (usesTargetDefault) {
      await db
        .update(schema.users)
        .set({ must_change_password: true, updated_at: new Date() })
        .where(eq(schema.users.id, stUser.id));
    } else if (usesLegacyDefault) {
      await db
        .update(schema.users)
        .set({
          password_hash: hashPassword(targetDefaultPwd),
          must_change_password: true,
          updated_at: new Date(),
        })
        .where(eq(schema.users.id, stUser.id));
    }
  }
}

export async function ensureDatabaseInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = runMigrationsAndSeed().catch((err) => {
      initPromise = null;
      console.error("Failed to initialize PostgreSQL database:", err);
      throw err;
    });
  }
  return initPromise;
}

/**
 * Verifies database connectivity.
 * Executes a lightweight `SELECT 1` query to validate connection.
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await ensureDatabaseInitialized();
    if (pgliteClient) {
      await pgliteClient.query("SELECT 1");
    } else if (queryClient) {
      await queryClient`SELECT 1`;
    }
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
  if (pgliteClient) {
    await pgliteClient.close();
  } else if (queryClient) {
    await queryClient.end();
  }
}
