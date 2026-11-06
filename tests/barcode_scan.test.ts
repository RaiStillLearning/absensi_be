import { beforeAll, describe, expect, it } from "bun:test";
import { app } from "../src/app";
import { seed_dummy_student } from "../src/scripts/seed_dummy_student";

describe("Hardware Barcode Scanner — JR HC-P20 Test Suite", () => {
  let dummy_data: {
    token: string;
    nisn: string;
    name: string;
    class_name: string;
  };

  beforeAll(async () => {
    // Seed dummy student, class, and attendance session
    const seeded = await seed_dummy_student();
    dummy_data = {
      token: seeded.token,
      nisn: seeded.nisn,
      name: seeded.name,
      class_name: seeded.class_name,
    };

    // Reset any previous attendance records for dummy student
    await app.request("/dev/api/reset-dummy-attendance", { method: "POST" });
  });

  it("should record attendance successfully on first valid scan (HTTP 200)", async () => {
    const res = await app.request("/api/v1/attendance/daily/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        barcode_token: dummy_data.token,
        request_id: crypto.randomUUID(),
      }),
    });

    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      success: boolean;
      message: string;
      data: {
        student_name: string;
        nisn: string;
        class_name: string;
        attendance_status: string;
        check_in_at: string;
      };
    };

    expect(body.success).toBe(true);
    expect(body.message).toBe("Absensi berhasil");
    expect(body.data.student_name).toBe(dummy_data.name);
    expect(body.data.nisn).toBe(dummy_data.nisn);
    expect(body.data.class_name).toBe(dummy_data.class_name);
    expect(body.data.attendance_status).toBe("present");
    expect(body.data.check_in_at).toBeDefined();
  });

  it("should reject duplicate scan for the same student on the same session (HTTP 409)", async () => {
    const res = await app.request("/api/v1/attendance/daily/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        barcode_token: dummy_data.token,
        request_id: crypto.randomUUID(),
      }),
    });

    expect(res.status).toBe(409);

    const body = (await res.json()) as { success: boolean; message: string };
    expect(body.success).toBe(false);
    expect(body.message).toBe("Siswa sudah melakukan absensi");
  });

  it("should reject invalid / unseeded barcode token (HTTP 404)", async () => {
    const res = await app.request("/api/v1/attendance/daily/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        barcode_token: "ghama_fake_token_not_in_db_12345",
      }),
    });

    expect(res.status).toBe(404);

    const body = (await res.json()) as { success: boolean; message: string };
    expect(body.success).toBe(false);
    expect(body.message).toBe("Barcode tidak valid");
  });

  it("should reject request with empty barcode token (HTTP 400)", async () => {
    const res = await app.request("/api/v1/attendance/daily/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        barcode_token: "",
      }),
    });

    expect(res.status).toBe(400);

    const body = (await res.json()) as { success: boolean; message: string };
    expect(body.success).toBe(false);
  });

  it("should serve Scanner Test Page on GET /dev/scanner-test", async () => {
    const res = await app.request("/dev/scanner-test");
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("Hardware Barcode Scanner Test — JR HC-P20");
    expect(html).toContain("scanInput");
    expect(html).toContain("Auto-Focus Active");
  });

  it("should return dummy student info on GET /dev/api/dummy-student-info", async () => {
    const res = await app.request("/dev/api/dummy-student-info");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      success: boolean;
      data: { nisn: string; full_name: string; token: string; has_attended_today: boolean };
    };

    expect(body.success).toBe(true);
    expect(body.data.nisn).toBe(dummy_data.nisn);
    expect(body.data.token).toBe(dummy_data.token);
  });

  it("should reset dummy attendance records on POST /dev/api/reset-dummy-attendance", async () => {
    const reset_res = await app.request("/dev/api/reset-dummy-attendance", {
      method: "POST",
    });
    expect(reset_res.status).toBe(200);

    // After reset, scanning the valid token should succeed again
    const res = await app.request("/api/v1/attendance/daily/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        barcode_token: dummy_data.token,
      }),
    });

    expect(res.status).toBe(200);
  });
});
