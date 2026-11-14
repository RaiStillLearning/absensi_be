import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { asc, eq } from "drizzle-orm";
import { db } from "../../config/database";
import { classes } from "../../config/schema";
import { classes, students, teachers } from "../../config/schema";
import { API_TAGS } from "../../shared/constants";
import { ErrorResponseSchema } from "../../shared/types/api";

export const kelasRouter = new OpenAPIHono();

export const KelasItemSchema = z
  .object({
    id: z.number().openapi({ example: 1 }),
    nama_kelas: z.string().openapi({ example: "X RPL 1" }),
    tingkat: z.string().openapi({ example: "X" }),
    jurusan: z.string().openapi({ example: "RPL" }),
    wali_kelas: z.string().openapi({ example: "Bu Sari" }),
    tahun_ajaran: z.string().optional().openapi({ example: "2026/2027" }),
  })
  .openapi("KelasItem");

export const CreateKelasPayloadSchema = z
  .object({
    nama_kelas: z.string().min(1, "Nama kelas wajib diisi"),
    tingkat: z.string().min(1, "Tingkat wajib diisi"),
    jurusan: z.string().min(1, "Jurusan wajib diisi"),
    tahun_ajaran: z.string().min(1, "Tahun ajaran wajib diisi"),
    wali_kelas: z.string().min(1, "Wali kelas wajib diisi"),
  })
  .openapi("CreateKelasPayload");

export const UpdateKelasPayloadSchema = CreateKelasPayloadSchema.partial().openapi("UpdateKelasPayload");

function mapClassRow(row: typeof classes.$inferSelect, fallbackIdx = 1) {
  return {
    id: row.class_code_id ?? fallbackIdx,
    nama_kelas: row.name,
    tingkat: row.tingkat || "X",
    jurusan: row.jurusan || "RPL",
    wali_kelas: row.wali_kelas || "",
    tahun_ajaran: row.tahun_ajaran || "2026/2027",
  };
}

async function findClassByCodeOrIndex(id: number) {
  // 1. Try finding by class_code_id directly
  const [found] = await db
    .select()
    .from(classes)
    .where(eq(classes.class_code_id, id))
    .limit(1);
  if (found) return found;

  // 2. Fallback: match by row order or assign missing class_code_id
  const all = await db.select().from(classes).orderBy(asc(classes.created_at));
  const fallback = all[id - 1] || all.find((c, idx) => (c.class_code_id ?? idx + 1) === id);
  if (fallback) {
    if (fallback.class_code_id === null || fallback.class_code_id === undefined) {
      await db.update(classes).set({ class_code_id: id }).where(eq(classes.id, fallback.id));
      fallback.class_code_id = id;
    }
    return fallback;
  }
  return undefined;
}

/**
 * 1. GET /api/v1/kelas
 */
export const listKelasRoute = createRoute({
  method: "get",
  path: "/",
  tags: [API_TAGS.ADMIN],
  summary: "List All School Classes",
  description: "Returns master list of all classes in the school from PostgreSQL",
  responses: {
    200: {
      description: "List of classes retrieved",
      content: {
        "application/json": {
          schema: z.array(KelasItemSchema),
        },
      },
    },
  },
});

kelasRouter.openapi(listKelasRoute, async (c) => {
  const rows = await db.select().from(classes).orderBy(asc(classes.class_code_id));
  return c.json(rows.map((r, idx) => mapClassRow(r, idx + 1)), 200);
});

/**
 * 2. POST /api/v1/kelas
 */
export const createKelasRoute = createRoute({
  method: "post",
  path: "/",
  tags: [API_TAGS.ADMIN],
  summary: "Create New Class",
  description: "Creates a new class entry in PostgreSQL",
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateKelasPayloadSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      description: "Class created successfully",
      content: {
        "application/json": {
          schema: KelasItemSchema,
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

kelasRouter.openapi(createKelasRoute, async (c) => {
  const body = c.req.valid("json");
  const existing = await db.select().from(classes);
  const nextId =
    existing.length > 0
      ? Math.max(...existing.map((k, idx) => k.class_code_id ?? idx + 1)) + 1
      : 1;

  const [inserted] = await db
    .insert(classes)
    .values({
      class_code_id: nextId,
      name: body.nama_kelas,
      tingkat: body.tingkat,
      jurusan: body.jurusan,
      wali_kelas: body.wali_kelas,
      tahun_ajaran: body.tahun_ajaran,
    })
    .returning();

  return c.json(mapClassRow(inserted!, nextId), 201);
});

/**
 * 3. GET /api/v1/kelas/:id
 */
export const getKelasByIdRoute = createRoute({
  method: "get",
  path: "/:id",
  tags: [API_TAGS.ADMIN],
  summary: "Get Class by ID",
  request: {
    params: z.object({
      id: z.coerce.number(),
    }),
  },
  responses: {
    200: {
      description: "Class found",
      content: {
        "application/json": {
          schema: KelasItemSchema,
        },
      },
    },
    404: {
      description: "Class not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

kelasRouter.openapi(getKelasByIdRoute, async (c) => {
  const { id } = c.req.valid("param");
  const item = await findClassByCodeOrIndex(id);

  if (!item) {
    return c.json({ success: false, message: `Kelas dengan ID ${id} tidak ditemukan` }, 404);
  }
  return c.json(mapClassRow(item, id), 200);
});

/**
 * 4. PUT /api/v1/kelas/:id
 */
export const updateKelasRoute = createRoute({
  method: "put",
  path: "/:id",
  tags: [API_TAGS.ADMIN],
  summary: "Update Class by ID",
  request: {
    params: z.object({
      id: z.coerce.number(),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateKelasPayloadSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Class updated successfully",
      content: {
        "application/json": {
          schema: KelasItemSchema,
        },
      },
    },
    404: {
      description: "Class not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

kelasRouter.openapi(updateKelasRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const existing = await findClassByCodeOrIndex(id);

  if (!existing) {
    return c.json({ success: false, message: `Kelas dengan ID ${id} tidak ditemukan` }, 404);
  }

  const newName = body.nama_kelas?.trim();
  const oldName = existing.name;

  const [updated] = await db
    .update(classes)
    .set({
      name: body.nama_kelas ?? existing.name,
      name: newName ?? existing.name,
      tingkat: body.tingkat ?? existing.tingkat,
      jurusan: body.jurusan ?? existing.jurusan,
      wali_kelas: body.wali_kelas ?? existing.wali_kelas,
      tahun_ajaran: body.tahun_ajaran ?? existing.tahun_ajaran,
      updated_at: new Date(),
    })
    .where(eq(classes.id, existing.id))
    .returning();

  // Cascade nama kelas baru ke tabel teachers dan students
  if (newName && newName !== oldName) {
    await db.update(teachers).set({ kelas_walas: newName }).where(eq(teachers.kelas_walas, oldName));
    await db.update(students).set({ kelas: newName }).where(eq(students.kelas, oldName));
  }

  // Sinkronkan guru yang dipilih sebagai wali kelas
  const walasName = body.wali_kelas?.trim();
  if (walasName) {
    await db
      .update(teachers)
      .set({ is_walas: true, kelas_walas: newName ?? existing.name })
      .where(eq(teachers.nama_guru, walasName));
  }

  return c.json(mapClassRow(updated!, id), 200);
});

/**
 * 5. DELETE /api/v1/kelas/:id
 */
export const deleteKelasRoute = createRoute({
  method: "delete",
  path: "/:id",
  tags: [API_TAGS.ADMIN],
  summary: "Delete Class by ID",
  request: {
    params: z.object({
      id: z.coerce.number(),
    }),
  },
  responses: {
    200: {
      description: "Class deleted successfully",
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
      description: "Class not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

kelasRouter.openapi(deleteKelasRoute, async (c) => {
  const { id } = c.req.valid("param");
  const existing = await findClassByCodeOrIndex(id);

  if (!existing) {
    return c.json({ success: false, message: `Kelas dengan ID ${id} tidak ditemukan` }, 404);
  }

  await db.delete(classes).where(eq(classes.id, existing.id));
  return c.json({ success: true, message: `Kelas berhasil dihapus` }, 200);
});
