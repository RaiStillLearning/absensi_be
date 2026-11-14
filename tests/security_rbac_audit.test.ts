import { describe, expect, it } from "bun:test";
import { app } from "../src/app";

describe("Security Audit & RBAC Permissions Test Suite", () => {
  let adminToken = "";
  let guruToken = "";
  let siswaToken = "";

  it("1. Autentikasi dan penerbitan JWT untuk setiap Role", async () => {
    // Admin login
    const adminRes = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nisn_atau_username: "admin", kata_sandi: "admin123" }),
    });
    expect(adminRes.status).toBe(200);
    const adminJson = (await adminRes.json()) as any;
    adminToken = adminJson.access_token;
    expect(adminToken).toBeDefined();

    // Guru login
    const guruRes = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nisn_atau_username: "198905122015012008", kata_sandi: "guru123" }),
    });
    expect(guruRes.status).toBe(200);
    const guruJson = (await guruRes.json()) as any;
    guruToken = guruJson.access_token;
    expect(guruToken).toBeDefined();

    // Siswa login
    const siswaRes = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nisn_atau_username: "0102641001",
        kata_sandi: process.env.STUDENT_DEFAULT_PASSWORD || "gc123",
      }),
    });
    expect(siswaRes.status).toBe(200);
    const siswaJson = (await siswaRes.json()) as any;
    siswaToken = siswaJson.access_token;
    expect(siswaToken).toBeDefined();
  });

  it("2. Endpoint terproteksi wajib menolak request tanpa token (401 Unauthorized)", async () => {
    const unauthAdmin = await app.request("/api/v1/admin/profil");
    expect(unauthAdmin.status).toBe(401);

    const unauthGuru = await app.request("/api/v1/guru/profil");
    expect(unauthGuru.status).toBe(401);

    const unauthWalas = await app.request("/api/v1/walas/dashboard");
    expect(unauthWalas.status).toBe(401);

    const unauthSiswa = await app.request("/api/v1/siswa/profil");
    expect(unauthSiswa.status).toBe(401);
  });

  it("3. Role SISWA dilarang mengakses modul Admin, Walas, dan Guru (403 Forbidden)", async () => {
    // Siswa akses Admin
    const siswaToAdmin = await app.request("/api/v1/admin/profil", {
      headers: { Authorization: `Bearer ${siswaToken}` },
    });
    expect(siswaToAdmin.status).toBe(403);

    // Siswa akses Walas
    const siswaToWalas = await app.request("/api/v1/walas/dashboard", {
      headers: { Authorization: `Bearer ${siswaToken}` },
    });
    expect(siswaToWalas.status).toBe(403);

    // Siswa akses Guru
    const siswaToGuru = await app.request("/api/v1/guru/profil", {
      headers: { Authorization: `Bearer ${siswaToken}` },
    });
    expect(siswaToGuru.status).toBe(403);

    // Siswa mutasi Jadwal (POST /jadwal) dilarang
    const siswaPostJadwal = await app.request("/api/v1/jadwal", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${siswaToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        kelas: "X RPL 1",
        hari: "Senin",
        jam_ke: 1,
        waktu_mulai: "07:00",
        waktu_selesai: "07:45",
        mata_pelajaran: "Hacking 101",
        guru: "Anonymous",
      }),
    });
    expect(siswaPostJadwal.status).toBe(403);
  });

  it("4. Role GURU dilarang mengakses modul Admin dan dilarang memanipulasi master Guru/Jadwal (403 Forbidden)", async () => {
    // Guru akses Admin
    const guruToAdmin = await app.request("/api/v1/admin/profil", {
      headers: { Authorization: `Bearer ${guruToken}` },
    });
    expect(guruToAdmin.status).toBe(403);

    // Guru coba tambah Guru baru (POST /guru) -> Harus 403 Forbidden
    const guruCreateTeacher = await app.request("/api/v1/guru", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${guruToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nama_guru: "Guru Palsu",
        mata_pelajaran: "Biologi",
      }),
    });
    expect(guruCreateTeacher.status).toBe(403);

    // Guru coba hapus Guru (DELETE /guru/1) -> Harus 403 Forbidden
    const guruDeleteTeacher = await app.request("/api/v1/guru/1", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${guruToken}` },
    });
    expect(guruDeleteTeacher.status).toBe(403);

    // Guru coba buat jadwal baru (POST /jadwal) -> Harus 403 Forbidden
    const guruCreateJadwal = await app.request("/api/v1/jadwal", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${guruToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        kelas: "X RPL 1",
        hari: "Senin",
        jam_ke: 1,
        waktu_mulai: "07:00",
        waktu_selesai: "07:45",
        mata_pelajaran: "Matematika",
        guru: "Pak Budi",
      }),
    });
    expect(guruCreateJadwal.status).toBe(403);
  });

  it("5. API Riwayat Kenaikan Kelas berfungsi dengan benar untuk Admin, Siswa, dan Walas", async () => {
    // Admin Riwayat Kenaikan
    const adminHistory = await app.request("/api/v1/admin/siswa/riwayat-kenaikan", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(adminHistory.status).toBe(200);
    const adminHistoryJson = (await adminHistory.json()) as any;
    expect(adminHistoryJson.success).toBe(true);
    expect(Array.isArray(adminHistoryJson.items)).toBe(true);
    expect(adminHistoryJson.pagination).toBeDefined();

    // Siswa Riwayat Kenaikan Mandiri
    const siswaHistory = await app.request("/api/v1/siswa/riwayat-kenaikan", {
      headers: { Authorization: `Bearer ${siswaToken}` },
    });
    expect(siswaHistory.status).toBe(200);
    const siswaHistoryJson = (await siswaHistory.json()) as any;
    expect(siswaHistoryJson.success).toBe(true);
    expect(Array.isArray(siswaHistoryJson.data)).toBe(true);

    // Walas Riwayat Kenaikan Siswa Binaan
    const walasHistory = await app.request("/api/v1/walas/riwayat-kenaikan", {
      headers: { Authorization: `Bearer ${guruToken}` }, // guruToken memiliki is_walas: true
    });
    expect(walasHistory.status).toBe(200);
    const walasHistoryJson = (await walasHistory.json()) as any;
    expect(walasHistoryJson.success).toBe(true);
    expect(Array.isArray(walasHistoryJson.data)).toBe(true);
  });
});
