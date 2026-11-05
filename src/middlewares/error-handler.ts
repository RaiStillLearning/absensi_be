import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { env } from "../config/env";
import { errorResponse } from "../shared/utils/response";

/**
 * Centralized Error Handler
 * Catches HTTPExceptions and unexpected runtime errors.
 */
export const errorHandler: ErrorHandler = (err: Error, c: Context) => {
  if (err instanceof HTTPException) {
    return c.json(
      errorResponse(err.message),
      err.status
    );
  }

  // Log full error details for server logs
  console.error(`[Unhandled Error] ${err.name}: ${err.message}`, err.stack);

  const message =
    env.APP_ENV === "production"
      ? "Internal Server Error"
      : err.message || "An unexpected error occurred";

  return c.json(errorResponse(message), 500);
};

/**
 * Centralized 404 Not Found Handler
 */
export const notFoundHandler: NotFoundHandler = (c: Context) => {
  return c.json(
    errorResponse(`Route not found: ${c.req.method} ${c.req.path}`),
    404
  );
};

