import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { closeDatabaseConnection, db } from "../config/database";
import {
  classes,
  class_students,
  daily_attendances,
  student_barcodes,
  students,
} from "../config/schema";
import { get_jakarta_date_string } from "../modules/attendance/attendance_service";

const TOKEN_CACHE_FILE = join(process.cwd(), ".dev_scanner_dummy_token.json");

interface cached_token_data {
  nisn: string;
  token: string;
  token_hash: string;
  created_at: string;
}

export async function seed_dummy_student() {
  console.log("🌱 Running dummy student seed for HC-P20 scanner test...\n");

  const DUMMY_NISN = "9999999901";
  const DUMMY_NAME = "TEST SISWA BARCODE";
  const DUMMY_CLASS_NAME = "X PPLG 1";
  const DUMMY_GENDER = "L";

  // 1. Ensure Class exists
  let target_class = (
    await db.select().from(classes).where(eq(classes.name, DUMMY_CLASS_NAME)).limit(1)
  )[0];

  if (!target_class) {
    const inserted = await db
      .insert(classes)
      .values({ name: DUMMY_CLASS_NAME })
      .returning();
    const created = inserted[0];
    if (!created) throw new Error("Failed to create class");
    target_class = created;
    console.log(`[+] Class created: ${target_class.name}`);
  } else {
    console.log(`[=] Class already exists: ${target_class.name}`);
  }

  // 2. Ensure Dummy Student exists
  let target_student = (
    await db.select().from(students).where(eq(students.nisn, DUMMY_NISN)).limit(1)
  )[0];

  if (!target_student) {
    const inserted = await db
      .insert(students)
      .values({
        nisn: DUMMY_NISN,
        full_name: DUMMY_NAME,
        gender: DUMMY_GENDER,
        status: "active",
      })
      .returning();
    const created = inserted[0];
    if (!created) throw new Error("Failed to create dummy student");
    target_student = created;
    console.log(`[+] Student created: ${target_student.full_name} (${target_student.nisn})`);
  } else {
    console.log(`[=] Student already exists: ${target_student.full_name} (${target_student.nisn})`);
  }

  // Non-null assertions after guard
  const active_class = target_class;
  const active_student_record = target_student;

  // 3. Ensure Student-Class Enrollment exists
  const existing_enrollment = (
    await db
      .select()
      .from(class_students)
      .where(
        and(
          eq(class_students.class_id, active_class.id),
          eq(class_students.student_id, active_student_record.id)
        )
      )
      .limit(1)
  )[0];

  if (!existing_enrollment) {
    await db.insert(class_students).values({
      class_id: active_class.id,
      student_id: active_student_record.id,
      is_active: true,
    });
    console.log(`[+] Student enrolled in class: ${active_class.name}`);
  } else {
    console.log(`[=] Student enrollment already verified in: ${active_class.name}`);
  }

  // 4. Ensure Active Daily Attendance Session for Today (Asia/Jakarta)
  const today_jakarta = get_jakarta_date_string();
  const existing_session = (
    await db
      .select()
      .from(daily_attendances)
      .where(
        and(
          eq(daily_attendances.class_id, active_class.id),
          eq(daily_attendances.attendance_date, today_jakarta)
        )
      )
      .limit(1)
  )[0];

  if (!existing_session) {
    // Covers the full test day (00:00:00 to 23:59:59 WIB)
    const session_start = new Date(`${today_jakarta}T00:00:00+07:00`);
    const session_end = new Date(`${today_jakarta}T23:59:59+07:00`);

    await db.insert(daily_attendances).values({
      class_id: active_class.id,
      attendance_date: today_jakarta,
      start_time: session_start,
      end_time: session_end,
      status: "active",
    });
    console.log(`[+] Active daily attendance session created for: ${today_jakarta}`);
  } else {
    // If exists, make sure status is active
    if (existing_session.status !== "active") {
      await db
        .update(daily_attendances)
        .set({ status: "active" })
        .where(eq(daily_attendances.id, existing_session.id));
      console.log(`[+] Daily attendance session re-activated for: ${today_jakarta}`);
    } else {
      console.log(`[=] Active daily attendance session exists for: ${today_jakarta}`);
    }
  }

  // 5. Manage Barcode Token
  // Check if we have a cached token that matches an active DB hash
  let active_token: string | null = null;
  let active_token_hash: string | null = null;

  const existing_barcodes = await db
    .select()
    .from(student_barcodes)
    .where(
      and(
        eq(student_barcodes.student_id, active_student_record.id),
        eq(student_barcodes.is_active, true)
      )
    );

  if (existsSync(TOKEN_CACHE_FILE)) {
    try {
      const cached = JSON.parse(readFileSync(TOKEN_CACHE_FILE, "utf-8")) as cached_token_data;
      if (
        cached.nisn === DUMMY_NISN &&
        existing_barcodes.some((b) => b.token_hash === cached.token_hash)
      ) {
        active_token = cached.token;
        active_token_hash = cached.token_hash;
      }
    } catch {
      // Ignore cache read error
    }
  }

  // If no matching active token found, generate a fresh cryptographically random token
  if (!active_token || !active_token_hash) {
    // Deactivate previous barcodes for this student to guarantee strictly ONE active barcode
    await db
      .update(student_barcodes)
      .set({ is_active: false })
      .where(eq(student_barcodes.student_id, active_student_record.id));

    // Generate cryptographically secure random token (NOT containing NISN)
    const random_hex = randomBytes(16).toString("hex");
    active_token = `ghama_scan_${random_hex}`;
    active_token_hash = createHash("sha256").update(active_token).digest("hex");

    await db.insert(student_barcodes).values({
      student_id: active_student_record.id,
      token_hash: active_token_hash,
      format: "QR_CODE",
      is_active: true,
    });

    // Cache locally for development reference
    const cache_payload: cached_token_data = {
      nisn: DUMMY_NISN,
      token: active_token,
      token_hash: active_token_hash,
      created_at: new Date().toISOString(),
    };
    writeFileSync(TOKEN_CACHE_FILE, JSON.stringify(cache_payload, null, 2), "utf-8");
    console.log(`[+] New cryptographically secure barcode generated & hashed.`);
  } else {
    console.log(`[=] Existing active barcode token re-verified.`);
  }

  // 6. Format required output
  console.log("\n-------------------------------------------");
  console.log("STUDENT CREATED:");
  console.log(`NISN: ${DUMMY_NISN}`);
  console.log(`NAME: ${DUMMY_NAME}`);
  console.log(`CLASS: ${DUMMY_CLASS_NAME}`);
  console.log("");
  console.log("BARCODE TOKEN:");
  console.log(active_token);
  console.log("");
  console.log("BARCODE FORMAT:");
  console.log("QR_CODE");
  console.log("");
  console.log("IMPORTANT:");
  console.log("Save this token for barcode generation.");
  console.log("-------------------------------------------\n");

  return {
    student_id: active_student_record.id,
    nisn: DUMMY_NISN,
    name: DUMMY_NAME,
    class_name: DUMMY_CLASS_NAME,
    token: active_token,
    token_hash: active_token_hash,
  };
}

// Execute when run directly
const isDirectRun = Boolean(
  (typeof import.meta !== "undefined" && (import.meta as { main?: boolean }).main) ||
    process.argv[1]?.includes("seed_dummy_student")
);

if (isDirectRun) {
  seed_dummy_student()
    .then(async () => {
      await closeDatabaseConnection();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("❌ Seed failed:", err);
      await closeDatabaseConnection();
      process.exit(1);
    });
}
