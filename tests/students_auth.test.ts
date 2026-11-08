import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { count, eq } from "drizzle-orm";
import { app } from "../src/app";
import { db } from "../src/config/database";
import { env } from "../src/config/env";
import { classes, class_students, students, users } from "../src/config/schema";
import { importStudentsFromCsv } from "../src/scripts/import_students_csv";

describe("Integrasi Siswa & Autentikasi NISN — SMK Ghama Caraka", () => {
  const csvPath = join(process.cwd(), "data", "students.csv");

  it("1. Harus memastikan file CSV ada dan dapat dibaca dengan encoding UTF-8", () => {
    expect(existsSync(csvPath)).toBe(true);

    const content = readFileSync(csvPath, "utf-8");
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

    // 1 baris header + 41 baris siswa = 42 baris
    expect(lines.length).toBe(42);
    expect(lines[0]).toBe("No,NISN,Nama Siswa,Kelas");

    // Periksa salah satu siswa dengan leading zero
    const firstStudent = lines[1];
    expect(firstStudent).toContain("0097061219,Abdul Hafizh Rijki Tsaqafi,KELAS 11");
  });

  it("2. Import CSV harus berhasil, idempoten, dan tidak membuat data duplikat", async () => {
    // Jalankan import
    const summary = await importStudentsFromCsv(csvPath);

    expect(summary.total_read).toBe(41);
    expect(summary.failed_count).toBe(0);
    expect(summary.errors.length).toBe(0);

    // Jalankan import kedua kalinya untuk memastikan idempotency
    const secondSummary = await importStudentsFromCsv(csvPath);
    expect(secondSummary.total_read).toBe(41);
    expect(secondSummary.students_inserted).toBe(0);
    expect(secondSummary.students_existing).toBe(41);
    expect(secondSummary.users_created).toBe(0);
    expect(secondSummary.users_existing).toBe(41);
  });

  it("3. Tidak boleh ada duplikasi NISN di tabel students", async () => {
    const allStudents = await db.select().from(students);
    const nisnList = allStudents.map((s) => s.nisn);
    const uniqueNisns = new Set(nisnList);

    expect(nisnList.length).toBe(uniqueNisns.size);
  });

  it("4. Data siswa dan kelas tersimpan dengan benar di database", async () => {
    // Cek siswa kelas 11
    const student11 = (
      await db.select().from(students).where(eq(students.nisn, "0097061219")).limit(1)
    )[0];

    expect(student11).toBeDefined();
    expect(student11?.full_name).toBe("Abdul Hafizh Rijki Tsaqafi");
    expect(student11?.gender).toBe("L");
    expect(student11?.status).toBe("active");

    // Cek relasi kelas
    const enrollment = (
      await db
        .select({
          class_name: classes.name,
        })
        .from(class_students)
        .innerJoin(classes, eq(class_students.class_id, classes.id))
        .where(eq(class_students.student_id, student11!.id))
        .limit(1)
    )[0];

    expect(enrollment).toBeDefined();
    expect(enrollment?.class_name).toBe("KELAS 11");

    // Cek siswa kelas 12 dengan leading zero
    const student12 = (
      await db.select().from(students).where(eq(students.nisn, "0086836167")).limit(1)
    )[0];

    expect(student12).toBeDefined();
    expect(student12?.full_name).toBe("Apriliana Isnaini Hasan");
    expect(student12?.gender).toBe("P");
  });

  it("5. Endpoint POST /api/v1/auth/login berhasil mengautentikasi siswa via NISN", async () => {
    const testNisn = "0097061219";
    const defaultPassword = env.STUDENT_DEFAULT_PASSWORD || "Ghama123!";

    const res = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: testNisn,
        password: defaultPassword,
      }),
    });

    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.message).toBe("Login berhasil");
    expect(body.data.access_token).toBeDefined();
    expect(body.data.token_type).toBe("Bearer");

    // Pastikan data siswa dalam response aman (tidak membocorkan hash/password)
    expect(body.data.user.username).toBe(testNisn);
    expect(body.data.user.role).toBe("siswa");
    expect(body.data.user.student.nisn).toBe(testNisn);
    expect(body.data.user.student.full_name).toBe("Abdul Hafizh Rijki Tsaqafi");
    expect(body.data.user.student.class_name).toBe("KELAS 11");
    expect(body.data.user.password_hash).toBeUndefined();
    expect(body.data.user.password).toBeUndefined();
  });

  it("6. Login ditolak dengan HTTP 401 jika password salah", async () => {
    const res = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "0097061219",
        password: "wrong_password_123",
      }),
    });

    expect(res.status).toBe(401);

    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.message).toContain("tidak sesuai");
  });

  it("7. Login ditolak dengan HTTP 401 jika NISN tidak terdaftar", async () => {
    const res = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "0000000000",
        password: "Ghama123!",
      }),
    });

    expect(res.status).toBe(401);
  });

  it("8. Endpoint GET /api/v1/auth/me mengembalikan profil dengan Bearer token", async () => {
    // Login dulu untuk mendapatkan token
    const loginRes = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "0097061219",
        password: env.STUDENT_DEFAULT_PASSWORD || "Ghama123!",
      }),
    });
    const loginBody = (await loginRes.json()) as any;
    const token = loginBody.data.access_token;

    // Akses /me dengan token
    const meRes = await app.request("/api/v1/auth/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(meRes.status).toBe(200);
    const meBody = (await meRes.json()) as any;
    expect(meBody.success).toBe(true);
    expect(meBody.data.username).toBe("0097061219");
    expect(meBody.data.student.full_name).toBe("Abdul Hafizh Rijki Tsaqafi");
  });

  it("9. Endpoint GET /api/v1/auth/me menolak request tanpa token (HTTP 401)", async () => {
    const res = await app.request("/api/v1/auth/me", {
      method: "GET",
    });

    expect(res.status).toBe(401);
  });

  it("10. CORS mengizinkan origin frontend yang sesuai", async () => {
    const frontendOrigin = "http://localhost:5173";

    // Test preflight OPTIONS
    const preflightRes = await app.request("/api/v1/auth/login", {
      method: "OPTIONS",
      headers: {
        Origin: frontendOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, Authorization",
      },
    });

    expect(preflightRes.headers.get("access-control-allow-origin")).toBe(frontendOrigin);
    expect(preflightRes.headers.get("access-control-allow-credentials")).toBe("true");
    expect(preflightRes.headers.get("access-control-allow-methods")).toContain("POST");

    // Test actual GET with Origin
    const getRes = await app.request("/health", {
      method: "GET",
      headers: {
        Origin: frontendOrigin,
      },
    });

    expect(getRes.headers.get("access-control-allow-origin")).toBe(frontendOrigin);
    expect(getRes.headers.get("access-control-allow-credentials")).toBe("true");
  });
});

