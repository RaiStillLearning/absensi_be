import { eq, inArray, ne, notInArray } from "drizzle-orm";
import { closeDatabaseConnection, db, ensureDatabaseInitialized } from "../config/database";
import {
  activity_logs,
  auth_sessions,
  classes,
  class_students,
  daily_attendance_records,
  daily_attendances,
  promotion_scheduler_runs,
  schedules,
  student_barcodes,
  student_promotion_logs,
  students,
  subject_attendance_records,
  teachers,
  users,
} from "../config/schema";

// 21 Real NISNs from SMK Ghama Caraka Kelas 11
const REAL_NISNS = [
  "0097061219", // Abdul Hafizh Rijki Tsaqafi
  "3099505781", // Affan Akbar Al Rauf
  "0096147878", // Aisya Aqilatu Tsabita
  "0083237382", // Alfian Fadillah
  "0088181016", // Bilqis Anatra Kinanthy
  "0085951918", // Fadlan Syahrullah Ajib
  "0092260256", // Galih Januar Putra
  "0088558708", // Gathan Arkano Setiadi
  "0095255243", // Ichiro Adiva Ghalia
  "0081075137", // Ilham Syawaludin
  "0095769100", // Mahesa Dwi Tunggal
  "0098700497", // Muhammad Iqbal Saputra
  "0086580666", // Muhammad Khalifatul Aziz
  "0082221670", // Muhammad Raffi Ramadhan
  "0071617142", // Muhammad Rizqy Hanafi
  "0092937161", // Raihan Abyan Allam
  "0087600918", // Rakha Arkana Ibrahim
  "3083843538", // Razan Muhammad Ihsan
  "0088923958", // Rhadesya Aulia Agustin
  "3094068054", // Saliz Zahra
  "0086211369", // Shadiq Sardi Ramadhan
];

async function purgeDummyData() {
  await ensureDatabaseInitialized();
  console.log("🚀 Memulai pembersihan data dummy di PostgreSQL...");

  // 1. Bersihkan tabel catatan riwayat & log dummy
  console.log("🧹 1. Membersihkan subject_attendance_records, promotion_logs, dan activity_logs...");
  const deletedSubjects = await db.delete(subject_attendance_records).returning({ id: subject_attendance_records.id });
  const deletedPromotions = await db.delete(student_promotion_logs).returning({ id: student_promotion_logs.id });
  const deletedActivities = await db.delete(activity_logs).returning({ id: activity_logs.id });
  console.log(`   - subject_attendance_records dihapus : ${deletedSubjects.length}`);
  console.log(`   - student_promotion_logs dihapus      : ${deletedPromotions.length}`);
  console.log(`   - activity_logs dihapus               : ${deletedActivities.length}`);

  // 2. Bersihkan master guru dan jadwal dummy
  console.log("\n🧹 2. Membersihkan master schedules dan teachers dummy...");
  const deletedSchedules = await db.delete(schedules).returning({ id: schedules.id });
  const deletedTeachers = await db.delete(teachers).returning({ id: teachers.id });
  console.log(`   - schedules dihapus : ${deletedSchedules.length}`);
  console.log(`   - teachers dihapus  : ${deletedTeachers.length}`);

  // 3. Bersihkan akun staf guru & walas dummy (LINDUNGI AKUN 'admin')
  console.log("\n🧹 3. Membersihkan akun guru dan walas dummy dari tabel users (Melindungi 'admin')...");
  const deletedStaffUsers = await db
    .delete(users)
    .where(inArray(users.role, ["guru", "walas"]))
    .returning({ username: users.username });
  console.log(`   - Akun staf dummy dihapus : ${deletedStaffUsers.length}`);

  // 4. Bersihkan user generik 'siswa' (jika ada)
  const deletedGenericSiswa = await db
    .delete(users)
    .where(eq(users.username, "siswa"))
    .returning({ username: users.username });
  if (deletedGenericSiswa.length > 0) {
    console.log(`   - Akun generik 'siswa' dihapus : ${deletedGenericSiswa.length}`);
  }

  // 5. Bersihkan data siswa dummy dari tabel students
  // Karena ON DELETE CASCADE aktif, penghapusan ini otomatis membersihkan:
  // - class_students (relasi kelas siswa dummy)
  // - student_barcodes (barcode siswa dummy)
  // - daily_attendance_records (kehadiran harian siswa dummy)
  // - users (akun siswa dummy dengan student_id terkait)
  // - auth_sessions (sesi login user siswa dummy)
  console.log("\n🧹 4. Membersihkan siswa dummy dari tabel students (Cascade aktif)...");
  const deletedStudents = await db
    .delete(students)
    .where(notInArray(students.nisn, REAL_NISNS))
    .returning({ nisn: students.nisn, name: students.full_name });
  console.log(`   - Siswa dummy dihapus : ${deletedStudents.length}`);

  // 6. Bersihkan sesi daily_attendances yatim (yang tidak memiliki record kehadiran riil)
  console.log("\n🧹 5. Membersihkan daily_attendances yatim tanpa siswa...");
  const activeRecords = await db
    .select({ session_id: daily_attendance_records.daily_attendance_id })
    .from(daily_attendance_records);
  const activeSessionIds = [...new Set(activeRecords.map((r) => r.session_id))];

  let deletedSessionsCount = 0;
  if (activeSessionIds.length > 0) {
    const deletedSessions = await db
      .delete(daily_attendances)
      .where(notInArray(daily_attendances.id, activeSessionIds))
      .returning({ id: daily_attendances.id });
    deletedSessionsCount = deletedSessions.length;
  } else {
    // Jika tidak ada absensi aktif, sisakan tidak ada atau bersihkan semua
    const deletedSessions = await db.delete(daily_attendances).returning({ id: daily_attendances.id });
    deletedSessionsCount = deletedSessions.length;
  }
  console.log(`   - Sesi daily_attendances lama dihapus : ${deletedSessionsCount}`);

  // 6. Bersihkan kelas dummy (Hanya pertahankan 'KELAS 11')
  console.log("\n🧹 6. Membersihkan master kelas dummy (Mempertahankan 'KELAS 11')...");
  const deletedClasses = await db
    .delete(classes)
    .where(ne(classes.name, "KELAS 11"))
    .returning({ name: classes.name });
  console.log(`   - Kelas dummy dihapus : ${deletedClasses.length}`);

  // 7. Verifikasi kondisi bersih
  console.log("\n==================================================");
  console.log("📊 STATUS DATABASE SETELAH PEMBERSIHAN:");
  const remainingStudents = await db.select().from(students);
  const remainingUsers = await db.select().from(users);
  const remainingTeachers = await db.select().from(teachers);
  const remainingSchedules = await db.select().from(schedules);
  const remainingBarcodes = await db.select().from(student_barcodes);
  const remainingClassStudents = await db.select().from(class_students);
  const remainingDailyRecords = await db.select().from(daily_attendance_records);
  const remainingSubjectRecords = await db.select().from(subject_attendance_records);
  const remainingPromotionLogs = await db.select().from(student_promotion_logs);
  const remainingClasses = await db.select().from(classes);

  console.log(` • Siswa riil di students        : ${remainingStudents.length} (Target: 21)`);
  console.log(` • Akun aktif di users           : ${remainingUsers.length} (Target: 22 [1 admin + 21 siswa])`);
  console.log(` • Guru di teachers              : ${remainingTeachers.length} (Target: 0 [siap diisi via admin])`);
  console.log(` • Jadwal di schedules           : ${remainingSchedules.length} (Target: 0 [siap diisi via admin])`);
  console.log(` • Master kelas di classes       : ${remainingClasses.length} (Target: 1 ['KELAS 11'])`);
  console.log(` • Barcode di student_barcodes   : ${remainingBarcodes.length} (Target: 21)`);
  console.log(` • Relasi di class_students      : ${remainingClassStudents.length} (Target: 21)`);
  console.log(` • Rekap daily_attendance_records: ${remainingDailyRecords.length}`);
  console.log(` • Rekap subject_attendance      : ${remainingSubjectRecords.length} (Target: 0)`);
  console.log(` • Log student_promotion_logs    : ${remainingPromotionLogs.length} (Target: 0)`);
  console.log("==================================================");

  // Pastikan akun admin dan siswa riil tetap ada
  const adminUser = (await db.select().from(users).where(eq(users.username, "admin")))[0];
  if (!adminUser) {
    throw new Error("CRITICAL: Akun 'admin' tidak ditemukan!");
  }
  console.log(`✅ Verifikasi Akun Admin: Ditemukan (${adminUser.username} - role: ${adminUser.role})`);

  const studentSample = (await db.select().from(students).where(eq(students.nisn, "0097061219")))[0];
  if (!studentSample) {
    throw new Error("CRITICAL: Siswa riil '0097061219' tidak ditemukan!");
  }
  console.log(`✅ Verifikasi Siswa Riil: Ditemukan (${studentSample.nisn} - ${studentSample.full_name})`);

  console.log("\n🎉 Seluruh pembersihan data dummy BERHASIL!");
}

purgeDummyData()
  .then(async () => {
    await closeDatabaseConnection();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("❌ Gagal mengeksekusi pembersihan data dummy:", err);
    await closeDatabaseConnection();
    process.exit(1);
  });
