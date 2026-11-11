import { createHash, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { count, eq } from "drizzle-orm";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
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
import { hashPassword } from "../shared/utils/hash";
import { env } from "./env";
import * as schema from "./schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PG_DATA_DIR = join(__dirname, "../../pgdata");

const useExternalPg = process.env.USE_EXTERNAL_POSTGRES === "true";

export const pgliteClient = useExternalPg ? null : new PGlite(PG_DATA_DIR);

export const queryClient = useExternalPg
  ? postgres(env.DATABASE_URL, {
      max: env.APP_ENV === "production" ? 20 : 5,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
    })
  : null;

/**
 * Drizzle ORM database instance initialized with PostgreSQL schema
 */
export const db: ReturnType<typeof drizzlePostgres<typeof schema>> = useExternalPg
  ? drizzlePostgres(queryClient!, { schema })
  : (drizzlePglite(pgliteClient!, { schema }) as unknown as ReturnType<
      typeof drizzlePostgres<typeof schema>
    >);

let initPromise: Promise<void> | null = null;

const DDL_SQL = `
CREATE TABLE IF NOT EXISTS "classes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "class_code_id" integer,
  "name" varchar(50) NOT NULL UNIQUE,
  "tingkat" varchar(10) DEFAULT 'X' NOT NULL,
  "jurusan" varchar(50) DEFAULT 'RPL' NOT NULL,
  "wali_kelas" varchar(150) DEFAULT '' NOT NULL,
  "tahun_ajaran" varchar(20) DEFAULT '2026/2027' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "teachers" (
  "id" serial PRIMARY KEY,
  "nip" varchar(30) DEFAULT '',
  "nama_guru" varchar(150) NOT NULL,
  "nama_panggilan" varchar(50) DEFAULT '',
  "mata_pelajaran" varchar(100) NOT NULL,
  "email" varchar(150) DEFAULT '',
  "nomor_telepon" varchar(30) DEFAULT '',
  "jenis_kelamin" varchar(20) DEFAULT 'Perempuan' NOT NULL,
  "tempat_lahir" varchar(100) DEFAULT 'Jakarta' NOT NULL,
  "tanggal_lahir" varchar(50) DEFAULT '12 Mei 1989' NOT NULL,
  "alamat" varchar(255) DEFAULT 'Depok, Jawa Barat' NOT NULL,
  "is_walas" boolean DEFAULT false NOT NULL,
  "kelas_walas" varchar(50) DEFAULT '' NOT NULL,
  "foto_profil" text DEFAULT '',
  "status_akun" varchar(20) DEFAULT 'Aktif' NOT NULL,
  "tahun_ajaran" varchar(20) DEFAULT '2026/2027' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "schedules" (
  "id" serial PRIMARY KEY,
  "kelas" varchar(50) NOT NULL,
  "hari" varchar(20) NOT NULL,
  "jam_ke" integer NOT NULL,
  "waktu_mulai" varchar(10) NOT NULL,
  "waktu_selesai" varchar(10) NOT NULL,
  "mata_pelajaran" varchar(100) NOT NULL,
  "guru" varchar(150) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "students" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nisn" varchar(20) NOT NULL UNIQUE,
  "nis" varchar(20) DEFAULT '242510001' NOT NULL,
  "full_name" varchar(150) NOT NULL,
  "gender" varchar(10) NOT NULL,
  "kelas" varchar(50) DEFAULT 'X RPL 1' NOT NULL,
  "jurusan" varchar(100) DEFAULT 'Rekayasa Perangkat Lunak' NOT NULL,
  "tempat_lahir" varchar(100) DEFAULT 'Depok' NOT NULL,
  "tanggal_lahir" varchar(50) DEFAULT '14 Maret 2008' NOT NULL,
  "agama" varchar(30) DEFAULT 'Islam' NOT NULL,
  "alamat" varchar(255) DEFAULT 'Jl. H. Caraka No. 12, Cisalak, Depok' NOT NULL,
  "telepon" varchar(30) DEFAULT '0812-9876-5432' NOT NULL,
  "nama_wali" varchar(150) DEFAULT 'Bambang Pratama' NOT NULL,
  "telepon_wali" varchar(30) DEFAULT '0813-1122-3344' NOT NULL,
  "email" varchar(150) DEFAULT 'siswa@ghamacaraka.sch.id' NOT NULL,
  "foto_profil" text DEFAULT '',
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "username" varchar(50) NOT NULL UNIQUE,
  "password_hash" varchar(255) NOT NULL,
  "role" varchar(20) DEFAULT 'siswa' NOT NULL,
  "nama_lengkap" varchar(150) DEFAULT '',
  "email" varchar(150) DEFAULT '',
  "foto_profil" text DEFAULT '',
  "student_id" uuid REFERENCES "students"("id") ON DELETE CASCADE,
  "teacher_id" integer,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "class_students" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "class_id" uuid NOT NULL REFERENCES "classes"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "class_students_class_student_idx" ON "class_students" ("class_id", "student_id");

CREATE TABLE IF NOT EXISTS "student_barcodes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "barcode_value" varchar(50),
  "token_hash" varchar(64) NOT NULL UNIQUE,
  "format" varchar(20) DEFAULT 'QR_CODE' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "daily_attendances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "class_id" uuid NOT NULL REFERENCES "classes"("id") ON DELETE CASCADE,
  "attendance_date" date NOT NULL,
  "start_time" timestamp with time zone,
  "end_time" timestamp with time zone,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "daily_attendances_class_date_idx" ON "daily_attendances" ("class_id", "attendance_date");

CREATE TABLE IF NOT EXISTS "daily_attendance_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "daily_attendance_id" uuid NOT NULL REFERENCES "daily_attendances"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "record_code" varchar(50) DEFAULT '',
  "attendance_status" varchar(20) DEFAULT 'present' NOT NULL,
  "attendance_source" varchar(20) DEFAULT 'barcode' NOT NULL,
  "jam_masuk" varchar(20) DEFAULT '06:45',
  "keterangan" varchar(255) DEFAULT 'Tepat waktu',
  "check_in_at" timestamp with time zone DEFAULT now() NOT NULL,
  "request_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "daily_attendance_records_session_student_idx" ON "daily_attendance_records" ("daily_attendance_id", "student_id");

CREATE TABLE IF NOT EXISTS "subject_attendance_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "record_key" varchar(50) NOT NULL,
  "kelas" varchar(50) NOT NULL,
  "mata_pelajaran" varchar(100) NOT NULL,
  "tanggal" varchar(20) NOT NULL,
  "no_urut" integer DEFAULT 1 NOT NULL,
  "nisn" varchar(20) NOT NULL,
  "nama_siswa" varchar(150) NOT NULL,
  "status" varchar(20) DEFAULT 'Hadir' NOT NULL,
  "catatan" varchar(255) DEFAULT '',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "activity_logs" (
  "id" serial PRIMARY KEY,
  "jenis" varchar(30) NOT NULL,
  "judul" varchar(150) NOT NULL,
  "deskripsi" varchar(255) NOT NULL,
  "waktu" varchar(50) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
`;

async function runDdlAndSeed(): Promise<void> {
  if (pgliteClient) {
    await pgliteClient.exec(DDL_SQL);
  } else if (queryClient) {
    await queryClient.unsafe(DDL_SQL);
  }

  // 1. Seed Classes if empty
  const existingClasses = await db.select({ value: count() }).from(schema.classes);
  const classMap = new Map<string, string>();

  if ((existingClasses[0]?.value ?? 0) === 0) {
    for (const k of initialKelas) {
      const [inserted] = await db
        .insert(schema.classes)
        .values({
          class_code_id: k.id,
          name: k.nama_kelas,
          tingkat: k.tingkat,
          jurusan: k.jurusan,
          wali_kelas: k.wali_kelas,
          tahun_ajaran: k.tahun_ajaran || "2026/2027",
        })
        .returning();
      if (inserted) {
        classMap.set(k.nama_kelas, inserted.id);
      }
    }
  } else {
    const allClasses = await db.select().from(schema.classes);
    for (const c of allClasses) {
      classMap.set(c.name, c.id);
    }
  }

  // 2. Seed Teachers if empty
  const existingTeachers = await db.select({ value: count() }).from(schema.teachers);
  if ((existingTeachers[0]?.value ?? 0) === 0) {
    for (const g of initialGuru) {
      await db.insert(schema.teachers).values({
        id: g.id,
        nip: g.nip || "",
        nama_guru: g.nama_guru,
        nama_panggilan: g.id === 5 ? "Bu Rina" : g.nama_guru.split(",")[0] || g.nama_guru,
        mata_pelajaran: g.mata_pelajaran,
        email: g.email || "",
        nomor_telepon: g.nomor_telepon || "",
        jenis_kelamin: g.nama_guru.startsWith("Bu") ? "Perempuan" : "Laki-laki",
        tempat_lahir: "Jakarta",
        tanggal_lahir: "12 Mei 1989",
        alamat: "Depok, Jawa Barat",
        is_walas: Boolean(g.isWalas ?? g.is_walas),
        kelas_walas: g.kelasWalas ?? g.kelas_walas ?? "",
        status_akun: "Aktif",
        tahun_ajaran: "2026/2027",
      });
    }
    if (pgliteClient) {
      await pgliteClient.exec(`SELECT setval('teachers_id_seq', (SELECT COALESCE(MAX(id), 1) FROM teachers));`);
    } else if (queryClient) {
      await queryClient.unsafe(`SELECT setval('teachers_id_seq', (SELECT COALESCE(MAX(id), 1) FROM teachers));`);
    }
  }

  // 3. Seed Schedules if empty
  const existingSchedules = await db.select({ value: count() }).from(schema.schedules);
  if ((existingSchedules[0]?.value ?? 0) === 0) {
    for (const j of initialJadwal) {
      await db.insert(schema.schedules).values({
        id: j.id,
        kelas: j.kelas,
        hari: j.hari,
        jam_ke: j.jam_ke,
        waktu_mulai: j.waktu_mulai,
        waktu_selesai: j.waktu_selesai,
        mata_pelajaran: j.mata_pelajaran,
        guru: j.guru,
      });
    }
    if (pgliteClient) {
      await pgliteClient.exec(`SELECT setval('schedules_id_seq', (SELECT COALESCE(MAX(id), 1) FROM schedules));`);
    } else if (queryClient) {
      await queryClient.unsafe(`SELECT setval('schedules_id_seq', (SELECT COALESCE(MAX(id), 1) FROM schedules));`);
    }
  }

  // 4. Seed Activity Logs if empty
  const existingLogs = await db.select({ value: count() }).from(schema.activity_logs);
  if ((existingLogs[0]?.value ?? 0) === 0) {
    for (const log of initialAktivitasTerbaru) {
      await db.insert(schema.activity_logs).values({
        jenis: log.jenis,
        judul: log.judul,
        deskripsi: log.deskripsi,
        waktu: log.waktu,
      });
    }
  }

  // 5. Seed Students, Barcodes, Class Enrollments, and Users
  const existingUsers = await db.select({ value: count() }).from(schema.users);
  if ((existingUsers[0]?.value ?? 0) === 0) {
    // Admin, Guru, Walas default accounts
    await db.insert(schema.users).values([
      {
        username: "admin",
        role: "admin",
        nama_lengkap: initialAdminProfile.nama_lengkap,
        email: initialAdminProfile.email,
        foto_profil: initialAdminProfile.foto_profil || "",
        password_hash: hashPassword("admin123"),
        is_active: true,
      },
      {
        username: "guru",
        role: "guru",
        nama_lengkap: "Bu Rina Pratiwi, S.Pd.",
        email: "burina@ghamacaraka.sch.id",
        teacher_id: 5,
        password_hash: hashPassword("guru123"),
        is_active: true,
      },
      {
        username: "198905122015012008",
        role: "guru",
        nama_lengkap: "Bu Rina Pratiwi, S.Pd.",
        email: "burina@ghamacaraka.sch.id",
        teacher_id: 5,
        password_hash: hashPassword("guru123"),
        is_active: true,
      },
      {
        username: "walas",
        role: "walas",
        nama_lengkap: "Bu Rina Pratiwi, S.Pd.",
        email: "burina@ghamacaraka.sch.id",
        teacher_id: 5,
        password_hash: hashPassword("walas123"),
        is_active: true,
      },
    ]);

    // Also create user accounts for all teachers by NIP
    for (const g of initialGuru) {
      if (g.nip && g.nip !== "198905122015012008") {
        await db
          .insert(schema.users)
          .values({
            username: g.nip,
            role: "guru",
            nama_lengkap: g.nama_guru,
            email: g.email || "",
            teacher_id: g.id,
            password_hash: hashPassword("guru123"),
            is_active: true,
          })
          .onConflictDoNothing();
      }
    }

    // Seed Main Demo Student (0102641001 - Ahmad Rizky Pratama)
    const [mainStudent] = await db
      .insert(schema.students)
      .values({
        nisn: initialSiswaProfile.nisn,
        nis: initialSiswaProfile.nis,
        full_name: initialSiswaProfile.nama_lengkap,
        gender: "L",
        kelas: initialSiswaProfile.kelas,
        jurusan: initialSiswaProfile.jurusan,
        tempat_lahir: initialSiswaProfile.tempat_lahir,
        tanggal_lahir: initialSiswaProfile.tanggal_lahir,
        agama: initialSiswaProfile.agama,
        alamat: initialSiswaProfile.alamat,
        telepon: initialSiswaProfile.telepon,
        nama_wali: initialSiswaProfile.nama_wali,
        telepon_wali: initialSiswaProfile.telepon_wali,
        email: initialSiswaProfile.email,
        foto_profil: initialSiswaProfile.foto_profil || "",
        status: "active",
      })
      .onConflictDoNothing()
      .returning();

    const xRpl1Id = classMap.get("X RPL 1");
    if (mainStudent) {
      if (xRpl1Id) {
        await db
          .insert(schema.class_students)
          .values({
            class_id: xRpl1Id,
            student_id: mainStudent.id,
            is_active: true,
          })
          .onConflictDoNothing();
      }

      const tokenHash = createHash("sha256").update("ghama_test_scanner_token").digest("hex");
      await db
        .insert(schema.student_barcodes)
        .values({
          student_id: mainStudent.id,
          barcode_value: `GC-${mainStudent.nisn}`,
          token_hash: tokenHash,
          format: "QR_CODE",
          is_active: true,
        })
        .onConflictDoNothing();

      await db
        .insert(schema.users)
        .values([
          {
            username: mainStudent.nisn,
            role: "siswa",
            nama_lengkap: mainStudent.full_name,
            email: mainStudent.email,
            student_id: mainStudent.id,
            password_hash: hashPassword("siswa123"),
            is_active: true,
          },
          {
            username: "siswa",
            role: "siswa",
            nama_lengkap: mainStudent.full_name,
            email: mainStudent.email,
            student_id: mainStudent.id,
            password_hash: hashPassword("siswa123"),
            is_active: true,
          },
        ])
        .onConflictDoNothing();
    }

    // Seed class students & subject attendance sessions
    const todayStr = new Date().toISOString().split("T")[0] || "2026-11-11";
    let xRpl1SessionId: string | null = null;
    if (xRpl1Id) {
      const [session] = await db
        .insert(schema.daily_attendances)
        .values({
          class_id: xRpl1Id,
          attendance_date: todayStr,
          status: "active",
        })
        .onConflictDoNothing()
        .returning();
      if (session) xRpl1SessionId = session.id;
    }

    // Seed Walas daily students (X RPL 1)
    for (const w of initialWalasSiswaList) {
      const [existingSt] = await db
        .select()
        .from(schema.students)
        .where(eq(schema.students.nisn, w.nisn))
        .limit(1);

      let st = existingSt;
      if (!st) {
        const isFemale =
          w.nama_siswa.toLowerCase().includes("aisyah") ||
          w.nama_siswa.toLowerCase().includes("citra") ||
          w.nama_siswa.toLowerCase().includes("eka") ||
          w.nama_siswa.toLowerCase().includes("gita");
        const [insertedSt] = await db
          .insert(schema.students)
          .values({
            nisn: w.nisn,
            nis: w.nis,
            full_name: w.nama_siswa,
            gender: isFemale ? "P" : "L",
            kelas: "X RPL 1",
            jurusan: "Rekayasa Perangkat Lunak",
            status: "active",
          })
          .returning();
        st = insertedSt;
      }

      if (st && xRpl1Id) {
        await db
          .insert(schema.class_students)
          .values({
            class_id: xRpl1Id,
            student_id: st.id,
            is_active: true,
          })
          .onConflictDoNothing();

        await db
          .insert(schema.users)
          .values({
            username: st.nisn,
            role: "siswa",
            nama_lengkap: st.full_name,
            student_id: st.id,
            password_hash: hashPassword("siswa123"),
            is_active: true,
          })
          .onConflictDoNothing();

        const rawTok = randomBytes(24).toString("base64url");
        const tokHash = createHash("sha256").update(rawTok).digest("hex");
        await db
          .insert(schema.student_barcodes)
          .values({
            student_id: st.id,
            barcode_value: `GC-${st.nisn}`,
            token_hash: tokHash,
            format: "QR_CODE",
            is_active: true,
          })
          .onConflictDoNothing();

        if (xRpl1SessionId) {
          const statusMap: Record<string, string> = {
            Hadir: "present",
            Izin: "excused",
            Sakit: "sick",
            Alpa: "absent",
            "Tidak Hadir": "absent",
          };
          await db
            .insert(schema.daily_attendance_records)
            .values({
              daily_attendance_id: xRpl1SessionId,
              student_id: st.id,
              record_code: w.id,
              attendance_status: statusMap[w.status] || "present",
              attendance_source: "manual",
              jam_masuk: w.jam_masuk || "—",
              keterangan: w.keterangan || "Tepat waktu",
            })
            .onConflictDoNothing();
        }
      }
    }

    // Seed remaining classes' students & initial subject attendance records
    for (const [kelasName, list] of Object.entries(initialSiswaPerKelas)) {
      const cId = classMap.get(kelasName) || xRpl1Id;
      for (const item of list) {
        const [existingSt] = await db
          .select()
          .from(schema.students)
          .where(eq(schema.students.nisn, item.nisn))
          .limit(1);

        let st = existingSt;
        if (!st) {
          const isFemale =
            item.nama_siswa.toLowerCase().includes("putri") ||
            item.nama_siswa.toLowerCase().includes("aisyah") ||
            item.nama_siswa.toLowerCase().includes("citra") ||
            item.nama_siswa.toLowerCase().includes("gita") ||
            item.nama_siswa.toLowerCase().includes("cantika") ||
            item.nama_siswa.toLowerCase().includes("fani") ||
            item.nama_siswa.toLowerCase().includes("intan") ||
            item.nama_siswa.toLowerCase().includes("bella") ||
            item.nama_siswa.toLowerCase().includes("farah") ||
            item.nama_siswa.toLowerCase().includes("hesti") ||
            item.nama_siswa.toLowerCase().includes("jihan");

          const [insertedSt] = await db
            .insert(schema.students)
            .values({
              nisn: item.nisn,
              nis: `2425${item.nisn.slice(-5)}`,
              full_name: item.nama_siswa,
              gender: isFemale ? "P" : "L",
              kelas: kelasName,
              jurusan: "Rekayasa Perangkat Lunak",
              status: "active",
            })
            .returning();
          st = insertedSt;
        }

        if (st && cId) {
          await db
            .insert(schema.class_students)
            .values({
              class_id: cId,
              student_id: st.id,
              is_active: true,
            })
            .onConflictDoNothing();

          await db
            .insert(schema.users)
            .values({
              username: st.nisn,
              role: "siswa",
              nama_lengkap: st.full_name,
              student_id: st.id,
              password_hash: hashPassword("siswa123"),
              is_active: true,
            })
            .onConflictDoNothing();
        }

        // Seed default subject attendance session (2026-06-06, Pemrograman Web)
        await db.insert(schema.subject_attendance_records).values({
          record_key: item.id,
          kelas: kelasName,
          mata_pelajaran: "Pemrograman Web",
          tanggal: "2026-06-06",
          no_urut: item.no,
          nisn: item.nisn,
          nama_siswa: item.nama_siswa,
          status: item.status,
          catatan: item.catatan || "",
        });
      }
    }
  }
}

export async function ensureDatabaseInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = runDdlAndSeed().catch((err) => {
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
