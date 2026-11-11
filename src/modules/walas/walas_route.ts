import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { API_TAGS } from "../../shared/constants";
import { store } from "../../shared/data/store";
import { ErrorResponseSchema } from "../../shared/types/api";

export const walasRouter = new OpenAPIHono();

export const WalasProfileSchema = z
  .object({
    id: z.string().openapi({ example: "5" }),
    nip: z.string().openapi({ example: "198905122015012008" }),
    nama_lengkap: z.string().openapi({ example: "Bu Rina Pratiwi, S.Pd." }),
    nama_panggilan: z.string().openapi({ example: "Bu Rina" }),
    peran: z.string().openapi({ example: "Guru" }),
    email: z.string().openapi({ example: "burina@ghamacaraka.sch.id" }),
    telepon: z.string().openapi({ example: "0812-3456-7890" }),
    jenis_kelamin: z.enum(["Laki-laki", "Perempuan"]).openapi({ example: "Perempuan" }),
    tanggal_lahir: z.string().openapi({ example: "12 Mei 1989" }),
    tempat_lahir: z.string().optional().openapi({ example: "Jakarta" }),
    mata_pelajaran: z.string().optional().openapi({ example: "Pemrograman Web" }),
    alamat: z.string().openapi({ example: "Depok, Jawa Barat" }),
    username: z.string().openapi({ example: "burina" }),
    status_akun: z.enum(["Aktif", "Non-Aktif"]).openapi({ example: "Aktif" }),
    isWalas: z.boolean().openapi({ example: true }),
    kelasWalas: z.string().openapi({ example: "X RPL 1" }),
    kelas_diampu: z.string().openapi({ example: "X RPL 1" }),
    jumlah_siswa: z.number().openapi({ example: 32 }),
    tahun_ajaran: z.string().openapi({ example: "2026/2027" }),
    foto_profil: z.string().optional(),
  })
  .openapi("WalasProfile");

export const SiswaHarianWalasItemSchema = z
  .object({
    no: z.number(),
    id: z.string(),
    nis: z.string(),
    nisn: z.string(),
    nama_siswa: z.string(),
    jam_masuk: z.string().optional(),
    status: z.enum(["Hadir", "Izin", "Sakit", "Alpa", "Tidak Hadir"]),
    keterangan: z.string(),
  })
  .openapi("SiswaHarianWalasItem");

export type SiswaHarianWalas = z.infer<typeof SiswaHarianWalasItemSchema>;

// Siswa Harian Walas synced with DataStore


/**
 * 1. GET /api/v1/walas/dashboard
 */
export const getWalasDashboardRoute = createRoute({
  method: "get",
  path: "/dashboard",
  tags: [API_TAGS.WALAS],
  summary: "Get Homeroom Teacher Dashboard",
  responses: {
    200: {
      description: "Homeroom dashboard retrieved",
      content: {
        "application/json": {
          schema: z.object({
            profile: WalasProfileSchema,
            rekap: z.object({
              hadir: z.number(),
              izin: z.number(),
              sakit: z.number(),
              alfa: z.number(),
              total_siswa: z.number(),
              persentase: z.number(),
            }),
          }),
        },
      },
    },
  },
});

walasRouter.openapi(getWalasDashboardRoute, (c) => {
  const guru = store.guru.find((g) => g.id === 5) || store.guru[0];
  const countHadir = store.walasSiswaList.filter((s) => s.status === "Hadir").length;
  const countIzin = store.walasSiswaList.filter((s) => s.status === "Izin").length;
  const countSakit = store.walasSiswaList.filter((s) => s.status === "Sakit").length;
  const countAlfa = store.walasSiswaList.filter((s) => s.status === "Tidak Hadir" || s.status === "Alpa").length;
  const total = store.walasSiswaList.length;
  const persentase = total > 0 ? Math.round((countHadir / total) * 100) : 0;

  return c.json(
    {
      profile: {
        id: String(guru?.id ?? "5"),
        nip: guru?.nip ?? "198905122015012008",
        nama_lengkap: guru?.nama_guru ?? "Bu Rina Pratiwi, S.Pd.",
        nama_panggilan: "Bu Rina",
        peran: "Guru",
        email: guru?.email ?? "burina@ghamacaraka.sch.id",
        telepon: guru?.nomor_telepon ?? "0812-3456-7890",
        jenis_kelamin: "Perempuan" as const,
        tanggal_lahir: "12 Mei 1989",
        tempat_lahir: "Jakarta",
        mata_pelajaran: guru?.mata_pelajaran ?? "Pemrograman Web",
        alamat: "Depok, Jawa Barat",
        username: guru?.nip || "burina",
        status_akun: "Aktif" as const,
        isWalas: true,
        kelasWalas: guru?.kelasWalas || guru?.kelas_walas || "X RPL 1",
        kelas_diampu: guru?.kelasWalas || guru?.kelas_walas || "X RPL 1",
        jumlah_siswa: total,
        tahun_ajaran: "2026/2027",
        foto_profil: "",
      },
      rekap: {
        hadir: countHadir,
        izin: countIzin,
        sakit: countSakit,
        alfa: countAlfa,
        total_siswa: total,
        persentase,
      },
    },
    200
  );
});

/**
 * 2. GET /api/v1/walas/monitoring
 */
export const getWalasMonitoringRoute = createRoute({
  method: "get",
  path: "/monitoring",
  tags: [API_TAGS.WALAS],
  summary: "Get Homeroom Daily Class Attendance Monitoring",
  request: {
    query: z.object({
      tanggal: z.string().optional().default("2026-06-05"),
      status: z.string().optional().default("Semua"),
      cari: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "Monitoring list and stats",
      content: {
        "application/json": {
          schema: z.object({
            tanggal: z.string(),
            siswa: z.array(SiswaHarianWalasItemSchema),
            statistik: z.object({
              total: z.number(),
              hadir: z.number(),
              izin: z.number(),
              sakit: z.number(),
              alpa: z.number(),
              persentase: z.number(),
            }),
          }),
        },
      },
    },
  },
});

walasRouter.openapi(getWalasMonitoringRoute, (c) => {
  const { tanggal, status, cari } = c.req.valid("query");
  let filtered = store.walasSiswaList;

  if (status && status !== "Semua") {
    filtered = filtered.filter((s) => s.status === status);
  }

  if (cari) {
    const q = cari.toLowerCase();
    filtered = filtered.filter(
      (s) => s.nama_siswa.toLowerCase().includes(q) || s.nisn.includes(q) || s.nis.includes(q)
    );
  }

  const countHadir = store.walasSiswaList.filter((s) => s.status === "Hadir").length;
  const countIzin = store.walasSiswaList.filter((s) => s.status === "Izin").length;
  const countSakit = store.walasSiswaList.filter((s) => s.status === "Sakit").length;
  const countAlpa = store.walasSiswaList.filter((s) => s.status === "Tidak Hadir" || s.status === "Alpa").length;
  const total = store.walasSiswaList.length;
  const persentase = total > 0 ? Math.round((countHadir / total) * 100) : 0;

  return c.json(
    {
      tanggal,
      siswa: filtered,
      siswa_list: filtered,
      statistik: {
        total,
        hadir: countHadir,
        izin: countIzin,
        sakit: countSakit,
        alpa: countAlpa,
        persentase,
      },
      ringkasan: {
        total_siswa: total,
        hadir: countHadir,
        izin: countIzin,
        sakit: countSakit,
        alpa: countAlpa,
        persentase,
      },
    },
    200
  );
});

/**
 * 3. PUT /api/v1/walas/monitoring/siswa/:id
 */
export const updateWalasStudentStatusRoute = createRoute({
  method: "put",
  path: "/monitoring/siswa/:id",
  tags: [API_TAGS.WALAS],
  summary: "Update Homeroom Student Daily Attendance Status",
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            status: z.enum(["Hadir", "Izin", "Sakit", "Alpa", "Tidak Hadir"]),
            keterangan: z.string().optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Student status updated",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
            data: SiswaHarianWalasItemSchema,
          }),
        },
      },
    },
    404: {
      description: "Student not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

walasRouter.openapi(updateWalasStudentStatusRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { status, keterangan } = c.req.valid("json");
  const index = store.walasSiswaList.findIndex((s) => s.id === id);
  if (index === -1) {
    return c.json({ success: false, message: "Siswa tidak ditemukan" }, 404);
  }
  const existing = store.walasSiswaList[index]!;
  const updatedItem: SiswaHarianWalas = {
    no: existing.no,
    id: existing.id,
    nis: existing.nis,
    nisn: existing.nisn,
    nama_siswa: existing.nama_siswa,
    jam_masuk: existing.jam_masuk,
    status,
    keterangan: keterangan || (status === "Hadir" ? "Tepat waktu" : "-"),
  };
  store.walasSiswaList[index] = updatedItem;
  store.persist();
  return c.json(
    {
      success: true,
      message: `Data kehadiran "${updatedItem.nama_siswa}" berhasil diubah.`,
      data: updatedItem,
    },
    200
  );
});

/**
 * 4. DELETE /api/v1/walas/monitoring/siswa/:id
 */
export const deleteWalasStudentRoute = createRoute({
  method: "delete",
  path: "/monitoring/siswa/:id",
  tags: [API_TAGS.WALAS],
  summary: "Remove Student from Daily Homeroom Attendance",
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Student removed",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
    },
  },
});

walasRouter.openapi(deleteWalasStudentRoute, (c) => {
  const { id } = c.req.valid("param");
  store.walasSiswaList = store.walasSiswaList.filter((s) => s.id !== id);
  store.persist();
  return c.json({ success: true, message: "Data siswa berhasil dihapus." }, 200);
});

/**
 * 5. GET /api/v1/walas/rekap/bulan-ini
 */
export const getWalasRekapBulanIniRoute = createRoute({
  method: "get",
  path: "/rekap/bulan-ini",
  tags: [API_TAGS.WALAS],
  summary: "Get Monthly Attendance Recap for Homeroom Class",
  responses: {
    200: {
      description: "Monthly recap data",
      content: {
        "application/json": {
          schema: z.object({
            rekap: z.object({
              hadir: z.number(),
              izin: z.number(),
              sakit: z.number(),
              alfa: z.number(),
              total_siswa: z.number(),
              persentase: z.number(),
            }),
            siswa_list: z.array(
              z.object({
                no: z.number(),
                id: z.string(),
                nisn: z.string(),
                nama_siswa: z.string(),
                hadir: z.number(),
                izin: z.number(),
                sakit: z.number(),
                alpa: z.number(),
                persentase: z.number(),
              })
            ),
          }),
        },
      },
    },
  },
});

walasRouter.openapi(getWalasRekapBulanIniRoute, (c) => {
  const siswaList = store.walasSiswaList.map((s, idx) => ({
    no: idx + 1,
    id: `rkw-${s.id}`,
    nisn: s.nisn,
    nama_siswa: s.nama_siswa,
    hadir: s.status === "Hadir" ? 1 : 0,
    izin: s.status === "Izin" ? 1 : 0,
    sakit: s.status === "Sakit" ? 1 : 0,
    alpa: s.status === "Tidak Hadir" || s.status === "Alpa" ? 1 : 0,
    persentase: s.status === "Hadir" ? 100 : 0,
  }));
  const total = siswaList.length;
  const countHadir = siswaList.reduce((acc, s) => acc + s.hadir, 0);
  const countIzin = siswaList.reduce((acc, s) => acc + s.izin, 0);
  const countSakit = siswaList.reduce((acc, s) => acc + s.sakit, 0);
  const countAlfa = siswaList.reduce((acc, s) => acc + s.alpa, 0);
  const persentase = total > 0 ? Math.round((countHadir / total) * 100) : 0;

  return c.json(
    {
      rekap: {
        hadir: countHadir,
        izin: countIzin,
        sakit: countSakit,
        alfa: countAlfa,
        total_siswa: total,
        persentase,
      },
      siswa_list: siswaList,
    },
    200
  );
});

/**
 * 6. POST /api/v1/walas/absensi/simpan
 */
export const saveWalasAbsensiRoute = createRoute({
  method: "post",
  path: "/absensi/simpan",
  tags: [API_TAGS.WALAS],
  summary: "Save Homeroom Daily Attendance Session",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            kelas: z.string(),
            tanggal: z.string(),
            siswa: z.array(SiswaHarianWalasItemSchema),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Homeroom attendance saved",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
    },
  },
});

walasRouter.openapi(saveWalasAbsensiRoute, async (c) => {
  const { kelas, tanggal, siswa } = c.req.valid("json");
  store.walasSiswaList = siswa;
  store.persist();
  return c.json(
    {
      success: true,
      message: `Data absensi kelas ${kelas} tanggal ${tanggal} berhasil disimpan!`,
    },
    200
  );
});
