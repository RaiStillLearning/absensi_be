import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { app } from "../app";
import { APP_CONSTANTS } from "../shared/constants";

async function generateOpenApiJson() {
  console.log("Generating OpenAPI specification...");

  const res = await app.request(APP_CONSTANTS.OPENAPI_JSON_PATH);

  if (!res.ok) {
    throw new Error(`Failed to fetch OpenAPI JSON: ${res.status} ${res.statusText}`);
  }

  const spec = await res.json();
  const targetPath = fileURLToPath(new URL("../../docs/api/openapi.json", import.meta.url));

  await writeFile(targetPath, JSON.stringify(spec, null, 2) + "\n", "utf-8");
  console.log(`✅ OpenAPI specification successfully written to ${targetPath}`);
}

generateOpenApiJson().catch((err) => {
  console.error("❌ Failed to generate OpenAPI specification:", err);
  process.exit(1);
});
