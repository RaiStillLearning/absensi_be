import postgres from "postgres";
import { env } from "../config/env";

async function resetPostgres() {
  console.log("⚠️ Mengatur ulang (reset) skema PostgreSQL 'public' dan 'drizzle'...");
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  try {
    await sql.unsafe(`
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO public;
      DROP SCHEMA IF EXISTS drizzle CASCADE;
    `);
    console.log("✅ Skema PostgreSQL berhasil direset.");
    console.log("👉 Jalankan backend kembali untuk mengeksekusi migrasi Drizzle dan inisialisasi data dari awal.");
  } catch (err) {
    console.error("❌ Gagal mereset skema PostgreSQL:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

resetPostgres();
