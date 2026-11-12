import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * 1. Classes Table (Master Kelas)
 */
export const classes = pgTable("classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  class_code_id: integer("class_code_id"),
  name: varchar("name", { length: 50 }).notNull().unique(),
  tingkat: varchar("tingkat", { length: 10 }).default("X").notNull(),
  jurusan: varchar("jurusan", { length: 50 }).default("RPL").notNull(),
  wali_kelas: varchar("wali_kelas", { length: 150 }).default("").notNull(),
  tahun_ajaran: varchar("tahun_ajaran", { length: 20 }).default("2026/2027").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * 2. Teachers Table (Master Guru & Wali Kelas)
 */
export const teachers = pgTable("teachers", {
  id: serial("id").primaryKey(),
  nip: varchar("nip", { length: 30 }).default(""),
  nama_guru: varchar("nama_guru", { length: 150 }).notNull(),
  nama_panggilan: varchar("nama_panggilan", { length: 50 }).default(""),
  mata_pelajaran: varchar("mata_pelajaran", { length: 100 }).notNull(),
  email: varchar("email", { length: 150 }).default(""),
  nomor_telepon: varchar("nomor_telepon", { length: 30 }).default(""),
  jenis_kelamin: varchar("jenis_kelamin", { length: 20 }).default("Perempuan").notNull(),
  tempat_lahir: varchar("tempat_lahir", { length: 100 }).default("Jakarta").notNull(),
  tanggal_lahir: varchar("tanggal_lahir", { length: 50 }).default("12 Mei 1989").notNull(),
  alamat: varchar("alamat", { length: 255 }).default("Depok, Jawa Barat").notNull(),
  is_walas: boolean("is_walas").default(false).notNull(),
  kelas_walas: varchar("kelas_walas", { length: 50 }).default("").notNull(),
  foto_profil: text("foto_profil").default(""),
  status_akun: varchar("status_akun", { length: 20 }).default("Aktif").notNull(),
  tahun_ajaran: varchar("tahun_ajaran", { length: 20 }).default("2026/2027").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * 3. Schedules Table (Jadwal Pelajaran)
 */
export const schedules = pgTable("schedules", {
  id: serial("id").primaryKey(),
  kelas: varchar("kelas", { length: 50 }).notNull(),
  hari: varchar("hari", { length: 20 }).notNull(),
  jam_ke: integer("jam_ke").notNull(),
  waktu_mulai: varchar("waktu_mulai", { length: 10 }).notNull(),
  waktu_selesai: varchar("waktu_selesai", { length: 10 }).notNull(),
  mata_pelajaran: varchar("mata_pelajaran", { length: 100 }).notNull(),
  guru: varchar("guru", { length: 150 }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * 4. Students Table (Master Siswa)
 */
export const students = pgTable("students", {
  id: uuid("id").primaryKey().defaultRandom(),
  nisn: varchar("nisn", { length: 20 }).notNull().unique(),
  nis: varchar("nis", { length: 20 }).default("242510001").notNull(),
  full_name: varchar("full_name", { length: 150 }).notNull(),
  gender: varchar("gender", { length: 10 }).notNull(), // 'L' / 'P'
  kelas: varchar("kelas", { length: 50 }).default("X RPL 1").notNull(),
  jurusan: varchar("jurusan", { length: 100 }).default("Rekayasa Perangkat Lunak").notNull(),
  tempat_lahir: varchar("tempat_lahir", { length: 100 }).default("Depok").notNull(),
  tanggal_lahir: varchar("tanggal_lahir", { length: 50 }).default("14 Maret 2008").notNull(),
  agama: varchar("agama", { length: 30 }).default("Islam").notNull(),
  alamat: varchar("alamat", { length: 255 }).default("Jl. H. Caraka No. 12, Cisalak, Depok").notNull(),
  telepon: varchar("telepon", { length: 30 }).default("0812-9876-5432").notNull(),
  nama_wali: varchar("nama_wali", { length: 150 }).default("Bambang Pratama").notNull(),
  telepon_wali: varchar("telepon_wali", { length: 30 }).default("0813-1122-3344").notNull(),
  email: varchar("email", { length: 150 }).default("siswa@ghamacaraka.sch.id").notNull(),
  foto_profil: text("foto_profil").default(""),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * 5. Users Table
 * Used for role-based authentication (admin, walas, guru, siswa).
 * For students, username is their NISN. For teachers, username can be NIP or username.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  password_hash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 20 }).default("siswa").notNull(),
  nama_lengkap: varchar("nama_lengkap", { length: 150 }).default(""),
  email: varchar("email", { length: 150 }).default(""),
  foto_profil: text("foto_profil").default(""),
  student_id: uuid("student_id").references(() => students.id, { onDelete: "cascade" }),
  teacher_id: integer("teacher_id"),
  is_active: boolean("is_active").default(true).notNull(),
  /** True selama akun masih memakai password default (wajib diganti setelah login pertama). */
  must_change_password: boolean("must_change_password").default(false).notNull(),
  /** Waktu terakhir pengguna mengganti password secara mandiri. */
  password_changed_at: timestamp("password_changed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * 5b. Auth Sessions Table
 * Satu baris = satu sesi login (per perangkat/browser).
 * Refresh token disimpan sebagai hash SHA-256 (tidak pernah plaintext) dan dirotasi setiap refresh.
 * `expires_at` adalah batas absolut sesi (24 jam, atau 7 hari bila Remember Me).
 */
export const auth_sessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    refresh_token_hash: varchar("refresh_token_hash", { length: 64 }).notNull().unique(),
    previous_refresh_token_hash: varchar("previous_refresh_token_hash", { length: 64 }),
    remember_me: boolean("remember_me").default(false).notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    rotated_at: timestamp("rotated_at", { withTimezone: true }),
    last_used_at: timestamp("last_used_at", { withTimezone: true }).defaultNow().notNull(),
    revoked_at: timestamp("revoked_at", { withTimezone: true }),
    revoked_reason: varchar("revoked_reason", { length: 50 }),
    user_agent: varchar("user_agent", { length: 255 }).default(""),
    ip_address: varchar("ip_address", { length: 64 }).default(""),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("auth_sessions_user_idx").on(t.user_id),
    index("auth_sessions_prev_hash_idx").on(t.previous_refresh_token_hash),
  ]
);

/**
 * 6. Class Students Relation Table
 */
export const class_students = pgTable(
  "class_students",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    class_id: uuid("class_id")
      .references(() => classes.id, { onDelete: "cascade" })
      .notNull(),
    student_id: uuid("student_id")
      .references(() => students.id, { onDelete: "cascade" })
      .notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("class_students_class_student_idx").on(t.class_id, t.student_id)]
);

/**
 * 7. Student Barcodes / QR Tokens Table
 * Stores SHA-256 hash of the cryptographically random token.
 */
export const student_barcodes = pgTable("student_barcodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  student_id: uuid("student_id")
    .references(() => students.id, { onDelete: "cascade" })
    .notNull(),
  barcode_value: varchar("barcode_value", { length: 50 }),
  token_hash: varchar("token_hash", { length: 64 }).notNull().unique(),
  format: varchar("format", { length: 20 }).default("QR_CODE").notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * 8. Daily Attendance Sessions Table
 */
export const daily_attendances = pgTable(
  "daily_attendances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    class_id: uuid("class_id")
      .references(() => classes.id, { onDelete: "cascade" })
      .notNull(),
    attendance_date: date("attendance_date").notNull(),
    start_time: timestamp("start_time", { withTimezone: true }),
    end_time: timestamp("end_time", { withTimezone: true }),
    status: varchar("status", { length: 20 }).default("active").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("daily_attendances_class_date_idx").on(t.class_id, t.attendance_date)]
);

/**
 * 9. Daily Attendance Records Table
 * Records individual student attendance.
 * Unique constraint on (daily_attendance_id, student_id) prevents duplicate attendance.
 */
export const daily_attendance_records = pgTable(
  "daily_attendance_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    daily_attendance_id: uuid("daily_attendance_id")
      .references(() => daily_attendances.id, { onDelete: "cascade" })
      .notNull(),
    student_id: uuid("student_id")
      .references(() => students.id, { onDelete: "cascade" })
      .notNull(),
    record_code: varchar("record_code", { length: 50 }).default(""),
    attendance_status: varchar("attendance_status", { length: 20 }).default("present").notNull(),
    attendance_source: varchar("attendance_source", { length: 20 }).default("barcode").notNull(),
    jam_masuk: varchar("jam_masuk", { length: 20 }).default("06:45"),
    keterangan: varchar("keterangan", { length: 255 }).default("Tepat waktu"),
    check_in_at: timestamp("check_in_at", { withTimezone: true }).defaultNow().notNull(),
    request_id: uuid("request_id"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("daily_attendance_records_session_student_idx").on(
      t.daily_attendance_id,
      t.student_id
    ),
  ]
);

/**
 * 10. Subject Attendance Records Table (Absensi Mata Pelajaran Guru)
 */
export const subject_attendance_records = pgTable("subject_attendance_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  record_key: varchar("record_key", { length: 50 }).notNull(),
  kelas: varchar("kelas", { length: 50 }).notNull(),
  mata_pelajaran: varchar("mata_pelajaran", { length: 100 }).notNull(),
  tanggal: varchar("tanggal", { length: 20 }).notNull(),
  no_urut: integer("no_urut").default(1).notNull(),
  nisn: varchar("nisn", { length: 20 }).notNull(),
  nama_siswa: varchar("nama_siswa", { length: 150 }).notNull(),
  status: varchar("status", { length: 20 }).default("Hadir").notNull(),
  catatan: varchar("catatan", { length: 255 }).default(""),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * 11. Activity Logs Table (Aktivitas Terbaru Sekolah)
 */
export const activity_logs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  jenis: varchar("jenis", { length: 30 }).notNull(),
  judul: varchar("judul", { length: 150 }).notNull(),
  deskripsi: varchar("deskripsi", { length: 255 }).notNull(),
  waktu: varchar("waktu", { length: 50 }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
