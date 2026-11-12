import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../../config/database";
import {
  activity_logs,
  classes,
  daily_attendance_records,
  daily_attendances,
  students,
  teachers,
} from "../../config/schema";
import { API_TAGS } from "../../shared/constants";

export const dashboardRouter = new OpenAPIHono();

function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatIndonesianDate(date = new Date()): string {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function getCurrentWeekDates(): { label: string; iso: string }[] {
  const now = new Date();
  const day = now.getDay(); // 0 = Sun, 1 = Mon, ...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() + diffToMonday);

  const labels = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"];
  return labels.map((label, idx) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + idx);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return { label, iso: `${yyyy}-${mm}-${dd}` };
  });
}

async function computeSchoolAttendanceSummary() {
  const [classCount] = await db.select({ value: count() }).from(classes);
  const [teacherCount] = await db.select({ value: count() }).from(teachers);
  const [studentCount] = await db.select({ value: count() }).from(students);

  const todayIso = getTodayIsoDate();
  const todayRecords = await db
    .select({
      attendance_status: daily_attendance_records.attendance_status,
    })
    .from(daily_attendance_records)
    .innerJoin(
      daily_attendances,
      eq(daily_attendance_records.daily_attendance_id, daily_attendances.id)
    )
    .where(eq(daily_attendances.attendance_date, todayIso));

  let hadir = 0;
  let izin = 0;
  let sakit = 0;
  let alpha = 0;

  for (const r of todayRecords) {
    if (r.attendance_status === "present") hadir++;
    else if (r.attendance_status === "excused") izin++;
    else if (r.attendance_status === "sick") sakit++;
    else alpha++;
  }

  const totalSiswa = studentCount?.value ?? 0;
  const totalKelas = classCount?.value ?? 0;
  const totalGuru = teacherCount?.value ?? 0;

  const kehadiranHariIni =
    totalSiswa > 0 && todayRecords.length > 0 ? Math.round((hadir / totalSiswa) * 100) : 0;

  return {
    total_siswa: totalSiswa,
    total_guru: totalGuru,
    total_kelas: totalKelas,
    kehadiran_hari_ini: kehadiranHariIni,
    kenaikan_kehadiran: 0,
    hadir,
    izin,
    sakit,
    alpha,
  };
}

/**
 * 1. GET /api/v1/dashboard/stats
 */
export const getStatsRoute = createRoute({
  method: "get",
  path: "/stats",
  tags: [API_TAGS.ADMIN, API_TAGS.GENERAL],
  summary: "Get Dashboard Statistics Summary",
  description: "Returns summary counts for students, teachers, classes, and attendance percentage from PostgreSQL",
  responses: {
    200: {
      description: "Dashboard stats retrieved successfully",
      content: {
        "application/json": {
          schema: z.object({
            total_siswa: z.number().openapi({ example: 320 }),
            total_guru: z.number().openapi({ example: 12 }),
            total_kelas: z.number().openapi({ example: 12 }),
            kehadiran_hari_ini: z.number().openapi({ example: 94 }),
            kenaikan_kehadiran: z.number().openapi({ example: 2 }),
          }),
        },
      },
    },
  },
});

dashboardRouter.openapi(getStatsRoute, async (c) => {
  const stats = await computeSchoolAttendanceSummary();
  return c.json(
    {
      total_siswa: stats.total_siswa,
      total_guru: stats.total_guru,
      total_kelas: stats.total_kelas,
      kehadiran_hari_ini: stats.kehadiran_hari_ini,
      kenaikan_kehadiran: stats.kenaikan_kehadiran,
    },
    200
  );
});

/**
 * 2. GET /api/v1/dashboard/rekap-kehadiran
 */
export const getRekapKehadiranRoute = createRoute({
  method: "get",
  path: "/rekap-kehadiran",
  tags: [API_TAGS.ADMIN],
  summary: "Get 5-Day Attendance Recap",
  description: "Returns 5-day daily attendance chart data (hadir, izin, sakit, alpha) from PostgreSQL",
  responses: {
    200: {
      description: "Recap data retrieved successfully",
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              hari: z.string().openapi({ example: "Senin" }),
              hadir: z.number().openapi({ example: 301 }),
              izin: z.number().openapi({ example: 9 }),
              sakit: z.number().openapi({ example: 6 }),
              alpha: z.number().openapi({ example: 4 }),
            })
          ),
        },
      },
    },
  },
});

dashboardRouter.openapi(getRekapKehadiranRoute, async (c) => {
  const weekDays = getCurrentWeekDates();
  const mondayIso = weekDays[0]!.iso;
  const fridayIso = weekDays[weekDays.length - 1]!.iso;

  const weekRecords = await db
    .select({
      attendance_date: daily_attendances.attendance_date,
      attendance_status: daily_attendance_records.attendance_status,
    })
    .from(daily_attendance_records)
    .innerJoin(
      daily_attendances,
      eq(daily_attendance_records.daily_attendance_id, daily_attendances.id)
    )
    .where(
      and(
        gte(daily_attendances.attendance_date, mondayIso),
        lte(daily_attendances.attendance_date, fridayIso)
      )
    );

  const tallyMap = new Map<
    string,
    { hadir: number; izin: number; sakit: number; alpha: number }
  >();
  for (const d of weekDays) {
    tallyMap.set(d.iso, { hadir: 0, izin: 0, sakit: 0, alpha: 0 });
  }

  for (const rec of weekRecords) {
    const bucket = tallyMap.get(String(rec.attendance_date));
    if (!bucket) continue;
    if (rec.attendance_status === "present") bucket.hadir++;
    else if (rec.attendance_status === "excused") bucket.izin++;
    else if (rec.attendance_status === "sick") bucket.sakit++;
    else bucket.alpha++;
  }

  const rekap5Hari = weekDays.map((d) => {
    const counts = tallyMap.get(d.iso) ?? { hadir: 0, izin: 0, sakit: 0, alpha: 0 };
    return {
      hari: d.label,
      ...counts,
    };
  });

  return c.json(rekap5Hari, 200);
});

/**
 * 3. GET /api/v1/dashboard/aktivitas-terbaru
 */
export const getAktivitasTerbaruRoute = createRoute({
  method: "get",
  path: "/aktivitas-terbaru",
  tags: [API_TAGS.ADMIN],
  summary: "Get Recent System Activities",
  description: "Returns recent school activity logs from PostgreSQL",
  responses: {
    200: {
      description: "Activities retrieved successfully",
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              jenis: z.enum(["absensi", "siswa", "izin", "jadwal", "laporan"]),
              judul: z.string(),
              deskripsi: z.string(),
              waktu: z.string(),
            })
          ),
        },
      },
    },
  },
});

dashboardRouter.openapi(getAktivitasTerbaruRoute, async (c) => {
  const logs = await db
    .select()
    .from(activity_logs)
    .orderBy(desc(activity_logs.id))
    .limit(10);

  return c.json(
    logs.map((l) => ({
      jenis: (l.jenis as "absensi" | "siswa" | "izin" | "jadwal" | "laporan") || "absensi",
      judul: l.judul,
      deskripsi: l.deskripsi,
      waktu: l.waktu,
    })),
    200
  );
});

/**
 * 4. GET /api/v1/dashboard/ringkasan-absensi
 */
export const getRingkasanAbsensiRoute = createRoute({
  method: "get",
  path: "/ringkasan-absensi",
  tags: [API_TAGS.ADMIN],
  summary: "Get Today's Attendance Summary",
  description: "Returns today's high-level attendance recap for all classes from PostgreSQL",
  responses: {
    200: {
      description: "Summary retrieved successfully",
      content: {
        "application/json": {
          schema: z.object({
            total_siswa: z.number(),
            total_kelas: z.number(),
            tanggal: z.string(),
            hadir: z.number(),
            izin: z.number(),
            sakit: z.number(),
            alpha: z.number(),
          }),
        },
      },
    },
  },
});

dashboardRouter.openapi(getRingkasanAbsensiRoute, async (c) => {
  const stats = await computeSchoolAttendanceSummary();
  return c.json(
    {
      total_siswa: stats.total_siswa,
      total_kelas: stats.total_kelas,
      tanggal: formatIndonesianDate(),
      hadir: stats.hadir,
      izin: stats.izin,
      sakit: stats.sakit,
      alpha: stats.alpha,
    },
    200
  );
});
