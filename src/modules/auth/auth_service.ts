import { eq, or } from "drizzle-orm";
import { sign } from "hono/jwt";
import { db } from "../../config/database";
import { users, students } from "../../config/schema";
import { env } from "../../config/env";
import { store } from "../../shared/data/store";
import type { GuruItem } from "../../shared/data/initial_data";
import { verifyPassword } from "../../shared/utils/hash";

export type LoginResult =
  | {
      status: "success";
      data: {
        access_token: string;
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
          student?: any;
        };
      };
      access_token?: string;
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
 * Universal authentication service for Admin, Guru, Walas, and Siswa
 */
export async function authenticateUser(
  usernameInput: string,
  passwordInput: string
): Promise<LoginResult> {
  const cleanUser = usernameInput.trim().toLowerCase();
  const cleanPass = passwordInput.trim();

  // 1. Query user from PostgreSQL database
  let dbUser: any = null;
  try {
    const found = await db
      .select()
      .from(users)
      .where(or(eq(users.username, cleanUser), eq(users.username, usernameInput.trim())))
      .limit(1);
    dbUser = found[0];

    if (!dbUser) {
      const cleanNip = cleanUser.replace(/\s+/g, "");
      const foundNip = await db.select().from(users).where(eq(users.username, cleanNip)).limit(1);
      dbUser = foundNip[0];
    }
  } catch (dbErr) {
    console.error("Database user query error:", dbErr);
  }

  // If found in PostgreSQL database, verify password hash from database
  if (dbUser) {
    const isPasswordValid = verifyPassword(cleanPass, dbUser.password_hash);
    if (!isPasswordValid) {
      return {
        status: "invalid_credentials",
        message: "Password yang Anda masukkan salah.",
      };
    }

    if (!dbUser.is_active) {
      return {
        status: "inactive",
        message: "Akun Anda berstatus non-aktif. Silakan hubungi administrator.",
      };
    }

    // Role Admin
    if (dbUser.role === "admin") {
      const payload = {
        sub: dbUser.id,
        username: dbUser.username,
        role: "admin",
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      };
      const token = await sign(payload, env.JWT_SECRET);
      const userProfile = {
        id: dbUser.id,
        username: dbUser.username,
        role: "admin",
        peran: "Administrator",
        nama_lengkap: store.adminProfile.nama_lengkap || "Admin",
        email: store.adminProfile.email,
        foto_profil: store.adminProfile.foto_profil,
      };
      return {
        status: "success",
        data: {
          access_token: token,
          token_type: "Bearer",
          user: userProfile,
        },
        access_token: token,
        user: userProfile,
      };
    }

    // Role Guru / Walas
    if (dbUser.role === "guru" || dbUser.role === "walas") {
      const isWalas = dbUser.role === "walas";
      const targetGuru: GuruItem =
        (isWalas ? store.guru.find((g) => g.is_walas) : store.guru[0]) || store.guru[0]!;
      const kelasWalas = targetGuru.kelasWalas || targetGuru.kelas_walas || (isWalas ? "X RPL 1" : "");

      const payload = {
        sub: dbUser.id,
        username: dbUser.username,
        role: "guru",
        isWalas,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      };
      const token = await sign(payload, env.JWT_SECRET);
      const userProfile = {
        id: dbUser.id,
        username: dbUser.username,
        role: "guru",
        peran: isWalas ? "Wali Kelas" : "Guru",
        nama_lengkap: targetGuru.nama_guru,
        email: targetGuru.email,
        mata_pelajaran: targetGuru.mata_pelajaran,
        nip: targetGuru.nip,
        isWalas,
        kelasWalas,
        kelas_diampu: kelasWalas,
      };
      return {
        status: "success",
        data: {
          access_token: token,
          token_type: "Bearer",
          user: userProfile,
        },
        access_token: token,
        user: userProfile,
      };
    }

    // Role Siswa
    if (dbUser.role === "siswa") {
      let studentData = store.siswaProfile;
      if (dbUser.student_id) {
        try {
          const [s] = await db.select().from(students).where(eq(students.id, dbUser.student_id)).limit(1);
          if (s) {
            studentData = { ...store.siswaProfile, nisn: s.nisn, nama_lengkap: s.full_name };
          }
        } catch {}
      }

      const payload = {
        sub: dbUser.username,
        username: dbUser.username,
        role: "siswa",
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      };
      const token = await sign(payload, env.JWT_SECRET);
      const userProfile = {
        id: dbUser.id,
        username: dbUser.username,
        role: "siswa",
        peran: "Siswa",
        nama_lengkap: studentData.nama_lengkap,
        email: studentData.email,
        nisn: studentData.nisn,
        kelas: studentData.kelas,
        jurusan: studentData.jurusan,
        student: {
          id: dbUser.student_id || studentData.nisn,
          nisn: studentData.nisn,
          full_name: studentData.nama_lengkap,
          class_name: studentData.kelas,
        },
      };
      return {
        status: "success",
        data: {
          access_token: token,
          token_type: "Bearer",
          user: userProfile,
        },
        access_token: token,
        user: userProfile,
      };
    }
  }

  // 2. Fallback check for Guru matching by NIP or name
  const cleanNip = cleanUser.replace(/\s+/g, "");
  const matchedGuru = store.guru.find(
    (g) =>
      (g.nip && g.nip.replace(/\s+/g, "").toLowerCase() === cleanNip) ||
      g.nama_guru.toLowerCase().includes(cleanUser) ||
      String(g.id) === cleanUser
  );

  if (matchedGuru) {
    if (cleanPass === "guru123" || cleanPass === "password") {
      const isWalas = Boolean(matchedGuru.isWalas ?? matchedGuru.is_walas);
      const kelasWalas = matchedGuru.kelasWalas || matchedGuru.kelas_walas || "";
      const payload = {
        sub: String(matchedGuru.id),
        username: matchedGuru.email || matchedGuru.nip || "guru",
        role: "guru",
        isWalas,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      };
      const token = await sign(payload, env.JWT_SECRET);
      const userProfile = {
        id: String(matchedGuru.id),
        username: matchedGuru.email || matchedGuru.nip || "burina",
        role: "guru",
        peran: isWalas ? "Wali Kelas" : "Guru",
        nama_lengkap: matchedGuru.nama_guru,
        email: matchedGuru.email,
        mata_pelajaran: matchedGuru.mata_pelajaran,
        nip: matchedGuru.nip,
        isWalas,
        kelasWalas,
        kelas_diampu: kelasWalas,
      };
      return {
        status: "success",
        data: {
          access_token: token,
          token_type: "Bearer",
          user: userProfile,
        },
        access_token: token,
        user: userProfile,
      };
    }
    return {
      status: "invalid_credentials",
      message: "Password guru salah (default: guru123)",
    };
  }

  return {
    status: "invalid_credentials",
    message: "Username atau password yang Anda masukkan tidak terdaftar.",
  };
}

import type { z } from "@hono/zod-openapi";
import type { AuthUserProfileSchema } from "./auth_schema";

export type AuthUserProfile = z.infer<typeof AuthUserProfileSchema>;

/**
 * Get profile of user by decoded JWT payload
 */
export async function getUserProfile(userId: string, role: string): Promise<AuthUserProfile> {
  if (role === "admin") {
    return {
      id: "1",
      username: "admin",
      role: "admin",
      peran: "Administrator",
      nama_lengkap: store.adminProfile.nama_lengkap,
      email: store.adminProfile.email,
      foto_profil: store.adminProfile.foto_profil,
    };
  }
  if (role === "guru") {
    const guru: GuruItem = store.guru.find((g) => String(g.id) === userId) || store.guru[4]!;
    return {
      id: String(guru.id),
      username: guru.nip || "guru",
      role: "guru",
      peran: "Guru",
      nama_lengkap: guru.nama_guru,
      email: guru.email || "",
      mata_pelajaran: guru.mata_pelajaran,
      isWalas: Boolean(guru.isWalas ?? guru.is_walas),
      kelasWalas: guru.kelasWalas || guru.kelas_walas || "",
    };
  }
  return {
    id: store.siswaProfile.nisn,
    username: store.siswaProfile.nisn,
    role: "siswa",
    peran: "Siswa",
    nama_lengkap: store.siswaProfile.nama_lengkap,
    email: store.siswaProfile.email,
    nisn: store.siswaProfile.nisn,
    kelas: store.siswaProfile.kelas,
    jurusan: store.siswaProfile.jurusan,
  };
}
