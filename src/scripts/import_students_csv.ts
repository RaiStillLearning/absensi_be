import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { closeDatabaseConnection, db } from "../config/database";
import { env } from "../config/env";
import {
  classes,
  class_students,
  student_barcodes,
  students,
  users,
} from "../config/schema";

// Known gender lookup table for SMK Ghama Caraka data
const KNOWN_GENDERS: Record<string, "L" | "P"> = {
  // KELAS 11
  "0097061219": "L",
  "3099505781": "L",
  "0096147878": "P",
  "0083237382": "L",
  "0088181016": "P",
  "0085951918": "L",
  "0092260256": "L",
  "0088558708": "L",
  "0095255243": "L",
  "0081075137": "L",
  "0095769100": "L",
  "0098700497": "L",
  "0086580666": "L",
  "0082221670": "L",
  "0071617142": "L",
  "0092937161": "L",
  "0087600918": "L",
  "3083843538": "L",
  "0088923958": "P",
  "3094068054": "P",
  "0086211369": "L",
  // KELAS 12
  "0086836167": "P",
  "0086417638": "P",
  "0077625596": "L",
  "0077676524": "L",
  "0077658622": "L",
  "0086001899": "L",
  "0077997573": "L",
  "0078843193": "L",
  "0072023589": "L",
  "0077517368": "L",
  "0081364456": "L",
  "0057448755": "L",
  "0073136149": "L",
  "0088528501": "L",
  "0088130270": "P",
  "0078645116": "L",
  "0089381409": "P",
  "0071507225": "P",
  "0082975208": "L",
  "0087926455": "P",
};

export interface ImportSummary {
  total_read: number;
  students_inserted: number;
  students_existing: number;
  users_created: number;
  users_existing: number;
  failed_count: number;
  errors: Array<{ line: number; nisn?: string; reason: string }>;
}

/**
 * Parse CSV line respecting quotes and commas
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Main function to import students from CSV file into PostgreSQL
 */
export async function importStudentsFromCsv(
  csvFilePath = join(process.cwd(), "data", "students.csv")
): Promise<ImportSummary> {
  console.log("📥 Memulai import data siswa dari CSV ke PostgreSQL...");
  console.log(`📁 Lokasi file: ${csvFilePath}\n`);

  if (!existsSync(csvFilePath)) {
    throw new Error(`File CSV tidak ditemukan di: ${csvFilePath}`);
  }

  const fileContent = readFileSync(csvFilePath, "utf-8");
  const lines = fileContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length <= 1) {
    throw new Error("File CSV kosong atau hanya berisi baris header.");
  }

  const summary: ImportSummary = {
    total_read: 0,
    students_inserted: 0,
    students_existing: 0,
    users_created: 0,
    users_existing: 0,
    failed_count: 0,
    errors: [],
  };

  // Pre-hash default student password with bcrypt cost 10
  const defaultPassword = env.STUDENT_DEFAULT_PASSWORD || "Ghama123!";
  const passwordHash = await Bun.password.hash(defaultPassword, {
    algorithm: "bcrypt",
    cost: 10,
  });

  // Track unique classes to cache class records
  const classCache = new Map<string, { id: string; name: string }>();

  // Track seen NISN in this file to detect within-file duplicates
  const seenNisns = new Set<string>();

  // Collect barcode mapping for printing and reference
  const exportedBarcodes: Array<{
    no: number;
    nisn: string;
    full_name: string;
    class_name: string;
    barcode_id: string;
  }> = [];

  // Process rows starting at line 1 (0 is header)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    summary.total_read++;
    const columns = parseCsvLine(line);

    // Expected format: No, NISN, Nama Siswa, Kelas
    if (columns.length < 3) {
      summary.failed_count++;
      summary.errors.push({
        line: i + 1,
        reason: "Format kolom tidak sesuai (minimal harus memiliki No, NISN, Nama Siswa).",
      });
      continue;
    }

    const [rawNo, rawNisn, rawNama, rawKelas] = columns;
    const nisn = (rawNisn || "").trim();
    const fullName = (rawNama || "").trim();
    const className = (rawKelas || "X PPLG 1").trim();
    const studentNumber = parseInt((rawNo || "").trim(), 10) || i;
    const barcodeValue = `ABSENSI${String(studentNumber).padStart(3, "0")}`;
    const tokenHash = createHash("sha256").update(barcodeValue).digest("hex");

    // Validation: NISN must be non-empty and numeric string
    if (!nisn || !/^\d{5,20}$/.test(nisn)) {
      summary.failed_count++;
      summary.errors.push({
        line: i + 1,
        nisn: nisn ? `${nisn.slice(0, 3)}***` : undefined,
        reason: "NISN tidak valid (harus berupa string angka 5-20 digit).",
      });
      continue;
    }

    // Validation: Full name required
    if (!fullName || fullName.length < 2) {
      summary.failed_count++;
      summary.errors.push({
        line: i + 1,
        nisn: `${nisn.slice(0, 3)}***`,
        reason: "Nama siswa tidak boleh kosong.",
      });
      continue;
    }

    // Check duplicate in the same CSV file
    if (seenNisns.has(nisn)) {
      summary.failed_count++;
      summary.errors.push({
        line: i + 1,
        nisn: `${nisn.slice(0, 3)}***`,
        reason: "Duplikasi NISN terdeteksi dalam file CSV yang sama.",
      });
      continue;
    }
    seenNisns.add(nisn);

    try {
      // 1. Ensure Class exists
      let targetClass = classCache.get(className);
      if (!targetClass) {
        const existingClass = (
          await db.select().from(classes).where(eq(classes.name, className)).limit(1)
        )[0];

        if (existingClass) {
          targetClass = existingClass;
        } else {
          const inserted = await db
            .insert(classes)
            .values({ name: className })
            .returning();
          const created = inserted[0];
          if (!created) throw new Error(`Gagal membuat kelas: ${className}`);
          targetClass = created;
        }
        classCache.set(className, targetClass);
      }

      // 2. Ensure Student exists (Idempotent: find by NISN)
      const existingStudent = (
        await db.select().from(students).where(eq(students.nisn, nisn)).limit(1)
      )[0];

      let studentId = "";
      const gender = KNOWN_GENDERS[nisn] || "L";

      if (existingStudent) {
        studentId = existingStudent.id;
        summary.students_existing++;
      } else {
        const inserted = await db
          .insert(students)
          .values({
            nisn,
            full_name: fullName,
            gender,
            status: "active",
          })
          .returning();
        const created = inserted[0];
        if (!created) throw new Error("Gagal memasukkan siswa.");
        studentId = created.id;
        summary.students_inserted++;
      }

      // 3. Ensure Student-Class Enrollment
      const existingEnrollment = (
        await db
          .select()
          .from(class_students)
          .where(
            and(
              eq(class_students.class_id, targetClass.id),
              eq(class_students.student_id, studentId)
            )
          )
          .limit(1)
      )[0];

      if (!existingEnrollment) {
        await db.insert(class_students).values({
          class_id: targetClass.id,
          student_id: studentId,
          is_active: true,
        });
      }

      // 4. Ensure Barcode Token exists (e.g. ABSENSI001, ABSENSI002, ...)
      const existingBarcode = (
        await db
          .select()
          .from(student_barcodes)
          .where(
            and(
              eq(student_barcodes.student_id, studentId),
              eq(student_barcodes.is_active, true)
            )
          )
          .limit(1)
      )[0];

      if (existingBarcode) {
        if (
          existingBarcode.barcode_value !== barcodeValue ||
          existingBarcode.token_hash !== tokenHash
        ) {
          await db
            .update(student_barcodes)
            .set({
              barcode_value: barcodeValue,
              token_hash: tokenHash,
              format: "CODE_128",
              updated_at: new Date(),
            })
            .where(eq(student_barcodes.id, existingBarcode.id));
        }
      } else {
        await db.insert(student_barcodes).values({
          student_id: studentId,
          barcode_value: barcodeValue,
          token_hash: tokenHash,
          format: "CODE_128",
          is_active: true,
        });
      }

      exportedBarcodes.push({
        no: studentNumber,
        nisn,
        full_name: fullName,
        class_name: className,
        barcode_id: barcodeValue,
      });

      // 5. Ensure User Account exists for NISN login
      const existingUser = (
        await db.select().from(users).where(eq(users.username, nisn)).limit(1)
      )[0];

      if (existingUser) {
        summary.users_existing++;
      } else {
        await db.insert(users).values({
          username: nisn,
          password_hash: passwordHash,
          role: "siswa",
          student_id: studentId,
          is_active: true,
        });
        summary.users_created++;
      }
    } catch (err: any) {
      summary.failed_count++;
      summary.errors.push({
        line: i + 1,
        nisn: `${nisn.slice(0, 3)}***`,
        reason: err?.message || String(err),
      });
    }
  }

  console.log("==================================================");
  console.log("📊 HASIL IMPORT DATA SISWA:");
  console.log(` - Total baris dibaca    : ${summary.total_read}`);
  console.log(` - Siswa baru dimasukkan : ${summary.students_inserted}`);
  console.log(` - Siswa sudah terdaftar : ${summary.students_existing}`);
  console.log(` - Akun login baru       : ${summary.users_created}`);
  console.log(` - Akun login existing   : ${summary.users_existing}`);
  console.log(` - Baris gagal / error   : ${summary.failed_count}`);
  console.log("==================================================");

  if (summary.errors.length > 0) {
    console.warn("⚠️ Daftar error:", summary.errors);
  }

  // Export tokens map to students_tokens.json for barcode label printing and reference
  try {
    writeFileSync(
      join(process.cwd(), "students_tokens.json"),
      JSON.stringify(exportedBarcodes, null, 2),
      "utf-8"
    );
    console.log(`📄 Barcode tokens berhasil diekspor ke: ${join(process.cwd(), "students_tokens.json")}`);
  } catch (exportErr) {
    console.warn("⚠️ Gagal mengekspor students_tokens.json:", exportErr);
  }

  return summary;
}

// Execute when invoked directly
if (import.meta.main) {
  const customPath = process.argv[2];
  importStudentsFromCsv(customPath)
    .then(async () => {
      await closeDatabaseConnection();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("❌ Fatal error saat import:", err);
      await closeDatabaseConnection();
      process.exit(1);
    });
}

