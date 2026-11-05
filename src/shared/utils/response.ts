import type { PaginationMeta } from "../types/api";

/**
 * Standard Success Response Helper
 */
export function successResponse<T>(data: T, message = "Success") {
  return {
    success: true as const,
    message,
    data,
  };
}

/**
 * Standard Paginated Response Helper
 */
export function paginatedResponse<T>(
  data: T[],
  pagination: PaginationMeta,
  message = "Data retrieved successfully"
) {
  return {
    success: true as const,
    message,
    data,
    pagination,
  };
}

/**
 * Standard Error Response Helper
 */
export function errorResponse(message: string, errors?: Array<{ field: string; message: string }>) {
  return {
    success: false as const,
    message,
    ...(errors ? { errors } : {}),
  };
}

