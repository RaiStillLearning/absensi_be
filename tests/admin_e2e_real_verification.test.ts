import { describe, expect, it } from "bun:test";
import { app } from "../src/app";
import { db } from "../src/config/database";
import {
  classes,
  teachers,
  students,
  schedules,
  users,
  daily_attendances,
  daily_attendance_records,
  student_promotion_logs
} from "../src/config/schema";
import { eq, and, desc } from "drizzle-orm";

describe("Admin End-to-End Real PostgreSQL Verification & Negative Security Tests", () => {
  let adminToken = "";
  let guruToken = "";
  let siswaToken = "";
  let createdClassId: number;
  let createdTeacherId: number;
  const testNisn = "99887766" + Math.floor(10 + Math.random() * 90);

  it("1. Autentikasi Admin, Guru, dan Siswa untuk pengujian RBAC & E2E", async () => {
    // Admin Login
    const adminRes = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nisn_atau_username: "admin",
        kata_sandi: "admin123",
      }),
    });
    expect(adminRes.status).toBe(200);
    const adminData = await adminRes.json();
    adminToken = adminData.access_token;
    expect(adminToken).toBeDefined();

    // Guru Login
    const guruRes = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nisn_atau_username: "198905122015012008",
        kata_sandi: "guru123",
      }),
    });
    expect(guruRes.status).toBe(200);
    const guruData = await guruRes.json();
    guruToken = guruData.access_token;
    expect(guruToken).toBeDefined();

    // Siswa Login
    const siswaRes = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nisn_atau_username: "0102641001",
        kata_sandi: process.env.STUDENT_DEFAULT_PASSWORD || "Ghama123!",
      }),
    });
    expect(siswaRes.status).toBe(200);
    const siswaData = await siswaRes.json();
    siswaToken = siswaData.access_token;
    expect(siswaToken).toBeDefined();
  });

  it("2. Real Data PostgreSQL: Verifikasi Dashboard Stats & Rekap 5 Hari", async () => {
    const statsRes = await app.request("/api/v1/dashboard/stats", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(statsRes.status).toBe(200);
    const stats = await statsRes.json();
    expect(stats.total_siswa).toBeGreaterThan(0);
    expect(stats.total_guru).toBeGreaterThan(0);
    expect(stats.total_kelas).toBeGreaterThan(0);

    // Bandingkan dengan jumlah row aktual di PostgreSQL
    const [dbStudent] = await db.select().from(students);
    expect(dbStudent).toBeDefined();

    const rekapRes = await app.request("/api/v1/dashboard/rekap-kehadiran", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(rekapRes.status).toBe(200);
    const rekap = await rekapRes.json();
    expect(Array.isArray(rekap)).toBe(true);
    expect(rekap.length).toBe(5);
  });

  it("3. Real Data PostgreSQL: CRUD Manajemen Kelas", async () => {
    const className = "X TEST E2E " + Date.now();
    
    // Create Kelas
    const createRes = await app.request("/api/v1/kelas", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nama_kelas: className,
        tingkat: "X",
        jurusan: "PPLG",
        tahun_ajaran: "2026/2027",
        wali_kelas: "Drs. Budi Santoso",
      }),
    });
    expect(createRes.status).toBe(201);
    const createdClass = await createRes.json();
    createdClassId = createdClass.id;

    // Verifikasi row tersimpan di PostgreSQL
    const [inDb] = await db.select().from(classes).where(eq(classes.name, className));
    expect(inDb).toBeDefined();
    expect(inDb.name).toBe(className);

    // Update Kelas
    const updateRes = await app.request(`/api/v1/kelas/${createdClassId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nama_kelas: className + " UPDATED",
      }),
    });
    expect(updateRes.status).toBe(200);
    const [updatedInDb] = await db.select().from(classes).where(eq(classes.name, className + " UPDATED"));
    expect(updatedInDb).toBeDefined();

    // Delete Kelas
    const deleteRes = await app.request(`/api/v1/kelas/${createdClassId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(deleteRes.status).toBe(200);
    const [deletedInDb] = await db.select().from(classes).where(eq(classes.name, className + " UPDATED"));
    expect(deletedInDb).toBeUndefined();
  });

  it("4. Real Data PostgreSQL: CRUD Manajemen Guru", async () => {
    const nipTest = "1999" + Date.now().toString().slice(-10);
    const teacherName = "Guru Test E2E";

    // Create Guru
    const createRes = await app.request("/api/v1/guru", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nama_guru: teacherName,
        nip: nipTest,
        email: `guru_${Date.now()}@ghamacaraka.sch.id`,
        mata_pelajaran: "Kecerdasan Buatan",
        is_walas: true,
        kelas_walas: "X RPL 1",
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    createdTeacherId = created.id;

    // Verifikasi row di PostgreSQL
    const [inDb] = await db.select().from(teachers).where(eq(teachers.nip, nipTest));
    expect(inDb).toBeDefined();
    expect(inDb.nama_guru).toBe(teacherName);

    // Update Guru
    const updateRes = await app.request(`/api/v1/guru/${createdTeacherId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nama_guru: teacherName + " M.Kom.",
      }),
    });
    expect(updateRes.status).toBe(200);

    // Delete Guru
    const deleteRes = await app.request(`/api/v1/guru/${createdTeacherId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(deleteRes.status).toBe(200);
    const [deletedInDb] = await db.select().from(teachers).where(eq(teachers.id, createdTeacherId));
    expect(deletedInDb).toBeUndefined();
  });

  it("5. Real Data PostgreSQL: CRUD Siswa & Validasi NISN", async () => {
    // Check NISN Availability
    const checkRes = await app.request(`/api/v1/admin/siswa/check-nisn?nisn=${testNisn}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(checkRes.status).toBe(200);
    const checkData = await checkRes.json();
    expect(checkData.available).toBe(true);

    // Create Siswa
    const createRes = await app.request("/api/v1/admin/siswa", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nisn: testNisn,
        nama_lengkap: "Siswa Test E2E PostgreSQL",
        kelas: "X RPL 1",
        jurusan: "Rekayasa Perangkat Lunak",
        jenis_kelamin: "Laki-laki",
      }),
    });
    expect(createRes.status).toBe(201);

    // Verifikasi Siswa di PostgreSQL
    const [studentInDb] = await db.select().from(students).where(eq(students.nisn, testNisn));
    expect(studentInDb).toBeDefined();
    expect(studentInDb.full_name).toBe("Siswa Test E2E PostgreSQL");

    // Detail Siswa & Kartu Digital
    const detailRes = await app.request(`/api/v1/admin/siswa/${testNisn}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(detailRes.status).toBe(200);
    const detailData = await detailRes.json();
    expect(detailData.siswa.nisn).toBe(testNisn);
    expect(detailData.kartu.nama_lengkap).toBeDefined();

    // Update Data Siswa
    const updateRes = await app.request(`/api/v1/admin/siswa/${testNisn}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nama_lengkap: "Siswa Test E2E PostgreSQL (Updated)",
        kelas: "X RPL 1",
      }),
    });
    expect(updateRes.status).toBe(200);

    const [updatedDb] = await db.select().from(students).where(eq(students.nisn, testNisn));
    expect(updatedDb.full_name).toBe("Siswa Test E2E PostgreSQL (Updated)");
  });

  it("6. Real Data PostgreSQL: Preview & Eksekusi Kenaikan Kelas Manual", async () => {
    // Preview
    const prevRes = await app.request("/api/v1/admin/siswa/kenaikan-kelas/preview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        from_class: "10",
        to_class: "11",
      }),
    });
    expect(prevRes.status).toBe(200);
    const prevData = await prevRes.json();
    expect(prevData.eligible_students).toBeDefined();

    // Eksekusi Kenaikan Kelas Spesifik pada siswa test
    const promoRes = await app.request("/api/v1/admin/siswa/kenaikan-kelas/manual", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        from_class: "X RPL 1",
        to_class: "XI RPL 1",
        student_nisns: [testNisn],
        tahun_ajaran: "2026/2027",
        catatan: "Uji Kenaikan Kelas E2E",
      }),
    });
    expect(promoRes.status).toBe(200);

    // Verifikasi di PostgreSQL: kelas siswa berubah dan tabel promotion history tercatat
    const [promotedStudent] = await db.select().from(students).where(eq(students.nisn, testNisn));
    expect(promotedStudent.kelas).toBe("XI RPL 1");

    const [historyEntry] = await db
      .select()
      .from(student_promotion_logs)
      .where(eq(student_promotion_logs.nisn, testNisn))
      .orderBy(desc(student_promotion_logs.id))
      .limit(1);
    expect(historyEntry).toBeDefined();
    expect(historyEntry.to_class).toBe("XI RPL 1");

    // Clean up test student
    await db.delete(student_promotion_logs).where(eq(student_promotion_logs.nisn, testNisn));
    await db.delete(students).where(eq(students.nisn, testNisn));
  });

  it("7. Real Data PostgreSQL: CRUD Jadwal Pelajaran", async () => {
    const createRes = await app.request("/api/v1/jadwal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        kelas: "X RPL 1",
        hari: "Senin",
        jam_ke: 9,
        waktu_mulai: "14:00",
        waktu_selesai: "15:30",
        mata_pelajaran: "Pemrograman Perangkat Bergerak",
        guru: "Drs. Budi Santoso",
      }),
    });
    expect(createRes.status).toBe(201);
    const createdJadwal = await createRes.json();

    const [inDb] = await db.select().from(schedules).where(eq(schedules.id, createdJadwal.id));
    expect(inDb).toBeDefined();

    // Delete Jadwal
    const delRes = await app.request(`/api/v1/jadwal/${createdJadwal.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(delRes.status).toBe(200);
  });

  it("8. Real Data PostgreSQL: Monitoring Absensi Harian", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await app.request(`/api/v1/absensi?tanggal=${today}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ringkasan).toBeDefined();
    expect(data.ringkasan.total_siswa).toBeGreaterThan(0);
    expect(Array.isArray(data.absensi)).toBe(true);
  });

  it("9. Real Data PostgreSQL: Profil Admin & Update Profil", async () => {
    const getRes = await app.request("/api/v1/admin/profil", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(getRes.status).toBe(200);
    const profile = await getRes.json();
    expect(profile.peran).toBe("Administrator");

    const updateRes = await app.request("/api/v1/admin/profil", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nama_lengkap: "Administrator Utama",
      }),
    });
    expect(updateRes.status).toBe(200);

    const [adminUser] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
    expect(adminUser.nama_lengkap).toBe("Administrator Utama");
  });

  it("10. NEGATIVE SECURITY: Verifikasi Akses Tanpa Token (401 Unauthorized)", async () => {
    // Tanpa header Authorization
    const resAdmin = await app.request("/api/v1/admin/profil");
    expect(resAdmin.status).toBe(401);

    const resSiswa = await app.request("/api/v1/admin/siswa");
    expect(resSiswa.status).toBe(401);

    const resKelas = await app.request("/api/v1/kelas");
    expect(resKelas.status).toBe(401);

    const resPromo = await app.request("/api/v1/admin/siswa/kenaikan-kelas/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_class: "10", to_class: "11" }),
    });
    expect(resPromo.status).toBe(401);
  });

  it("11. NEGATIVE SECURITY: Privilege Escalation & Cross-Role Access (403 Forbidden)", async () => {
    // 1. Role SISWA mencoba mengakses endpoint Admin
    const siswaAccessAdmin = await app.request("/api/v1/admin/profil", {
      headers: { Authorization: `Bearer ${siswaToken}` },
    });
    expect(siswaAccessAdmin.status).toBe(403);

    const siswaAccessKelas = await app.request("/api/v1/kelas", {
      headers: { Authorization: `Bearer ${siswaToken}` },
    });
    expect(siswaAccessKelas.status).toBe(403);

    const siswaMutasiGuru = await app.request("/api/v1/guru", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${siswaToken}`,
      },
      body: JSON.stringify({ nama_guru: "Hacker Guru", mata_pelajaran: "Hacking" }),
    });
    expect(siswaMutasiGuru.status).toBe(403);

    // 2. Role GURU mencoba mutasi master Kelas dan mutasi Guru lain
    const guruMutasiKelas = await app.request("/api/v1/kelas", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${guruToken}`,
      },
      body: JSON.stringify({
        nama_kelas: "X ILEGAL",
        tingkat: "X",
        jurusan: "RPL",
        wali_kelas: "Guru Ilegal",
        tahun_ajaran: "2026/2027",
      }),
    });
    expect(guruMutasiKelas.status).toBe(403);

    const guruMutasiJadwal = await app.request("/api/v1/jadwal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${guruToken}`,
      },
      body: JSON.stringify({
        kelas: "X RPL 1",
        hari: "Senin",
        jam_ke: 1,
        waktu_mulai: "07:00",
        waktu_selesai: "08:00",
        mata_pelajaran: "Mapel Ilegal",
        guru: "Guru Ilegal",
      }),
    });
    expect(guruMutasiJadwal.status).toBe(403);

    const guruAksesSiswaAdmin = await app.request("/api/v1/admin/siswa", {
      headers: { Authorization: `Bearer ${guruToken}` },
    });
    expect(guruAksesSiswaAdmin.status).toBe(403);
  });

  it("12. NEGATIVE SECURITY: Proteksi IDOR & Parameter Tampering pada Siswa", async () => {
    // Mengambil data siswa yang tidak ada (404 Not Found)
    const nonExistent = await app.request("/api/v1/admin/siswa/00000000000000", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(nonExistent.status).toBe(404);

    // Mencoba edit siswa yang tidak ada
    const editNonExistent = await app.request("/api/v1/admin/siswa/00000000000000", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nama_lengkap: "Ghost Student",
        kelas: "X RPL 1",
      }),
    });
    expect(editNonExistent.status).toBe(404);
  });
});
