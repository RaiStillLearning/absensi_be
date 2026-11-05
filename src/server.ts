import { app } from "./app";
import { env } from "./config/env";
import { APP_CONSTANTS } from "./shared/constants";

const port = env.APP_PORT;

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`🚀 ${APP_CONSTANTS.APP_NAME} started`);
console.log(`📡 Environment: ${env.APP_ENV}`);
console.log(`🌐 Base URL: http://localhost:${server.port}`);
console.log(`📚 Swagger UI: http://localhost:${server.port}${APP_CONSTANTS.DOCS_PATH}`);
console.log(`📄 OpenAPI JSON: http://localhost:${server.port}${APP_CONSTANTS.OPENAPI_JSON_PATH}`);

export default server;

