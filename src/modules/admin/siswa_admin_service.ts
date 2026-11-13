import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../../config/database";
import { env } from "../../config/env";
import {
  activity_logs,
  class_students,
  classes,
  promotion_scheduler_runs,
  student_barcodes,
  student_promotion_logs,
  students,
  subject_attendance_records,
  users,
} from "../../config/schema";
import { hashPassword } from "../../shared/utils/hash";
import { saveValidatedAvatarFile, validateProfilePhotoValue } from "../../shared/utils/upload";

export type GradeLevel = 10 | 11 | 12;

export interface AdminStudentItem {
  id: string;
  nisn: string;
  nis: string;
  nama_lengkap: string;
  kelas: string;
  tingkat: number;
  jurusan: string;
  jenis_kelamin: string;
  status: "Aktif" | "Lulus";
  status_raw: string;
  foto_profil: string;
  created_at: string;
  updated_at: string;
}

export interface PromotionHistoryItem {
  id: string;
  batch_id: string | null;
  student_id: string | null;
  nisn: string;
  nama_siswa: string;
  kelas_sebelumnya: string;
  kelas_tujuan: string;
  tahun_ajaran: string;
  jenis_proses: "Otomatis" | "Manual";
  executed_by: string;
  catatan: string;
  tanggal_kenaikan: string;
}

export interface PromotionCandidateResult {
  nisn: string;
  nama_siswa: string;
  kelas_asal: string;
  kelas_tujuan: string;
  status: "berhasil" | "ditolak";
  alasan?: string;
}

const DEFAULT_SCHOOL_NAME = "SMK Ghama Caraka";
const DEFAULT_TAHUN_AJARAN = "2026/2027";

/**
 * Parse numeric grade level (10, 11, 12, or >12 for invalid higher grades) from class string.
 */
export function parseGradeNumber(kelasInput: string): number | null {
  const cleaned = String(kelasInput || "").trim().toUpperCase();
  if (!cleaned) return null;

  // Check Roman numerals first (longest first: XIII, XII, XI, X)
  if (/^(KELAS\s+)?XIII(\b|\s|$)/.test(cleaned)) return 13;
  if (/^(KELAS\s+)?XII(\b|\s|$)/.test(cleaned)) return 12;
  if (/^(KELAS\s+)?XI(\b|\s|$)/.test(cleaned)) return 11;
  if (/^(KELAS\s+)?X(\b|\s|$)/.test(cleaned)) return 10;

  // Check numeric prefix (e.g. 10, 11, 12, 13, Kelas 10, 10 RPL 1)
  const numMatch = cleaned.match(/^(?:KELAS\s+)?(\d{1,2})(?:\b|\s|$)/);
  if (numMatch?.[1]) {
    const parsed = Number.parseInt(numMatch[1], 10);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return null;
}

export function gradeToRoman(grade: number): string {
  if (grade === 10) return "X";
  if (grade === 11) return "XI";
  if (grade === 12) return "XII";
  return String(grade);
}

/**
 * Derive full major (Jurusan) name from class name or code.
 */
export function deriveJurusanName(kelasInput: string, explicitJurusan?: string): string {
  const explicit = String(explicitJurusan || "").trim();
  if (explicit) {
    const upper = explicit.toUpperCase();
    if (upper === "RPL" || upper === "PPLG") return "Rekayasa Perangkat Lunak";
    if (upper === "TKJ" || upper === "TJKT") return "Teknik Komputer dan Jaringan";
    if (upper === "AKL") return "Akuntansi dan Keuangan Lembaga";
    if (upper === "MP" || upper === "OTKP") return "Manajemen Perkantoran";
    if (upper === "BD" || upper === "BDP") return "Bisnis Digital";
    return explicit;
  }

  const upperKelas = String(kelasInput || "").toUpperCase();
  if (upperKelas.includes("RPL") || upperKelas.includes("PPLG")) {
    return "Rekayasa Perangkat Lunak";
  }
  if (upperKelas.includes("TKJ") || upperKelas.includes("TJKT")) {
    return "Teknik Komputer dan Jaringan";
  }
  if (upperKelas.includes("AKL")) {
    return "Akuntansi dan Keuangan Lembaga";
  }
  if (upperKelas.includes("OTKP") || upperKelas.includes("MP")) {
    return "Manajemen Perkantoran";
  }
  return "Rekayasa Perangkat Lunak";
}

export function deriveJurusanShortCode(jurusanOrKelas: string): string {
  const upper = String(jurusanOrKelas || "").toUpperCase();
  if (upper.includes("TKJ") || upper.includes("JARINGAN")) return "TKJ";
  if (upper.includes("AKL") || upper.includes("AKUNTANSI")) return "AKL";
  if (upper.includes("MP") || upper.includes("PERKANTORAN")) return "MP";
  return "RPL";
}

/**
 * Normalize status string from database ('active' / 'graduated' / 'Lulus') to UI label.
 */
export function normalizeStudentStatus(rawStatus: string | null | undefined): "Aktif" | "Lulus" {
  const lower = String(rawStatus || "active").trim().toLowerCase();
  if (lower === "graduated" || lower === "lulus") {
    return "Lulus";
  }
  return "Aktif";
}

export function isStudentGraduated(rawStatus: string | null | undefined): boolean {
  return normalizeStudentStatus(rawStatus) === "Lulus";
}

/**
 * Compute target class name when promoting a student from `currentKelas` to `targetSpec`.
 * - If `targetSpec` is "Lulus", returns "Lulus".
 * - If `targetSpec` is a grade number ("11", "12", "Kelas 11", "Kelas 12", "XI", "XII"):
 *   preserves the student's existing class suffix if they have one (e.g. "X RPL 1" -> "XI RPL 1"),
 *   or uses "11"/"12" if `currentKelas` was numeric ("10" -> "11").
 * - If `targetSpec` is a full class name (e.g. "XI RPL 1", "XII RPL 1"), returns `targetSpec`.
 */
export function computePromotedClassName(currentKelas: string, targetSpec: string): string {
  const cleanTarget = String(targetSpec || "").trim();
  if (/^lulus$/i.test(cleanTarget)) {
    return "Lulus";
  }

  const targetUpper = cleanTarget.toUpperCase();
  const isGenericGradeTarget = /^(KELAS\s+)?(10|11|12|X|XI|XII)$/.test(targetUpper);

  if (!isGenericGradeTarget) {
    return cleanTarget;
  }

  const targetGrade = parseGradeNumber(cleanTarget);
  if (!targetGrade || (targetGrade !== 10 && targetGrade !== 11 && targetGrade !== 12)) {
    return cleanTarget;
  }

  const trimmedCurrent = String(currentKelas || "").trim();
  // If currentKelas is e.g. "X RPL 1" or "XI TKJ 2"
  const romanMatch = trimmedCurrent.match(/^(XII|XI|X)(\s+.+)$/i);
  if (romanMatch?.[2]) {
    return `${gradeToRoman(targetGrade)}${romanMatch[2]}`;
  }

  // If currentKelas is e.g. "10 RPL 1" or "11 TKJ 1"
  const numWithSuffixMatch = trimmedCurrent.match(/^(?:Kelas\s+)?(10|11|12)(\s+.+)$/i);
  if (numWithSuffixMatch?.[2]) {
    return `${targetGrade}${numWithSuffixMatch[2]}`;
  }

  // If currentKelas is pure Roman "X" / "XI"
  if (/^(X|XI|XII)$/i.test(trimmedCurrent)) {
    return gradeToRoman(targetGrade);
  }

  // Default numeric grade representation ("10", "11", "12")
  return String(targetGrade);
}

/**
 * Determine whether a student's `kelas` matches a class filter or source class selector.
 * Supports matching by grade ("10", "11", "12", "Kelas 10", "X", "XI", "XII") OR exact class name ("X RPL 1").
 */
export function matchesClassSelector(studentKelas: string, selector: string): boolean {
  const cleanSelector = String(selector || "").trim();
  if (!cleanSelector || cleanSelector.toLowerCase() === "semua") return true;

  const selectorUpper = cleanSelector.toUpperCase();
  const isGradeOnlySelector = /^(KELAS\s+)?(10|11|12|X|XI|XII)$/.test(selectorUpper);
  if (isGradeOnlySelector) {
    const targetGrade = parseGradeNumber(selectorUpper);
    const studentGrade = parseGradeNumber(studentKelas);
    return targetGrade !== null && studentGrade === targetGrade;
  }

  return String(studentKelas || "").trim().toLowerCase() === cleanSelector.toLowerCase();
}

/**
 * Add 6 calendar months to a Date for the 6-month repeat-promotion cooldown check.
 */
export function addSixMonths(date: Date): Date {
  const copy = new Date(date.getTime());
  copy.setMonth(copy.getMonth() + 6);
  return copy;
}

/**
 * Check if `now` is within <= 6 months of `lastPromotedAt`.
 */
export function isWithinSixMonthsCooldown(lastPromotedAt: Date, now: Date = new Date()): boolean {
  const diffMs = now.getTime() - lastPromotedAt.getTime();
  if (diffMs < 0) return true;
  const sixMonthsLater = addSixMonths(lastPromotedAt);
  return now.getTime() <= sixMonthsLater.getTime();
}

export function formatJakartaDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function getJakartaDateParts(date: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  tahunAjaran: string;
} {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? date.getFullYear());
  const month = Number(parts.find((p) => p.type === "month")?.value ?? date.getMonth() + 1);
  const day = Number(parts.find((p) => p.type === "day")?.value ?? date.getDate());

  // Academic year in Indonesia: June/July starts year/(year+1); May graduation closes (year-1)/year or current configured year
  const tahunAjaran = month >= 6 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
  return { year, month, day, tahunAjaran };
}

function mapStudentRowToAdminItem(row: typeof students.$inferSelect): AdminStudentItem {
  const tingkat = parseGradeNumber(row.kelas) ?? 10;
  const statusLabel = normalizeStudentStatus(row.status);
  return {
    id: row.id,
    nisn: row.nisn,
    nis: row.nis || `2425${row.nisn.slice(-5)}`,
    nama_lengkap: row.full_name,
    kelas: row.kelas,
    tingkat,
    jurusan: deriveJurusanName(row.kelas, row.jurusan),
    jenis_kelamin: row.gender === "P" ? "Perempuan" : "Laki-laki",
    status: statusLabel,
    status_raw: row.status,
    foto_profil: row.foto_profil || "",
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

/**
 * Ensure a class row exists in `classes` table and return its UUID.
 */
async function ensureClassRecord(
  tx: any,
  kelasName: string,
  explicitJurusan?: string
): Promise<string | null> {
  const cleanName = String(kelasName || "").trim();
  if (!cleanName || /^lulus$/i.test(cleanName)) return null;

  const [existing] = await tx
    .select()
    .from(classes)
    .where(eq(classes.name, cleanName))
    .limit(1);

  if (existing) return existing.id;

  const gradeNum = parseGradeNumber(cleanName) ?? 10;
  const tingkatRoman = gradeToRoman(gradeNum);
  const jurusanCode = deriveJurusanShortCode(explicitJurusan || cleanName);

  const [inserted] = await tx
    .insert(classes)
    .values({
      name: cleanName,
      tingkat: tingkatRoman,
      jurusan: jurusanCode,
      wali_kelas: "",
      tahun_ajaran: DEFAULT_TAHUN_AJARAN,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted) return inserted.id;

  const [refetched] = await tx
    .select()
    .from(classes)
    .where(eq(classes.name, cleanName))
    .limit(1);
  return refetched?.id ?? null;
}

/**
 * Sync student's active class enrollment in `class_students`.
 */
async function syncStudentClassEnrollment(
  tx: any,
  studentId: string,
  kelasName: string,
  explicitJurusan?: string
): Promise<void> {
  const classId = await ensureClassRecord(tx, kelasName, explicitJurusan);
  if (!classId) return;

  await tx
    .update(class_students)
    .set({ is_active: false })
    .where(eq(class_students.student_id, studentId));

  const [existingLink] = await tx
    .select()
    .from(class_students)
    .where(
      and(
        eq(class_students.class_id, classId),
        eq(class_students.student_id, studentId)
      )
    )
    .limit(1);

  if (existingLink) {
    await tx
      .update(class_students)
      .set({ is_active: true })
      .where(eq(class_students.id, existingLink.id));
  } else {
    await tx.insert(class_students).values({
      class_id: classId,
      student_id: studentId,
      is_active: true,
    });
  }
}

/**
 * Validate NISN format and check if it is already used in `students` or `users`.
 */
export async function checkNisnAvailability(nisnInput: string): Promise<{
  valid: boolean;
  available: boolean;
  nisn: string;
  message: string;
}> {
  const nisn = String(nisnInput || "").trim();
  if (!nisn) {
    return {
      valid: false,
      available: false,
      nisn,
      message: "NISN wajib diisi",
    };
  }

  if (!/^\d{4,20}$/.test(nisn)) {
    return {
      valid: false,
      available: false,
      nisn,
      message: "NISN harus berupa angka (4 sampai 20 digit)",
    };
  }

  const [existingStudent] = await db
    .select({ id: students.id, full_name: students.full_name })
    .from(students)
    .where(eq(students.nisn, nisn))
    .limit(1);

  if (existingStudent) {
    return {
      valid: true,
      available: false,
      nisn,
      message: `NISN ${nisn} sudah terdaftar atas nama ${existingStudent.full_name}`,
    };
  }

  const [existingUser] = await db
    .select({ id: users.id, nama_lengkap: users.nama_lengkap })
    .from(users)
    .where(eq(users.username, nisn))
    .limit(1);

  if (existingUser) {
    return {
      valid: true,
      available: false,
      nisn,
      message: `NISN ${nisn} sudah digunakan oleh akun ${existingUser.nama_lengkap}`,
    };
  }

  return {
    valid: true,
    available: true,
    nisn,
    message: "NISN tersedia dan dapat digunakan",
  };
}

/**
 * List students for Admin with search, class filter, status filter, and pagination.
 */
export async function listAdminStudents(params: {
  search?: string;
  kelas?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const search = String(params.search || "").trim();
  const kelasFilter = String(params.kelas || "").trim();
  const statusFilter = String(params.status || "").trim();
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 10));

  const allRows = await db
    .select()
    .from(students)
    .orderBy(asc(students.kelas), asc(students.full_name));

  const allClassRows = await db.select().from(classes).orderBy(asc(classes.name));
  const classSet = new Set<string>();
  for (const c of allClassRows) {
    if (c.name) classSet.add(c.name);
  }
  for (const s of allRows) {
    if (s.kelas) classSet.add(s.kelas);
  }

  // Ensure standard classes exist in options for grades 10, 11, 12
  for (const stdClass of ["X RPL 1", "X RPL 2", "X TKJ 1", "XI RPL 1", "XI TKJ 1", "XII RPL 1", "XII TKJ 1"]) {
    classSet.add(stdClass);
  }

  const totalSiswa = allRows.length;
  const totalAktif = allRows.filter((r) => !isStudentGraduated(r.status)).length;
  const totalLulus = allRows.filter((r) => isStudentGraduated(r.status)).length;

  const filtered = allRows.filter((row) => {
    if (search) {
      const q = search.toLowerCase();
      const matchNisn = row.nisn.toLowerCase().includes(q);
      const matchName = row.full_name.toLowerCase().includes(q);
      if (!matchNisn && !matchName) return false;
    }

    if (kelasFilter && kelasFilter.toLowerCase() !== "semua") {
      if (!matchesClassSelector(row.kelas, kelasFilter)) return false;
    }

    if (statusFilter && statusFilter.toLowerCase() !== "semua") {
      const normalized = normalizeStudentStatus(row.status);
      if (statusFilter.toLowerCase() === "aktif" || statusFilter.toLowerCase() === "active") {
        if (normalized !== "Aktif") return false;
      } else if (
        statusFilter.toLowerCase() === "lulus" ||
        statusFilter.toLowerCase() === "graduated"
      ) {
        if (normalized !== "Lulus") return false;
      }
    }

    return true;
  });

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;
  const paginatedItems = filtered.slice(offset, offset + limit).map(mapStudentRowToAdminItem);

  return {
    items: paginatedItems,
    pagination: {
      page: safePage,
      limit,
      total: totalFiltered,
      total_pages: totalPages,
    },
    summary: {
      total_siswa: totalSiswa,
      total_aktif: totalAktif,
      total_lulus: totalLulus,
    },
    available_classes: Array.from(classSet).sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Get complete detail of a single student by NISN or UUID, including card data & promotion history.
 */
export async function getAdminStudentDetail(identifier: string) {
  const cleanId = String(identifier || "").trim();
  if (!cleanId) return null;

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);

  const [studentRow] = await db
    .select()
    .from(students)
    .where(isUuid ? or(eq(students.id, cleanId), eq(students.nisn, cleanId)) : eq(students.nisn, cleanId))
    .limit(1);

  if (!studentRow) return null;

  const historyRows = await db
    .select()
    .from(student_promotion_logs)
    .where(
      or(
        eq(student_promotion_logs.nisn, studentRow.nisn),
        eq(student_promotion_logs.student_id, studentRow.id)
      )
    )
    .orderBy(desc(student_promotion_logs.promoted_at));

  const item = mapStudentRowToAdminItem(studentRow);

  const riwayat_kenaikan: PromotionHistoryItem[] = historyRows.map((h) => ({
    id: h.id,
    batch_id: h.batch_id,
    student_id: h.student_id,
    nisn: h.nisn,
    nama_siswa: h.student_name,
    kelas_sebelumnya: h.from_class,
    kelas_tujuan: h.to_class,
    tahun_ajaran: h.tahun_ajaran,
    jenis_proses: h.process_type === "Otomatis" ? "Otomatis" : "Manual",
    executed_by: h.executed_by,
    catatan: h.notes || "",
    tanggal_kenaikan: h.promoted_at.toISOString(),
  }));

  const latestPromotion = historyRows[0] ?? null;
  const onCooldown = latestPromotion
    ? isWithinSixMonthsCooldown(latestPromotion.promoted_at)
    : false;

  return {
    siswa: item,
    kartu: {
      nama_sekolah: DEFAULT_SCHOOL_NAME,
      logo_sekolah: "/logo.png",
      nama_lengkap: item.nama_lengkap,
      nisn: item.nisn,
      nis: item.nis,
      kelas: item.kelas,
      tingkat: item.tingkat,
      jurusan: item.jurusan,
      foto_profil: item.foto_profil,
      status: item.status,
      kartu_depan_svg: "/kartu-siswa-depan.svg",
      kartu_belakang_svg: "/kartu-siswa-belakang.svg",
    },
    riwayat_kenaikan,
    status_kenaikan: {
      terakhir_dinaikkan: latestPromotion ? latestPromotion.promoted_at.toISOString() : null,
      dalam_cooldown_6_bulan: onCooldown,
      dapat_dinaikkan: item.status === "Aktif" && !onCooldown,
    },
  };
}

/**
 * Create a new student and automatically provision their `users` account (default password `gc123`),
 * `class_students` link, and `student_barcodes`.
 */
export async function createAdminStudent(input: {
  nisn: string;
  nama_lengkap: string;
  kelas: string;
  jurusan?: string;
  foto_profil?: string;
  jenis_kelamin?: string;
}): Promise<
  | { ok: true; data: AdminStudentItem }
  | { ok: false; status: number; message: string }
> {
  const nisn = String(input.nisn || "").trim();
  const namaLengkap = String(input.nama_lengkap || "").trim();
  const rawKelas = String(input.kelas || "").trim();

  if (!nisn) {
    return { ok: false, status: 400, message: "NISN wajib diisi" };
  }
  if (!/^\d{4,20}$/.test(nisn)) {
    return {
      ok: false,
      status: 400,
      message: "NISN harus berupa angka (4 sampai 20 digit)",
    };
  }
  if (!namaLengkap || namaLengkap.length < 2) {
    return { ok: false, status: 400, message: "Nama lengkap siswa wajib diisi (minimal 2 karakter)" };
  }
  if (!rawKelas) {
    return { ok: false, status: 400, message: "Kelas wajib dipilih (10, 11, atau 12)" };
  }

  const gradeNum = parseGradeNumber(rawKelas);
  if (gradeNum !== 10 && gradeNum !== 11 && gradeNum !== 12) {
    return {
      ok: false,
      status: 400,
      message: "Kelas tidak valid. Pilih kelas tingkat 10, 11, atau 12",
    };
  }

  const nisnCheck = await checkNisnAvailability(nisn);
  if (!nisnCheck.available) {
    return { ok: false, status: 409, message: nisnCheck.message };
  }

  let validatedPhoto = "";
  if (input.foto_profil && String(input.foto_profil).trim() !== "") {
    const rawPhoto = String(input.foto_profil).trim();
    const photoCheck = validateProfilePhotoValue(rawPhoto);
    if (!photoCheck.valid) {
      return { ok: false, status: 400, message: photoCheck.error };
    }
    validatedPhoto = rawPhoto;
  }

  const jurusanFull = deriveJurusanName(rawKelas, input.jurusan);
  const genderCode =
    String(input.jenis_kelamin || "").toLowerCase().startsWith("p") ? "P" : "L";
  const defaultPassword = env.STUDENT_DEFAULT_PASSWORD || "gc123";
  const passwordHash = hashPassword(defaultPassword);

  const created = await db.transaction(async (tx) => {
    // Double-check uniqueness inside transaction
    const [dupStudent] = await tx
      .select({ id: students.id })
      .from(students)
      .where(eq(students.nisn, nisn))
      .limit(1);
    if (dupStudent) {
      throw new Error(`DUPLICATE_NISN:NISN ${nisn} sudah terdaftar di sistem`);
    }

    const [dupUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, nisn))
      .limit(1);
    if (dupUser) {
      throw new Error(`DUPLICATE_NISN:NISN ${nisn} sudah terdaftar pada akun pengguna`);
    }

    const [insertedStudent] = await tx
      .insert(students)
      .values({
        nisn,
        nis: `2425${nisn.slice(-5)}`,
        full_name: namaLengkap,
        gender: genderCode,
        kelas: rawKelas,
        jurusan: jurusanFull,
        foto_profil: validatedPhoto,
        status: "active",
      })
      .returning();

    if (!insertedStudent) {
      throw new Error("Gagal menyimpan data siswa baru");
    }

    // Ensure class and link student to class_students
    await syncStudentClassEnrollment(tx, insertedStudent.id, rawKelas, jurusanFull);

    // Create linked student user account with default password 'gc123'
    await tx.insert(users).values({
      username: nisn,
      role: "siswa",
      nama_lengkap: namaLengkap,
      email: "",
      foto_profil: validatedPhoto,
      student_id: insertedStudent.id,
      password_hash: passwordHash,
      must_change_password: true,
      is_active: true,
    });

    // Create active student barcode for attendance scanning
    const rawToken = randomBytes(24).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    await tx.insert(student_barcodes).values({
      student_id: insertedStudent.id,
      barcode_value: `GC-${nisn}`,
      token_hash: tokenHash,
      format: "QR_CODE",
      is_active: true,
    });

    await tx.insert(activity_logs).values({
      jenis: "siswa_baru",
      judul: "Siswa Baru Ditambahkan",
      deskripsi: `${namaLengkap} (NISN: ${nisn}) ditambahkan ke kelas ${rawKelas}`,
      waktu: "Baru saja",
    });

    return insertedStudent;
  }).catch((err: any) => {
    const msg = String(err?.message || "");
    if (msg.startsWith("DUPLICATE_NISN:")) {
      return { __duplicateError: msg.replace("DUPLICATE_NISN:", "") };
    }
    if (err?.code === "23505") {
      return { __duplicateError: `NISN ${nisn} sudah terdaftar di database` };
    }
    throw err;
  });

  if ("__duplicateError" in created) {
    return { ok: false, status: 409, message: created.__duplicateError };
  }

  return { ok: true, data: mapStudentRowToAdminItem(created) };
}

/**
 * Update existing student data (Nama Lengkap, Kelas, Jurusan, Foto Profil).
 * NISN is strictly READ-ONLY and cannot be modified via UI or API.
 */
export async function updateAdminStudent(
  targetNisn: string,
  payload: Record<string, unknown>
): Promise<
  | { ok: true; data: AdminStudentItem }
  | { ok: false; status: number; message: string }
> {
  const cleanNisn = String(targetNisn || "").trim();
  const [existing] = await db
    .select()
    .from(students)
    .where(eq(students.nisn, cleanNisn))
    .limit(1);

  if (!existing) {
    return { ok: false, status: 404, message: "Data siswa tidak ditemukan" };
  }

  // Strictly reject any attempt to change NISN via API manipulation
  if (
    payload.nisn !== undefined &&
    String(payload.nisn).trim() !== "" &&
    String(payload.nisn).trim() !== existing.nisn
  ) {
    return {
      ok: false,
      status: 400,
      message:
        "NISN bersifat READ ONLY dan tidak dapat diubah untuk menghindari kesalahan identitas siswa",
    };
  }

  const nextName =
    payload.nama_lengkap !== undefined
      ? String(payload.nama_lengkap).trim()
      : existing.full_name;
  if (!nextName || nextName.length < 2) {
    return { ok: false, status: 400, message: "Nama lengkap siswa wajib diisi" };
  }

  const nextKelas =
    payload.kelas !== undefined ? String(payload.kelas).trim() : existing.kelas;
  if (!nextKelas) {
    return { ok: false, status: 400, message: "Kelas siswa wajib diisi" };
  }

  const gradeNum = parseGradeNumber(nextKelas);
  if (gradeNum !== 10 && gradeNum !== 11 && gradeNum !== 12) {
    return {
      ok: false,
      status: 400,
      message: "Kelas tidak valid. Pilih kelas tingkat 10, 11, atau 12",
    };
  }

  const nextJurusan =
    payload.jurusan !== undefined
      ? deriveJurusanName(nextKelas, String(payload.jurusan))
      : deriveJurusanName(nextKelas, existing.jurusan);

  let nextPhoto = existing.foto_profil || "";
  if (payload.foto_profil !== undefined) {
    const rawPhoto = String(payload.foto_profil || "").trim();
    if (rawPhoto === "") {
      nextPhoto = "";
    } else {
      const photoCheck = validateProfilePhotoValue(rawPhoto);
      if (!photoCheck.valid) {
        return { ok: false, status: 400, message: photoCheck.error };
      }
      nextPhoto = rawPhoto;
    }
  }

  const updated = await db.transaction(async (tx) => {
    const [updatedStudent] = await tx
      .update(students)
      .set({
        full_name: nextName,
        kelas: nextKelas,
        jurusan: nextJurusan,
        foto_profil: nextPhoto,
        updated_at: new Date(),
      })
      .where(eq(students.id, existing.id))
      .returning();

    // Sync user profile name & photo (never change username/NISN)
    await tx
      .update(users)
      .set({
        nama_lengkap: nextName,
        foto_profil: nextPhoto,
        updated_at: new Date(),
      })
      .where(eq(users.student_id, existing.id));

    // Sync subject attendance student name if name changed
    if (nextName !== existing.full_name) {
      await tx
        .update(subject_attendance_records)
        .set({ nama_siswa: nextName, updated_at: new Date() })
        .where(eq(subject_attendance_records.nisn, existing.nisn));
    }

    // Sync class enrollment if class changed
    if (nextKelas !== existing.kelas) {
      await syncStudentClassEnrollment(tx, existing.id, nextKelas, nextJurusan);
    }

    // Note: We intentionally NEVER delete or alter `student_promotion_logs` when editing student data
    return updatedStudent!;
  });

  return { ok: true, data: mapStudentRowToAdminItem(updated) };
}

/**
 * Upload profile photo file for a student (<= 1MB, JPG/JPEG/PNG).
 */
export async function uploadAdminStudentPhotoFile(
  targetNisn: string,
  file: File
): Promise<
  | { ok: true; foto_profil: string; data: AdminStudentItem }
  | { ok: false; status: number; message: string }
> {
  const cleanNisn = String(targetNisn || "").trim();
  const [existing] = await db
    .select()
    .from(students)
    .where(eq(students.nisn, cleanNisn))
    .limit(1);

  if (!existing) {
    return { ok: false, status: 404, message: "Data siswa tidak ditemukan" };
  }

  let saved: { publicUrl: string };
  try {
    saved = await saveValidatedAvatarFile(file, `siswa-${existing.nisn}`);
  } catch (err: any) {
    return {
      ok: false,
      status: 400,
      message: err?.message || "Gagal mengunggah foto profil siswa",
    };
  }

  const [updated] = await db
    .update(students)
    .set({ foto_profil: saved.publicUrl, updated_at: new Date() })
    .where(eq(students.id, existing.id))
    .returning();

  await db
    .update(users)
    .set({ foto_profil: saved.publicUrl, updated_at: new Date() })
    .where(eq(users.student_id, existing.id));

  return {
    ok: true,
    foto_profil: saved.publicUrl,
    data: mapStudentRowToAdminItem(updated!),
  };
}

/**
 * Validate whether a class transition (fromClass -> toClass) is logical.
 * Prevents:
 * - Same grade level (e.g. 11 -> 11)
 * - Lower grade level (e.g. 11 -> 10, 12 -> 11)
 * - Skipping grades (e.g. 10 -> 12)
 * - Promoting Class 12 to Class 13 or higher (Class 12 can only transition to "Lulus")
 */
export function validatePromotionTransition(
  fromClass: string,
  toClass: string
): { valid: boolean; fromGrade: number | null; toGrade: number | "Lulus" | null; message?: string } {
  const cleanFrom = String(fromClass || "").trim();
  const cleanTo = String(toClass || "").trim();

  if (!cleanFrom || !cleanTo) {
    return {
      valid: false,
      fromGrade: null,
      toGrade: null,
      message: "Kelas asal dan kelas tujuan wajib dipilih",
    };
  }

  if (cleanFrom.toLowerCase() === cleanTo.toLowerCase()) {
    return {
      valid: false,
      fromGrade: parseGradeNumber(cleanFrom),
      toGrade: parseGradeNumber(cleanTo),
      message: `Kenaikan kelas tidak valid: Kelas tujuan (${cleanTo}) tidak boleh sama dengan kelas asal (${cleanFrom})`,
    };
  }

  const fromGrade = parseGradeNumber(cleanFrom);
  if (fromGrade !== 10 && fromGrade !== 11 && fromGrade !== 12) {
    return {
      valid: false,
      fromGrade,
      toGrade: null,
      message: `Kelas asal (${cleanFrom}) tidak valid. Harus berasal dari tingkat kelas 10, 11, atau 12`,
    };
  }

  const isTargetLulus = /^lulus$/i.test(cleanTo);
  if (isTargetLulus) {
    if (fromGrade !== 12) {
      return {
        valid: false,
        fromGrade,
        toGrade: "Lulus",
        message: `Hanya siswa kelas 12 yang dapat diluluskan (kelas asal saat ini: tingkat ${fromGrade})`,
      };
    }
    return { valid: true, fromGrade: 12, toGrade: "Lulus" };
  }

  const toGrade = parseGradeNumber(cleanTo);
  if (toGrade === null) {
    return {
      valid: false,
      fromGrade,
      toGrade: null,
      message: `Kelas tujuan (${cleanTo}) tidak dikenali`,
    };
  }

  if (fromGrade === 12 || toGrade >= 13) {
    return {
      valid: false,
      fromGrade,
      toGrade,
      message:
        "Kenaikan kelas tidak logis: Siswa kelas 12 tidak dapat dinaikkan ke kelas 13 atau lebih tinggi (hanya dapat diluluskan)",
    };
  }

  if (toGrade <= fromGrade) {
    return {
      valid: false,
      fromGrade,
      toGrade,
      message: `Kenaikan kelas tidak logis: Tidak dapat menaikkan dari tingkat ${fromGrade} (${cleanFrom}) ke tingkat ${toGrade} (${cleanTo})`,
    };
  }

  if (toGrade !== fromGrade + 1) {
    return {
      valid: false,
      fromGrade,
      toGrade,
      message: `Kenaikan kelas harus bertahap satu tingkat (tingkat ${fromGrade} hanya dapat naik ke tingkat ${fromGrade + 1})`,
    };
  }

  return { valid: true, fromGrade, toGrade };
}

/**
 * Preview manual class promotion impact before execution.
 */
export async function previewManualPromotion(params: {
  from_class: string;
  to_class: string;
  now?: Date;
}) {
  const validation = validatePromotionTransition(params.from_class, params.to_class);
  if (!validation.valid) {
    return {
      ok: false as const,
      status: 400,
      message: validation.message || "Kombinasi kelas asal dan kelas tujuan tidak valid",
    };
  }

  const now = params.now ?? new Date();
  const allStudents = await db
    .select()
    .from(students)
    .orderBy(asc(students.full_name));

  // Match students in from_class
  const matchingStudents = allStudents.filter((s) =>
    matchesClassSelector(s.kelas, params.from_class)
  );

  const activeCandidates = matchingStudents.filter((s) => !isStudentGraduated(s.status));
  const graduatedInClass = matchingStudents.filter((s) => isStudentGraduated(s.status));

  const studentIds = activeCandidates.map((s) => s.id);
  const nisns = activeCandidates.map((s) => s.nisn);

  const recentLogs =
    studentIds.length > 0 || nisns.length > 0
      ? await db
          .select()
          .from(student_promotion_logs)
          .where(
            or(
              studentIds.length > 0 ? inArray(student_promotion_logs.student_id, studentIds) : undefined,
              nisns.length > 0 ? inArray(student_promotion_logs.nisn, nisns) : undefined
            )
          )
          .orderBy(desc(student_promotion_logs.promoted_at))
      : [];

  const latestLogByNisn = new Map<string, typeof student_promotion_logs.$inferSelect>();
  for (const log of recentLogs) {
    if (!latestLogByNisn.has(log.nisn)) {
      latestLogByNisn.set(log.nisn, log);
    }
  }

  const eligibleStudents: PromotionCandidateResult[] = [];
  const rejectedStudents: PromotionCandidateResult[] = [];

  for (const s of activeCandidates) {
    const targetClass = computePromotedClassName(s.kelas, params.to_class);
    const lastLog = latestLogByNisn.get(s.nisn);

    if (lastLog && isWithinSixMonthsCooldown(lastLog.promoted_at, now)) {
      rejectedStudents.push({
        nisn: s.nisn,
        nama_siswa: s.full_name,
        kelas_asal: s.kelas,
        kelas_tujuan: targetClass,
        status: "ditolak",
        alasan: `Siswa baru saja mengalami kenaikan kelas pada ${formatJakartaDate(lastLog.promoted_at)} (<= 6 bulan terakhir)`,
      });
    } else {
      eligibleStudents.push({
        nisn: s.nisn,
        nama_siswa: s.full_name,
        kelas_asal: s.kelas,
        kelas_tujuan: targetClass,
        status: "berhasil",
      });
    }
  }

  return {
    ok: true as const,
    data: {
      from_class: params.from_class,
      to_class: params.to_class,
      total_di_kelas_asal: matchingStudents.length,
      total_siswa_aktif: activeCandidates.length,
      total_siswa_lulus_diabaikan: graduatedInClass.length,
      jumlah_dapat_dinaikkan: eligibleStudents.length,
      jumlah_ditolak_cooldown: rejectedStudents.length,
      eligible_students: eligibleStudents,
      rejected_students: rejectedStudents,
    },
  };
}

/**
 * Execute manual class promotion with full transaction, per-student 6-month validation,
 * and audit logging in `student_promotion_logs`.
 */
export async function executeManualPromotion(params: {
  from_class: string;
  to_class: string;
  tahun_ajaran?: string;
  catatan?: string;
  executed_by?: string;
  student_nisns?: string[];
  now?: Date;
}): Promise<
  | {
      ok: true;
      data: {
        batch_id: string;
        from_class: string;
        to_class: string;
        tahun_ajaran: string;
        jenis_proses: "Manual";
        tanggal_proses: string;
        total_diproses: number;
        jumlah_berhasil: number;
        jumlah_ditolak: number;
        siswa_berhasil: PromotionCandidateResult[];
        siswa_ditolak: PromotionCandidateResult[];
        pesan_peringatan?: string;
      };
    }
  | {
      ok: false;
      status: number;
      message: string;
      data?: {
        jumlah_berhasil: number;
        jumlah_ditolak: number;
        siswa_berhasil: PromotionCandidateResult[];
        siswa_ditolak: PromotionCandidateResult[];
      };
    }
> {
  const validation = validatePromotionTransition(params.from_class, params.to_class);
  if (!validation.valid) {
    return {
      ok: false,
      status: 400,
      message: validation.message || "Kenaikan kelas tidak valid",
    };
  }

  const now = params.now ?? new Date();
  const jakartaParts = getJakartaDateParts(now);
  const tahunAjaran = String(params.tahun_ajaran || "").trim() || jakartaParts.tahunAjaran;
  const executedBy = String(params.executed_by || "Admin").trim() || "Admin";
  const catatan = String(params.catatan || "").trim();
  const batchId = randomUUID();

  const result = await db.transaction(async (tx) => {
    const allStudents = await tx
      .select()
      .from(students)
      .orderBy(asc(students.full_name));

    let candidates = allStudents.filter((s) =>
      matchesClassSelector(s.kelas, params.from_class)
    );

    if (params.student_nisns && params.student_nisns.length > 0) {
      const filterSet = new Set(params.student_nisns.map((n) => String(n).trim()));
      candidates = candidates.filter((s) => filterSet.has(s.nisn));
    }

    if (candidates.length === 0) {
      return {
        empty: true as const,
        promoted: [] as PromotionCandidateResult[],
        rejected: [] as PromotionCandidateResult[],
      };
    }

    const candidateNisns = candidates.map((c) => c.nisn);
    const logs = await tx
      .select()
      .from(student_promotion_logs)
      .where(inArray(student_promotion_logs.nisn, candidateNisns))
      .orderBy(desc(student_promotion_logs.promoted_at));

    const latestLogByNisn = new Map<string, typeof student_promotion_logs.$inferSelect>();
    for (const log of logs) {
      if (!latestLogByNisn.has(log.nisn)) {
        latestLogByNisn.set(log.nisn, log);
      }
    }

    const promoted: PromotionCandidateResult[] = [];
    const rejected: PromotionCandidateResult[] = [];

    for (const student of candidates) {
      const targetClass = computePromotedClassName(student.kelas, params.to_class);

      // 1. Check if student already graduated (Lulus)
      if (isStudentGraduated(student.status)) {
        rejected.push({
          nisn: student.nisn,
          nama_siswa: student.full_name,
          kelas_asal: student.kelas,
          kelas_tujuan: targetClass,
          status: "ditolak",
          alasan: "Siswa sudah berstatus Lulus dan tidak dapat mengikuti proses kenaikan kelas",
        });
        continue;
      }

      // 2. Validate per-student grade progression
      const studentTransition = validatePromotionTransition(student.kelas, targetClass);
      if (!studentTransition.valid) {
        rejected.push({
          nisn: student.nisn,
          nama_siswa: student.full_name,
          kelas_asal: student.kelas,
          kelas_tujuan: targetClass,
          status: "ditolak",
          alasan: studentTransition.message || "Transisi kelas tidak valid",
        });
        continue;
      }

      // 3. Check 6-month repeat-promotion cooldown
      const lastLog = latestLogByNisn.get(student.nisn);
      if (lastLog && isWithinSixMonthsCooldown(lastLog.promoted_at, now)) {
        rejected.push({
          nisn: student.nisn,
          nama_siswa: student.full_name,
          kelas_asal: student.kelas,
          kelas_tujuan: targetClass,
          status: "ditolak",
          alasan: `Siswa baru saja mengalami kenaikan kelas pada ${formatJakartaDate(lastLog.promoted_at)} (kurang dari atau sama dengan 6 bulan terakhir)`,
        });
        continue;
      }

      // 4. Execute promotion or graduation
      if (/^lulus$/i.test(targetClass)) {
        await tx
          .update(students)
          .set({
            status: "graduated",
            updated_at: now,
          })
          .where(eq(students.id, student.id));

        await tx
          .update(class_students)
          .set({ is_active: false })
          .where(eq(class_students.student_id, student.id));
      } else {
        await tx
          .update(students)
          .set({
            kelas: targetClass,
            updated_at: now,
          })
          .where(eq(students.id, student.id));

        await syncStudentClassEnrollment(tx, student.id, targetClass, student.jurusan);
      }

      // 5. Record promotion history in `student_promotion_logs`
      await tx.insert(student_promotion_logs).values({
        batch_id: batchId,
        student_id: student.id,
        nisn: student.nisn,
        student_name: student.full_name,
        from_class: student.kelas,
        to_class: targetClass,
        tahun_ajaran: tahunAjaran,
        process_type: "Manual",
        executed_by: executedBy,
        notes: catatan || `Kenaikan kelas manual dari ${student.kelas} ke ${targetClass}`,
        promoted_at: now,
      });

      promoted.push({
        nisn: student.nisn,
        nama_siswa: student.full_name,
        kelas_asal: student.kelas,
        kelas_tujuan: targetClass,
        status: "berhasil",
      });
    }

    if (promoted.length > 0) {
      await tx.insert(activity_logs).values({
        jenis: "kenaikan_kelas",
        judul: "Kenaikan Kelas Manual",
        deskripsi: `${promoted.length} siswa berhasil dinaikkan dari ${params.from_class} ke ${params.to_class} (${tahunAjaran})`,
        waktu: "Baru saja",
      });
    }

    return { empty: false as const, promoted, rejected };
  });

  if (result.empty) {
    return {
      ok: false,
      status: 404,
      message: `Tidak ditemukan siswa pada kelas asal "${params.from_class}"`,
    };
  }

  // If ALL students were rejected (e.g. all on <= 6-month cooldown or already graduated), return 409 with detailed breakdown
  if (result.promoted.length === 0 && result.rejected.length > 0) {
    const firstReason =
      result.rejected[0]?.alasan ||
      "Seluruh siswa pada kelas tersebut baru saja dinaikkan dalam 6 bulan terakhir atau sudah lulus";
    return {
      ok: false,
      status: 409,
      message: `Proses kenaikan kelas ditolak: ${firstReason}`,
      data: {
        jumlah_berhasil: 0,
        jumlah_ditolak: result.rejected.length,
        siswa_berhasil: [],
        siswa_ditolak: result.rejected,
      },
    };
  }

  const warningMsg =
    result.rejected.length > 0
      ? `${result.promoted.length} siswa berhasil dinaikkan, namun ${result.rejected.length} siswa ditolak karena baru saja mengalami kenaikan kelas dalam 6 bulan terakhir atau berstatus Lulus.`
      : undefined;

  return {
    ok: true,
    data: {
      batch_id: batchId,
      from_class: params.from_class,
      to_class: params.to_class,
      tahun_ajaran: tahunAjaran,
      jenis_proses: "Manual",
      tanggal_proses: now.toISOString(),
      total_diproses: result.promoted.length + result.rejected.length,
      jumlah_berhasil: result.promoted.length,
      jumlah_ditolak: result.rejected.length,
      siswa_berhasil: result.promoted,
      siswa_ditolak: result.rejected,
      pesan_peringatan: warningMsg,
    },
  };
}

/**
 * Automatic Monthly Promotion & Graduation Scheduled Job (Timezone: Asia/Jakarta).
 * - Month 5 (May): Active Class 12 students automatically receive status "Lulus" ('graduated').
 *   Graduated students are never promoted again and never reverted to active.
 * - Month 6 (June): Active Class 11 students -> Class 12, and Active Class 10 students -> Class 11.
 * - Idempotent per period_key (`AUTO_GRADUATION_<YEAR>_05` and `AUTO_PROMOTION_<YEAR>_06`).
 */
export async function runAutomaticPromotionJob(options?: {
  referenceDate?: Date;
  forceRun?: boolean;
}) {
  const now = options?.referenceDate ?? new Date();
  const { year, month, tahunAjaran } = getJakartaDateParts(now);

  // Automatic actions only run in May (5) or June (6)
  if (month !== 5 && month !== 6) {
    return {
      executed: false,
      reason: `Bulan saat ini (${month}) bukan periode kelulusan otomatis (Mei) atau kenaikan kelas otomatis (Juni)`,
      month,
      year,
      tahun_ajaran: tahunAjaran,
      total_promoted: 0,
      total_rejected: 0,
      promoted_students: [] as PromotionCandidateResult[],
      rejected_students: [] as PromotionCandidateResult[],
    };
  }

  const periodKey =
    month === 5
      ? `AUTO_GRADUATION_${year}_05`
      : `AUTO_PROMOTION_${year}_06`;

  if (!options?.forceRun) {
    const [existingRun] = await db
      .select()
      .from(promotion_scheduler_runs)
      .where(eq(promotion_scheduler_runs.period_key, periodKey))
      .limit(1);

    if (existingRun) {
      return {
        executed: false,
        already_ran_for_period: true,
        period_key: periodKey,
        reason: `Proses otomatis untuk periode ${periodKey} sudah pernah dijalankan pada ${formatJakartaDate(existingRun.executed_at)}`,
        month,
        year,
        tahun_ajaran: existingRun.tahun_ajaran,
        total_promoted: existingRun.total_promoted,
        total_rejected: existingRun.total_rejected,
        promoted_students: [] as PromotionCandidateResult[],
        rejected_students: [] as PromotionCandidateResult[],
      };
    }
  }

  const batchId = randomUUID();

  return await db.transaction(async (tx) => {
    // Re-check inside transaction for concurrency safety
    if (!options?.forceRun) {
      const [existingRunTx] = await tx
        .select()
        .from(promotion_scheduler_runs)
        .where(eq(promotion_scheduler_runs.period_key, periodKey))
        .limit(1);

      if (existingRunTx) {
        return {
          executed: false,
          already_ran_for_period: true,
          period_key: periodKey,
          reason: `Proses otomatis periode ${periodKey} sudah dijalankan`,
          month,
          year,
          tahun_ajaran: existingRunTx.tahun_ajaran,
          total_promoted: existingRunTx.total_promoted,
          total_rejected: existingRunTx.total_rejected,
          promoted_students: [] as PromotionCandidateResult[],
          rejected_students: [] as PromotionCandidateResult[],
        };
      }
    }

    const allStudents = await tx
      .select()
      .from(students)
      .orderBy(asc(students.full_name));

    const allLogs = await tx
      .select()
      .from(student_promotion_logs)
      .orderBy(desc(student_promotion_logs.promoted_at));

    const latestLogByNisn = new Map<string, typeof student_promotion_logs.$inferSelect>();
    for (const log of allLogs) {
      if (!latestLogByNisn.has(log.nisn)) {
        latestLogByNisn.set(log.nisn, log);
      }
    }

    const promotedStudents: PromotionCandidateResult[] = [];
    const rejectedStudents: PromotionCandidateResult[] = [];

    if (month === 5) {
      // MAY: Graduate active Class 12 students -> Lulus ('graduated')
      const class12ActiveStudents = allStudents.filter(
        (s) => !isStudentGraduated(s.status) && parseGradeNumber(s.kelas) === 12
      );

      for (const student of class12ActiveStudents) {
        const lastLog = latestLogByNisn.get(student.nisn);
        if (lastLog && isWithinSixMonthsCooldown(lastLog.promoted_at, now)) {
          rejectedStudents.push({
            nisn: student.nisn,
            nama_siswa: student.full_name,
            kelas_asal: student.kelas,
            kelas_tujuan: "Lulus",
            status: "ditolak",
            alasan: `Siswa baru saja mengalami kenaikan kelas pada ${formatJakartaDate(lastLog.promoted_at)} (<= 6 bulan terakhir)`,
          });
          continue;
        }

        await tx
          .update(students)
          .set({
            status: "graduated",
            updated_at: now,
          })
          .where(eq(students.id, student.id));

        await tx
          .update(class_students)
          .set({ is_active: false })
          .where(eq(class_students.student_id, student.id));

        await tx.insert(student_promotion_logs).values({
          batch_id: batchId,
          student_id: student.id,
          nisn: student.nisn,
          student_name: student.full_name,
          from_class: student.kelas,
          to_class: "Lulus",
          tahun_ajaran: tahunAjaran,
          process_type: "Otomatis",
          executed_by: "Sistem Otomatis (Jadwal Mei)",
          notes: "Kelulusan otomatis siswa kelas 12 periode bulan Mei",
          promoted_at: now,
        });

        promotedStudents.push({
          nisn: student.nisn,
          nama_siswa: student.full_name,
          kelas_asal: student.kelas,
          kelas_tujuan: "Lulus",
          status: "berhasil",
        });
      }
    } else if (month === 6) {
      // JUNE: Promote active Class 11 -> 12 FIRST, then active Class 10 -> 11
      // Promoting 11 -> 12 first prevents a student promoted from 10 -> 11 from being promoted again to 12.
      const class11Active = allStudents.filter(
        (s) => !isStudentGraduated(s.status) && parseGradeNumber(s.kelas) === 11
      );
      const class10Active = allStudents.filter(
        (s) => !isStudentGraduated(s.status) && parseGradeNumber(s.kelas) === 10
      );

      const processGradeGroup = async (
        group: (typeof students.$inferSelect)[],
        targetGrade: 11 | 12
      ) => {
        for (const student of group) {
          const nextKelas = computePromotedClassName(student.kelas, String(targetGrade));
          const lastLog = latestLogByNisn.get(student.nisn);

          if (lastLog && isWithinSixMonthsCooldown(lastLog.promoted_at, now)) {
            rejectedStudents.push({
              nisn: student.nisn,
              nama_siswa: student.full_name,
              kelas_asal: student.kelas,
              kelas_tujuan: nextKelas,
              status: "ditolak",
              alasan: `Siswa baru saja mengalami kenaikan kelas pada ${formatJakartaDate(lastLog.promoted_at)} (<= 6 bulan terakhir)`,
            });
            continue;
          }

          await tx
            .update(students)
            .set({
              kelas: nextKelas,
              updated_at: now,
            })
            .where(eq(students.id, student.id));

          await syncStudentClassEnrollment(tx, student.id, nextKelas, student.jurusan);

          await tx.insert(student_promotion_logs).values({
            batch_id: batchId,
            student_id: student.id,
            nisn: student.nisn,
            student_name: student.full_name,
            from_class: student.kelas,
            to_class: nextKelas,
            tahun_ajaran: tahunAjaran,
            process_type: "Otomatis",
            executed_by: "Sistem Otomatis (Jadwal Juni)",
            notes: `Kenaikan kelas otomatis periode bulan Juni (${student.kelas} ke ${nextKelas})`,
            promoted_at: now,
          });

          promotedStudents.push({
            nisn: student.nisn,
            nama_siswa: student.full_name,
            kelas_asal: student.kelas,
            kelas_tujuan: nextKelas,
            status: "berhasil",
          });
        }
      };

      await processGradeGroup(class11Active, 12);
      await processGradeGroup(class10Active, 11);
    }

    // Record idempotency run for this period
    await tx
      .insert(promotion_scheduler_runs)
      .values({
        period_key: periodKey,
        tahun_ajaran: tahunAjaran,
        process_type: month === 5 ? "AUTO_GRADUATION" : "AUTO_PROMOTION",
        total_processed: promotedStudents.length + rejectedStudents.length,
        total_promoted: promotedStudents.length,
        total_rejected: rejectedStudents.length,
        executed_at: now,
      })
      .onConflictDoUpdate({
        target: promotion_scheduler_runs.period_key,
        set: {
          total_processed: promotedStudents.length + rejectedStudents.length,
          total_promoted: promotedStudents.length,
          total_rejected: rejectedStudents.length,
          executed_at: now,
        },
      });

    if (promotedStudents.length > 0) {
      await tx.insert(activity_logs).values({
        jenis: "kenaikan_kelas_otomatis",
        judul: month === 5 ? "Kelulusan Otomatis Kelas 12" : "Kenaikan Kelas Otomatis (Juni)",
        deskripsi: `${promotedStudents.length} siswa diproses secara otomatis pada periode ${periodKey}`,
        waktu: "Baru saja",
      });
    }

    return {
      executed: true,
      already_ran_for_period: false,
      period_key: periodKey,
      month,
      year,
      tahun_ajaran: tahunAjaran,
      total_promoted: promotedStudents.length,
      total_rejected: rejectedStudents.length,
      promoted_students: promotedStudents,
      rejected_students: rejectedStudents,
    };
  });
}

/**
 * List promotion history records (`student_promotion_logs`) with search, filters, and pagination.
 */
export async function listPromotionHistory(params: {
  search?: string;
  nisn?: string;
  jenis_proses?: string;
  tahun_ajaran?: string;
  kelas?: string;
  page?: number;
  limit?: number;
}) {
  const search = String(params.search || "").trim().toLowerCase();
  const nisnFilter = String(params.nisn || "").trim();
  const jenisFilter = String(params.jenis_proses || "").trim().toLowerCase();
  const tahunFilter = String(params.tahun_ajaran || "").trim();
  const kelasFilter = String(params.kelas || "").trim().toLowerCase();
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 15));

  const allLogs = await db
    .select()
    .from(student_promotion_logs)
    .orderBy(desc(student_promotion_logs.promoted_at));

  const filtered = allLogs.filter((row) => {
    if (nisnFilter && row.nisn !== nisnFilter) return false;

    if (search) {
      const matchNisn = row.nisn.toLowerCase().includes(search);
      const matchName = row.student_name.toLowerCase().includes(search);
      const matchFrom = row.from_class.toLowerCase().includes(search);
      const matchTo = row.to_class.toLowerCase().includes(search);
      if (!matchNisn && !matchName && !matchFrom && !matchTo) return false;
    }

    if (jenisFilter && jenisFilter !== "semua") {
      if (row.process_type.toLowerCase() !== jenisFilter) return false;
    }

    if (tahunFilter && tahunFilter.toLowerCase() !== "semua") {
      if (row.tahun_ajaran !== tahunFilter) return false;
    }

    if (kelasFilter && kelasFilter !== "semua") {
      const matchFrom = row.from_class.toLowerCase().includes(kelasFilter);
      const matchTo = row.to_class.toLowerCase().includes(kelasFilter);
      if (!matchFrom && !matchTo) return false;
    }

    return true;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;

  const items: PromotionHistoryItem[] = filtered.slice(offset, offset + limit).map((h) => ({
    id: h.id,
    batch_id: h.batch_id,
    student_id: h.student_id,
    nisn: h.nisn,
    nama_siswa: h.student_name,
    kelas_sebelumnya: h.from_class,
    kelas_tujuan: h.to_class,
    tahun_ajaran: h.tahun_ajaran,
    jenis_proses: h.process_type === "Otomatis" ? "Otomatis" : "Manual",
    executed_by: h.executed_by,
    catatan: h.notes || "",
    tanggal_kenaikan: h.promoted_at.toISOString(),
  }));

  return {
    items,
    pagination: {
      page: safePage,
      limit,
      total,
      total_pages: totalPages,
    },
  };
}

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start background scheduler (checks on server startup and every hour in Asia/Jakarta timezone).
 */
export function startAutomaticPromotionScheduler(): void {
  if (schedulerInterval) return;

  // Initial check shortly after server startup
  setTimeout(async () => {
    try {
      const res = await runAutomaticPromotionJob();
      if (res.executed && res.total_promoted > 0) {
        console.log(
          `[PromotionScheduler] Executed ${res.period_key}: ${res.total_promoted} siswa diproses.`
        );
      }
    } catch (err) {
      console.error("[PromotionScheduler] Startup check error:", err);
    }
  }, 5000);

  // Hourly background check (Asia/Jakarta)
  schedulerInterval = setInterval(
    async () => {
      try {
        await runAutomaticPromotionJob();
      } catch (err) {
        console.error("[PromotionScheduler] Periodic check error:", err);
      }
    },
    60 * 60 * 1000
  );
}
