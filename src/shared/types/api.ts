import { z } from "@hono/zod-openapi";

/**
 * Standard Success Response Schema Factory
 */
export const createSuccessResponseSchema = <T extends z.ZodTypeAny>(
  dataSchema: T,
  defaultMessage = "Success"
) =>
  z.object({
    success: z.boolean().openapi({ example: true }),
    message: z.string().openapi({ example: defaultMessage }),
    data: dataSchema,
  });

/**
 * Standard Error Detail Schema
 */
export const ErrorDetailSchema = z.object({
  field: z.string().openapi({ example: "username" }),
  message: z.string().openapi({ example: "Field is required" }),
});

/**
 * Standard Error Response Schema
 */
export const ErrorResponseSchema = z.object({
  success: z.boolean().openapi({ example: false }),
  message: z.string().openapi({ example: "An error occurred" }),
  errors: z.array(ErrorDetailSchema).optional().openapi({
    example: [{ field: "username", message: "Field is required" }],
  }),
});

/**
 * Pagination Meta Schema
 */
export const PaginationMetaSchema = z.object({
  page: z.number().int().positive().openapi({ example: 1 }),
  limit: z.number().int().positive().openapi({ example: 10 }),
  total_records: z.number().int().nonnegative().openapi({ example: 100 }),
  total_pages: z.number().int().nonnegative().openapi({ example: 10 }),
  has_next: z.boolean().openapi({ example: true }),
  has_prev: z.boolean().openapi({ example: false }),
});

/**
 * Standard Paginated Response Schema Factory
 */
export const createPaginatedResponseSchema = <T extends z.ZodTypeAny>(
  itemSchema: T,
  defaultMessage = "Data retrieved successfully"
) =>
  z.object({
    success: z.boolean().openapi({ example: true }),
    message: z.string().openapi({ example: defaultMessage }),
    data: z.array(itemSchema),
    pagination: PaginationMetaSchema,
  });

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

