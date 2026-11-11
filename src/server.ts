import { app } from "./app";
import { env } from "./config/env";
import { APP_CONSTANTS } from "./shared/constants";

const port = env.APP_PORT;

async function startServer() {
  if (typeof (globalThis as any).Bun !== "undefined") {
    (globalThis as any).Bun.serve({
      port,
      fetch: app.fetch,
    });
  } else {
    const { serve } = await import("@hono/node-server");
    serve({
      fetch: app.fetch,
      port,
    });
  }

  console.log(`🚀 ${APP_CONSTANTS.APP_NAME} started`);
  console.log(`📡 Environment: ${env.APP_ENV}`);
  console.log(`🌐 Base URL: http://localhost:${port}`);
  console.log(`📚 Swagger UI: http://localhost:${port}${APP_CONSTANTS.DOCS_PATH}`);
  console.log(`📄 OpenAPI JSON: http://localhost:${port}${APP_CONSTANTS.OPENAPI_JSON_PATH}`);
  if (env.APP_ENV !== "production") {
    console.log(`🔍 Scanner Test: http://localhost:${port}/dev/scanner-test`);
  }
}

startServer();

export default app;
