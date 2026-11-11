import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { API_TAGS } from "../../shared/constants";
import { store } from "../../shared/data/store";
import { ErrorResponseSchema } from "../../shared/types/api";

export const guruRouter = new OpenAPIHono();

export const GuruItemSchema = z
  .object({
    id: z.number().openapi({ example: 5 }),
    nama_guru: z.string().openapi({ example: "Bu Rina Pratiwi, S.Pd." }),
    mata_pelajaran: z.string().openapi({ example: "Pemrograman Web" }),
    nip: z.string().optional().openapi({ example: "198905122015012008" }),
    email: z.string().optional().openapi({ example: "burina@ghamacaraka.sch.id" }),
    nomor_telepon: z.string().optional().openapi({ example: "0812-3456-7890" }),
    is_walas: z.boolean().default(false),
    kelas_walas: z.string().default(""),
    isWalas: z.boolean().optional(),
    kelasWalas: z.string().optional(),
  })
  .openapi("GuruItem");

export const CreateGuruPayloadSchema = z
  .object({
    nama_guru: z.string().min(1, "Nama guru wajib diisi"),
    mata_pelajaran: z.string().min(1, "Mata pelajaran wajib diisi"),
    nip: z.string().optional(),
    email: z.string().optional(),
    nomor_telepon: z.string().optional(),
    is_walas: z.boolean().optional(),
    kelas_walas: z.string().optional(),
    isWalas: z.boolean().optional(),
    kelasWalas: z.string().optional(),
  })
  .openapi("CreateGuruPayload");

export const UpdateGuruPayloadSchema = CreateGuruPayloadSchema.partial().openapi("UpdateGuruPayload");

export const SiswaAbsensiItemSchema = z
  .object({
    no: z.coerce.number().optional(),
    id: z.string().openapi({ example: "xrpl1-1" }),
    nama_siswa: z.string().openapi({ example: "Ahmad Rizky Pratama" }),
    nisn: z.string().openapi({ example: "1234567891" }),
    status: z.enum(["Hadir", "Izin", "Sakit", "Alpa"]).openapi({ example: "Hadir" }),
    catatan: z.string().optional(),
  })
  .openapi("SiswaAbsensiItem");

export const GuruProfileSchema = z
  .object({
    id: z.string().openapi({ example: "5" }),
    nip: z.string().openapi({ example: "198905122015012008" }),
    nama_lengkap: z.string().openapi({ example: "Bu Rina Pratiwi, S.Pd." }),
    nama_panggilan: z.string().optional().openapi({ example: "Bu Rina" }),
    peran: z.string().openapi({ example: "Guru" }),
    email: z.string().openapi({ example: "burina@ghamacaraka.sch.id" }),
    telepon: z.string().openapi({ example: "0812-3456-7890" }),
    jenis_kelamin: z.enum(["Laki-laki", "Perempuan"]).openapi({ example: "Perempuan" }),
    tanggal_lahir: z.string().optional().openapi({ example: "12 Mei 1989" }),
    tempat_lahir: z.string().optional().openapi({ example: "Jakarta" }),
    alamat: z.string().openapi({ example: "Depok, Jawa Barat" }),
    mata_pelajaran: z.string().openapi({ example: "Pemrograman Web" }),
    kelas_diajar: z.array(z.string()).openapi({ example: ["X RPL 1", "XI RPL 1", "XII RPL 1"] }),
    isWalas: z.boolean().openapi({ example: true }),
    kelasWalas: z.string().openapi({ example: "X RPL 1" }),
    kelas_diampu: z.string().openapi({ example: "X RPL 1" }),
    jumlah_siswa: z.number().openapi({ example: 32 }),
    status_akun: z.enum(["Aktif", "Non-Aktif"]).openapi({ example: "Aktif" }),
    tahun_ajaran: z.string().openapi({ example: "2026/2027" }),
    foto_profil: z.string().optional(),
  })
  .openapi("GuruProfile");

// In-memory Profile of Bu Rina (default teacher)
let teacherProfile = {
  id: "5",
  nip: "198905122015012008",
  nama_lengkap: "Bu Rina Pratiwi, S.Pd.",
  nama_panggilan: "Bu Rina",
  peran: "Guru",
  email: "burina@ghamacaraka.sch.id",
  telepon: "0812-3456-7890",
  jenis_kelamin: "Perempuan" as "Laki-laki" | "Perempuan",
  tempat_lahir: "Jakarta",
  tanggal_lahir: "12 Mei 1989",
  alamat: "Depok, Jawa Barat",
  mata_pelajaran: "Pemrograman Web",
  kelas_diajar: ["X RPL 1", "XI RPL 1", "XII RPL 1"],
  isWalas: true,
  kelasWalas: "X RPL 1",
  kelas_diampu: "X RPL 1",
  jumlah_siswa: 32,
  status_akun: "Aktif" as "Aktif" | "Non-Aktif",
  tahun_ajaran: "2026/2027",
  foto_profil: "",
};

/**
 * 1. GET /api/v1/guru
 */
export const listGuruRoute = createRoute({
  method: "get",
  path: "/",
  tags: [API_TAGS.ADMIN, API_TAGS.GURU],
  summary: "List All Teachers",
  description: "Returns master list of teachers with subject and homeroom class roles",
  responses: {
    200: {
      description: "List of teachers retrieved",
      content: {
        "application/json": {
          schema: z.array(GuruItemSchema),
        },
      },
    },
  },
});

guruRouter.openapi(listGuruRoute, (c) => {
  const result = store.guru.map((g) => {
    const isWalas = Boolean(g.isWalas ?? g.is_walas);
    const kelasWalas = g.kelasWalas ?? g.kelas_walas ?? "";
    return {
      ...g,
      is_walas: isWalas,
      kelas_walas: kelasWalas,
      isWalas,
      kelasWalas,
    };
  });
  return c.json(result, 200);
});

/**
 * 2. POST /api/v1/guru
 */
export const createGuruRoute = createRoute({
  method: "post",
  path: "/",
  tags: [API_TAGS.ADMIN],
  summary: "Create New Teacher",
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateGuruPayloadSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      description: "Teacher created successfully",
      content: {
        "application/json": {
          schema: GuruItemSchema,
        },
      },
    },
    400: {
      description: "Validation error",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

guruRouter.openapi(createGuruRoute, async (c) => {
  const body = c.req.valid("json");
  const newId = store.guru.length > 0 ? Math.max(...store.guru.map((g) => g.id)) + 1 : 1;
  const isWalas = Boolean(body.isWalas ?? body.is_walas);
  const kelasWalas = body.kelasWalas ?? body.kelas_walas ?? "";
  const newGuru = {
    id: newId,
    nama_guru: body.nama_guru,
    mata_pelajaran: body.mata_pelajaran,
    nip: body.nip,
    email: body.email,
    nomor_telepon: body.nomor_telepon,
    is_walas: isWalas,
    kelas_walas: kelasWalas,
    isWalas,
    kelasWalas,
  };
  store.guru.push(newGuru);
  store.persist();
  return c.json(newGuru, 201);
});

/**
 * 3. GET /api/v1/guru/profil
 */
export const getGuruProfileRoute = createRoute({
  method: "get",
  path: "/profil",
  tags: [API_TAGS.GURU, API_TAGS.WALAS],
  summary: "Get Current Teacher Profile",
  description: "Returns profile details for teacher / homeroom teacher",
  responses: {
    200: {
      description: "Teacher profile retrieved",
      content: {
        "application/json": {
          schema: GuruProfileSchema,
        },
      },
    },
  },
});

guruRouter.openapi(getGuruProfileRoute, (c) => {
  const rina = store.guru.find((g) => g.id === 5);
  if (rina) {
    teacherProfile.nama_lengkap = rina.nama_guru;
    teacherProfile.nip = rina.nip || teacherProfile.nip;
    teacherProfile.email = rina.email || teacherProfile.email;
    teacherProfile.telepon = rina.nomor_telepon || teacherProfile.telepon;
    teacherProfile.mata_pelajaran = rina.mata_pelajaran || teacherProfile.mata_pelajaran;
    teacherProfile.isWalas = Boolean(rina.isWalas ?? rina.is_walas);
    teacherProfile.kelasWalas = rina.kelasWalas ?? rina.kelas_walas ?? "";
    teacherProfile.kelas_diampu = teacherProfile.kelasWalas;
  }
  return c.json(teacherProfile, 200);
});

/**
 * 4. PUT /api/v1/guru/profil
 */
export const updateGuruProfileRoute = createRoute({
  method: "put",
  path: "/profil",
  tags: [API_TAGS.GURU, API_TAGS.WALAS],
  summary: "Update Current Teacher Profile",
  request: {
    body: {
      content: {
        "application/json": {
          schema: GuruProfileSchema.partial(),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Teacher profile updated",
      content: {
        "application/json": {
          schema: GuruProfileSchema,
        },
      },
    },
  },
});

guruRouter.openapi(updateGuruProfileRoute, async (c) => {
  const body = c.req.valid("json");
  teacherProfile = {
    ...teacherProfile,
    ...body,
  };
  const rinaIdx = store.guru.findIndex((g) => g.id === 5);
  if (rinaIdx !== -1) {
    const existing = store.guru[rinaIdx]!;
    store.guru[rinaIdx] = {
      ...existing,
      nama_guru: teacherProfile.nama_lengkap,
      nip: teacherProfile.nip,
      email: teacherProfile.email,
      nomor_telepon: teacherProfile.telepon,
      mata_pelajaran: teacherProfile.mata_pelajaran,
    };
    store.persist();
  }
  return c.json(teacherProfile, 200);
});

/**
 * 5. GET /api/v1/guru/dashboard
 */
export const getGuruDashboardRoute = createRoute({
  method: "get",
  path: "/dashboard",
  tags: [API_TAGS.GURU],
  summary: "Get Teacher Dashboard Overview",
  responses: {
    200: {
      description: "Teacher dashboard retrieved",
      content: {
        "application/json": {
          schema: z.object({
            guru: GuruProfileSchema,
            kelas_aktif: z.object({
              id: z.string(),
              nama_kelas: z.string(),
              jurusan: z.string(),
              mata_pelajaran: z.string(),
              tanggal: z.string(),
              jam: z.string(),
              status: z.string(),
            }),
            rekap: z.object({
              hadir: z.number(),
              izin: z.number(),
              sakit: z.number(),
              alpa: z.number(),
              total: z.number(),
            }),
          }),
        },
      },
    },
  },
});

guruRouter.openapi(getGuruDashboardRoute, (c) => {
  return c.json(
    {
      guru: teacherProfile,
      kelas_aktif: {
        id: "kls-1",
        nama_kelas: "X RPL 1",
        jurusan: "Rekayasa Perangkat Lunak",
        mata_pelajaran: teacherProfile.mata_pelajaran,
        tanggal: "19/10/2026",
        jam: "10:30",
        status: "Aktif",
      },
      rekap: {
        hadir: 24,
        izin: 4,
        sakit: 4,
        alpa: 0,
        total: 32,
      },
    },
    200
  );
});

/**
 * 6. GET /api/v1/guru/absensi
 */
export const getGuruAbsensiSesiRoute = createRoute({
  method: "get",
  path: "/absensi",
  tags: [API_TAGS.GURU],
  summary: "Get Student Attendance for Class/Subject Session",
  request: {
    query: z.object({
      kelas: z.string().optional().default("X RPL 1"),
      mapel: z.string().optional().default("Pemrograman Web"),
      tanggal: z.string().optional().default("2026-06-06"),
    }),
  },
  responses: {
    200: {
      description: "Student attendance session list",
      content: {
        "application/json": {
          schema: z.array(SiswaAbsensiItemSchema),
        },
      },
    },
  },
});

guruRouter.openapi(getGuruAbsensiSesiRoute, (c) => {
  const { kelas, mapel, tanggal } = c.req.valid("query");
  const list = store.getAbsensiSesi(kelas, mapel, tanggal);
  return c.json(list, 200);
});

/**
 * 7. POST /api/v1/guru/absensi/simpan
 */
export const saveGuruAbsensiSesiRoute = createRoute({
  method: "post",
  path: "/absensi/simpan",
  tags: [API_TAGS.GURU],
  summary: "Save Student Attendance for Class/Subject Session",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            kelas: z.string(),
            mapel: z.string(),
            tanggal: z.string(),
            siswa: z.array(SiswaAbsensiItemSchema).optional(),
            siswa_list: z.array(SiswaAbsensiItemSchema).optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Attendance session saved successfully",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
            data: z.array(SiswaAbsensiItemSchema),
          }),
        },
      },
    },
  },
});

guruRouter.openapi(saveGuruAbsensiSesiRoute, async (c) => {
  const body = c.req.valid("json");
  const kelas = body.kelas;
  const mapel = body.mapel;
  const tanggal = body.tanggal;
  const rawList = body.siswa || body.siswa_list || [];
  const cleanList = rawList.map((item, idx) => ({
    ...item,
    no: item.no ?? idx + 1,
  }));
  store.saveAbsensiSesi(kelas, mapel, tanggal, cleanList);
  return c.json(
    {
      success: true,
      message: `Data absensi kelas ${kelas} (${mapel}) berhasil disimpan!`,
      data: cleanList,
    },
    200
  );
});

export const patchGuruAbsensiStudentRoute = createRoute({
  method: "patch",
  path: "/absensi/:id",
  tags: [API_TAGS.GURU],
  summary: "Update Student Attendance in Subject Session via Patch",
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            status: z.enum(["Hadir", "Izin", "Sakit", "Alpa"]),
            kelas: z.string().optional().default("X RPL 1"),
            mapel: z.string().optional().default("Pemrograman Web"),
            tanggal: z.string().optional().default("2026-06-06"),
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
          }),
        },
      },
    },
  },
});

guruRouter.openapi(patchGuruAbsensiStudentRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { status, kelas, mapel, tanggal } = c.req.valid("json");
  store.updateStudentStatus(kelas, mapel, tanggal, id, status);
  return c.json(
    {
      success: true,
      message: `Status siswa berhasil diubah menjadi ${status}`,
    },
    200
  );
});

/**
 * 8. PUT /api/v1/guru/absensi/status
 */
export const updateGuruAbsensiStatusRoute = createRoute({
  method: "put",
  path: "/absensi/status",
  tags: [API_TAGS.GURU],
  summary: "Update Individual Student Attendance Status",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            kelas: z.string(),
            mapel: z.string(),
            tanggal: z.string(),
            siswa_id: z.string(),
            status: z.enum(["Hadir", "Izin", "Sakit", "Alpa"]),
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
          }),
        },
      },
    },
  },
});

guruRouter.openapi(updateGuruAbsensiStatusRoute, async (c) => {
  const { kelas, mapel, tanggal, siswa_id, status } = c.req.valid("json");
  store.updateStudentStatus(kelas, mapel, tanggal, siswa_id, status);
  return c.json(
    {
      success: true,
      message: `Status siswa berhasil diubah menjadi ${status}`,
    },
    200
  );
});

/**
 * 9. DELETE /api/v1/guru/absensi/:id
 */
export const deleteGuruAbsensiStudentRoute = createRoute({
  method: "delete",
  path: "/absensi/:id",
  tags: [API_TAGS.GURU],
  summary: "Remove Student From Subject Attendance Session",
  request: {
    params: z.object({
      id: z.string(),
    }),
    query: z.object({
      kelas: z.string().optional().default("X RPL 1"),
      mapel: z.string().optional().default("Pemrograman Web"),
      tanggal: z.string().optional().default("2026-06-06"),
    }),
  },
  responses: {
    200: {
      description: "Student removed from session",
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

guruRouter.openapi(deleteGuruAbsensiStudentRoute, (c) => {
  const { id } = c.req.valid("param");
  const { kelas, mapel, tanggal } = c.req.valid("query");
  store.deleteStudentFromSession(kelas, mapel, tanggal, id);
  return c.json(
    {
      success: true,
      message: "Data siswa berhasil dihapus dari sesi absensi",
    },
    200
  );
});

/**
 * 10. GET /api/v1/guru/rekap
 */
export const getGuruRekapRoute = createRoute({
  method: "get",
  path: "/rekap",
  tags: [API_TAGS.GURU],
  summary: "Get Attendance Recapitulation for Subject Session",
  request: {
    query: z.object({
      kelas: z.string().optional().default("X RPL 1"),
      mapel: z.string().optional().default("Pemrograman Web"),
      tanggal: z.string().optional().default("2026-06-06"),
    }),
  },
  responses: {
    200: {
      description: "Recapitulation report data",
      content: {
        "application/json": {
          schema: z.object({
            kelas: z.string(),
            mata_pelajaran: z.string(),
            tanggal: z.string(),
            total_siswa: z.number(),
            total_hadir: z.number(),
            total_izin: z.number(),
            total_sakit: z.number(),
            total_alfa: z.number(),
            persentase_kehadiran: z.number(),
            rows: z.array(
              z.object({
                no: z.number(),
                id: z.string(),
                nama_siswa: z.string(),
                nisn: z.string(),
                hadir: z.number(),
                izin: z.number(),
                sakit: z.number(),
                alfa: z.number(),
                persentase: z.number(),
              })
            ),
          }),
        },
      },
    },
  },
});

guruRouter.openapi(getGuruRekapRoute, (c) => {
  const { kelas, mapel, tanggal } = c.req.valid("query");
  const rawSiswa = store.getAbsensiSesi(kelas, mapel, tanggal);
  const rows = rawSiswa.map((item, index) => {
    const hadir = item.status === "Hadir" ? 1 : 0;
    const izin = item.status === "Izin" ? 1 : 0;
    const sakit = item.status === "Sakit" ? 1 : 0;
    const alfa = item.status === "Alpa" ? 1 : 0;
    const persentase = hadir > 0 ? 100 : 0;
    return {
      no: index + 1,
      id: `rk-${item.id}`,
      nama_siswa: item.nama_siswa,
      nisn: item.nisn,
      hadir,
      izin,
      sakit,
      alfa,
      persentase,
    };
  });
  const total_siswa = rows.length;
  const total_hadir = rows.reduce((acc, curr) => acc + curr.hadir, 0);
  const total_izin = rows.reduce((acc, curr) => acc + curr.izin, 0);
  const total_sakit = rows.reduce((acc, curr) => acc + curr.sakit, 0);
  const total_alfa = rows.reduce((acc, curr) => acc + curr.alfa, 0);
  const persentase_kehadiran = total_siswa > 0 ? Math.round((total_hadir / total_siswa) * 100) : 0;

  return c.json(
    {
      kelas,
      mata_pelajaran: mapel,
      tanggal,
      total_siswa,
      total_hadir,
      total_izin,
      total_sakit,
      total_alfa,
      persentase_kehadiran,
      rows,
    },
    200
  );
});

/**
 * 11. GET /api/v1/guru/:id
 */
export const getGuruByIdRoute = createRoute({
  method: "get",
  path: "/:id",
  tags: [API_TAGS.ADMIN],
  summary: "Get Teacher by ID",
  request: {
    params: z.object({
      id: z.coerce.number(),
    }),
  },
  responses: {
    200: {
      description: "Teacher details retrieved",
      content: {
        "application/json": {
          schema: GuruItemSchema,
        },
      },
    },
    404: {
      description: "Teacher not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

guruRouter.openapi(getGuruByIdRoute, (c) => {
  const { id } = c.req.valid("param");
  const item = store.guru.find((g) => g.id === id);
  if (!item) {
    return c.json({ success: false, message: `Guru dengan ID ${id} tidak ditemukan` }, 404);
  }
  const isWalas = Boolean(item.isWalas ?? item.is_walas);
  const kelasWalas = item.kelasWalas ?? item.kelas_walas ?? "";
  return c.json(
    {
      id: item.id,
      nama_guru: item.nama_guru,
      mata_pelajaran: item.mata_pelajaran,
      nip: item.nip,
      email: item.email,
      nomor_telepon: item.nomor_telepon,
      is_walas: isWalas,
      kelas_walas: kelasWalas,
      isWalas,
      kelasWalas,
    },
    200
  );
});

/**
 * 12. PUT /api/v1/guru/:id
 */
export const updateGuruRoute = createRoute({
  method: "put",
  path: "/:id",
  tags: [API_TAGS.ADMIN],
  summary: "Update Teacher by ID",
  request: {
    params: z.object({
      id: z.coerce.number(),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateGuruPayloadSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Teacher updated successfully",
      content: {
        "application/json": {
          schema: GuruItemSchema,
        },
      },
    },
    404: {
      description: "Teacher not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

guruRouter.openapi(updateGuruRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const index = store.guru.findIndex((g) => g.id === id);
  if (index === -1) {
    return c.json({ success: false, message: `Guru dengan ID ${id} tidak ditemukan` }, 404);
  }
  const existing = store.guru[index]!;
  const isWalas = typeof body.isWalas !== "undefined" ? body.isWalas : typeof body.is_walas !== "undefined" ? body.is_walas : existing.is_walas;
  const kelasWalas = typeof body.kelasWalas !== "undefined" ? body.kelasWalas : typeof body.kelas_walas !== "undefined" ? body.kelas_walas : existing.kelas_walas;
  const updated = {
    id,
    nama_guru: body.nama_guru ?? existing.nama_guru,
    mata_pelajaran: body.mata_pelajaran ?? existing.mata_pelajaran,
    nip: body.nip ?? existing.nip,
    email: body.email ?? existing.email,
    nomor_telepon: body.nomor_telepon ?? existing.nomor_telepon,
    is_walas: Boolean(isWalas),
    kelas_walas: kelasWalas || "",
    isWalas: Boolean(isWalas),
    kelasWalas: kelasWalas || "",
  };
  store.guru[index] = updated;
  store.persist();
  return c.json(updated, 200);
});

/**
 * 13. DELETE /api/v1/guru/:id
 */
export const deleteGuruRoute = createRoute({
  method: "delete",
  path: "/:id",
  tags: [API_TAGS.ADMIN],
  summary: "Delete Teacher by ID",
  request: {
    params: z.object({
      id: z.coerce.number(),
    }),
  },
  responses: {
    200: {
      description: "Teacher deleted successfully",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
    },
    404: {
      description: "Teacher not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

guruRouter.openapi(deleteGuruRoute, (c) => {
  const { id } = c.req.valid("param");
  const index = store.guru.findIndex((g) => g.id === id);
  if (index === -1) {
    return c.json({ success: false, message: `Guru dengan ID ${id} tidak ditemukan` }, 404);
  }
  store.guru.splice(index, 1);
  store.persist();
  return c.json({ success: true, message: `Guru berhasil dihapus` }, 200);
});
