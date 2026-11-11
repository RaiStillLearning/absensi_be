import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { API_TAGS } from "../../shared/constants";
import { store } from "../../shared/data/store";

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

adminRouter.openapi(getAdminProfileRoute, (c) => {
  return c.json(store.adminProfile, 200);
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
  store.adminProfile = {
    ...store.adminProfile,
    ...body,
  };
  store.persist();
  return c.json(store.adminProfile, 200);
});

