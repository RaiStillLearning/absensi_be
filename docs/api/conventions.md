# API Design & Conventions — Sistem Absensi Sekolah SMK Ghama Caraka

This document specifies the standard conventions for all HTTP REST APIs within this backend service. Consistency across routes ensures high maintainability and predictable frontend integration.

---

## 1. REST API Naming Conventions

- **Resource-Oriented URIs**: Use plural nouns to represent collections (e.g., `/students`, `/classes`, `/attendance-records`).
- **HTTP Methods as Actions**: Do not put verbs in URIs.
  - `GET` : Read/retrieve resources (idempotent, safe).
  - `POST` : Create new resources or trigger actions.
  - `PUT` : Full replacement of a resource.
  - `PATCH` : Partial update of a resource.
  - `DELETE` : Remove a resource.
- **Nested Resources**: Represent hierarchical relationships logically:
  - `GET /classes/{class_id}/students`
  - `POST /attendance-sessions/{session_id}/check-in`
- **Kebab-case in URIs**: URIs should use lowercase letters with hyphens for multiple words:
  - Correct: `/attendance-records`, `/face-descriptors`
  - Avoid: `/attendanceRecords`, `/attendance_records`

---

## 2. API Versioning Conventions

- All domain routes must be prefixed with `/api/v1`.
- Unversioned routes are limited to:
  - Service health: `/health`
  - API documentation: `/docs/api` and `/docs/api/openapi.json`
- Breaking changes require a version bump (e.g., `/api/v2`).

---

## 3. Field Naming: `snake_case`

All JSON payload fields, request parameters, query parameters, and database columns must follow `snake_case`.

**Example:**
```json
{
  "user_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "full_name": "Ahmad Dani",
  "nisn_number": "0012345678",
  "created_at": "2026-11-05T07:30:00.000Z"
}
```

---

## 4. HTTP Status Code Conventions

Use accurate HTTP status codes:

| Code | Status | Usage |
| :--- | :--- | :--- |
| `200` | OK | Successful GET, PUT, PATCH request |
| `201` | Created | Successful resource creation via POST |
| `204` | No Content | Successful DELETE request returning no body |
| `400` | Bad Request | Validation errors, malformed payloads |
| `401` | Unauthorized | Missing or invalid authentication token |
| `403` | Forbidden | Authenticated user lacks permission/role |
| `404` | Not Found | Requested resource does not exist |
| `409` | Conflict | Duplicate resource or state conflict (e.g., already checked in) |
| `422` | Unprocessable Entity | Syntactically correct input failing business logic |
| `500` | Internal Server Error | Unhandled server exception |

---

## 5. JSON Response Conventions

All API responses return a structured JSON envelope.

### 5.1 Single Resource / Success Response
```json
{
  "success": true,
  "message": "Resource retrieved successfully",
  "data": {
    "id": "uuid-here",
    "name": "XII RPL 1"
  }
}
```

### 5.2 Action Without Data
```json
{
  "success": true,
  "message": "Password updated successfully"
}
```

---

## 6. Pagination Conventions

List endpoints supporting pagination must accept query parameters:
- `page` (integer, default: 1)
- `limit` (integer, default: 10, max: 100)

### Paginated Response Structure
```json
{
  "success": true,
  "message": "Students retrieved successfully",
  "data": [
    {
      "id": "uuid-1",
      "full_name": "Student A"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total_records": 45,
    "total_pages": 5,
    "has_next": true,
    "has_prev": false
  }
}
```

---

## 7. Error Response Conventions

Errors must provide clear context and a machine-readable breakdown where applicable.

### General Error
```json
{
  "success": false,
  "message": "Resource not found"
}
```

### Validation Error (`400 Bad Request`)
```json
{
  "success": false,
  "message": "Validation Error",
  "errors": [
    {
      "field": "nisn_number",
      "message": "NISN must be exactly 10 numeric digits"
    },
    {
      "field": "email",
      "message": "Invalid email address format"
    }
  ]
}
```

