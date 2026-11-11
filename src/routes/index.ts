import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { attendance_router } from "../modules/attendance/attendance_route";
import { authRouter } from "../modules/auth/auth_route";
import { dashboardRouter } from "../modules/dashboard/dashboard_route";
import { kelasRouter } from "../modules/kelas/kelas_route";
import { guruRouter } from "../modules/guru/guru_route";
import { jadwalRouter } from "../modules/jadwal/jadwal_route";
import { absensiAdminRouter } from "../modules/absensi/absensi_admin_route";
import { adminRouter } from "../modules/admin/admin_route";
import { walasRouter } from "../modules/walas/walas_route";
import { siswaRouter } from "../modules/siswa/siswa_route";
import { API_TAGS, APP_CONSTANTS } from "../shared/constants";
import { requireAuth } from "../middlewares/auth";

/**
 * Health Check Route Specification
 */
export const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: [API_TAGS.GENERAL],
  summary: "Service Health Check",
  description: "Returns the operational status of the backend application",
  responses: {
    200: {
      description: "Backend service is healthy",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean().openapi({ example: true }),
            message: z.string().openapi({ example: "Backend is running" }),
            data: z.object({
              status: z.string().openapi({ example: "healthy" }),
            }),
          }),
        },
      },
    },
  },
});

/**
 * API v1 Root Route Specification
 */
export const apiV1RootRoute = createRoute({
  method: "get",
  path: "/",
  tags: [API_TAGS.GENERAL],
  summary: "API v1 Information",
  description: "Returns API service name, version, and status metadata",
  responses: {
    200: {
      description: "API version information retrieved successfully",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean().openapi({ example: true }),
            message: z.string().openapi({ example: APP_CONSTANTS.APP_NAME }),
            data: z.object({
              name: z.string().openapi({ example: APP_CONSTANTS.APP_NAME }),
              version: z.string().openapi({ example: APP_CONSTANTS.APP_VERSION }),
            }),
          }),
        },
      },
    },
  },
});

/**
 * API v1 Sub-Router
 * All endpoints mounted here are prefixed with /api/v1
 */
export const apiV1Router = new OpenAPIHono();

apiV1Router.openapi(apiV1RootRoute, (c) => {
  return c.json(
    {
      success: true,
      message: APP_CONSTANTS.APP_NAME,
      data: {
        name: APP_CONSTANTS.APP_NAME,
        version: APP_CONSTANTS.APP_VERSION,
      },
    },
    200
  );
});

// Authentication & Role-Based Access Control Middlewares
apiV1Router.use("/dashboard", requireAuth(["admin", "guru", "walas"]));
apiV1Router.use("/dashboard/*", requireAuth(["admin", "guru", "walas"]));

apiV1Router.use("/kelas", requireAuth(["admin"]));
apiV1Router.use("/kelas/*", requireAuth(["admin"]));

apiV1Router.use("/admin", requireAuth(["admin"]));
apiV1Router.use("/admin/*", requireAuth(["admin"]));

apiV1Router.use("/guru", requireAuth(["admin", "guru", "walas"]));
apiV1Router.use("/guru/*", requireAuth(["admin", "guru", "walas"]));

apiV1Router.use("/walas", requireAuth(["admin", "walas"]));
apiV1Router.use("/walas/*", requireAuth(["admin", "walas"]));

apiV1Router.use("/jadwal", requireAuth(["admin", "guru", "walas", "siswa"]));
apiV1Router.use("/jadwal/*", requireAuth(["admin", "guru", "walas", "siswa"]));

apiV1Router.use("/absensi", requireAuth(["admin", "guru", "walas"]));
apiV1Router.use("/absensi/*", requireAuth(["admin", "guru", "walas"]));

apiV1Router.use("/siswa", requireAuth(["admin", "siswa"]));
apiV1Router.use("/siswa/*", requireAuth(["admin", "siswa"]));

// Mount All Domain Routers
apiV1Router.route("/auth", authRouter);
apiV1Router.route("/dashboard", dashboardRouter);
apiV1Router.route("/kelas", kelasRouter);
apiV1Router.route("/guru", guruRouter);
apiV1Router.route("/jadwal", jadwalRouter);
apiV1Router.route("/absensi", absensiAdminRouter);
apiV1Router.route("/admin", adminRouter);
apiV1Router.route("/walas", walasRouter);
apiV1Router.route("/siswa", siswaRouter);
apiV1Router.route("/", attendance_router);
