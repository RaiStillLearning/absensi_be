import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { API_TAGS } from "../../shared/constants";
import { store } from "../../shared/data/store";
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

/**
 * 1. GET /api/v1/kelas
 */
export const listKelasRoute = createRoute({
  method: "get",
  path: "/",
  tags: [API_TAGS.ADMIN],
  summary: "List All School Classes",
  description: "Returns master list of all classes in the school",
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

kelasRouter.openapi(listKelasRoute, (c) => {
  return c.json(store.kelas, 200);
});

/**
 * 2. POST /api/v1/kelas
 */
export const createKelasRoute = createRoute({
  method: "post",
  path: "/",
  tags: [API_TAGS.ADMIN],
  summary: "Create New Class",
  description: "Creates a new class entry",
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
  const newId = store.kelas.length > 0 ? Math.max(...store.kelas.map((k) => k.id)) + 1 : 1;
  const newKelas = {
    id: newId,
    nama_kelas: body.nama_kelas,
    tingkat: body.tingkat,
    jurusan: body.jurusan,
    wali_kelas: body.wali_kelas,
    tahun_ajaran: body.tahun_ajaran,
  };
  store.kelas.push(newKelas);
  store.persist();
  return c.json(newKelas, 201);
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

kelasRouter.openapi(getKelasByIdRoute, (c) => {
  const { id } = c.req.valid("param");
  const item = store.kelas.find((k) => k.id === id);
  if (!item) {
    return c.json({ success: false, message: `Kelas dengan ID ${id} tidak ditemukan` }, 404);
  }
  return c.json(item, 200);
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
  const index = store.kelas.findIndex((k) => k.id === id);
  if (index === -1) {
    return c.json({ success: false, message: `Kelas dengan ID ${id} tidak ditemukan` }, 404);
  }
  const existing = store.kelas[index]!;
  const updated = {
    id,
    nama_kelas: body.nama_kelas ?? existing.nama_kelas,
    tingkat: body.tingkat ?? existing.tingkat,
    jurusan: body.jurusan ?? existing.jurusan,
    wali_kelas: body.wali_kelas ?? existing.wali_kelas,
    tahun_ajaran: body.tahun_ajaran ?? existing.tahun_ajaran,
  };
  store.kelas[index] = updated;
  store.persist();
  return c.json(updated, 200);
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

kelasRouter.openapi(deleteKelasRoute, (c) => {
  const { id } = c.req.valid("param");
  const index = store.kelas.findIndex((k) => k.id === id);
  if (index === -1) {
    return c.json({ success: false, message: `Kelas dengan ID ${id} tidak ditemukan` }, 404);
  }
  store.kelas.splice(index, 1);
  store.persist();
  return c.json({ success: true, message: `Kelas berhasil dihapus` }, 200);
});
