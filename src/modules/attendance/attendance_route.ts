import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { rateLimitAuth } from "../../middlewares/auth";
import { API_TAGS } from "../../shared/constants";
import { ErrorResponseSchema } from "../../shared/types/api";
import { process_barcode_attendance } from "./attendance_service";

/**
 * Scan Request Schema
 */
export const scan_request_schema = z
  .object({
    barcode_token: z
      .string()
      .min(1, "Barcode token tidak boleh kosong")
      .openapi({
        example: "ghama_7c8d9e0f1a2b3c4d5e6f7a8b",
        description: "Cryptographically random barcode or QR token",
      }),
    request_id: z
      .string()
      .uuid("request_id harus berupa UUID valid")
      .optional()
      .openapi({
        example: "550e8400-e29b-41d4-a716-446655440000",
        description: "Unique request identifier for idempotency and audit logs",
      }),
  })
  .openapi("ScanRequest");

/**
 * Scan Success Data Schema
 */
export const scan_success_data_schema = z
  .object({
    student_name: z.string().openapi({ example: "TEST SISWA BARCODE" }),
    nisn: z.string().openapi({ example: "9999999901" }),
    class_name: z.string().openapi({ example: "X PPLG 1" }),
    attendance_status: z.string().openapi({ example: "present" }),
    check_in_at: z.string().openapi({ example: "2026-11-06T20:25:00.000Z" }),
  })
  .openapi("ScanSuccessData");

/**
 * Scan Success Response Schema
 */
export const scan_success_response_schema = z
  .object({
    success: z.boolean().openapi({ example: true }),
    message: z.string().openapi({ example: "Absensi berhasil" }),
    data: scan_success_data_schema,
  })
  .openapi("ScanSuccessResponse");

/**
 * Route definition for daily attendance scan
 */
export const daily_scan_route = createRoute({
  method: "post",
  path: "/attendance/daily/scan",
  tags: [API_TAGS.SISWA, API_TAGS.GENERAL],
  summary: "Scan barcode / QR code for daily student attendance",
  description:
    "Validates student barcode token, verifies student enrollment and daily attendance session, and records check-in. Prevents duplicate submissions.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: scan_request_schema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Attendance recorded successfully",
      content: {
        "application/json": {
          schema: scan_success_response_schema,
        },
      },
    },
    400: {
      description: "Invalid session, student status, or validation failure",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: "Barcode token not found or invalid",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    409: {
      description: "Duplicate attendance record for this session",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

/**
 * Attendance router instance
 */
export const attendance_router = new OpenAPIHono();

// Rate limiting proteksi brute-force barcode/token (60 request per menit per IP)
attendance_router.use("/attendance/daily/scan", rateLimitAuth(60, 60 * 1000, "scanner_barcode"));

attendance_router.openapi(daily_scan_route, async (c) => {
  const { barcode_token, request_id } = c.req.valid("json");

  const result = await process_barcode_attendance(barcode_token, request_id);

  if (result.status === "success") {
    return c.json(
      {
        success: true,
        message: "Absensi berhasil",
        data: result.data,
      },
      200
    );
  }

  if (result.status === "duplicate") {
    return c.json(
      {
        success: false,
        message: result.message,
      },
      409
    );
  }

  if (result.status === "invalid_barcode") {
    return c.json(
      {
        success: false,
        message: result.message,
      },
      404
    );
  }

  // invalid_student or invalid_session
  return c.json(
    {
      success: false,
      message: result.message,
    },
    400
  );
});

