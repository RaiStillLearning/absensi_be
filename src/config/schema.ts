import { boolean, date, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

/**
 * Classes Table
 */
export const classes = pgTable("classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Students Table
 */
export const students = pgTable("students", {
  id: uuid("id").primaryKey().defaultRandom(),
  nisn: varchar("nisn", { length: 20 }).notNull().unique(),
  full_name: varchar("full_name", { length: 150 }).notNull(),
  gender: varchar("gender", { length: 10 }).notNull(), // 'L' / 'P'
  status: varchar("status", { length: 20 }).default("active").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Class Students Relation Table
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
  (t) => [
    uniqueIndex("class_students_class_student_idx").on(t.class_id, t.student_id),
  ]
);

/**
 * Student Barcodes / QR Tokens Table
 * Stores SHA-256 hash of the cryptographically random token.
 */
export const student_barcodes = pgTable("student_barcodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  student_id: uuid("student_id")
    .references(() => students.id, { onDelete: "cascade" })
    .notNull(),
  token_hash: varchar("token_hash", { length: 64 }).notNull().unique(),
  format: varchar("format", { length: 20 }).default("QR_CODE").notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Daily Attendance Sessions Table
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
  (t) => [
    uniqueIndex("daily_attendances_class_date_idx").on(t.class_id, t.attendance_date),
  ]
);

/**
 * Daily Attendance Records Table
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
    attendance_status: varchar("attendance_status", { length: 20 }).default("present").notNull(),
    attendance_source: varchar("attendance_source", { length: 20 }).default("barcode").notNull(),
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
