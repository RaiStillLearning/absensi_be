import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { API_TAGS } from "../../shared/constants";
import { store } from "../../shared/data/store";

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
      description: "Attendance records and summary retrieved successfully",
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

absensiAdminRouter.openapi(getMonitoringAbsensiRoute, (c) => {
  const { kelas, cari_siswa, halaman, jumlah_per_halaman } = c.req.valid("query");
  let list = store.absensi;

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
      ringkasan: store.ringkasanAbsensi,
      absensi: list,
    },
    200
  );
});

