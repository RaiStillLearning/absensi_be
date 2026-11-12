import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { count, eq } from "drizzle-orm";
import { db } from "../../config/database";
import {
  classes,
  daily_attendance_records,
  daily_attendances,
  students,
} from "../../config/schema";
import { API_TAGS } from "../../shared/constants";

function formatIndonesianDate(isoDate?: string): string {
  const parsed = isoDate ? new Date(`${isoDate}T00:00:00`) : new Date();
  const dateObj = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(dateObj);
}

export const absensiAdminRouter = new OpenAPIHono();

export const RingkasanAbsensiSchema = z
  .object({
    total_siswa: z.number().openapi({ example: 320 }),
    total_kelas: z.number().openapi({ example: 12 }),
    tanggal: z.string().openapi({ example: "Senin, 19 Oktober 2026" }),
    hadir: z.number().openapi({ example: 301 }),
    izin: z.number().openapi({ example: 9 }),
    sakit: z.number().openapi({ example: 6 }),
    alpha: z.number().openapi({ example: 4 }),
  })
  .openapi("RingkasanAbsensi");

export const AbsensiItemSchema = z
  .object({
    nama_siswa: z.string().openapi({ example: "Ahmad Fauzan" }),
    nisn: z.string().openapi({ example: "0102641001" }),
    kelas: z.string().openapi({ example: "X RPL 1" }),
    status: z.enum(["Hadir", "Izin", "Sakit", "Alpa", "Alpha"]).openapi({ example: "Hadir" }),
    jam_masuk: z.string().openapi({ example: "06.42" }),
    keterangan: z.string().openapi({ example: "Tepat waktu" }),
  })
  .openapi("AbsensiItem");

function mapDbStatusToDisplay(status: string): "Hadir" | "Izin" | "Sakit" | "Alpa" {
  if (status === "present") return "Hadir";
  if (status === "excused") return "Izin";
  if (status === "sick") return "Sakit";
  return "Alpa";
}

/**
 * 1. GET /api/v1/absensi
 */
export const getMonitoringAbsensiRoute = createRoute({
  method: "get",
  path: "/",
  tags: [API_TAGS.ADMIN],
  summary: "Get School-wide Attendance Monitoring Records",
  request: {
    query: z.object({
      tanggal: z.string().optional(),
      kelas: z.string().optional(),
      cari_siswa: z.string().optional(),
      halaman: z.coerce.number().optional(),
      jumlah_per_halaman: z.coerce.number().optional(),
    }),
  },
  responses: {
    200: {
      description: "Attendance records and summary retrieved successfully from PostgreSQL",
      content: {
        "application/json": {
          schema: z.object({
            ringkasan: RingkasanAbsensiSchema,
            absensi: z.array(AbsensiItemSchema),
          }),
        },
      },
    },
  },
});

absensiAdminRouter.openapi(getMonitoringAbsensiRoute, async (c) => {
  const { tanggal, kelas, cari_siswa, halaman, jumlah_per_halaman } = c.req.valid("query");
  const targetDate =
    tanggal && /^\d{4}-\d{2}-\d{2}$/.test(tanggal)
      ? tanggal
      : new Date().toISOString().slice(0, 10);

  const [classCount] = await db.select({ value: count() }).from(classes);
  const [studentCount] = await db.select({ value: count() }).from(students);

  const joinedRows = await db
    .select({
      nama_siswa: students.full_name,
      nisn: students.nisn,
      kelas: students.kelas,
      status: daily_attendance_records.attendance_status,
      jam_masuk: daily_attendance_records.jam_masuk,
      keterangan: daily_attendance_records.keterangan,
    })
    .from(daily_attendance_records)
    .innerJoin(students, eq(daily_attendance_records.student_id, students.id))
    .innerJoin(
      daily_attendances,
      eq(daily_attendance_records.daily_attendance_id, daily_attendances.id)
    )
    .where(eq(daily_attendances.attendance_date, targetDate));

  let list = joinedRows.map((r) => ({
    nama_siswa: r.nama_siswa,
    nisn: r.nisn,
    kelas: r.kelas || "-",
    status: mapDbStatusToDisplay(r.status),
    jam_masuk: r.jam_masuk || "-",
    keterangan: r.keterangan || "",
  }));

  const hadir = list.filter((i) => i.status === "Hadir").length;
  const izin = list.filter((i) => i.status === "Izin").length;
  const sakit = list.filter((i) => i.status === "Sakit").length;
  const alpha = list.filter((i) => i.status === "Alpa").length;
  const totalSiswa = studentCount?.value ?? 0;

  if (kelas && kelas !== "Semua Kelas") {
    list = list.filter((a) => a.kelas === kelas);
  }

  if (cari_siswa) {
    const q = cari_siswa.toLowerCase();
    list = list.filter(
      (a) => a.nama_siswa.toLowerCase().includes(q) || a.nisn.includes(q)
    );
  }

  if (halaman && jumlah_per_halaman) {
    const start = (halaman - 1) * jumlah_per_halaman;
    list = list.slice(start, start + jumlah_per_halaman);
  }

  return c.json(
    {
      ringkasan: {
        total_siswa: totalSiswa,
        total_kelas: classCount?.value ?? 0,
        tanggal: formatIndonesianDate(targetDate),
        hadir,
        izin,
        sakit,
        alpha,
      },
      absensi: list,
    },
    200
  );
});
