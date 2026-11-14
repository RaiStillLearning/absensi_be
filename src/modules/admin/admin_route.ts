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

/**
 * GET /api/v1/admin/siswa
 * Daftar seluruh siswa dengan search (NISN/nama), filter kelas, filter status, dan pagination.
 */
adminRouter.get("/siswa", async (c) => {
  const search = c.req.query("search") || "";
  const kelas = c.req.query("kelas") || "";
  const status = c.req.query("status") || "";
  const page = Number(c.req.query("page") || 1);
  const limit = Number(c.req.query("limit") || 10);

  const result = await listAdminStudents({
    search,
    kelas,
    status,
    page,
    limit,
  });

  return c.json(result, 200);
});

/**
 * GET /api/v1/admin/siswa/check-nisn?nisn=...
 * Memeriksa ketersediaan dan keunikan NISN sebelum menyimpan data siswa baru.
 */
adminRouter.get("/siswa/check-nisn", async (c) => {
  const nisn = c.req.query("nisn") || "";
  const check = await checkNisnAvailability(nisn);
  return c.json(check, 200);
});

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
 * POST /api/v1/admin/siswa/kenaikan-kelas/preview
 * Preview dampak kenaikan kelas manual sebelum dieksekusi.
 */
adminRouter.post("/siswa/kenaikan-kelas/preview", async (c) => {
  const body = await c.req.json().catch(() => ({}));
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
 * POST /api/v1/admin/siswa/kenaikan-kelas/manual
 * Eksekusi kenaikan kelas manual dengan transaksi dan validasi cooldown 6 bulan.
 */
adminRouter.post("/siswa/kenaikan-kelas/manual", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const authUser = getAuthUser(c);
  const executedBy = authUser?.username || "Admin";

  const result = await executeManualPromotion({
    from_class: String(body.from_class || body.kelas_asal || ""),
    to_class: String(body.to_class || body.kelas_tujuan || ""),
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
 * POST /api/v1/admin/siswa/kenaikan-kelas/otomatis/trigger
 * Endpoint pemicu scheduler kenaikan kelas otomatis (Mei = Lulus Kelas 12, Juni = Naik Kelas 10->11 & 11->12).
 */
adminRouter.post("/siswa/kenaikan-kelas/otomatis/trigger", async (c) => {
  const body = await c.req.json().catch(() => ({}));
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

  return c.json(res, 200);
});

/**
 * POST /api/v1/admin/siswa
 * Tambah siswa baru beserta pembuatan akun login siswa (password default gc123).
 */
adminRouter.post("/siswa", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = await createAdminStudent({
    nisn: String(body.nisn || ""),
    nama_lengkap: String(body.nama_lengkap || body.nama_siswa || ""),
    kelas: String(body.kelas || ""),
    jurusan: body.jurusan ? String(body.jurusan) : undefined,
    foto_profil: body.foto_profil ? String(body.foto_profil) : undefined,
    jenis_kelamin: body.jenis_kelamin ? String(body.jenis_kelamin) : undefined,
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
 * GET /api/v1/admin/siswa/:nisn
 * Detail siswa, informasi kartu identitas siswa, dan riwayat kenaikan kelas siswa.
 */
adminRouter.get("/siswa/:nisn", async (c) => {
  const nisn = c.req.param("nisn");
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
 * PUT /api/v1/admin/siswa/:nisn
 * Edit data siswa (Nama Lengkap, Kelas, Jurusan, Foto Profil). NISN bersifat READ-ONLY.
 */
adminRouter.put("/siswa/:nisn", async (c) => {
  const nisn = c.req.param("nisn");
  const body = await c.req.json().catch(() => ({}));

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
 * POST /api/v1/admin/siswa/:nisn/foto
 * Upload foto profil siswa menggunakan multipart/form-data (maks 1MB, JPG/JPEG/PNG).
 */
adminRouter.post("/siswa/:nisn/foto", async (c) => {
  const nisn = c.req.param("nisn");
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

  return c.json(result, 200);
});
