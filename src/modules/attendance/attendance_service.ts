import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../config/database";
import {
  classes,
  class_students,
  daily_attendance_records,
  daily_attendances,
  student_barcodes,
  students,
} from "../../config/schema";

export type scan_attendance_result =
  | {
      status: "success";
      data: {
        student_name: string;
        nisn: string;
        class_name: string;
        attendance_status: string;
        check_in_at: string;
      };
    }
  | {
      status: "invalid_barcode";
      message: string;
    }
  | {
      status: "duplicate";
      message: string;
    }
  | {
      status: "invalid_session";
      message: string;
    }
  | {
      status: "invalid_student";
      message: string;
    };

/**
 * Hash raw barcode/QR token using SHA-256
 */
export function hash_barcode_token(raw_token: string): string {
  return createHash("sha256").update(raw_token.trim()).digest("hex");
}

/**
 * Get current date in Asia/Jakarta timezone formatted as YYYY-MM-DD
 */
export function get_jakarta_date_string(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Process a daily attendance scan by barcode token
 */
export async function process_barcode_attendance(
  barcode_token: string,
  request_id?: string
): Promise<scan_attendance_result> {
  const cleanToken = String(barcode_token || "").trim();
  if (!cleanToken) {
    return {
      status: "invalid_barcode",
      message: "Barcode tidak valid",
    };
  }

  // 1. Hash barcode token using SHA-256
  const token_hash = hash_barcode_token(cleanToken);

  // 2. Find active barcode by:
  //    a) token_hash (Token QR Code aman kriptografis)
  //    b) barcode_value (Kode 1D Barcode fisik kartu pelajar, misal: "GC-9999999901")
  //    c) NISN siswa langsung (misal: "9999999901")
  let active_barcode = (
    await db
      .select()
      .from(student_barcodes)
      .where(
        and(
          eq(student_barcodes.token_hash, token_hash),
          eq(student_barcodes.is_active, true)
        )
      )
      .limit(1)
  )[0];

  if (!active_barcode) {
    // Cari berdasarkan barcode_value (misal "GC-9999999901")
    const byVal = await db
      .select()
      .from(student_barcodes)
      .where(
        and(
          eq(student_barcodes.barcode_value, cleanToken),
          eq(student_barcodes.is_active, true)
        )
      )
      .limit(1);

    if (byVal.length > 0) {
      active_barcode = byVal[0];
    } else {
      // Cari berdasarkan NISN siswa langsung
      const [byNisn] = await db
        .select()
        .from(students)
        .where(eq(students.nisn, cleanToken))
        .limit(1);

      if (byNisn) {
        const [bc] = await db
          .select()
          .from(student_barcodes)
          .where(
            and(
              eq(student_barcodes.student_id, byNisn.id),
              eq(student_barcodes.is_active, true)
            )
          )
          .limit(1);
        if (bc) active_barcode = bc;
      }
    }
  }

  if (!active_barcode) {
    return {
      status: "invalid_barcode",
      message: "Barcode tidak valid",
    };
  }

  // 3. Ensure student exists and is active
  const student_rows = await db
    .select()
    .from(students)
    .where(eq(students.id, active_barcode.student_id))
    .limit(1);

  const active_student = student_rows[0];
  if (!active_student || active_student.status !== "active") {
    return {
      status: "invalid_student",
      message: "Siswa tidak aktif atau tidak ditemukan",
    };
  }

  // 4. Ensure student is assigned to an active class
  const class_rows = await db
    .select({
      class_id: classes.id,
      class_name: classes.name,
    })
    .from(class_students)
    .innerJoin(classes, eq(class_students.class_id, classes.id))
    .where(
      and(
        eq(class_students.student_id, active_student.id),
        eq(class_students.is_active, true)
      )
    )
    .limit(1);

  const student_class = class_rows[0];
  if (!student_class) {
    return {
      status: "invalid_student",
      message: "Siswa tidak terdaftar di kelas manapun",
    };
  }

  // 5. Ensure an active daily attendance session exists for the class today (Asia/Jakarta)
  const today_jakarta = get_jakarta_date_string();
  const session_rows = await db
    .select()
    .from(daily_attendances)
    .where(
      and(
        eq(daily_attendances.class_id, student_class.class_id),
        eq(daily_attendances.attendance_date, today_jakarta),
        eq(daily_attendances.status, "active")
      )
    )
    .limit(1);

  const active_session = session_rows[0];
  if (!active_session) {
    return {
      status: "invalid_session",
      message: "Sesi absensi tidak aktif atau belum dibuka",
    };
  }

  // 6. Validate attendance time window (if start_time / end_time are specified)
  const now = new Date();
  if (active_session.start_time && now < active_session.start_time) {
    return {
      status: "invalid_session",
      message: "Sesi absensi belum dimulai",
    };
  }
  if (active_session.end_time && now > active_session.end_time) {
    return {
      status: "invalid_session",
      message: "Sesi absensi sudah berakhir",
    };
  }

  // 7. Check if student has already recorded attendance in this session
  const existing_record_rows = await db
    .select()
    .from(daily_attendance_records)
    .where(
      and(
        eq(daily_attendance_records.daily_attendance_id, active_session.id),
        eq(daily_attendance_records.student_id, active_student.id)
      )
    )
    .limit(1);

  if (existing_record_rows.length > 0) {
    return {
      status: "duplicate",
      message: "Siswa sudah melakukan absensi",
    };
  }

  // 8. Insert attendance record (protected by DB unique constraint against concurrent duplicate requests)
  try {
    const inserted_records = await db
      .insert(daily_attendance_records)
      .values({
        daily_attendance_id: active_session.id,
        student_id: active_student.id,
        attendance_status: "present",
        attendance_source: "barcode",
        check_in_at: now,
        request_id: request_id || undefined,
      })
      .returning();

    const created_record = inserted_records[0];

    return {
      status: "success",
      data: {
        student_name: active_student.full_name,
        nisn: active_student.nisn,
        class_name: student_class.class_name,
        attendance_status: created_record?.attendance_status || "present",
        check_in_at: (created_record?.check_in_at || now).toISOString(),
      },
    };
  } catch (error: any) {
    // Catch database unique constraint violation (code 23505)
    if (error?.code === "23505") {
      return {
        status: "duplicate",
        message: "Siswa sudah melakukan absensi",
      };
    }
    throw error;
  }
}

