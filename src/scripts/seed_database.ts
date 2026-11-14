import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { closeDatabaseConnection, db, ensureDatabaseInitialized } from "../config/database";
import { env } from "../config/env";
import {
  classes,
  class_students,
  daily_attendance_records,
  daily_attendances,
  student_barcodes,
  students,
  users,
} from "../config/schema";
import { hashPassword } from "../shared/utils/hash";
import { initialSiswaPerKelas, initialSiswaProfile } from "../shared/data/initial_data";
import { importStudentsFromCsv } from "./import_students_csv";

export async function seedAll() {
  console.log("🌱 Memulai seeding data PostgreSQL...");
  await ensureDatabaseInitialized();

  // 1. Seed Users (Admin, Walas, Guru, Siswa Demo)
  const defaultAccounts = [
    { username: "admin", role: "admin", pass: "admin123" },
    { username: "walas", role: "walas", pass: "walas123" },
    { username: "guru", role: "guru", pass: "guru123" },
    { username: "siswa", role: "siswa", pass: env.STUDENT_DEFAULT_PASSWORD || "gc123" },
  ];

  for (const acc of defaultAccounts) {
    const existing = await db.select().from(users).where(eq(users.username, acc.username)).limit(1);
    if (existing.length === 0) {
      await db.insert(users).values({
        username: acc.username,
        role: acc.role,
        password_hash: hashPassword(acc.pass),
        is_active: true,
      });
      console.log(`[+] User created: ${acc.username} (${acc.role})`);
    } else {
      console.log(`[=] User exists: ${acc.username}`);
    }
  }

  // 2. Seed Classes
  const classNames = [
    "X RPL 1",
    "X RPL 2",
    "XI RPL 1",
    "XI RPL 2",
    "XII RPL 1",
    "X TKJ 1",
    "XI TKJ 1",
    "XII TKJ 1",
    "X AKL 1",
    "XI AKL 1",
    "XII AKL 1",
  ];

  const classMap = new Map<string, string>(); // name -> id

  for (const name of classNames) {
    const existing = await db.select().from(classes).where(eq(classes.name, name)).limit(1);
    let classId = existing[0]?.id;
    if (!classId) {
      const [inserted] = await db.insert(classes).values({ name }).returning();
      if (inserted) {
        classId = inserted.id;
        console.log(`[+] Class created: ${name}`);
      }
    }
    if (classId) {
      classMap.set(name, classId);
    }
  }

  // 3. Seed Students & Barcodes
  const csvPath = join(process.cwd(), "data", "students.csv");
  if (existsSync(csvPath)) {
    console.log("📄 Menemukan data/students.csv — mengimpor data siswa riil dari CSV...");
    await importStudentsFromCsv(csvPath);
    console.log("✅ Data siswa riil dari CSV berhasil di-import.");
    return;
  }

  // Fallback: Add main profile student
  const allStudents = [
    {
      nisn: initialSiswaProfile.nisn,
      nama: initialSiswaProfile.nama_lengkap,
      kelas: initialSiswaProfile.kelas,
      gender: "L",
      statusHadir: "Hadir",
    },
  ];

  // Add students from each class
  for (const [kelasName, list] of Object.entries(initialSiswaPerKelas)) {
    for (const item of list) {
      if (!allStudents.some((s) => s.nisn === item.nisn)) {
        allStudents.push({
          nisn: item.nisn,
          nama: item.nama_siswa,
          kelas: kelasName,
          gender: item.nama_siswa.toLowerCase().includes("putri") ||
                  item.nama_siswa.toLowerCase().includes("aisyah") ||
                  item.nama_siswa.toLowerCase().includes("citra") ||
                  item.nama_siswa.toLowerCase().includes("gita") ||
                  item.nama_siswa.toLowerCase().includes("cantika") ||
                  item.nama_siswa.toLowerCase().includes("fani") ||
                  item.nama_siswa.toLowerCase().includes("intan") ||
                  item.nama_siswa.toLowerCase().includes("bella") ||
                  item.nama_siswa.toLowerCase().includes("farah") ||
                  item.nama_siswa.toLowerCase().includes("hesti") ||
                  item.nama_siswa.toLowerCase().includes("jihan") ? "P" : "L",
          statusHadir: item.status,
        });
      }
    }
  }

  // Create attendance session for today for X RPL 1
  const todayStr = new Date().toISOString().split("T")[0] || "2026-11-10";
  const xRpl1Id = classMap.get("X RPL 1");

  let activeSessionId: string | null = null;
  if (xRpl1Id) {
    const sessionRes = await db
      .select()
      .from(daily_attendances)
      .where(eq(daily_attendances.class_id, xRpl1Id))
      .limit(1);

    let session = sessionRes[0];

    if (!session) {
      const [newSession] = await db
        .insert(daily_attendances)
        .values({
          class_id: xRpl1Id,
          attendance_date: todayStr,
          status: "active",
        })
        .returning();
      session = newSession;
      console.log(`[+] Daily Attendance session created for X RPL 1: ${todayStr}`);
    }
    if (session) {
      activeSessionId = session.id;
    }
  }

  for (const s of allStudents) {
    const studentRes = await db.select().from(students).where(eq(students.nisn, s.nisn)).limit(1);
    let student = studentRes[0];
    if (!student) {
      const [inserted] = await db
        .insert(students)
        .values({
          nisn: s.nisn,
          full_name: s.nama,
          gender: s.gender,
          status: "active",
        })
        .returning();
      student = inserted;
      console.log(`[+] Student created: ${s.nama} (${s.nisn})`);
    }

    if (!student) continue;

    // Link class
    const classId = classMap.get(s.kelas) || xRpl1Id;
    if (classId) {
      const [existingLink] = await db
        .select()
        .from(class_students)
        .where(eq(class_students.student_id, student.id))
        .limit(1);
      if (!existingLink) {
        await db.insert(class_students).values({
          class_id: classId,
          student_id: student.id,
          is_active: true,
        });
      }
    }

    // User account for student
    const [existingUser] = await db.select().from(users).where(eq(users.username, s.nisn)).limit(1);
    if (!existingUser) {
      await db.insert(users).values({
        username: s.nisn,
        role: "siswa",
        student_id: student.id,
        password_hash: hashPassword(env.STUDENT_DEFAULT_PASSWORD || "gc123"),
        must_change_password: true,
        is_active: true,
      });
    }

    // Barcode token
    const [existingBarcode] = await db
      .select()
      .from(student_barcodes)
      .where(eq(student_barcodes.student_id, student.id))
      .limit(1);

    if (!existingBarcode) {
      const rawToken = s.nisn === initialSiswaProfile.nisn ? "ghama_test_scanner_token" : randomBytes(24).toString("base64url");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      await db.insert(student_barcodes).values({
        student_id: student.id,
        token_hash: tokenHash,
        barcode_value: `GC-${s.nisn}`,
        format: "QR_CODE",
        is_active: true,
      });
    }

    // Daily attendance record
    if (activeSessionId && s.kelas === "X RPL 1") {
      const [existingRecord] = await db
        .select()
        .from(daily_attendance_records)
        .where(eq(daily_attendance_records.student_id, student.id))
        .limit(1);

      if (!existingRecord) {
        const statusMap: Record<string, string> = {
          Hadir: "present",
          Izin: "excused",
          Sakit: "sick",
          Alpa: "absent",
        };
        await db.insert(daily_attendance_records).values({
          daily_attendance_id: activeSessionId,
          student_id: student.id,
          attendance_status: statusMap[s.statusHadir] || "present",
          attendance_source: "manual",
        });
      }
    }
  }

  // 4. Seed Historical Attendance Sessions & Records for realistic attendance calculations
  if (xRpl1Id) {
    console.log("📅 Menghasilkan sesi riwayat absensi lampau...");
    const studentList = await db
      .select({ id: students.id })
      .from(students)
      .innerJoin(class_students, eq(class_students.student_id, students.id))
      .where(eq(class_students.class_id, xRpl1Id));

    const now = new Date();
    // Generate 25 past school days
    for (let dayOffset = 1; dayOffset <= 30; dayOffset++) {
      const d = new Date(now);
      d.setDate(d.getDate() - dayOffset);
      const dayOfWeek = d.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip Saturday and Sunday

      const dateStr = d.toISOString().split("T")[0];
      if (!dateStr) continue;

      // Check if session for this specific date exists
      const existingDateSession = await db
        .select()
        .from(daily_attendances)
        .where(eq(daily_attendances.attendance_date, dateStr))
        .limit(1);

      let targetSessionId = existingDateSession[0]?.id;
      if (!targetSessionId) {
        const [created] = await db
          .insert(daily_attendances)
          .values({
            class_id: xRpl1Id,
            attendance_date: dateStr,
            status: "completed",
          })
          .returning();
        if (created) {
          targetSessionId = created.id;
        }
      }

      if (!targetSessionId) continue;

      // Populate records for all students in this class for that date
      for (const st of studentList) {
        const [hasRec] = await db
          .select()
          .from(daily_attendance_records)
          .where(
            eq(daily_attendance_records.daily_attendance_id, targetSessionId)
          )
          .limit(1);

        if (!hasRec) {
          // pseudo-random status based on hash
          const hashVal = (dayOffset * 7 + st.id.charCodeAt(0)) % 100;
          let attStatus = "present";
          if (hashVal > 95) attStatus = "absent";
          else if (hashVal > 90) attStatus = "sick";
          else if (hashVal > 85) attStatus = "excused";

          await db.insert(daily_attendance_records).values({
            daily_attendance_id: targetSessionId,
            student_id: st.id,
            attendance_status: attStatus,
            attendance_source: "manual",
          });
        }
      }
    }
  }

  console.log("✅ Seeding database selesai!");
}

seedAll()
  .then(async () => {
    console.log("Seeding process finished.");
    await closeDatabaseConnection();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error("Seeding failed:", e);
    await closeDatabaseConnection();
    process.exit(1);
  });
