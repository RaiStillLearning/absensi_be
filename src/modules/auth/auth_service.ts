import type { z } from "@hono/zod-openapi";
import { eq, or, sql } from "drizzle-orm";
import { db, ensureDatabaseInitialized } from "../../config/database";
import { env } from "../../config/env";
import { classes, class_students, students, teachers, users } from "../../config/schema";
import { hashPassword, verifyPassword } from "../../shared/utils/hash";
import type { AuthUserProfileSchema } from "./auth_schema";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  createSession,
  revokeAllUserSessions,
  signAccessToken,
  type AuthRole,
} from "./session_service";

const GENERIC_LOGIN_ERROR =
  "Kredensial login tidak valid. Periksa kembali NISN, NIP, Nama, Username, atau Password Anda.";

export type AuthUserProfile = z.infer<typeof AuthUserProfileSchema>;

export type LoginResult =
  | {
      status: "success";
      session: {
        id: string;
        refreshToken: string;
        expiresAt: Date;
        rememberMe: boolean;
      };
      data: {
        access_token: string;
        token_type: "Bearer";
        expires_in: number;
        remember_me: boolean;
        session_expires_at: string;
        user: AuthUserProfile;
      };
      access_token: string;
      user: AuthUserProfile;
    }
  | {
      status: "invalid_credentials" | "ambiguous_identity";
      message: string;
    }
  | {
      status: "inactive";
      message: string;
    };

export interface AuthenticateOptions {
  rememberMe?: boolean;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Resolve domain claims + public profile for a `users` row from PostgreSQL.
 */
async function buildUserSessionContext(dbUser: typeof users.$inferSelect): Promise<{
  sub: string;
  role: AuthRole;
  isWalas: boolean;
  profile: AuthUserProfile;
} | null> {
  if (dbUser.role === "admin") {
    return {
      sub: dbUser.id,
      role: "admin",
      isWalas: false,
      profile: {
        id: dbUser.id,
        username: dbUser.username,
        role: "admin",
        peran: "Administrator",
        nama_lengkap: dbUser.nama_lengkap || "",
        email: dbUser.email || "",
        foto_profil: dbUser.foto_profil || "",
        must_change_password: Boolean(dbUser.must_change_password),
      },
    };
  }

  if (dbUser.role === "guru" || dbUser.role === "walas") {
    let teacherRow: typeof teachers.$inferSelect | undefined;
    if (dbUser.teacher_id) {
      const [byId] = await db
        .select()
        .from(teachers)
        .where(eq(teachers.id, dbUser.teacher_id))
        .limit(1);
      teacherRow = byId;
    }
    if (!teacherRow) {
      const [byNip] = await db
        .select()
        .from(teachers)
        .where(eq(teachers.nip, dbUser.username))
        .limit(1);
      teacherRow = byNip;
    }

    if (!teacherRow) return null;

    const isWalas = Boolean(teacherRow.is_walas) || dbUser.role === "walas";
    const kelasWalas = teacherRow.kelas_walas || "";
    const resolvedRole: AuthRole = dbUser.role === "walas" ? "walas" : "guru";

    return {
      sub: String(teacherRow.id),
      role: resolvedRole,
      isWalas,
      profile: {
        id: String(teacherRow.id),
        username: dbUser.username,
        role: "guru",
        peran: isWalas ? "Wali Kelas" : "Guru",
        nama_lengkap: teacherRow.nama_guru || dbUser.nama_lengkap || "",
        email: teacherRow.email || dbUser.email || "",
        mata_pelajaran: teacherRow.mata_pelajaran,
        foto_profil: teacherRow.foto_profil || "",
        isWalas,
        kelasWalas,
        must_change_password: Boolean(dbUser.must_change_password),
      },
    };
  }

  // Siswa
  let studentRow: typeof students.$inferSelect | undefined;
  if (dbUser.student_id) {
    const [s] = await db
      .select()
      .from(students)
      .where(eq(students.id, dbUser.student_id))
      .limit(1);
    studentRow = s;
  }
  if (!studentRow) {
    const [s] = await db
      .select()
      .from(students)
      .where(eq(students.nisn, dbUser.username))
      .limit(1);
    studentRow = s;
  }
  if (!studentRow) return null;

  let className = studentRow.kelas;
  const [enrollment] = await db
    .select({ class_name: classes.name })
    .from(class_students)
    .innerJoin(classes, eq(class_students.class_id, classes.id))
    .where(eq(class_students.student_id, studentRow.id))
    .limit(1);
  if (enrollment?.class_name) {
    className = enrollment.class_name;
  }

  return {
    sub: studentRow.nisn,
    role: "siswa",
    isWalas: false,
    profile: {
      id: dbUser.id,
      username: dbUser.username,
      role: "siswa",
      peran: "Siswa",
      nama_lengkap: studentRow.full_name,
      email: studentRow.email,
      nisn: studentRow.nisn,
      kelas: className,
      jurusan: studentRow.jurusan,
      foto_profil: studentRow.foto_profil || "",
      must_change_password: Boolean(dbUser.must_change_password),
      student: {
        id: studentRow.id,
        nisn: studentRow.nisn,
        full_name: studentRow.full_name,
        class_name: className,
      },
    },
  };
}

/**
 * Universal authentication service for Admin, Guru, Walas, and Siswa.
 * Mendukung login siswa menggunakan NISN atau Nama Siswa (menolak nama ganda dengan instruksi pakai NISN).
 */
export async function authenticateUser(
  usernameInput: string,
  passwordInput: string,
  options: AuthenticateOptions = {}
): Promise<LoginResult> {
  await ensureDatabaseInitialized();

  const trimmedInput = usernameInput.trim();
  const collapsedInput = trimmedInput.replace(/\s+/g, " ");
  const cleanUser = trimmedInput.toLowerCase();
  const cleanNip = cleanUser.replace(/\s+/g, "");
  const cleanPass = passwordInput.trim();

  if (!trimmedInput || !cleanPass) {
    return { status: "invalid_credentials", message: GENERIC_LOGIN_ERROR };
  }

  // 1. Cari langsung di tabel `users` berdasarkan username exact (admin, NIP, NISN)
  const found = await db
    .select()
    .from(users)
    .where(
      or(
        eq(users.username, cleanUser),
        eq(users.username, trimmedInput),
        eq(users.username, cleanNip)
      )
    )
    .limit(1);

  let dbUser = found[0];

  // 2. Jika belum cocok di `users`, cek `teachers` berdasarkan NIP / email
  if (!dbUser) {
    const [matchedTeacher] = await db
      .select()
      .from(teachers)
      .where(
        or(
          eq(teachers.nip, cleanNip),
          eq(teachers.nip, trimmedInput),
          eq(teachers.email, cleanUser)
        )
      )
      .limit(1);

    if (matchedTeacher) {
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.teacher_id, matchedTeacher.id))
        .limit(1);

      if (!existingUser) {
        const defaultTeacherPwd = env.TEACHER_DEFAULT_PASSWORD || "guru123";
        const [newUser] = await db
          .insert(users)
          .values({
            username: matchedTeacher.nip || `guru_${matchedTeacher.id}`,
            password_hash: hashPassword(defaultTeacherPwd),
            role: matchedTeacher.is_walas ? "walas" : "guru",
            nama_lengkap: matchedTeacher.nama_guru,
            email: matchedTeacher.email || "",
            teacher_id: matchedTeacher.id,
            must_change_password: true,
            is_active: true,
          })
          .returning();
        dbUser = newUser;
      } else {
        dbUser = existingUser;
      }
    }
  }

  // 3. Jika masih belum ketemu, cari siswa berdasarkan NISN / email, lalu Nama Siswa
  if (!dbUser) {
    let matchedStudent: typeof students.$inferSelect | undefined;

    const [byNisnOrEmail] = await db
      .select()
      .from(students)
      .where(
        or(
          eq(students.nisn, cleanNip),
          eq(students.nisn, trimmedInput),
          eq(students.email, cleanUser)
        )
      )
      .limit(1);

    if (byNisnOrEmail) {
      matchedStudent = byNisnOrEmail;
    } else {
      // Pencarian nama siswa (case-insensitive & normalisasi spasi), cek hingga 2 baris untuk deteksi nama identik
      const normalizedQueryName = collapsedInput.toLowerCase();
      const matchedByName = await db
        .select()
        .from(students)
        .where(
          sql`lower(regexp_replace(trim(${students.full_name}), '[[:space:]]+', ' ', 'g')) = ${normalizedQueryName}`
        )
        .limit(2);

      if (matchedByName.length > 1) {
        return {
          status: "ambiguous_identity",
          message:
            "Ditemukan lebih dari satu akun siswa dengan nama tersebut. Silakan login menggunakan NISN.",
        };
      }

      if (matchedByName.length === 1) {
        matchedStudent = matchedByName[0];
      }
    }

    if (matchedStudent) {
      const [existingStudentUser] = await db
        .select()
        .from(users)
        .where(eq(users.student_id, matchedStudent.id))
        .limit(1);

      if (!existingStudentUser) {
        const defaultStudentPwd = env.STUDENT_DEFAULT_PASSWORD || "gc123";
        const [newStudentUser] = await db
          .insert(users)
          .values({
            username: matchedStudent.nisn,
            password_hash: hashPassword(defaultStudentPwd),
            role: "siswa",
            nama_lengkap: matchedStudent.full_name,
            email: matchedStudent.email || "",
            student_id: matchedStudent.id,
            must_change_password: true,
            is_active: true,
          })
          .returning();
        dbUser = newStudentUser;
      } else {
        dbUser = existingStudentUser;
      }
    }
  }

  if (!dbUser) {
    return { status: "invalid_credentials", message: GENERIC_LOGIN_ERROR };
  }

  // Verifikasi hash password (tidak pernah mengirim atau mengecek plaintext)
  const isPasswordValid = verifyPassword(cleanPass, dbUser.password_hash);
  if (!isPasswordValid) {
    return { status: "invalid_credentials", message: GENERIC_LOGIN_ERROR };
  }

  if (!dbUser.is_active) {
    return {
      status: "inactive",
      message: "Akun Anda berstatus non-aktif. Silakan hubungi administrator.",
    };
  }

  const context = await buildUserSessionContext(dbUser);
  if (!context) {
    return { status: "invalid_credentials", message: GENERIC_LOGIN_ERROR };
  }

  const rememberMe = Boolean(options.rememberMe);
  const session = await createSession({
    userId: dbUser.id,
    rememberMe,
    userAgent: options.userAgent,
    ipAddress: options.ipAddress,
  });

  const { token } = await signAccessToken({
    sub: context.sub,
    uid: dbUser.id,
    sid: session.sessionId,
    username: dbUser.username,
    role: context.role,
    isWalas: context.isWalas,
  });

  const data = {
    access_token: token,
    token_type: "Bearer" as const,
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    remember_me: rememberMe,
    session_expires_at: session.expiresAt.toISOString(),
    user: context.profile,
  };

  return {
    status: "success",
    session: {
      id: session.sessionId,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      rememberMe,
    },
    data,
    access_token: token,
    user: context.profile,
  };
}

/**
 * Terbitkan Access Token baru (15 menit) untuk sesi yang sudah tervalidasi (saat Refresh).
 */
export async function issueAccessTokenForUser(
  userId: string,
  sessionId: string
): Promise<{ accessToken: string; user: AuthUserProfile } | null> {
  await ensureDatabaseInitialized();

  const [dbUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!dbUser || !dbUser.is_active) return null;

  const context = await buildUserSessionContext(dbUser);
  if (!context) return null;

  const { token } = await signAccessToken({
    sub: context.sub,
    uid: dbUser.id,
    sid: sessionId,
    username: dbUser.username,
    role: context.role,
    isWalas: context.isWalas,
  });

  return { accessToken: token, user: context.profile };
}

/**
 * Ganti password pengguna (siswa/guru/admin). Setelah diganti, password default tidak berlaku lagi.
 */
export async function changeUserPassword(input: {
  userId: string;
  sessionId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: true } | { ok: false; status: 400 | 404; message: string }> {
  await ensureDatabaseInitialized();

  const [dbUser] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!dbUser) {
    return { ok: false, status: 404, message: "Akun pengguna tidak ditemukan." };
  }

  if (!verifyPassword(input.currentPassword.trim(), dbUser.password_hash)) {
    return { ok: false, status: 400, message: "Password saat ini tidak sesuai." };
  }

  const trimmedNew = input.newPassword.trim();
  const defaultPwd = env.STUDENT_DEFAULT_PASSWORD || "gc123";
  if (trimmedNew === defaultPwd) {
    return {
      ok: false,
      status: 400,
      message: "Password baru tidak boleh sama dengan password default sekolah.",
    };
  }
  if (verifyPassword(trimmedNew, dbUser.password_hash)) {
    return {
      ok: false,
      status: 400,
      message: "Password baru harus berbeda dari password saat ini.",
    };
  }

  await db
    .update(users)
    .set({
      password_hash: hashPassword(trimmedNew),
      must_change_password: false,
      password_changed_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(users.id, dbUser.id));

  // Cabut sesi perangkat/tab lain demi keamanan
  await revokeAllUserSessions(dbUser.id, "password_changed", input.sessionId);

  return { ok: true };
}

/**
 * Get profile of user by decoded JWT payload (`uid` / `sub` & `role`) from PostgreSQL
 */
export async function getUserProfile(
  userId: string,
  role: string,
  uid?: string
): Promise<AuthUserProfile | null> {
  await ensureDatabaseInitialized();

  if (uid) {
    const [dbUser] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
    if (dbUser) {
      const ctx = await buildUserSessionContext(dbUser);
      if (ctx) return ctx.profile;
    }
  }

  if (role === "admin") {
    const [adminUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!adminUser) return null;
    return {
      id: adminUser.id,
      username: adminUser.username,
      role: "admin",
      peran: "Administrator",
      nama_lengkap: adminUser.nama_lengkap || "",
      email: adminUser.email || "",
      foto_profil: adminUser.foto_profil || "",
      must_change_password: Boolean(adminUser.must_change_password),
    };
  }

  if (role === "guru" || role === "walas") {
    const numericId = Number(userId);
    if (Number.isNaN(numericId) || numericId <= 0) {
      throw new Error("User ID tidak valid");
    }
    const [guru] = await db.select().from(teachers).where(eq(teachers.id, numericId)).limit(1);
    if (!guru) return null;

    return {
      id: String(guru.id),
      username: guru.nip || "guru",
      role: "guru",
      peran: guru.is_walas ? "Wali Kelas" : "Guru",
      nama_lengkap: guru.nama_guru,
      email: guru.email || "",
      mata_pelajaran: guru.mata_pelajaran,
      foto_profil: guru.foto_profil || "",
      isWalas: Boolean(guru.is_walas),
      kelasWalas: guru.kelas_walas || "",
    };
  }

  let [studentRow] = await db
    .select()
    .from(students)
    .where(eq(students.nisn, userId))
    .limit(1);

  if (!studentRow && /^[0-9a-f-]{36}$/i.test(userId)) {
    const [byUuid] = await db.select().from(students).where(eq(students.id, userId)).limit(1);
    studentRow = byUuid;
  }

  if (!studentRow) return null;

  return {
    id: studentRow.nisn,
    username: studentRow.nisn,
    role: "siswa",
    peran: "Siswa",
    nama_lengkap: studentRow.full_name,
    email: studentRow.email,
    nisn: studentRow.nisn,
    kelas: studentRow.kelas,
    jurusan: studentRow.jurusan,
    foto_profil: studentRow.foto_profil || "",
    student: {
      id: studentRow.id,
      nisn: studentRow.nisn,
      full_name: studentRow.full_name,
      class_name: studentRow.kelas,
    },
  };
}

/**
 * Updates `foto_profil` across both `users` and the role-specific table (`teachers` / `students`).
 */
export async function updateUserProfilePhoto(
  userId: string,
  role: string,
  username: string | undefined,
  newFotoUrl: string
): Promise<{ previousFoto: string | null; foto_profil: string } | null> {
  await ensureDatabaseInitialized();

  if (role === "admin") {
    let [adminUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!adminUser && username) {
      [adminUser] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    }
    if (!adminUser) return null;

    const previousFoto = adminUser.foto_profil || null;
    await db
      .update(users)
      .set({ foto_profil: newFotoUrl, updated_at: new Date() })
      .where(eq(users.id, adminUser.id));

    return { previousFoto, foto_profil: newFotoUrl };
  }

  if (role === "guru" || role === "walas") {
    const numericId = Number(userId);
    let guru: typeof teachers.$inferSelect | undefined;
    if (!Number.isNaN(numericId) && numericId > 0) {
      [guru] = await db.select().from(teachers).where(eq(teachers.id, numericId)).limit(1);
    }
    if (!guru && username) {
      [guru] = await db.select().from(teachers).where(eq(teachers.nip, username)).limit(1);
    }
    if (!guru) return null;

    const previousFoto = guru.foto_profil || null;
    await db
      .update(teachers)
      .set({ foto_profil: newFotoUrl, updated_at: new Date() })
      .where(eq(teachers.id, guru.id));

    await db
      .update(users)
      .set({ foto_profil: newFotoUrl, updated_at: new Date() })
      .where(
        guru.nip
          ? or(eq(users.teacher_id, guru.id), eq(users.username, guru.nip))
          : eq(users.teacher_id, guru.id)
      );

    return { previousFoto, foto_profil: newFotoUrl };
  }

  let [studentRow] = await db
    .select()
    .from(students)
    .where(eq(students.nisn, userId))
    .limit(1);

  if (!studentRow && /^[0-9a-f-]{36}$/i.test(userId)) {
    [studentRow] = await db.select().from(students).where(eq(students.id, userId)).limit(1);
  }
  if (!studentRow && username) {
    [studentRow] = await db.select().from(students).where(eq(students.nisn, username)).limit(1);
  }
  if (!studentRow) return null;

  const previousFoto = studentRow.foto_profil || null;
  await db
    .update(students)
    .set({ foto_profil: newFotoUrl, updated_at: new Date() })
    .where(eq(students.id, studentRow.id));

  await db
    .update(users)
    .set({ foto_profil: newFotoUrl, updated_at: new Date() })
    .where(or(eq(users.student_id, studentRow.id), eq(users.username, studentRow.nisn)));

  return { previousFoto, foto_profil: newFotoUrl };
}
