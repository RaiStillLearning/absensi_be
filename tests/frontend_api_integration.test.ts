import { app } from "../src/app";

async function runTests() {
  console.log("🧪 Testing Frontend API Endpoints on Hono Backend...\n");
  let passed = 0;
  let failed = 0;

  async function testEndpoint(name: string, path: string, init?: RequestInit, expectedStatus = 200): Promise<any> {
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
  const adminLogin = await testEndpoint("Admin Login", "/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn_atau_username: "admin", kata_sandi: "admin123" }),
  });
  const adminHeaders: Record<string, string> = adminLogin?.access_token ? { Authorization: `Bearer ${adminLogin.access_token}` } : {};

  const guruLogin = await testEndpoint("Guru Login", "/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn_atau_username: "198905122015012008", kata_sandi: "guru123" }),
  });
  const guruHeaders: Record<string, string> = guruLogin?.access_token ? { Authorization: `Bearer ${guruLogin.access_token}` } : {};

  const siswaLogin = await testEndpoint("Siswa Login", "/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn_atau_username: "0102641001", kata_sandi: process.env.STUDENT_DEFAULT_PASSWORD || "gc123" }),
  });
  const siswaHeaders: Record<string, string> = siswaLogin?.access_token ? { Authorization: `Bearer ${siswaLogin.access_token}` } : {};

  // 3. Dashboard Endpoints
  await testEndpoint("Dashboard Stats", "/api/v1/dashboard/stats", { headers: adminHeaders });
  await testEndpoint("Rekap Kehadiran 5 Hari", "/api/v1/dashboard/rekap-kehadiran", { headers: adminHeaders });
  await testEndpoint("Aktivitas Terbaru", "/api/v1/dashboard/aktivitas-terbaru", { headers: adminHeaders });
  await testEndpoint("Ringkasan Absensi", "/api/v1/dashboard/ringkasan-absensi", { headers: adminHeaders });

  // 4. Kelas Endpoints
  await testEndpoint("List Kelas", "/api/v1/kelas", { headers: adminHeaders });
  await testEndpoint("Get Kelas by ID", "/api/v1/kelas/1", { headers: adminHeaders });

  // 5. Guru Endpoints
  await testEndpoint("List Guru", "/api/v1/guru", { headers: adminHeaders });
  await testEndpoint("Get Guru Profil", "/api/v1/guru/profil", { headers: guruHeaders });
  await testEndpoint("Get Guru Dashboard", "/api/v1/guru/dashboard", { headers: guruHeaders });
  await testEndpoint("Get Guru Absensi Sesi", "/api/v1/guru/absensi?kelas=X%20RPL%201&mapel=Pemrograman%20Web&tanggal=2026-06-06", { headers: guruHeaders });
  await testEndpoint("Get Guru Rekap", "/api/v1/guru/rekap?kelas=X%20RPL%201&mapel=Pemrograman%20Web&tanggal=2026-06-06", { headers: guruHeaders });

  // 6. Jadwal Endpoints
  await testEndpoint("List Jadwal", "/api/v1/jadwal?kelas=X%20RPL%201", { headers: adminHeaders });
  await testEndpoint("Get Jadwal by ID", "/api/v1/jadwal/1", { headers: adminHeaders });

  // 7. Absensi Admin
  await testEndpoint("Admin Monitoring Absensi", "/api/v1/absensi?tanggal=2026-10-19", { headers: adminHeaders });

  // 8. Admin Profil & Riwayat Kenaikan
  await testEndpoint("Admin Profil", "/api/v1/admin/profil", { headers: adminHeaders });
  await testEndpoint("Admin Riwayat Kenaikan Siswa", "/api/v1/admin/siswa/riwayat-kenaikan", { headers: adminHeaders });
  await testEndpoint("Admin Riwayat Kenaikan Alias", "/api/v1/admin/riwayat-kenaikan", { headers: adminHeaders });

  // 9. Walas Endpoints
  await testEndpoint("Walas Dashboard", "/api/v1/walas/dashboard", { headers: guruHeaders });
  await testEndpoint("Walas Monitoring", "/api/v1/walas/monitoring?tanggal=2026-06-05", { headers: guruHeaders });
  await testEndpoint("Walas Rekap Bulan Ini", "/api/v1/walas/rekap/bulan-ini", { headers: guruHeaders });
  await testEndpoint("Walas Riwayat Kenaikan Siswa Binaan", "/api/v1/walas/riwayat-kenaikan", { headers: guruHeaders });

  // 10. Siswa Endpoints
  await testEndpoint("Siswa Profil", "/api/v1/siswa/profil", { headers: siswaHeaders });
  await testEndpoint("Siswa Metrik Kehadiran", "/api/v1/siswa/metrik-kehadiran", { headers: siswaHeaders });
  await testEndpoint("Siswa Jadwal Hari Ini", "/api/v1/siswa/jadwal/hari-ini", { headers: siswaHeaders });
  await testEndpoint("Siswa Jadwal Mingguan", "/api/v1/siswa/jadwal/mingguan", { headers: siswaHeaders });
  await testEndpoint("Siswa Absensi Realtime", "/api/v1/siswa/absensi/realtime", { headers: siswaHeaders });
  await testEndpoint("Siswa Kehadiran", "/api/v1/siswa/kehadiran", { headers: siswaHeaders });
  await testEndpoint("Siswa Rekap Bulanan", "/api/v1/siswa/kehadiran/rekap?bulan=2025-01", { headers: siswaHeaders });
  await testEndpoint("Siswa Riwayat Kenaikan Mandiri", "/api/v1/siswa/riwayat-kenaikan", { headers: siswaHeaders });
  await testEndpoint("Siswa Riwayat Kenaikan Alias", "/api/v1/siswa/riwayat-kenaikan-kelas", { headers: siswaHeaders });

  console.log(`\n🎉 Test Summary: ${passed} Passed, ${failed} Failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
