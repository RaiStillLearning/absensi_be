import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { API_TAGS } from "../../shared/constants";
import { store } from "../../shared/data/store";
import { successResponse } from "../../shared/utils/response";

export const dashboardRouter = new OpenAPIHono();

/**
 * 1. GET /api/v1/dashboard/stats
 */
export const getStatsRoute = createRoute({
  method: "get",
  path: "/stats",
  tags: [API_TAGS.ADMIN, API_TAGS.GENERAL],
  summary: "Get Dashboard Statistics Summary",
  description: "Returns summary counts for students, teachers, classes, and attendance percentage",
  responses: {
    200: {
      description: "Dashboard stats retrieved successfully",
      content: {
        "application/json": {
          schema: z.object({
            total_siswa: z.number().openapi({ example: 320 }),
            total_guru: z.number().openapi({ example: 28 }),
            total_kelas: z.number().openapi({ example: 12 }),
            kehadiran_hari_ini: z.number().openapi({ example: 94 }),
            kenaikan_kehadiran: z.number().openapi({ example: 2 }),
          }),
        },
      },
    },
  },
});

dashboardRouter.openapi(getStatsRoute, (c) => {
  return c.json(store.dashboardStats, 200);
});

/**
 * 2. GET /api/v1/dashboard/rekap-kehadiran
 */
export const getRekapKehadiranRoute = createRoute({
  method: "get",
  path: "/rekap-kehadiran",
  tags: [API_TAGS.ADMIN],
  summary: "Get 5-Day Attendance Recap",
  description: "Returns 5-day daily attendance chart data (hadir, izin, sakit, alpha)",
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

dashboardRouter.openapi(getRekapKehadiranRoute, (c) => {
  return c.json(store.rekapKehadiran5Hari, 200);
});

/**
 * 3. GET /api/v1/dashboard/aktivitas-terbaru
 */
export const getAktivitasTerbaruRoute = createRoute({
  method: "get",
  path: "/aktivitas-terbaru",
  tags: [API_TAGS.ADMIN],
  summary: "Get Recent System Activities",
  description: "Returns recent school activity logs",
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

dashboardRouter.openapi(getAktivitasTerbaruRoute, (c) => {
  return c.json(store.aktivitasTerbaru, 200);
});

/**
 * 4. GET /api/v1/dashboard/ringkasan-absensi
 */
export const getRingkasanAbsensiRoute = createRoute({
  method: "get",
  path: "/ringkasan-absensi",
  tags: [API_TAGS.ADMIN],
  summary: "Get Today's Attendance Summary",
  description: "Returns today's high-level attendance recap for all classes",
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

dashboardRouter.openapi(getRingkasanAbsensiRoute, (c) => {
  return c.json(store.ringkasanAbsensi, 200);
});

