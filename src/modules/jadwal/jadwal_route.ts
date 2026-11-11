import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../../config/database";
import { schedules } from "../../config/schema";
import { API_TAGS } from "../../shared/constants";
import { ErrorResponseSchema } from "../../shared/types/api";

export const jadwalRouter = new OpenAPIHono();

export const JadwalItemSchema = z
  .object({
    id: z.number().openapi({ example: 1 }),
    kelas: z.string().openapi({ example: "X RPL 1" }),
    hari: z.string().openapi({ example: "Senin" }),
    jam_ke: z.number().openapi({ example: 1 }),
    waktu_mulai: z.string().openapi({ example: "07:00" }),
    waktu_selesai: z.string().openapi({ example: "07:45" }),
    mata_pelajaran: z.string().openapi({ example: "Matematika" }),
    guru: z.string().openapi({ example: "Bu Sari" }),
  })
  .openapi("JadwalItem");

export const CreateJadwalPayloadSchema = z
  .object({
    kelas: z.string().min(1, "Kelas wajib diisi"),
    hari: z.string().min(1, "Hari wajib diisi"),
    jam_ke: z.coerce.number().min(1, "Jam ke minimal 1"),
    waktu_mulai: z.string().min(1, "Waktu mulai wajib diisi"),
    waktu_selesai: z.string().min(1, "Waktu selesai wajib diisi"),
    mata_pelajaran: z.string().min(1, "Mata pelajaran wajib diisi"),
    guru: z.string().min(1, "Guru pengajar wajib diisi"),
  })
  .openapi("CreateJadwalPayload");

export const UpdateJadwalPayloadSchema = CreateJadwalPayloadSchema.partial().openapi("UpdateJadwalPayload");

/**
 * 1. GET /api/v1/jadwal
 */
export const listJadwalRoute = createRoute({
  method: "get",
  path: "/",
  tags: [API_TAGS.ADMIN],
  summary: "List Schedules with Optional Filters",
  request: {
    query: z.object({
      kelas: z.string().optional(),
      hari: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "List of schedules from PostgreSQL",
      content: {
        "application/json": {
          schema: z.array(JadwalItemSchema),
        },
      },
    },
  },
});

jadwalRouter.openapi(listJadwalRoute, async (c) => {
  const { kelas, hari } = c.req.valid("query");
  const conditions = [];
  if (kelas && kelas !== "Semua") {
    conditions.push(eq(schedules.kelas, kelas));
  }
  if (hari && hari !== "Semua") {
    conditions.push(eq(schedules.hari, hari));
  }

  const rows =
    conditions.length > 0
      ? await db
          .select()
          .from(schedules)
          .where(and(...conditions))
          .orderBy(asc(schedules.id))
      : await db.select().from(schedules).orderBy(asc(schedules.id));

  return c.json(
    rows.map((r) => ({
      id: r.id,
      kelas: r.kelas,
      hari: r.hari,
      jam_ke: r.jam_ke,
      waktu_mulai: r.waktu_mulai,
      waktu_selesai: r.waktu_selesai,
      mata_pelajaran: r.mata_pelajaran,
      guru: r.guru,
    })),
    200
  );
});

/**
 * 2. POST /api/v1/jadwal
 */
export const createJadwalRoute = createRoute({
  method: "post",
  path: "/",
  tags: [API_TAGS.ADMIN],
  summary: "Create New Lesson Schedule",
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateJadwalPayloadSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      description: "Schedule created successfully",
      content: {
        "application/json": {
          schema: JadwalItemSchema,
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

jadwalRouter.openapi(createJadwalRoute, async (c) => {
  const body = c.req.valid("json");
  const [inserted] = await db
    .insert(schedules)
    .values({
      kelas: body.kelas,
      hari: body.hari,
      jam_ke: body.jam_ke,
      waktu_mulai: body.waktu_mulai,
      waktu_selesai: body.waktu_selesai,
      mata_pelajaran: body.mata_pelajaran,
      guru: body.guru,
    })
    .returning();

  return c.json(
    {
      id: inserted!.id,
      kelas: inserted!.kelas,
      hari: inserted!.hari,
      jam_ke: inserted!.jam_ke,
      waktu_mulai: inserted!.waktu_mulai,
      waktu_selesai: inserted!.waktu_selesai,
      mata_pelajaran: inserted!.mata_pelajaran,
      guru: inserted!.guru,
    },
    201
  );
});

/**
 * 3. GET /api/v1/jadwal/:id
 */
export const getJadwalByIdRoute = createRoute({
  method: "get",
  path: "/:id",
  tags: [API_TAGS.ADMIN],
  summary: "Get Schedule by ID",
  request: {
    params: z.object({
      id: z.coerce.number(),
    }),
  },
  responses: {
    200: {
      description: "Schedule found",
      content: {
        "application/json": {
          schema: JadwalItemSchema,
        },
      },
    },
    404: {
      description: "Schedule not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

jadwalRouter.openapi(getJadwalByIdRoute, async (c) => {
  const { id } = c.req.valid("param");
  const [item] = await db.select().from(schedules).where(eq(schedules.id, id)).limit(1);
  if (!item) {
    return c.json({ success: false, message: `Jadwal dengan ID ${id} tidak ditemukan` }, 404);
  }
  return c.json(
    {
      id: item.id,
      kelas: item.kelas,
      hari: item.hari,
      jam_ke: item.jam_ke,
      waktu_mulai: item.waktu_mulai,
      waktu_selesai: item.waktu_selesai,
      mata_pelajaran: item.mata_pelajaran,
      guru: item.guru,
    },
    200
  );
});

/**
 * 4. PUT /api/v1/jadwal/:id
 */
export const updateJadwalRoute = createRoute({
  method: "put",
  path: "/:id",
  tags: [API_TAGS.ADMIN],
  summary: "Update Schedule by ID",
  request: {
    params: z.object({
      id: z.coerce.number(),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateJadwalPayloadSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Schedule updated successfully",
      content: {
        "application/json": {
          schema: JadwalItemSchema,
        },
      },
    },
    404: {
      description: "Schedule not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

jadwalRouter.openapi(updateJadwalRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const [existing] = await db.select().from(schedules).where(eq(schedules.id, id)).limit(1);
  if (!existing) {
    return c.json({ success: false, message: `Jadwal dengan ID ${id} tidak ditemukan` }, 404);
  }

  const [updated] = await db
    .update(schedules)
    .set({
      kelas: body.kelas ?? existing.kelas,
      hari: body.hari ?? existing.hari,
      jam_ke: body.jam_ke ?? existing.jam_ke,
      waktu_mulai: body.waktu_mulai ?? existing.waktu_mulai,
      waktu_selesai: body.waktu_selesai ?? existing.waktu_selesai,
      mata_pelajaran: body.mata_pelajaran ?? existing.mata_pelajaran,
      guru: body.guru ?? existing.guru,
      updated_at: new Date(),
    })
    .where(eq(schedules.id, id))
    .returning();

  return c.json(
    {
      id: updated!.id,
      kelas: updated!.kelas,
      hari: updated!.hari,
      jam_ke: updated!.jam_ke,
      waktu_mulai: updated!.waktu_mulai,
      waktu_selesai: updated!.waktu_selesai,
      mata_pelajaran: updated!.mata_pelajaran,
      guru: updated!.guru,
    },
    200
  );
});

/**
 * 5. DELETE /api/v1/jadwal/:id
 */
export const deleteJadwalRoute = createRoute({
  method: "delete",
  path: "/:id",
  tags: [API_TAGS.ADMIN],
  summary: "Delete Schedule by ID",
  request: {
    params: z.object({
      id: z.coerce.number(),
    }),
  },
  responses: {
    200: {
      description: "Schedule deleted successfully",
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
      description: "Schedule not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

jadwalRouter.openapi(deleteJadwalRoute, async (c) => {
  const { id } = c.req.valid("param");
  const [existing] = await db.select().from(schedules).where(eq(schedules.id, id)).limit(1);
  if (!existing) {
    return c.json({ success: false, message: `Jadwal dengan ID ${id} tidak ditemukan` }, 404);
  }
  await db.delete(schedules).where(eq(schedules.id, id));
  return c.json({ success: true, message: "Jadwal berhasil dihapus" }, 200);
});
