import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler";
import { dev_scanner_router } from "./modules/dev/scanner_test_route";
import { apiV1Router, healthRoute } from "./routes";
import { API_TAGS, APP_CONSTANTS } from "./shared/constants";

/**
 * Initialize OpenAPI-enabled Hono application
 */
export const app = new OpenAPIHono({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          message: "Validation Error",
          errors: result.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        },
        400
      );
    }
  },
});

// Global Middlewares
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: env.CORS_ORIGIN === "*" ? "*" : [env.CORS_ORIGIN],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  })
);

// Register BearerAuth Security Scheme for OpenAPI
app.openAPIRegistry.registerComponent("securitySchemes", "BearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: "JWT Bearer token for authorized requests. Enter token without 'Bearer ' prefix.",
});

// Health check endpoint
app.openapi(healthRoute, (c) => {
  return c.json(
    {
      success: true,
      message: "Backend is running",
      data: {
        status: "healthy",
      },
    },
    200
  );
});

// Modular API v1 Routes
app.route(APP_CONSTANTS.API_PREFIX, apiV1Router);

// Development Hardware Scanner Test Route (disabled in production)
app.route("/dev", dev_scanner_router);

// OpenAPI JSON Document
app.doc(APP_CONSTANTS.OPENAPI_JSON_PATH, {
  openapi: "3.0.0",
  info: {
    title: APP_CONSTANTS.APP_NAME,
    version: APP_CONSTANTS.APP_VERSION,
    description:
      "Backend API for SMK Ghama Caraka School Attendance System (Sistem Absensi Sekolah).\n\n" +
      "Provides structured RESTful endpoints for attendance tracking, role-based workflows, and reporting.",
    contact: {
      name: "SMK Ghama Caraka Backend Engineering",
    },
  },
  servers: [
    {
      url: `http://localhost:${env.APP_PORT}`,
      description: "Local Development Server",
    },
  ],
  tags: [
    {
      name: API_TAGS.GENERAL,
      description: "General system status and health endpoints",
    },
    {
      name: API_TAGS.AUTHENTICATION,
      description: "Authentication and session management (Future)",
    },
    {
      name: API_TAGS.ADMIN,
      description: "Administrator operations for master data, users, and school configuration (Future)",
    },
    {
      name: API_TAGS.WALAS,
      description: "Wali Kelas (Homeroom Teacher) attendance oversight and reporting (Future)",
    },
    {
      name: API_TAGS.GURU,
      description: "Guru Mata Pelajaran (Subject Teacher) attendance tracking (Future)",
    },
    {
      name: API_TAGS.SISWA,
      description: "Siswa (Student) attendance check-in and records (Future)",
    },
  ],
});

// Swagger UI Route
app.get(
  APP_CONSTANTS.DOCS_PATH,
  swaggerUI({
    url: APP_CONSTANTS.OPENAPI_JSON_PATH,
  })
);

// Centralized Error and Not Found Handlers
app.notFound(notFoundHandler);
app.onError(errorHandler);

