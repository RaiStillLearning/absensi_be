import { describe, expect, it } from "bun:test";
import { checkDatabaseConnection, db } from "../src/config/database";

describe("Database Configuration", () => {
  it("should initialize Drizzle instance properly", () => {
    expect(db).toBeDefined();
    expect(typeof checkDatabaseConnection).toBe("function");
  });

  it("should connect to PostgreSQL container successfully", async () => {
    const isConnected = await checkDatabaseConnection();
    expect(isConnected).toBe(true);
  });
});
