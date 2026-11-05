# API Documentation — Sistem Absensi Sekolah SMK Ghama Caraka

Welcome to the API Documentation directory for the SMK Ghama Caraka School Attendance System. This directory serves as the single source of truth for architectural conventions, endpoint designs, and generated OpenAPI specifications.

---

## 1. Documentation Access

When the backend development server is running (`bun run dev`), the interactive API documentation and raw specification are accessible at:

- **Swagger UI Interface**: [http://localhost:3000/docs/api](http://localhost:3000/docs/api)
- **OpenAPI 3.0 Raw JSON**: [http://localhost:3000/docs/api/openapi.json](http://localhost:3000/docs/api/openapi.json)
- **Static Export**: Stored locally in [`docs/api/openapi.json`](file:///docs/api/openapi.json)

To regenerate the static specification file after modifying or adding routes, run:

```bash
bun run docs:generate
```

---

## 2. API Versioning

All business endpoints are versioned with the `/api/v1` prefix.

- Base URL: `http://localhost:3000/api/v1`
- Unversioned endpoints are reserved strictly for system operations (such as `/health` and documentation routes `/docs/api`).
- Future API version changes will be introduced via separate route mounts (e.g., `/api/v2`).

---

## 3. How to Document New Endpoints

We use **code-first, schema-driven documentation** with `@hono/zod-openapi`. Route specifications and runtime handlers share the same source code.

### Step-by-Step Guide

1. **Define the Route Schema with `createRoute`**:
   ```typescript
   import { createRoute, z } from "@hono/zod-openapi";
   import { API_TAGS } from "../shared/constants";
   import { ErrorResponseSchema } from "../shared/types/api";

   export const getStudentProfileRoute = createRoute({
     method: "get",
     path: "/students/{id}",
     tags: [API_TAGS.SISWA],
     summary: "Get student profile",
     description: "Retrieve complete profile information for a student by ID",
     security: [{ BearerAuth: [] }],
     request: {
       params: z.object({
         id: z.string().uuid().openapi({
           param: { name: "id", in: "path" },
           example: "550e8400-e29b-41d4-a716-446655440000",
         }),
       }),
     },
     responses: {
       200: {
         description: "Student profile found",
         content: {
           "application/json": {
             schema: z.object({
               success: z.boolean().openapi({ example: true }),
               message: z.string().openapi({ example: "Student retrieved successfully" }),
               data: StudentSchema,
             }),
           },
         },
       },
       404: {
         description: "Student not found",
         content: {
           "application/json": {
             schema: ErrorResponseSchema,
           },
         },
       },
     },
   });
   ```

2. **Mount the Route on the Corresponding Router**:
   ```typescript
   router.openapi(getStudentProfileRoute, async (c) => {
     const { id } = c.req.valid("param");
     // Handler logic...
     return c.json({ success: true, message: "...", data: result }, 200);
   });
   ```

---

## 4. How to Add New API Tags

API tags categorize endpoints into logical groups within Swagger UI.

1. Add the new tag name in [`src/shared/constants/index.ts`](file:///src/shared/constants/index.ts):
   ```typescript
   export const API_TAGS = {
     // ...
     REPORTS: "Reports",
   } as const;
   ```
2. Add the tag description in `app.doc` inside [`src/app.ts`](file:///src/app.ts):
   ```typescript
   tags: [
     // ...
     { name: API_TAGS.REPORTS, description: "Attendance and academic reports" },
   ]
   ```
3. Reference the tag in the `createRoute({ tags: [API_TAGS.REPORTS], ... })` definition.

---

## 5. How to Define Request and Response Schemas

All schemas must use Zod with `.openapi()` extensions for metadata and examples:

- **Query Parameters**:
  ```typescript
  request: {
    query: z.object({
      page: z.coerce.number().int().positive().default(1).openapi({ example: 1 }),
      limit: z.coerce.number().int().positive().default(10).openapi({ example: 10 }),
    }),
  }
  ```
- **Request Body**:
  ```typescript
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateRecordSchema,
        },
      },
    },
  }
  ```
- **Responses**: Always adhere to standard JSON response conventions (see [`conventions.md`](file:///docs/api/conventions.md)).

---

## 6. How to Configure Authentication Documentation

Protected endpoints must declare the security scheme in the route definition:

```typescript
export const protectedRoute = createRoute({
  method: "get",
  path: "/protected-resource",
  tags: [API_TAGS.ADMIN],
  security: [
    {
      BearerAuth: [],
    },
  ],
  // ...
});
```

The `BearerAuth` scheme is registered globally in [`src/app.ts`](file:///src/app.ts) as an HTTP Bearer JWT token scheme. In Swagger UI, developers can click the "Authorize" button and enter their JWT token.

