import type { z } from "@hono/zod-openapi";
import { eq, or } from "drizzle-orm";
import { sign } from "hono/jwt";
import { db, ensureDatabaseInitialized } from "../../config/database";
import { env } from "../../config/env";
import { classes, class_students, students, teachers, users } from "../../config/schema";
import { hashPassword, verifyPassword } from "../../shared/utils/hash";
import type { AuthUserProfileSchema } from "./auth_schema";

export type LoginResult =
  | {
      status: "success";
      data: {
        access_token: string;
        refresh_token?: string;
        token_type: "Bearer";
        user: {
          id: string;
          username: string;
          role: string;
          peran: string;
          nama_lengkap: string;
          email?: string;
          foto_profil?: string;
          isWalas?: boolean;
          kelasWalas?: string;
          kelas_diampu?: string;
          mata_pelajaran?: string;
          nip?: string;
          nisn?: string;
          kelas?: string;
          jurusan?: string;
          student?: {
            id: string;
            nisn: string;
            full_name: string;
            class_name: string;
          };
        };
      };
      access_token?: string;
      refresh_token?: string;
      user?: any;
    }
  | {
      status: "invalid_credentials";
      message: string;
    }
  | {
      status: "inactive";
      message: string;
    };

/**
 * Universal authentication service for Admin, Guru, Walas, and Siswa (100% PostgreSQL via Drizzle ORM).
 * All passwords must be cryptographically hashed in the `users` table.
 */
export async function authenticateUser(
  usernameInput: string,
  passwordInput: string
): Promise<LoginResult> {
  await ensureDatabaseInitialized();

  const cleanUser = usernameInput.trim().toLowerCase();
  const cleanPass = passwordInput.trim();
  const cleanNip = cleanUser.replace(/\s+/g, "");

  // 1. Query user from PostgreSQL `users` table
  const found = await db
    .select()
    .from(users)
    .where(
      or(
        eq(users.username, cleanUser),
        eq(users.username, usernameInput.trim()),
        eq(users.username, cleanNip)
      )
    )
    .limit(1);

  let dbUser = found[0];

  // Jika belum ada di `users`, cek apakah guru ada di tabel `teachers` (auto-create user dengan password hash dari env)
  if (!dbUser) {
    const [matchedTeacher] = await db
      .select()
      .from(teachers)
      .where(
        or(
          eq(teachers.nip, cleanNip),
          eq(teachers.nip, usernameInput.trim()),
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
        const defaultPassword = env.STUDENT_DEFAULT_PASSWORD;
        const [newUser] = await db
          .insert(users)
          .values({
            username: matchedTeacher.nip || `guru_${matchedTeacher.id}`,
            password_hash: hashPassword(defaultPassword),
            role: matchedTeacher.is_walas ? "walas" : "guru",
            nama_lengkap: matchedTeacher.nama_guru,
            email: matchedTeacher.email || "",
            teacher_id: matchedTeacher.id,
            is_active: true,
          })
          .returning();
        dbUser = newUser;
      } else {
        dbUser = existingUser;
      }
    }

    if (!dbUser) {
      const [matchedStudent] = await db
        .select()
        .from(students)
        .where(
          or(
            eq(students.nisn, cleanNip),
            eq(students.nisn, usernameInput.trim()),
            eq(students.email, cleanUser)
          )
        )
        .limit(1);

      if (matchedStudent) {
        const [existingStudentUser] = await db
          .select()
          .from(users)
          .where(eq(users.student_id, matchedStudent.id))
          .limit(1);

        if (!existingStudentUser) {
          const defaultPassword = env.STUDENT_DEFAULT_PASSWORD;
          const [newStudentUser] = await db
            .insert(users)
            .values({
              username: matchedStudent.nisn,
              password_hash: hashPassword(defaultPassword),
              role: "siswa",
              nama_lengkap: matchedStudent.full_name,
              email: matchedStudent.email || "",
              student_id: matchedStudent.id,
              is_active: true,
            })
            .returning();
          dbUser = newStudentUser;
        } else {
          dbUser = existingStudentUser;
        }
      }
    }
  }

  if (!dbUser) {
    return {
      status: "invalid_credentials",
      message: "Username atau password yang Anda masukkan tidak terdaftar.",
    };
  }

  // 2. Verify cryptographic password hash from PostgreSQL
  const isPasswordValid = verifyPassword(cleanPass, dbUser.password_hash);
  if (!isPasswordValid) {
    return {
      status: "invalid_credentials",
      message: "Password yang Anda masukkan tidak sesuai.",
    };
  }

  if (!dbUser.is_active) {
    return {
      status: "inactive",
      message: "Akun Anda berstatus non-aktif. Silakan hubungi administrator.",
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const accessExp = nowSec + 60 * 60 * 8; // 8 hours
  const refreshExp = nowSec + 60 * 60 * 24 * 7; // 7 days

  // Role Admin
  if (dbUser.role === "admin") {
    const payload = {
      sub: dbUser.id,
      username: dbUser.username,
      role: "admin",
      exp: accessExp,
    };
    const token = await sign(payload, env.JWT_SECRET);
    const refreshToken = await sign({ ...payload, type: "refresh", exp: refreshExp }, env.JWT_SECRET);
    const userProfile = {
      id: dbUser.id,
      username: dbUser.username,
      role: "admin",
      peran: "Administrator",
      nama_lengkap: dbUser.nama_lengkap || "",
      email: dbUser.email || "",
      foto_profil: dbUser.foto_profil || "",
    };
    return {
      status: "success",
      data: {
        access_token: token,
        refresh_token: refreshToken,
        token_type: "Bearer",
        user: userProfile,
      },
      access_token: token,
      refresh_token: refreshToken,
      user: userProfile,
    };
  }

  // Role Guru / Walas
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

    if (!teacherRow) {
      return {
        status: "invalid_credentials",
        message: "Data guru tidak ditemukan. Hubungi administrator.",
      };
    }

    const isWalas = Boolean(teacherRow.is_walas) || dbUser.role === "walas";
    const kelasWalas = teacherRow.kelas_walas || "";

    const payload = {
      sub: String(teacherRow.id),
      username: dbUser.username,
      role: "guru",
      isWalas,
      exp: accessExp,
    };
    const token = await sign(payload, env.JWT_SECRET);
    const refreshToken = await sign({ ...payload, type: "refresh", exp: refreshExp }, env.JWT_SECRET);
    const userProfile = {
      id: String(teacherRow.id),
      username: dbUser.username,
      role: "guru",
      peran: "Guru",
      nama_lengkap: teacherRow.nama_guru || dbUser.nama_lengkap || "",
      email: teacherRow.email || dbUser.email || "",
      mata_pelajaran: teacherRow.mata_pelajaran,
      nip: teacherRow.nip || "",
      isWalas,
      kelasWalas,
      kelas_diampu: kelasWalas,
      foto_profil: teacherRow.foto_profil || "",
    };
    return {
      status: "success",
      data: {
        access_token: token,
        refresh_token: refreshToken,
        token_type: "Bearer",
        user: userProfile,
      },
      access_token: token,
      refresh_token: refreshToken,
      user: userProfile,
    };
  }

  // Role Siswa
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

  if (!studentRow) {
    return {
      status: "invalid_credentials",
      message: "Data siswa tidak ditemukan. Hubungi administrator.",
    };
  }

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

  const payload = {
    sub: studentRow.nisn,
    username: dbUser.username,
    role: "siswa",
    exp: accessExp,
  };
  const token = await sign(payload, env.JWT_SECRET);
  const refreshToken = await sign({ ...payload, type: "refresh", exp: refreshExp }, env.JWT_SECRET);
  const userProfile = {
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
    student: {
      id: studentRow.id,
      nisn: studentRow.nisn,
      full_name: studentRow.full_name,
      class_name: className,
    },
  };
  return {
    status: "success",
    data: {
      access_token: token,
      refresh_token: refreshToken,
      token_type: "Bearer",
      user: userProfile,
    },
    access_token: token,
    refresh_token: refreshToken,
    user: userProfile,
  };
}

export type AuthUserProfile = z.infer<typeof AuthUserProfileSchema>;

/**
 * Get profile of user by decoded JWT payload (`sub` & `role`) from PostgreSQL
 */
export async function getUserProfile(
  userId: string,
  role: string
): Promise<AuthUserProfile | null> {
  await ensureDatabaseInitialized();

  if (role === "admin") {
    const [adminById] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const adminUser =
      adminById ||
      (await db.select().from(users).where(eq(users.role, "admin")).limit(1))[0];
    if (!adminUser) return null;
    return {
      id: adminUser.id,
      username: adminUser.username,
      role: "admin",
      peran: "Administrator",
      nama_lengkap: adminUser.nama_lengkap || "",
      email: adminUser.email || "",
      foto_profil: adminUser.foto_profil || "",
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
      peran: "Guru",
      nama_lengkap: guru.nama_guru,
      email: guru.email || "",
      mata_pelajaran: guru.mata_pelajaran,
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
  };
}
