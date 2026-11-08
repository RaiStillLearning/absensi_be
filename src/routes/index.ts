import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { attendance_router } from "../modules/attendance/attendance_route";
import { authRouter } from "../modules/auth/auth_route";
import { API_TAGS, APP_CONSTANTS } from "../shared/constants";

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

// Mount Auth domain routes (/api/v1/auth)
apiV1Router.route("/auth", authRouter);

// Mount Attendance domain routes
apiV1Router.route("/", attendance_router);

