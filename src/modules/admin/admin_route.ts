import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { db } from "../../config/database";
import { users } from "../../config/schema";
import { API_TAGS } from "../../shared/constants";

export const adminRouter = new OpenAPIHono();

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
  const [adminUser] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
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
  },
});

adminRouter.openapi(updateAdminProfileRoute, async (c) => {
  const body = c.req.valid("json");
  const [adminUser] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);

  if (adminUser) {
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
