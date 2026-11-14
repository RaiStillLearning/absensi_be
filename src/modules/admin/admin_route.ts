import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { db } from "../../config/database";
import { users } from "../../config/schema";
import { getAuthUser, requireAuth } from "../../middlewares/auth";
import { API_TAGS } from "../../shared/constants";
import { ErrorResponseSchema } from "../../shared/types/api";
import {
  deleteLocalAvatarIfOwned,
  validateProfilePhotoValue,
} from "../../shared/utils/upload";
import {
  checkNisnAvailability,
  createAdminStudent,
  executeManualPromotion,
  getAdminStudentDetail,
  listAdminStudents,
  listPromotionHistory,
  previewManualPromotion,
  runAutomaticPromotionJob,
  updateAdminStudent,
  uploadAdminStudentPhotoFile,
} from "./siswa_admin_service";

export const adminRouter = new OpenAPIHono();
adminRouter.use("/siswa", requireAuth(["admin"]));
adminRouter.use("/siswa/*", requireAuth(["admin"]));

export const AdminProfileSchema = z
  .object({
    nama_lengkap: z.string().openapi({ example: "Admin" }),
    username: z.string().openapi({ example: "admin" }),
    email: z.string().openapi({ example: "admin@sekolah.example" }),
    peran: z.string().openapi({ example: "Administrator" }),
    foto_profil: z.string().optional().openapi({ example: "" }),
  })
  .openapi("AdminProfile");

/**
 * 1. GET /api/v1/admin/profil
 */
export const getAdminProfileRoute = createRoute({
  method: "get",
  path: "/profil",
  tags: [API_TAGS.ADMIN],
  summary: "Get Administrator Profile",
  responses: {
    200: {
      description: "Admin profile retrieved",
      content: {
        "application/json": {
          schema: AdminProfileSchema,
        },
      },
    },
  },
});

adminRouter.openapi(getAdminProfileRoute, async (c) => {
  const authUser = getAuthUser(c);
  let adminUser: typeof users.$inferSelect | undefined;
  if (authUser?.sub) {
    [adminUser] = await db.select().from(users).where(eq(users.id, authUser.sub)).limit(1);
  }
  if (!adminUser) {
    [adminUser] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  }
  return c.json(
    {
      nama_lengkap: adminUser?.nama_lengkap || "Admin",
      username: adminUser?.username || "admin",
      email: adminUser?.email || "admin@sekolah.example",
      peran: "Administrator",
      foto_profil: adminUser?.foto_profil || "",
    },
    200
  );
});

/**
 * 2. PUT /api/v1/admin/profil
 */
export const updateAdminProfileRoute = createRoute({
  method: "put",
  path: "/profil",
  tags: [API_TAGS.ADMIN],
  summary: "Update Administrator Profile",
  request: {
    body: {
      content: {
        "application/json": {
          schema: AdminProfileSchema.partial(),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Admin profile updated",
      content: {
        "application/json": {
          schema: AdminProfileSchema,
        },
      },
    },
    400: {
      description: "Invalid profile photo",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

adminRouter.openapi(updateAdminProfileRoute, async (c) => {
  const body = c.req.valid("json");

  if (body.foto_profil !== undefined) {
    const validation = validateProfilePhotoValue(body.foto_profil);
    if (!validation.valid) {
      return c.json({ success: false, message: validation.error }, 400);
    }
  }

  const authUser = getAuthUser(c);
  let adminUser: typeof users.$inferSelect | undefined;
  if (authUser?.sub) {
    [adminUser] = await db.select().from(users).where(eq(users.id, authUser.sub)).limit(1);
  }
  if (!adminUser) {
    [adminUser] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  }

  if (adminUser) {
    const previousFoto = adminUser.foto_profil;
    const [updated] = await db
      .update(users)
      .set({
        nama_lengkap: body.nama_lengkap ?? adminUser.nama_lengkap,
        username: body.username ?? adminUser.username,
        email: body.email ?? adminUser.email,
        foto_profil: body.foto_profil ?? adminUser.foto_profil,
        updated_at: new Date(),
      })
      .where(eq(users.id, adminUser.id))
      .returning();

    if (
      body.foto_profil !== undefined &&
      previousFoto &&
      previousFoto !== body.foto_profil
    ) {
      await deleteLocalAvatarIfOwned(previousFoto);
    }

    return c.json(
      {
        nama_lengkap: updated?.nama_lengkap || "Admin",
        username: updated?.username || "admin",
        email: updated?.email || "admin@sekolah.example",
        peran: "Administrator",
        foto_profil: updated?.foto_profil || "",
      },
      200
    );
  }

  return c.json(
    {
      nama_lengkap: body.nama_lengkap || "Admin",
      username: body.username || "admin",
      email: body.email || "admin@sekolah.example",
      peran: "Administrator",
      foto_profil: body.foto_profil || "",
    },
    200
  );
});

/**
 * ============================================================================
 * MANAJEMEN SISWA (KHUSUS ADMIN)
 * ============================================================================
 */

export const PromotionHistoryItemSchema = z
  .object({
    id: z.string().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
    batch_id: z.string().nullable().openapi({ example: "550e8400-e29b-41d4-a716-446655440001" }),
    student_id: z.string().nullable().openapi({ example: "550e8400-e29b-41d4-a716-446655440002" }),
    nisn: z.string().openapi({ example: "0102641001" }),
    nama_siswa: z.string().openapi({ example: "Ahmad Rizky Pratama" }),
    kelas_sebelumnya: z.string().openapi({ example: "X RPL 1" }),
    kelas_tujuan: z.string().openapi({ example: "XI RPL 1" }),
    tahun_ajaran: z.string().openapi({ example: "2026/2027" }),
    jenis_proses: z.enum(["Otomatis", "Manual"]).openapi({ example: "Otomatis" }),
    executed_by: z.string().openapi({ example: "Admin" }),
    catatan: z.string().openapi({ example: "Kenaikan kelas reguler" }),
    tanggal_kenaikan: z.string().openapi({ example: "2026-06-30T00:00:00.000Z" }),
  })
  .openapi("PromotionHistoryItem");

export const PromotionHistoryResponseSchema = z
  .object({
    success: z.boolean().default(true),
    message: z.string().default("Riwayat kenaikan kelas berhasil diambil"),
    items: z.array(PromotionHistoryItemSchema),
    data: z.array(PromotionHistoryItemSchema),
    pagination: z.object({
      page: z.number().openapi({ example: 1 }),
      limit: z.number().openapi({ example: 15 }),
      total: z.number().openapi({ example: 32 }),
      total_pages: z.number().openapi({ example: 3 }),
    }),
  })
  .openapi("PromotionHistoryResponse");

// Alias: GET /api/v1/admin/riwayat-kenaikan
adminRouter.get("/riwayat-kenaikan", async (c) => {
  const search = c.req.query("search") || "";
  const nisn = c.req.query("nisn") || "";
  const jenis_proses = c.req.query("jenis_proses") || "";
  const tahun_ajaran = c.req.query("tahun_ajaran") || "";
  const kelas = c.req.query("kelas") || "";
  const page = Number(c.req.query("page") || 1);
  const limit = Number(c.req.query("limit") || 15);

  const result = await listPromotionHistory({
    search,
    nisn,
    jenis_proses,
    tahun_ajaran,
    kelas,
    page,
    limit,
  });

  return c.json(
    {
      success: true,
      message: "Riwayat kenaikan kelas berhasil diambil",
      items: result.items,
      data: result.items,
      pagination: result.pagination,
    },
    200
  );
});

/**
 * 4. GET /api/v1/admin/siswa/riwayat-kenaikan
 * Daftar riwayat kenaikan kelas seluruh siswa (Otomatis & Manual).
 */
export const getAdminPromotionHistoryRoute = createRoute({
  method: "get",
  path: "/siswa/riwayat-kenaikan",
  tags: [API_TAGS.ADMIN],
  summary: "Get All Students Promotion History",
  description:
    "Daftar riwayat kenaikan kelas seluruh siswa (Otomatis & Manual) dengan filter pencarian nama/NISN, jenis proses, tahun ajaran, kelas, dan pagination.",
  security: [{ BearerAuth: [] }],
  request: {
    query: z.object({
      search: z.string().optional(),
      nisn: z.string().optional(),
      jenis_proses: z.string().optional(),
      tahun_ajaran: z.string().optional(),
      kelas: z.string().optional(),
      page: z.coerce.number().optional().default(1),
      limit: z.coerce.number().optional().default(15),
    }),
  },
  responses: {
    200: {
      description: "Riwayat kenaikan kelas berhasil diambil",
      content: {
        "application/json": {
          schema: PromotionHistoryResponseSchema,
        },
      },
    },
  },
});

adminRouter.openapi(getAdminPromotionHistoryRoute, async (c) => {
  const { search, nisn, jenis_proses, tahun_ajaran, kelas, page, limit } = c.req.valid("query");

  const result = await listPromotionHistory({
    search,
    nisn,
    jenis_proses,
    tahun_ajaran,
    kelas,
    page,
    limit,
  });

  return c.json(
    {
      success: true,
      message: "Riwayat kenaikan kelas berhasil diambil",
      items: result.items,
      data: result.items,
      pagination: result.pagination,
    },
    200
  );
});

export const AdminStudentItemSchema = z
  .object({
    id: z.string().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
    nisn: z.string().openapi({ example: "0102641001" }),
    nama_lengkap: z.string().openapi({ example: "Ahmad Rizky Pratama" }),
    nama_siswa: z.string().optional().openapi({ example: "Ahmad Rizky Pratama" }),
    kelas: z.string().openapi({ example: "X RPL 1" }),
    jurusan: z.string().openapi({ example: "Rekayasa Perangkat Lunak" }),
    jenis_kelamin: z.string().optional().openapi({ example: "Laki-laki" }),
    status_siswa: z.enum(["Aktif", "Lulus"]).openapi({ example: "Aktif" }),
    status: z.enum(["Aktif", "Lulus"]).openapi({ example: "Aktif" }),
    foto_profil: z.string().openapi({ example: "/avatar-student.svg" }),
    tingkat: z.string().openapi({ example: "10" }),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .openapi("AdminStudentItem");

export const AdminStudentsListResponseSchema = z
  .object({
    items: z.array(AdminStudentItemSchema),
    available_classes: z.array(z.string()),
    pagination: z.object({
      page: z.number().openapi({ example: 1 }),
      limit: z.number().openapi({ example: 10 }),
      total: z.number().openapi({ example: 32 }),
      total_pages: z.number().openapi({ example: 4 }),
    }),
    summary: z.object({
      total_siswa: z.number().openapi({ example: 32 }),
      total_aktif: z.number().openapi({ example: 32 }),
      total_lulus: z.number().openapi({ example: 0 }),
    }),
  })
  .openapi("AdminStudentsListResponse");

export const CheckNisnResponseSchema = z
  .object({
    valid: z.boolean().openapi({ example: true }),
    available: z.boolean().openapi({ example: true }),
    nisn: z.string().openapi({ example: "0102641001" }),
    message: z.string().openapi({ example: "NISN tersedia dan dapat digunakan" }),
  })
  .openapi("CheckNisnResponse");

export const CreateAdminStudentPayloadSchema = z
  .object({
    nisn: z.string().min(4).max(20).openapi({ example: "0102641001" }),
    nama_lengkap: z.string().min(2).max(150).openapi({ example: "Ahmad Rizky Pratama" }),
    kelas: z.string().min(1).openapi({ example: "X RPL 1" }),
    jurusan: z.string().optional().openapi({ example: "Rekayasa Perangkat Lunak" }),
    foto_profil: z.string().optional(),
    jenis_kelamin: z.string().optional().openapi({ example: "Laki-laki" }),
  })
  .openapi("CreateAdminStudentPayload");

export const UpdateAdminStudentPayloadSchema = z
  .object({
    nama_lengkap: z.string().min(2).max(150).openapi({ example: "Ahmad Rizky Pratama" }),
    kelas: z.string().min(1).openapi({ example: "XI RPL 1" }),
    jurusan: z.string().optional().openapi({ example: "Rekayasa Perangkat Lunak" }),
    foto_profil: z.string().optional(),
  })
  .openapi("UpdateAdminStudentPayload");

export const AdminStudentDetailResponseSchema = z
  .object({
    siswa: AdminStudentItemSchema,
    kartu: z.object({
      nama_sekolah: z.string().openapi({ example: "SMK Ghama Caraka" }),
      barcode_token: z.string().openapi({ example: "GC-0102641001" }),
      format: z.string().openapi({ example: "CODE128" }),
      masa_berlaku: z.string().openapi({ example: "3 Tahun Pelajaran" }),
      tampak_depan_bg: z.string().openapi({ example: "/kartu-siswa-depan.svg" }),
      tampak_belakang_bg: z.string().openapi({ example: "/kartu-siswa-belakang.svg" }),
    }),
    riwayat_kenaikan: z.array(PromotionHistoryItemSchema),
  })
  .openapi("AdminStudentDetailResponse");

export const ManualPromotionPreviewPayloadSchema = z
  .object({
    from_class: z.string().min(1).openapi({ example: "11" }),
    to_class: z.string().min(1).openapi({ example: "12" }),
    kelas_asal: z.string().optional(),
    kelas_tujuan: z.string().optional(),
  })
  .openapi("ManualPromotionPreviewPayload");

export const ManualPromotionExecutePayloadSchema = z
  .object({
    from_class: z.string().min(1).openapi({ example: "11" }),
    to_class: z.string().min(1).openapi({ example: "12" }),
    tahun_ajaran: z.string().optional().openapi({ example: "2026/2027" }),
    catatan: z.string().optional().openapi({ example: "Kenaikan kelas manual" }),
    keterangan: z.string().optional(),
    student_nisns: z.array(z.string()).optional(),
  })
  .openapi("ManualPromotionExecutePayload");

/**
 * 1. GET /api/v1/admin/siswa
 */
export const listAdminStudentsRoute = createRoute({
  method: "get",
  path: "/siswa",
  tags: [API_TAGS.ADMIN],
  summary: "List Students for Administrator",
  description: "Daftar seluruh siswa dengan search, filter kelas, filter status, dan pagination dari PostgreSQL.",
  security: [{ BearerAuth: [] }],
  request: {
    query: z.object({
      search: z.string().optional(),
      kelas: z.string().optional(),
      status: z.string().optional(),
      page: z.coerce.number().optional().default(1),
      limit: z.coerce.number().optional().default(10),
    }),
  },
  responses: {
    200: {
      description: "Daftar siswa berhasil diambil",
      content: {
        "application/json": {
          schema: AdminStudentsListResponseSchema,
        },
      },
    },
  },
});

adminRouter.openapi(listAdminStudentsRoute, async (c) => {
  const { search, kelas, status, page, limit } = c.req.valid("query");
  const result = await listAdminStudents({
    search: search || "",
    kelas: kelas || "",
    status: status || "",
    page: Number(page || 1),
    limit: Number(limit || 10),
  });
  return c.json(result, 200);
});

/**
 * 2. GET /api/v1/admin/siswa/check-nisn
 */
export const checkAdminNisnRoute = createRoute({
  method: "get",
  path: "/siswa/check-nisn",
  tags: [API_TAGS.ADMIN],
  summary: "Check NISN Availability",
  description: "Memeriksa ketersediaan dan keunikan NISN sebelum menyimpan data siswa baru.",
  security: [{ BearerAuth: [] }],
  request: {
    query: z.object({
      nisn: z.string().openapi({ example: "0102641001" }),
    }),
  },
  responses: {
    200: {
      description: "Status validasi dan ketersediaan NISN",
      content: {
        "application/json": {
          schema: CheckNisnResponseSchema,
        },
      },
    },
  },
});

adminRouter.openapi(checkAdminNisnRoute, async (c) => {
  const { nisn } = c.req.valid("query");
  const check = await checkNisnAvailability(nisn || "");
  return c.json(check, 200);
});

/**
 * 3. POST /api/v1/admin/siswa
 */
export const createAdminStudentRoute = createRoute({
  method: "post",
  path: "/siswa",
  tags: [API_TAGS.ADMIN],
  summary: "Create New Student",
  description: "Tambah siswa baru beserta akun login dan kartu barcode di PostgreSQL.",
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateAdminStudentPayloadSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      description: "Siswa baru berhasil ditambahkan",
      content: {
        "application/json": {
          schema: AdminStudentItemSchema,
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
    409: {
      description: "NISN sudah terdaftar",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

adminRouter.openapi(createAdminStudentRoute, async (c) => {
  const body = c.req.valid("json");
  const result = await createAdminStudent({
    nisn: body.nisn,
    nama_lengkap: body.nama_lengkap,
    kelas: body.kelas,
    jurusan: body.jurusan,
    foto_profil: body.foto_profil,
    jenis_kelamin: body.jenis_kelamin,
  });

  if (!result.ok) {
    return c.json(
      {
        success: false,
        error: {
          code: result.status === 409 ? "DUPLICATE_NISN" : "VALIDATION_ERROR",
          message: result.message,
        },
      },
      result.status as 400 | 409
    );
  }

  return c.json(result.data, 201);
});

/**
 * 4. GET /api/v1/admin/siswa/:nisn
 */
export const getAdminStudentDetailRoute = createRoute({
  method: "get",
  path: "/siswa/{nisn}",
  tags: [API_TAGS.ADMIN],
  summary: "Get Student Detail & Card",
  description: "Detail siswa, kartu barcode JR HC-P20, dan riwayat kenaikan kelas.",
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      nisn: z.string().openapi({ example: "0102641001" }),
    }),
  },
  responses: {
    200: {
      description: "Detail siswa ditemukan",
      content: {
        "application/json": {
          schema: AdminStudentDetailResponseSchema,
        },
      },
    },
    404: {
      description: "Siswa tidak ditemukan",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

adminRouter.openapi(getAdminStudentDetailRoute, async (c) => {
  const { nisn } = c.req.valid("param");
  const detail = await getAdminStudentDetail(nisn);
  if (!detail) {
    return c.json(
      {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Data siswa dengan NISN/ID "${nisn}" tidak ditemukan`,
        },
      },
      404
    );
  }
  return c.json(detail, 200);
});

/**
 * 5. PUT /api/v1/admin/siswa/:nisn
 */
export const updateAdminStudentRoute = createRoute({
  method: "put",
  path: "/siswa/{nisn}",
  tags: [API_TAGS.ADMIN],
  summary: "Update Student Information",
  description: "Edit data siswa (Nama, Kelas, Jurusan, Foto Profil). NISN bersifat read-only.",
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      nisn: z.string().openapi({ example: "0102641001" }),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateAdminStudentPayloadSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Data siswa berhasil diperbarui",
      content: {
        "application/json": {
          schema: AdminStudentItemSchema,
        },
      },
    },
    404: {
      description: "Siswa tidak ditemukan",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

adminRouter.openapi(updateAdminStudentRoute, async (c) => {
  const { nisn } = c.req.valid("param");
  const body = c.req.valid("json");
  const result = await updateAdminStudent(nisn, body);
  if (!result.ok) {
    return c.json(
      {
        success: false,
        error: {
          code: result.status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR",
          message: result.message,
        },
      },
      result.status as 400 | 404
    );
  }
  return c.json(result.data, 200);
});

/**
 * 6. POST /api/v1/admin/siswa/kenaikan-kelas/preview
 */
export const previewManualPromotionRoute = createRoute({
  method: "post",
  path: "/siswa/kenaikan-kelas/preview",
  tags: [API_TAGS.ADMIN],
  summary: "Preview Manual Class Promotion",
  description: "Simulasi dampak kenaikan kelas manual sebelum dieksekusi.",
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: ManualPromotionPreviewPayloadSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Hasil preview kenaikan kelas",
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

adminRouter.openapi(previewManualPromotionRoute, async (c) => {
  const body = c.req.valid("json");
  const result = await previewManualPromotion({
    from_class: String(body.from_class || body.kelas_asal || ""),
    to_class: String(body.to_class || body.kelas_tujuan || ""),
  });

  if (!result.ok) {
    return c.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: result.message,
        },
      },
      result.status as 400
    );
  }

  return c.json(result.data, 200);
});

/**
 * 7. POST /api/v1/admin/siswa/kenaikan-kelas/manual
 */
export const executeManualPromotionRoute = createRoute({
  method: "post",
  path: "/siswa/kenaikan-kelas/manual",
  tags: [API_TAGS.ADMIN],
  summary: "Execute Manual Class Promotion",
  description: "Eksekusi kenaikan kelas manual dengan transaksi database atomik dan proteksi cooldown 6 bulan.",
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: ManualPromotionExecutePayloadSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Kenaikan kelas manual berhasil dieksekusi",
    },
    400: {
      description: "Validation error",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    409: {
      description: "Kenaikan kelas ditolak (cooldown)",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

adminRouter.openapi(executeManualPromotionRoute, async (c) => {
  const body = c.req.valid("json");
  const authUser = getAuthUser(c);
  const executedBy = authUser?.username || "Admin";

  const result = await executeManualPromotion({
    from_class: String(body.from_class || ""),
    to_class: String(body.to_class || ""),
    tahun_ajaran: body.tahun_ajaran ? String(body.tahun_ajaran) : undefined,
    catatan: body.catatan || body.keterangan ? String(body.catatan || body.keterangan) : undefined,
    executed_by: executedBy,
    student_nisns: Array.isArray(body.student_nisns) ? body.student_nisns : undefined,
  });

  if (!result.ok) {
    return c.json(
      {
        success: false,
        error: {
          code: result.status === 409 ? "PROMOTION_REJECTED" : "VALIDATION_ERROR",
          message: result.message,
        },
        data: result.data,
      },
      result.status as 400 | 404 | 409
    );
  }

  return c.json(result.data, 200);
});

/**
 * 8. POST /api/v1/admin/siswa/kenaikan-kelas/otomatis/trigger
 * Endpoint pemicu scheduler kenaikan kelas otomatis (Mei = Lulus Kelas 12, Juni = Naik Kelas 10->11 & 11->12).
 */
export const triggerAutomaticPromotionRoute = createRoute({
  method: "post",
  path: "/siswa/kenaikan-kelas/otomatis/trigger",
  tags: [API_TAGS.ADMIN],
  summary: "Trigger Automatic Promotion Job",
  description: "Memicu eksekusi job kelulusan kelas 12 dan kenaikan kelas 10->11, 11->12.",
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            reference_date: z.string().optional().openapi({ example: "2026-06-30" }),
            force_run: z.boolean().optional().openapi({ example: false }),
          }),
        },
      },
      required: false,
    },
  },
  responses: {
    200: {
      description: "Job otomatis kenaikan kelas berhasil diproses",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
            executed: z.boolean(),
            promoted_count: z.number().optional(),
          }),
        },
      },
    },
    400: {
      description: "Format tanggal tidak valid",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

adminRouter.openapi(triggerAutomaticPromotionRoute, async (c) => {
  const body = c.req.valid("json") || {};
  const refDate = body.reference_date ? new Date(String(body.reference_date)) : undefined;
  if (refDate && Number.isNaN(refDate.getTime())) {
    return c.json(
      {
        success: false,
        error: {
          code: "INVALID_DATE",
          message: "Format reference_date tidak valid",
        },
      },
      400
    );
  }

  const res = await runAutomaticPromotionJob({
    referenceDate: refDate,
    forceRun: Boolean(body.force_run),
  });

  return c.json(res as any, 200);
});

/**
 * 9. POST /api/v1/admin/siswa/{nisn}/foto
 * Upload foto profil siswa menggunakan multipart/form-data (maks 1MB, JPG/JPEG/PNG).
 */
export const uploadAdminStudentPhotoRoute = createRoute({
  method: "post",
  path: "/siswa/{nisn}/foto",
  tags: [API_TAGS.ADMIN],
  summary: "Upload Student Profile Photo",
  description: "Upload foto profil siswa via multipart/form-data (maks 1MB, format JPG/PNG).",
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      nisn: z.string().openapi({ example: "0102641001" }),
    }),
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            file: z.any().openapi({ type: "string", format: "binary" }),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Foto profil siswa berhasil diunggah",
      content: {
        "application/json": {
          schema: z.object({
            ok: z.boolean(),
            foto_profil: z.string(),
            data: AdminStudentItemSchema,
          }),
        },
      },
    },
    400: {
      description: "Validasi file gagal",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: "Siswa tidak ditemukan",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

adminRouter.openapi(uploadAdminStudentPhotoRoute, async (c) => {
  const { nisn } = c.req.valid("param");
  const formData = await c.req.formData().catch(() => null);
  const file = formData?.get("file") || formData?.get("foto");

  if (!file || !(file instanceof File)) {
    return c.json(
      {
        success: false,
        error: {
          code: "INVALID_FILE",
          message: "File foto profil wajib diunggah",
        },
      },
      400
    );
  }

  const result = await uploadAdminStudentPhotoFile(nisn, file);
  if (!result.ok) {
    return c.json(
      {
        success: false,
        error: {
          code: result.status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR",
          message: result.message,
        },
      },
      result.status as 400 | 404
    );
  }

  return c.json(result as any, 200);
});
