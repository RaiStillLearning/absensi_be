import { beforeAll, describe, expect, it } from "bun:test";
import { app } from "../src/app";
import { ensureDatabaseInitialized } from "../src/config/database";

describe("SMK Ghama Caraka Backend Foundation", () => {
  beforeAll(async () => {
    await ensureDatabaseInitialized();
  }, 30000);
  it("should return healthy status on GET /health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { success: boolean; message: string; data: { status: string } };
    expect(body).toEqual({
      success: true,
      message: "Backend is running",
      data: {
        status: "healthy",
      },
    });
  });

  it("should return API v1 metadata on GET /api/v1", async () => {
    const res = await app.request("/api/v1");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      success: boolean;
      message: string;
      data: { name: string; version: string };
    };
    expect(body.success).toBe(true);
    expect(body.message).toBe("SMK Ghama Caraka - Attendance API");
    expect(body.data.name).toBe("SMK Ghama Caraka - Attendance API");
    expect(body.data.version).toBe("1.0.0");
  });

  it("should serve OpenAPI 3.0 specification on GET /docs/api/openapi.json", async () => {
    const res = await app.request("/docs/api/openapi.json");
    expect(res.status).toBe(200);

    const spec = (await res.json()) as {
      openapi: string;
      info: { title: string; version: string };
      tags: Array<{ name: string }>;
      components?: { securitySchemes?: Record<string, unknown> };
      paths: Record<string, unknown>;
    };
    expect(spec.openapi).toBe("3.0.0");
    expect(spec.info.title).toBe("SMK Ghama Caraka - Attendance API");
    expect(spec.info.version).toBe("1.0.0");
    expect(spec.tags.length).toBeGreaterThanOrEqual(6);
    expect(spec.components?.securitySchemes?.BearerAuth).toBeDefined();
    expect(spec.paths["/health"]).toBeDefined();
    expect(spec.paths["/api/v1"]).toBeDefined();
  });

  it("should serve Swagger UI on GET /docs/api", async () => {
    const res = await app.request("/docs/api");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("swagger");
  });

  it("should handle 404 for undefined routes gracefully", async () => {
    const res = await app.request("/api/v1/non-existent-path");
    expect(res.status).toBe(404);

    const body = (await res.json()) as { success: boolean; message: string };
    expect(body.success).toBe(false);
    expect(body.message).toContain("Route not found");
  });
});
