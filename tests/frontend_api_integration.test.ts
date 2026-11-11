import { app } from "../src/app";

async function runTests() {
  console.log("🧪 Testing Frontend API Endpoints on Hono Backend...\n");
  let passed = 0;
  let failed = 0;

  async function testEndpoint(name: string, path: string, init?: RequestInit, expectedStatus = 200) {
    try {
      const res = await app.request(path, init);
      if (res.status === expectedStatus) {
        console.log(`✅ [${res.status}] ${name} (${path})`);
        passed++;
        return await res.json();
      } else {
        console.error(`❌ [${res.status} != ${expectedStatus}] ${name} (${path})`);
        const text = await res.text();
        console.error("   Response:", text);
        failed++;
        return null;
      }
    } catch (err) {
      console.error(`❌ [ERROR] ${name} (${path}):`, err);
      failed++;
      return null;
    }
  }

  // 1. General & Health
  await testEndpoint("Health Check", "/health");
  await testEndpoint("API v1 Root", "/api/v1");
  await testEndpoint("OpenAPI Specification", "/docs/api/openapi.json");

  // 2. Authentication
  await testEndpoint("Admin Login", "/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn_atau_username: "admin", kata_sandi: "admin123" }),
  });

  await testEndpoint("Guru Login", "/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn_atau_username: "198905122015012008", kata_sandi: "guru123" }),
  });

  await testEndpoint("Siswa Login", "/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn_atau_username: "0102641001", kata_sandi: "siswa123" }),
  });

  // 3. Dashboard Endpoints
  await testEndpoint("Dashboard Stats", "/api/v1/dashboard/stats");
  await testEndpoint("Rekap Kehadiran 5 Hari", "/api/v1/dashboard/rekap-kehadiran");
  await testEndpoint("Aktivitas Terbaru", "/api/v1/dashboard/aktivitas-terbaru");
  await testEndpoint("Ringkasan Absensi", "/api/v1/dashboard/ringkasan-absensi");

  // 4. Kelas Endpoints
  await testEndpoint("List Kelas", "/api/v1/kelas");
  await testEndpoint("Get Kelas by ID", "/api/v1/kelas/1");

  // 5. Guru Endpoints
  await testEndpoint("List Guru", "/api/v1/guru");
  await testEndpoint("Get Guru Profil", "/api/v1/guru/profil");
  await testEndpoint("Get Guru Dashboard", "/api/v1/guru/dashboard");
  await testEndpoint("Get Guru Absensi Sesi", "/api/v1/guru/absensi?kelas=X%20RPL%201&mapel=Pemrograman%20Web&tanggal=2026-06-06");
  await testEndpoint("Get Guru Rekap", "/api/v1/guru/rekap?kelas=X%20RPL%201&mapel=Pemrograman%20Web&tanggal=2026-06-06");

  // 6. Jadwal Endpoints
  await testEndpoint("List Jadwal", "/api/v1/jadwal?kelas=X%20RPL%201");
  await testEndpoint("Get Jadwal by ID", "/api/v1/jadwal/1");

  // 7. Absensi Admin
  await testEndpoint("Admin Monitoring Absensi", "/api/v1/absensi?tanggal=2026-10-19");

  // 8. Admin Profil
  await testEndpoint("Admin Profil", "/api/v1/admin/profil");

  // 9. Walas Endpoints
  await testEndpoint("Walas Dashboard", "/api/v1/walas/dashboard");
  await testEndpoint("Walas Monitoring", "/api/v1/walas/monitoring?tanggal=2026-06-05");
  await testEndpoint("Walas Rekap Bulan Ini", "/api/v1/walas/rekap/bulan-ini");

  // 10. Siswa Endpoints
  await testEndpoint("Siswa Profil", "/api/v1/siswa/profil");
  await testEndpoint("Siswa Metrik Kehadiran", "/api/v1/siswa/metrik-kehadiran");
  await testEndpoint("Siswa Jadwal Hari Ini", "/api/v1/siswa/jadwal/hari-ini");
  await testEndpoint("Siswa Jadwal Mingguan", "/api/v1/siswa/jadwal/mingguan");
  await testEndpoint("Siswa Absensi Realtime", "/api/v1/siswa/absensi/realtime");
  await testEndpoint("Siswa Kehadiran", "/api/v1/siswa/kehadiran");
  await testEndpoint("Siswa Rekap Bulanan", "/api/v1/siswa/kehadiran/rekap?bulan=2025-01");

  console.log(`\n🎉 Test Summary: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
