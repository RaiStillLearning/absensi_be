import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, asc, count, eq, or } from "drizzle-orm";
import type { Context } from "hono";
import { db } from "../../config/database";
import { env } from "../../config/env";
import {
  activity_logs,
  schedules,
  students,
  subject_attendance_records,
  teachers,
  users,
} from "../../config/schema";
import { requireAuth, type DecodedAuthToken } from "../../middlewares/auth";
import { API_TAGS } from "../../shared/constants";
import { ErrorResponseSchema } from "../../shared/types/api";
import { hashPassword } from "../../shared/utils/hash";
import {
  deleteLocalAvatarIfOwned,
  validateProfilePhotoValue,
} from "../../shared/utils/upload";

export const guruRouter = new OpenAPIHono();

// Otorisasi RBAC: Menambah, mengubah master data guru lain, dan menghapus guru hanya boleh dilakukan oleh Admin
guruRouter.use("*", async (c, next) => {
  const path = c.req.path;
  const method = c.req.method;
  if (method === "POST" && (path === "/api/v1/guru" || path === "/api/v1/guru/")) {
    return requireAuth(["admin"])(c, next);
  }
  if (["PUT", "DELETE"].includes(method) && /^\/api\/v1\/guru\/\d+$/.test(path)) {
    return requireAuth(["admin"])(c, next);
  }
  return next();
});

export const GuruItemSchema = z
  .object({
    id: z.number().openapi({ example: 5 }),
    nama_guru: z.string().openapi({ example: "Bu Rina Pratiwi, S.Pd." }),
    mata_pelajaran: z.string().openapi({ example: "Pemrograman Web" }),
    nip: z.string().optional().openapi({ example: "198905122015012008" }),
    email: z.string().optional().openapi({ example: "burina@ghamacaraka.sch.id" }),
    nomor_telepon: z.string().optional().openapi({ example: "0812-3456-7890" }),
    is_walas: z.boolean().default(false),
    kelas_walas: z.string().default(""),
    isWalas: z.boolean().optional(),
    kelasWalas: z.string().optional(),
  })
  .openapi("GuruItem");

export const CreateGuruPayloadSchema = z
  .object({
    nama_guru: z.string().min(1, "Nama guru wajib diisi"),
    mata_pelajaran: z.string().min(1, "Mata pelajaran wajib diisi"),
    nip: z.string().optional(),
    email: z.string().optional(),
    nomor_telepon: z.string().optional(),
    is_walas: z.boolean().optional(),
    kelas_walas: z.string().optional(),
    isWalas: z.boolean().optional(),
    kelasWalas: z.string().optional(),
  })
  .openapi("CreateGuruPayload");

export const UpdateGuruPayloadSchema = CreateGuruPayloadSchema.partial().openapi("UpdateGuruPayload");

export const SiswaAbsensiItemSchema = z
  .object({
    no: z.coerce.number().optional(),
    id: z.string().openapi({ example: "xrpl1-1" }),
    nama_siswa: z.string().openapi({ example: "Ahmad Rizky Pratama" }),
    nisn: z.string().openapi({ example: "1234567891" }),
    status: z.enum(["Hadir", "Izin", "Sakit", "Alpa"]).openapi({ example: "Hadir" }),
    catatan: z.string().optional(),
  })
  .openapi("SiswaAbsensiItem");

export const GuruProfileSchema = z
  .object({
    id: z.string().openapi({ example: "5" }),
    nip: z.string().openapi({ example: "198905122015012008" }),
    nama_lengkap: z.string().openapi({ example: "Bu Rina Pratiwi, S.Pd." }),
    nama_panggilan: z.string().optional().openapi({ example: "Bu Rina" }),
    peran: z.string().openapi({ example: "Guru" }),
    email: z.string().openapi({ example: "burina@ghamacaraka.sch.id" }),
    telepon: z.string().openapi({ example: "0812-3456-7890" }),
    jenis_kelamin: z.enum(["Laki-laki", "Perempuan"]).openapi({ example: "Perempuan" }),
    tanggal_lahir: z.string().optional().openapi({ example: "12 Mei 1989" }),
    tempat_lahir: z.string().optional().openapi({ example: "Jakarta" }),
    alamat: z.string().openapi({ example: "Depok, Jawa Barat" }),
    mata_pelajaran: z.string().openapi({ example: "Pemrograman Web" }),
    kelas_diajar: z.array(z.string()).openapi({ example: ["X RPL 1", "XI RPL 1", "XII RPL 1"] }),
    isWalas: z.boolean().openapi({ example: true }),
    kelasWalas: z.string().openapi({ example: "X RPL 1" }),
    kelas_diampu: z.string().openapi({ example: "X RPL 1" }),
    jumlah_siswa: z.number().openapi({ example: 32 }),
    status_akun: z.enum(["Aktif", "Non-Aktif"]).openapi({ example: "Aktif" }),
    tahun_ajaran: z.string().openapi({ example: "2026/2027" }),
    foto_profil: z.string().optional(),
  })
  .openapi("GuruProfile");

function mapTeacherToGuruItem(t: typeof teachers.$inferSelect) {
  return {
    id: t.id,
    nama_guru: t.nama_guru,
    mata_pelajaran: t.mata_pelajaran,
    nip: t.nip || "",
    email: t.email || "",
    nomor_telepon: t.nomor_telepon || "",
    is_walas: Boolean(t.is_walas),
    kelas_walas: t.kelas_walas || "",
    isWalas: Boolean(t.is_walas),
    kelasWalas: t.kelas_walas || "",
  };
}

async function getTeacherFromContext(
  c: Context
): Promise<typeof teachers.$inferSelect | undefined> {
  const authUser = c.get("authUser") as DecodedAuthToken | undefined;
  const teacherId = Number(authUser?.sub);
  if (teacherId && !Number.isNaN(teacherId)) {
    const [teacher] = await db
      .select()
      .from(teachers)
      .where(eq(teachers.id, teacherId))
      .limit(1);
    return teacher;
  }
  if (authUser?.username) {
    const [byNip] = await db
      .select()
      .from(teachers)
      .where(or(eq(teachers.nip, authUser.username), eq(teachers.email, authUser.username)))
      .limit(1);
    if (byNip) return byNip;
  }
  if (authUser?.role === "admin") {
    const [first] = await db.select().from(teachers).orderBy(asc(teachers.id)).limit(1);
    return first;
  }
  return undefined;
}

async function formatTeacherProfile(t?: typeof teachers.$inferSelect) {
  const isWalas = Boolean(t?.is_walas ?? false);
  const kelasWalas = t?.kelas_walas ?? "";
  const namaGuru = t?.nama_guru || "";
  const mapel = t?.mata_pelajaran || "";

  let kelasDiajar: string[] = [];
  if (mapel) {
    const fromRecords = await db
      .selectDistinct({ kelas: subject_attendance_records.kelas })
      .from(subject_attendance_records)
      .where(eq(subject_attendance_records.mata_pelajaran, mapel));
    kelasDiajar = fromRecords.map((k) => k.kelas).filter(Boolean);
  }
  if (kelasDiajar.length === 0 && namaGuru) {
    const teacherSchedules = await db
      .selectDistinct({ kelas: schedules.kelas })
      .from(schedules)
      .where(eq(schedules.guru, namaGuru));
    kelasDiajar = teacherSchedules.map((s) => s.kelas).filter(Boolean);
  }
  if (kelasDiajar.length === 0 && kelasWalas) {
    kelasDiajar = [kelasWalas];
  }

  const [jumlahSiswa] = await db
    .select({ count: count() })
    .from(students)
    .where(eq(students.kelas, kelasWalas || kelasDiajar[0] || ""));

  return {
    id: String(t?.id ?? ""),
    nip: t?.nip || "",
    nama_lengkap: namaGuru,
    nama_panggilan: t?.nama_panggilan || namaGuru.split(",")[0] || "",
    peran: "Guru",
    email: t?.email || "",
    telepon: t?.nomor_telepon || "",
    jenis_kelamin: ((t?.jenis_kelamin === "Laki-laki" ? "Laki-laki" : "Perempuan") as
      | "Laki-laki"
      | "Perempuan"),
    tempat_lahir: t?.tempat_lahir || "",
    tanggal_lahir: t?.tanggal_lahir || "",
    alamat: t?.alamat || "",
    mata_pelajaran: mapel,
    kelas_diajar: kelasDiajar,
    isWalas,
    kelasWalas,
    kelas_diampu: kelasWalas,
    jumlah_siswa: jumlahSiswa?.count || 0,
    status_akun: ((t?.status_akun === "Non-Aktif" ? "Non-Aktif" : "Aktif") as
      | "Aktif"
      | "Non-Aktif"),
    tahun_ajaran: t?.tahun_ajaran || "2026/2027",
    foto_profil: t?.foto_profil || "",
  };
}

function normalizeDateString(tanggal?: string): string {
  const raw = (tanggal || new Date().toISOString().slice(0, 10)).trim();
  return raw.includes("T") ? raw.split("T")[0]! : raw;
}

async function getOrSeedSubjectSession(kelas: string, mapel: string, tanggal: string) {
  const normKelas = (kelas || "X RPL 1").trim();
  const normMapel = (mapel || "Pemrograman Web").trim();
  const normTanggal = normalizeDateString(tanggal);

  const existing = await db
    .select()
    .from(subject_attendance_records)
    .where(
      and(
        eq(subject_attendance_records.kelas, normKelas),
        eq(subject_attendance_records.mata_pelajaran, normMapel),
        eq(subject_attendance_records.tanggal, normTanggal)
      )
    )
    .orderBy(asc(subject_attendance_records.no_urut));

  if (existing.length > 0) {
    return existing.map((r, i) => ({
      no: r.no_urut || i + 1,
      id: r.record_key,
      nama_siswa: r.nama_siswa,
      nisn: r.nisn,
      status: (r.status as "Hadir" | "Izin" | "Sakit" | "Alpa") || "Hadir",
      catatan: r.catatan || undefined,
    }));
  }

  // Seed session from students in that class (or template session in DB)
  let classStudents = await db
    .select()
    .from(students)
    .where(eq(students.kelas, normKelas))
    .orderBy(asc(students.full_name));

  if (classStudents.length === 0) {
    classStudents = await db
      .select()
      .from(students)
      .where(eq(students.kelas, "X RPL 1"))
      .orderBy(asc(students.full_name));
  }

  const slug = normKelas.toLowerCase().replace(/\s+/g, "");
  const createdItems: Array<{
    no: number;
    id: string;
    nama_siswa: string;
    nisn: string;
    status: "Hadir" | "Izin" | "Sakit" | "Alpa";
    catatan?: string;
  }> = [];

  for (let i = 0; i < classStudents.length; i++) {
    const st = classStudents[i]!;
    const recKey = `${slug}-${i + 1}`;
    await db.insert(subject_attendance_records).values({
      record_key: recKey,
      kelas: normKelas,
      mata_pelajaran: normMapel,
      tanggal: normTanggal,
      no_urut: i + 1,
      nisn: st.nisn,
      nama_siswa: st.full_name,
      status: "Hadir",
      catatan: "",
    });
    createdItems.push({
      no: i + 1,
      id: recKey,
      nama_siswa: st.full_name,
      nisn: st.nisn,
      status: "Hadir",
    });
  }

  return createdItems;
}

/**
 * 1. GET /api/v1/guru
 */
export const listGuruRoute = createRoute({
  method: "get",
  path: "/",
  tags: [API_TAGS.ADMIN, API_TAGS.GURU],
  summary: "List All Teachers",
  description: "Returns master list of teachers from PostgreSQL",
  responses: {
    200: {
      description: "List of teachers retrieved",
      content: {
        "application/json": {
          schema: z.array(GuruItemSchema),
        },
      },
    },
  },
});

guruRouter.openapi(listGuruRoute, async (c) => {
  const rows = await db.select().from(teachers).orderBy(asc(teachers.id));
  return c.json(rows.map(mapTeacherToGuruItem), 200);
});

/**
 * 2. POST /api/v1/guru
 */
export const createGuruRoute = createRoute({
  method: "post",
  path: "/",
  tags: [API_TAGS.ADMIN],
  summary: "Create New Teacher",
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateGuruPayloadSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      description: "Teacher created successfully in PostgreSQL",
      content: {
        "application/json": {
          schema: GuruItemSchema,
        },
      },
    },
    400: {
      description: "Validation error",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

guruRouter.openapi(createGuruRoute, async (c) => {
  const body = c.req.valid("json");
  const isWalas = Boolean(body.isWalas ?? body.is_walas);
  const kelasWalas = body.kelasWalas ?? body.kelas_walas ?? "";

  const [inserted] = await db
    .insert(teachers)
    .values({
      nama_guru: body.nama_guru,
      mata_pelajaran: body.mata_pelajaran,
      nip: body.nip || "",
      email: body.email || "",
      nomor_telepon: body.nomor_telepon || "",
      is_walas: isWalas,
      kelas_walas: isWalas ? kelasWalas : "",
    })
    .returning();

  if (inserted?.nip) {
    await db
      .insert(users)
      .values({
        username: inserted.nip,
        role: "guru",
        nama_lengkap: inserted.nama_guru,
        email: inserted.email || "",
        teacher_id: inserted.id,
        password_hash: hashPassword(env.TEACHER_DEFAULT_PASSWORD || "guru123"),
        is_active: true,
      })
      .onConflictDoNothing();
  }

  return c.json(mapTeacherToGuruItem(inserted!), 201);
});

/**
 * 3. GET /api/v1/guru/profil
 */
export const getGuruProfileRoute = createRoute({
  method: "get",
  path: "/profil",
  tags: [API_TAGS.GURU, API_TAGS.WALAS],
  summary: "Get Current Teacher Profile",
  description: "Returns profile details for teacher / homeroom teacher from PostgreSQL",
  responses: {
    200: {
      description: "Teacher profile retrieved",
      content: {
        "application/json": {
          schema: GuruProfileSchema,
        },
      },
    },
  },
});

guruRouter.openapi(getGuruProfileRoute, async (c) => {
  const row = await getTeacherFromContext(c);
  return c.json(await formatTeacherProfile(row), 200);
});

/**
 * 4. PUT /api/v1/guru/profil
 */
export const updateGuruProfileRoute = createRoute({
  method: "put",
  path: "/profil",
  tags: [API_TAGS.GURU, API_TAGS.WALAS],
  summary: "Update Current Teacher Profile",
  request: {
    body: {
      content: {
        "application/json": {
          schema: GuruProfileSchema.partial(),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Teacher profile updated in PostgreSQL",
      content: {
        "application/json": {
          schema: GuruProfileSchema,
        },
      },
    },
    400: {
      description: "Invalid profile photo",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

guruRouter.openapi(updateGuruProfileRoute, async (c) => {
  const body = c.req.valid("json");
  if (body.foto_profil !== undefined) {
    const validation = validateProfilePhotoValue(body.foto_profil);
    if (!validation.valid) {
      return c.json({ success: false, message: validation.error }, 400);
    }
  }

  const current = await getTeacherFromContext(c);
  if (!current) {
    return c.json(await formatTeacherProfile(undefined), 200);
  }

  const previousFoto = current.foto_profil;
  // Keamanan RBAC: Guru tidak boleh mengubah NIP (identitas login) atau mata pelajaran secara mandiri
  const [updated] = await db
    .update(teachers)
    .set({
      nama_guru: body.nama_lengkap ?? current.nama_guru,
      nama_panggilan: body.nama_panggilan ?? current.nama_panggilan,
      email: body.email ?? current.email,
      nomor_telepon: body.telepon ?? current.nomor_telepon,
      jenis_kelamin: body.jenis_kelamin ?? current.jenis_kelamin,
      tempat_lahir: body.tempat_lahir ?? current.tempat_lahir,
      tanggal_lahir: body.tanggal_lahir ?? current.tanggal_lahir,
      alamat: body.alamat ?? current.alamat,
      foto_profil: body.foto_profil ?? current.foto_profil,
      updated_at: new Date(),
    })
    .where(eq(teachers.id, current.id))
    .returning();

  if (body.foto_profil !== undefined) {
    await db
      .update(users)
      .set({ foto_profil: body.foto_profil, updated_at: new Date() })
      .where(
        current.nip
          ? or(eq(users.teacher_id, current.id), eq(users.username, current.nip))
          : eq(users.teacher_id, current.id)
      );

    if (previousFoto && previousFoto !== body.foto_profil) {
      await deleteLocalAvatarIfOwned(previousFoto);
    }
  }

  return c.json(await formatTeacherProfile(updated), 200);
});

/**
 * 5. GET /api/v1/guru/dashboard
 */
export const getGuruDashboardRoute = createRoute({
  method: "get",
  path: "/dashboard",
  tags: [API_TAGS.GURU],
  summary: "Get Teacher Dashboard Overview",
  responses: {
    200: {
      description: "Teacher dashboard retrieved from PostgreSQL",
      content: {
        "application/json": {
          schema: z.object({
            profil: GuruProfileSchema,
            guru: GuruProfileSchema.optional(),
            kelas_aktif: z.object({
              id: z.string(),
              nama_kelas: z.string(),
              jurusan: z.string(),
              mata_pelajaran: z.string(),
              tanggal: z.string(),
              jam: z.string(),
              status: z.string(),
            }),
            rekap: z.object({
              hadir: z.number(),
              izin: z.number(),
              sakit: z.number(),
              alpa: z.number(),
              total: z.number(),
            }),
          }),
        },
      },
    },
  },
});

guruRouter.openapi(getGuruDashboardRoute, async (c) => {
  const row = await getTeacherFromContext(c);
  const profile = await formatTeacherProfile(row);
  const activeClass = profile.kelasWalas || profile.kelas_diajar[0] || "X RPL 1";
  const today = new Date().toISOString().split("T")[0] || "2026-11-11";
  const todayFormatted = new Date().toLocaleDateString("id-ID");
  const sessionList = await getOrSeedSubjectSession(
    activeClass,
    profile.mata_pelajaran,
    today
  );

  const hadir = sessionList.filter((s) => s.status === "Hadir").length;
  const izin = sessionList.filter((s) => s.status === "Izin").length;
  const sakit = sessionList.filter((s) => s.status === "Sakit").length;
  const alpa = sessionList.filter((s) => s.status === "Alpa").length;
  const jamSekarang = new Date().toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return c.json(
    {
      profil: profile,
      guru: profile,
      kelas_aktif: {
        id: "kls-1",
        nama_kelas: activeClass,
        jurusan: activeClass.includes("TKJ")
          ? "Teknik Komputer dan Jaringan"
          : "Rekayasa Perangkat Lunak",
        mata_pelajaran: profile.mata_pelajaran,
        tanggal: todayFormatted,
        jam: jamSekarang,
        status: "Aktif",
      },
      rekap: {
        hadir,
        izin,
        sakit,
        alpa,
        total: sessionList.length,
      },
    },
    200
  );
});

/**
 * 6. GET /api/v1/guru/absensi
 */
export const getGuruAbsensiSesiRoute = createRoute({
  method: "get",
  path: "/absensi",
  tags: [API_TAGS.GURU],
  summary: "Get Student Attendance for Class/Subject Session",
  request: {
    query: z.object({
      kelas: z.string().optional().default("X RPL 1"),
      mapel: z.string().optional().default("Pemrograman Web"),
      tanggal: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "Student attendance session list from PostgreSQL",
      content: {
        "application/json": {
          schema: z.array(SiswaAbsensiItemSchema),
        },
      },
    },
  },
});

guruRouter.openapi(getGuruAbsensiSesiRoute, async (c) => {
  const { kelas, mapel, tanggal } = c.req.valid("query");
  const teacher = await getTeacherFromContext(c);
  const targetKelas = kelas || teacher?.kelas_walas || "X RPL 1";
  const targetMapel = mapel || teacher?.mata_pelajaran || "Pemrograman Web";
  const targetTanggal = normalizeDateString(tanggal);
  const list = await getOrSeedSubjectSession(targetKelas, targetMapel, targetTanggal);
  return c.json(list, 200);
});

/**
 * 7. POST /api/v1/guru/absensi/simpan
 */
export const saveGuruAbsensiSesiRoute = createRoute({
  method: "post",
  path: "/absensi/simpan",
  tags: [API_TAGS.GURU],
  summary: "Save Student Attendance for Class/Subject Session",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            kelas: z.string(),
            mapel: z.string(),
            tanggal: z.string(),
            siswa: z.array(SiswaAbsensiItemSchema).optional(),
            siswa_list: z.array(SiswaAbsensiItemSchema).optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Attendance session saved successfully in PostgreSQL",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
            data: z.array(SiswaAbsensiItemSchema),
          }),
        },
      },
    },
  },
});

guruRouter.openapi(saveGuruAbsensiSesiRoute, async (c) => {
  const body = c.req.valid("json");
  const teacher = await getTeacherFromContext(c);
  const normKelas = (body.kelas || teacher?.kelas_walas || "X RPL 1").trim();
  const normMapel = (body.mapel || teacher?.mata_pelajaran || "Pemrograman Web").trim();
  const normTanggal = normalizeDateString(body.tanggal);
  const rawList = body.siswa || body.siswa_list || [];

  await db
    .delete(subject_attendance_records)
    .where(
      and(
        eq(subject_attendance_records.kelas, normKelas),
        eq(subject_attendance_records.mata_pelajaran, normMapel),
        eq(subject_attendance_records.tanggal, normTanggal)
      )
    );

  const cleanList = rawList.map((item, idx) => ({
    ...item,
    no: item.no ?? idx + 1,
  }));

  for (const item of cleanList) {
    await db.insert(subject_attendance_records).values({
      record_key: item.id,
      kelas: normKelas,
      mata_pelajaran: normMapel,
      tanggal: normTanggal,
      no_urut: item.no,
      nisn: item.nisn,
      nama_siswa: item.nama_siswa,
      status: item.status,
      catatan: item.catatan || "",
    });
  }

  await db.insert(activity_logs).values({
    jenis: "absensi",
    judul: "Absensi kelas diperbarui",
    deskripsi: `Guru mengisi absensi ${normKelas} (${normMapel}).`,
    waktu: "Baru saja",
  });

  return c.json(
    {
      success: true,
      message: `Data absensi kelas ${normKelas} (${normMapel}) berhasil disimpan!`,
      data: cleanList,
    },
    200
  );
});

export const patchGuruAbsensiStudentRoute = createRoute({
  method: "patch",
  path: "/absensi/:id",
  tags: [API_TAGS.GURU],
  summary: "Update Student Attendance in Subject Session via Patch",
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            status: z.enum(["Hadir", "Izin", "Sakit", "Alpa"]),
            kelas: z.string().optional().default("X RPL 1"),
            mapel: z.string().optional().default("Pemrograman Web"),
            tanggal: z.string().optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Student status updated in PostgreSQL",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
    },
  },
});

guruRouter.openapi(patchGuruAbsensiStudentRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { status, kelas, mapel, tanggal } = c.req.valid("json");
  const normKelas = (kelas || "X RPL 1").trim();
  const normMapel = (mapel || "Pemrograman Web").trim();
  const normTanggal = normalizeDateString(tanggal);

  await getOrSeedSubjectSession(normKelas, normMapel, normTanggal);

  await db
    .update(subject_attendance_records)
    .set({ status, updated_at: new Date() })
    .where(
      and(
        eq(subject_attendance_records.kelas, normKelas),
        eq(subject_attendance_records.mata_pelajaran, normMapel),
        eq(subject_attendance_records.tanggal, normTanggal),
        eq(subject_attendance_records.record_key, id)
      )
    );

  return c.json(
    {
      success: true,
      message: `Status siswa berhasil diubah menjadi ${status}`,
    },
    200
  );
});



/**
 * 9. DELETE /api/v1/guru/absensi/:id
 */
export const deleteGuruAbsensiStudentRoute = createRoute({
  method: "delete",
  path: "/absensi/:id",
  tags: [API_TAGS.GURU],
  summary: "Remove Student From Subject Attendance Session",
  request: {
    params: z.object({
      id: z.string(),
    }),
    query: z.object({
      kelas: z.string().optional().default("X RPL 1"),
      mapel: z.string().optional().default("Pemrograman Web"),
      tanggal: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "Student removed from session in PostgreSQL",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
    },
  },
});

guruRouter.openapi(deleteGuruAbsensiStudentRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { kelas, mapel, tanggal } = c.req.valid("query");
  const normKelas = (kelas || "X RPL 1").trim();
  const normMapel = (mapel || "Pemrograman Web").trim();
  const normTanggal = normalizeDateString(tanggal);

  await getOrSeedSubjectSession(normKelas, normMapel, normTanggal);

  await db
    .delete(subject_attendance_records)
    .where(
      and(
        eq(subject_attendance_records.kelas, normKelas),
        eq(subject_attendance_records.mata_pelajaran, normMapel),
        eq(subject_attendance_records.tanggal, normTanggal),
        eq(subject_attendance_records.record_key, id)
      )
    );

  return c.json(
    {
      success: true,
      message: "Data siswa berhasil dihapus dari sesi absensi",
    },
    200
  );
});

/**
 * 10. GET /api/v1/guru/rekap
 */
export const getGuruRekapRoute = createRoute({
  method: "get",
  path: "/rekap",
  tags: [API_TAGS.GURU],
  summary: "Get Attendance Recapitulation for Subject Session",
  request: {
    query: z.object({
      kelas: z.string().optional().default("X RPL 1"),
      mapel: z.string().optional().default("Pemrograman Web"),
      tanggal: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "Recapitulation report data from PostgreSQL",
      content: {
        "application/json": {
          schema: z.object({
            kelas: z.string(),
            mata_pelajaran: z.string(),
            tanggal: z.string(),
            total_siswa: z.number(),
            total_hadir: z.number(),
            total_izin: z.number(),
            total_sakit: z.number(),
            total_alfa: z.number(),
            persentase_kehadiran: z.number(),
            rows: z.array(
              z.object({
                no: z.number(),
                id: z.string(),
                nama_siswa: z.string(),
                nisn: z.string(),
                hadir: z.number(),
                izin: z.number(),
                sakit: z.number(),
                alfa: z.number(),
                persentase: z.number(),
              })
            ),
          }),
        },
      },
    },
  },
});

guruRouter.openapi(getGuruRekapRoute, async (c) => {
  const { kelas, mapel, tanggal } = c.req.valid("query");
  const targetTanggal = normalizeDateString(tanggal);
  const rawSiswa = await getOrSeedSubjectSession(kelas, mapel, targetTanggal);
  const rows = rawSiswa.map((item, index) => {
    const hadir = item.status === "Hadir" ? 1 : 0;
    const izin = item.status === "Izin" ? 1 : 0;
    const sakit = item.status === "Sakit" ? 1 : 0;
    const alfa = item.status === "Alpa" ? 1 : 0;
    const persentase = hadir > 0 ? 100 : 0;
    return {
      no: index + 1,
      id: `rk-${item.id}`,
      nama_siswa: item.nama_siswa,
      nisn: item.nisn,
      hadir,
      izin,
      sakit,
      alfa,
      persentase,
    };
  });
  const total_siswa = rows.length;
  const total_hadir = rows.reduce((acc, curr) => acc + curr.hadir, 0);
  const total_izin = rows.reduce((acc, curr) => acc + curr.izin, 0);
  const total_sakit = rows.reduce((acc, curr) => acc + curr.sakit, 0);
  const total_alfa = rows.reduce((acc, curr) => acc + curr.alfa, 0);
  const persentase_kehadiran = total_siswa > 0 ? Math.round((total_hadir / total_siswa) * 100) : 0;

  return c.json(
    {
      kelas,
      mata_pelajaran: mapel,
      tanggal: targetTanggal,
      total_siswa,
      total_hadir,
      total_izin,
      total_sakit,
      total_alfa,
      persentase_kehadiran,
      rows,
    },
    200
  );
});

/**
 * 11. GET /api/v1/guru/:id
 */
export const getGuruByIdRoute = createRoute({
  method: "get",
  path: "/:id",
  tags: [API_TAGS.ADMIN],
  summary: "Get Teacher by ID",
  request: {
    params: z.object({
      id: z.coerce.number(),
    }),
  },
  responses: {
    200: {
      description: "Teacher details retrieved from PostgreSQL",
      content: {
        "application/json": {
          schema: GuruItemSchema,
        },
      },
    },
    404: {
      description: "Teacher not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

guruRouter.openapi(getGuruByIdRoute, async (c) => {
  const { id } = c.req.valid("param");
  const [item] = await db.select().from(teachers).where(eq(teachers.id, id)).limit(1);
  if (!item) {
    return c.json({ success: false, message: `Guru dengan ID ${id} tidak ditemukan` }, 404);
  }
  return c.json(mapTeacherToGuruItem(item), 200);
});

/**
 * 12. PUT /api/v1/guru/:id
 */
export const updateGuruRoute = createRoute({
  method: "put",
  path: "/:id",
  tags: [API_TAGS.ADMIN],
  summary: "Update Teacher by ID",
  request: {
    params: z.object({
      id: z.coerce.number(),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateGuruPayloadSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Teacher updated successfully in PostgreSQL",
      content: {
        "application/json": {
          schema: GuruItemSchema,
        },
      },
    },
    404: {
      description: "Teacher not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

guruRouter.openapi(updateGuruRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const [existing] = await db.select().from(teachers).where(eq(teachers.id, id)).limit(1);
  if (!existing) {
    return c.json({ success: false, message: `Guru dengan ID ${id} tidak ditemukan` }, 404);
  }

  const isWalas =
    typeof body.isWalas !== "undefined"
      ? body.isWalas
      : typeof body.is_walas !== "undefined"
        ? body.is_walas
        : existing.is_walas;
  const kelasWalas =
    typeof body.kelasWalas !== "undefined"
      ? body.kelasWalas
      : typeof body.kelas_walas !== "undefined"
        ? body.kelas_walas
        : existing.kelas_walas;

  const [updated] = await db
    .update(teachers)
    .set({
      nama_guru: body.nama_guru ?? existing.nama_guru,
      mata_pelajaran: body.mata_pelajaran ?? existing.mata_pelajaran,
      nip: body.nip ?? existing.nip,
      email: body.email ?? existing.email,
      nomor_telepon: body.nomor_telepon ?? existing.nomor_telepon,
      is_walas: Boolean(isWalas),
      kelas_walas: isWalas ? kelasWalas || "" : "",
      updated_at: new Date(),
    })
    .where(eq(teachers.id, id))
    .returning();

  return c.json(mapTeacherToGuruItem(updated!), 200);
});

/**
 * 13. DELETE /api/v1/guru/:id
 */
export const deleteGuruRoute = createRoute({
  method: "delete",
  path: "/:id",
  tags: [API_TAGS.ADMIN],
  summary: "Delete Teacher by ID",
  request: {
    params: z.object({
      id: z.coerce.number(),
    }),
  },
  responses: {
    200: {
      description: "Teacher deleted successfully from PostgreSQL",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
    },
    404: {
      description: "Teacher not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

guruRouter.openapi(deleteGuruRoute, async (c) => {
  const { id } = c.req.valid("param");
  const [existing] = await db.select().from(teachers).where(eq(teachers.id, id)).limit(1);
  if (!existing) {
    return c.json({ success: false, message: `Guru dengan ID ${id} tidak ditemukan` }, 404);
  }
  await db.delete(teachers).where(eq(teachers.id, id));
  return c.json({ success: true, message: `Guru berhasil dihapus` }, 200);
});
