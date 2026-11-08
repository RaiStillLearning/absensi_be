import { and, eq } from "drizzle-orm";
import { sign } from "hono/jwt";
import { db } from "../../config/database";
import { env } from "../../config/env";
import {
  classes,
  class_students,
  students,
  users,
} from "../../config/schema";

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
          student?: {
            id: string;
            nisn: string;
            full_name: string;
            class_name: string;
          } | null;
        };
      };
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
 * Authenticate student or staff user via username/NISN and password
 */
export async function authenticateUser(
  usernameInput: string,
  passwordInput: string
): Promise<LoginResult> {
  const username = usernameInput.trim();

  // 1. Find user by username/NISN
  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  const user = userRows[0];
  if (!user) {
    return {
      status: "invalid_credentials",
      message: "NISN / Username atau password tidak sesuai",
    };
  }

  // 2. Check if user is active
  if (!user.is_active) {
    return {
      status: "inactive",
      message: "Akun Anda telah dinonaktifkan. Silakan hubungi admin sekolah.",
    };
  }

  // 3. Verify password hash using bcrypt
  const isPasswordValid = await Bun.password.verify(passwordInput, user.password_hash);
  if (!isPasswordValid) {
    return {
      status: "invalid_credentials",
      message: "NISN / Username atau password tidak sesuai",
    };
  }

  // 4. If user is linked to a student, load student and class details
  let studentData: {
    id: string;
    nisn: string;
    full_name: string;
    class_name: string;
  } | null = null;

  if (user.student_id) {
    const studentRows = await db
      .select()
      .from(students)
      .where(eq(students.id, user.student_id))
      .limit(1);

    const student = studentRows[0];
    if (student) {
      // Find student's active class
      const classRows = await db
        .select({
          class_id: classes.id,
          class_name: classes.name,
        })
        .from(class_students)
        .innerJoin(classes, eq(class_students.class_id, classes.id))
        .where(
          and(
            eq(class_students.student_id, student.id),
            eq(class_students.is_active, true)
          )
        )
        .limit(1);

      const activeClass = classRows[0];
      studentData = {
        id: student.id,
        nisn: student.nisn,
        full_name: student.full_name,
        class_name: activeClass?.class_name || "Belum Ditentukan",
      };
    }
  }

  // 5. Generate signed JWT token (24-hour expiration)
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
  const accessToken = await sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
      student_id: user.student_id,
      exp,
    },
    env.JWT_SECRET,
    "HS256"
  );

  return {
    status: "success",
    data: {
      access_token: accessToken,
      token_type: "Bearer",
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        student: studentData,
      },
    },
  };
}

/**
 * Retrieve user profile for authenticated user
 */
export async function getUserProfile(userId: string) {
  const userRows = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.is_active, true)))
    .limit(1);

  const user = userRows[0];
  if (!user) {
    return null;
  }

  let studentData: {
    id: string;
    nisn: string;
    full_name: string;
    class_name: string;
  } | null = null;

  if (user.student_id) {
    const studentRows = await db
      .select()
      .from(students)
      .where(eq(students.id, user.student_id))
      .limit(1);

    const student = studentRows[0];
    if (student) {
      const classRows = await db
        .select({
          class_name: classes.name,
        })
        .from(class_students)
        .innerJoin(classes, eq(class_students.class_id, classes.id))
        .where(
          and(
            eq(class_students.student_id, student.id),
            eq(class_students.is_active, true)
          )
        )
        .limit(1);

      studentData = {
        id: student.id,
        nisn: student.nisn,
        full_name: student.full_name,
        class_name: classRows[0]?.class_name || "Belum Ditentukan",
      };
    }
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    student: studentData,
  };
}

