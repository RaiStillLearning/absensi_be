import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { asc, eq, or } from "drizzle-orm";
import type { Context } from "hono";
import { db } from "../../config/database";
import {
  classes,
  daily_attendance_records,
  daily_attendances,
  students,
  teachers,
} from "../../config/schema";
import { type DecodedAuthToken } from "../../middlewares/auth";
import { API_TAGS } from "../../shared/constants";
import { ErrorResponseSchema } from "../../shared/types/api";

export const walasRouter = new OpenAPIHono();

export const WalasProfileSchema = z
  .object({
    id: z.string().openapi({ example: "5" }),
    nip: z.string().openapi({ example: "198905122015012008" }),
    nama_lengkap: z.string().openapi({ example: "Bu Rina Pratiwi, S.Pd." }),
    nama_panggilan: z.string().openapi({ example: "Bu Rina" }),
    peran: z.string().openapi({ example: "Guru" }),
    email: z.string().openapi({ example: "burina@ghamacaraka.sch.id" }),
    telepon: z.string().openapi({ example: "0812-3456-7890" }),
    jenis_kelamin: z.enum(["Laki-laki", "Perempuan"]).openapi({ example: "Perempuan" }),
    tanggal_lahir: z.string().openapi({ example: "12 Mei 1989" }),
    tempat_lahir: z.string().optional().openapi({ example: "Jakarta" }),
    mata_pelajaran: z.string().optional().openapi({ example: "Pemrograman Web" }),
    alamat: z.string().openapi({ example: "Depok, Jawa Barat" }),
    username: z.string().openapi({ example: "burina" }),
    status_akun: z.enum(["Aktif", "Non-Aktif"]).openapi({ example: "Aktif" }),
    isWalas: z.boolean().openapi({ example: true }),
    kelasWalas: z.string().openapi({ example: "X RPL 1" }),
    kelas_diampu: z.string().openapi({ example: "X RPL 1" }),
    jumlah_siswa: z.number().openapi({ example: 32 }),
    tahun_ajaran: z.string().openapi({ example: "2026/2027" }),
    foto_profil: z.string().optional(),
  })
  .openapi("WalasProfile");

export const SiswaHarianWalasItemSchema = z
  .object({
    no: z.number(),
    id: z.string(),
    nis: z.string(),
    nisn: z.string(),
    nama_siswa: z.string(),
    jam_masuk: z.string().optional(),
    status: z.enum(["Hadir", "Izin", "Sakit", "Alpa", "Tidak Hadir"]),
    keterangan: z.string(),
  })
  .openapi("SiswaHarianWalasItem");

export type SiswaHarianWalas = z.infer<typeof SiswaHarianWalasItemSchema>;

function mapDbStatusToWalasStatus(
  status: string
): "Hadir" | "Izin" | "Sakit" | "Alpa" | "Tidak Hadir" {
  if (status === "present") return "Hadir";
  if (status === "excused") return "Izin";
  if (status === "sick") return "Sakit";
  return "Tidak Hadir";
}

function mapWalasStatusToDbStatus(status: string): string {
  if (status === "Hadir") return "present";
  if (status === "Izin") return "excused";
  if (status === "Sakit") return "sick";
  return "absent";
}

async function getWalasDailyRecords(): Promise<SiswaHarianWalas[]> {
  const rows = await db
    .select({
      record_id: daily_attendance_records.id,
      record_code: daily_attendance_records.record_code,
      attendance_status: daily_attendance_records.attendance_status,
      jam_masuk: daily_attendance_records.jam_masuk,
      keterangan: daily_attendance_records.keterangan,
      student_id: students.id,
      nis: students.nis,
      nisn: students.nisn,
      nama_siswa: students.full_name,
    })
    .from(daily_attendance_records)
    .innerJoin(students, eq(daily_attendance_records.student_id, students.id))
    .orderBy(asc(students.nisn));

  return rows.map((r, idx) => ({
    no: idx + 1,
    id: r.record_code || `w-${idx + 1}`,
    nis: r.nis || `24251000${idx + 1}`,
    nisn: r.nisn,
    nama_siswa: r.nama_siswa,
    jam_masuk: r.jam_masuk && r.jam_masuk !== "—" ? r.jam_masuk : undefined,
    status: mapDbStatusToWalasStatus(r.attendance_status),
    keterangan: r.keterangan || "Tepat waktu",
  }));
}

/**
 * 1. GET /api/v1/walas/dashboard
 */
export const getWalasDashboardRoute = createRoute({
  method: "get",
  path: "/dashboard",
  tags: [API_TAGS.WALAS],
  summary: "Get Homeroom Teacher Dashboard",
  responses: {
    200: {
      description: "Homeroom dashboard retrieved from PostgreSQL",
      content: {
        "application/json": {
          schema: z.object({
            profile: WalasProfileSchema,
            rekap: z.object({
              hadir: z.number(),
              izin: z.number(),
              sakit: z.number(),
              alfa: z.number(),
              total_siswa: z.number(),
              persentase: z.number(),
            }),
          }),
        },
      },
    },
  },
});

async function getActiveWalasTeacherRow(c: Context) {
  const authUser = c.get("authUser") as DecodedAuthToken | undefined;
  const teacherId = Number(authUser?.sub);
  if (teacherId && !Number.isNaN(teacherId)) {
    const [guru] = await db
      .select()
      .from(teachers)
      .where(eq(teachers.id, teacherId))
      .limit(1);
    return guru;
  }
  if (authUser?.username) {
    const [byNipOrEmail] = await db
      .select()
      .from(teachers)
      .where(
        or(eq(teachers.nip, authUser.username), eq(teachers.email, authUser.username))
      )
      .limit(1);
    if (byNipOrEmail) return byNipOrEmail;
  }
  if (authUser?.role === "admin") {
    const [firstWalas] = await db
      .select()
      .from(teachers)
      .where(eq(teachers.is_walas, true))
      .orderBy(asc(teachers.id))
      .limit(1);
    return firstWalas;
  }
  return undefined;
}

walasRouter.openapi(getWalasDashboardRoute, async (c) => {
  const guru = await getActiveWalasTeacherRow(c);
  const walasSiswaList = await getWalasDailyRecords();

  const countHadir = walasSiswaList.filter((s) => s.status === "Hadir").length;
  const countIzin = walasSiswaList.filter((s) => s.status === "Izin").length;
  const countSakit = walasSiswaList.filter((s) => s.status === "Sakit").length;
  const countAlfa = walasSiswaList.filter(
    (s) => s.status === "Tidak Hadir" || s.status === "Alpa"
  ).length;
  const total = walasSiswaList.length;
  const persentase = total > 0 ? Math.round((countHadir / total) * 100) : 0;

  return c.json(
    {
      profile: {
        id: String(guru?.id ?? "5"),
        nip: guru?.nip ?? "198905122015012008",
        nama_lengkap: guru?.nama_guru ?? "Bu Rina Pratiwi, S.Pd.",
        nama_panggilan: guru?.nama_panggilan || "Bu Rina",
        peran: "Guru",
        email: guru?.email ?? "burina@ghamacaraka.sch.id",
        telepon: guru?.nomor_telepon ?? "0812-3456-7890",
        jenis_kelamin: ((guru?.jenis_kelamin === "Laki-laki" ? "Laki-laki" : "Perempuan") as
          | "Laki-laki"
          | "Perempuan"),
        tanggal_lahir: guru?.tanggal_lahir || "12 Mei 1989",
        tempat_lahir: guru?.tempat_lahir || "Jakarta",
        mata_pelajaran: guru?.mata_pelajaran ?? "Pemrograman Web",
        alamat: guru?.alamat || "Depok, Jawa Barat",
        username: guru?.nip || "burina",
        status_akun: "Aktif" as const,
        isWalas: Boolean(guru?.is_walas ?? true),
        kelasWalas: guru?.kelas_walas || "X RPL 1",
        kelas_diampu: guru?.kelas_walas || "X RPL 1",
        jumlah_siswa: total,
        tahun_ajaran: guru?.tahun_ajaran || "2026/2027",
        foto_profil: guru?.foto_profil || "",
      },
      rekap: {
        hadir: countHadir,
        izin: countIzin,
        sakit: countSakit,
        alfa: countAlfa,
        total_siswa: total,
        persentase,
      },
    },
    200
  );
});

/**
 * 2. GET /api/v1/walas/monitoring
 */
export const getWalasMonitoringRoute = createRoute({
  method: "get",
  path: "/monitoring",
  tags: [API_TAGS.WALAS],
  summary: "Get Homeroom Daily Class Attendance Monitoring",
  request: {
    query: z.object({
      tanggal: z.string().optional().default("2026-06-05"),
      status: z.string().optional().default("Semua"),
      cari: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "Monitoring list and stats from PostgreSQL",
      content: {
        "application/json": {
          schema: z.object({
            tanggal: z.string(),
            siswa: z.array(SiswaHarianWalasItemSchema),
            statistik: z.object({
              total: z.number(),
              hadir: z.number(),
              izin: z.number(),
              sakit: z.number(),
              alpa: z.number(),
              persentase: z.number(),
            }),
          }),
        },
      },
    },
  },
});

walasRouter.openapi(getWalasMonitoringRoute, async (c) => {
  const { tanggal, status, cari } = c.req.valid("query");
  const allList = await getWalasDailyRecords();
  let filtered = allList;

  if (status && status !== "Semua") {
    filtered = filtered.filter((s) => s.status === status);
  }

  if (cari) {
    const q = cari.toLowerCase();
    filtered = filtered.filter(
      (s) => s.nama_siswa.toLowerCase().includes(q) || s.nisn.includes(q) || s.nis.includes(q)
    );
  }

  const countHadir = allList.filter((s) => s.status === "Hadir").length;
  const countIzin = allList.filter((s) => s.status === "Izin").length;
  const countSakit = allList.filter((s) => s.status === "Sakit").length;
  const countAlpa = allList.filter(
    (s) => s.status === "Tidak Hadir" || s.status === "Alpa"
  ).length;
  const total = allList.length;
  const persentase = total > 0 ? Math.round((countHadir / total) * 100) : 0;

  return c.json(
    {
      tanggal,
      siswa: filtered,
      siswa_list: filtered,
      statistik: {
        total,
        hadir: countHadir,
        izin: countIzin,
        sakit: countSakit,
        alpa: countAlpa,
        persentase,
      },
      ringkasan: {
        total_siswa: total,
        hadir: countHadir,
        izin: countIzin,
        sakit: countSakit,
        alpa: countAlpa,
        persentase,
      },
    },
    200
  );
});

/**
 * 3. PUT /api/v1/walas/monitoring/siswa/:id
 */
export const updateWalasStudentStatusRoute = createRoute({
  method: "put",
  path: "/monitoring/siswa/:id",
  tags: [API_TAGS.WALAS],
  summary: "Update Homeroom Student Daily Attendance Status",
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            status: z.enum(["Hadir", "Izin", "Sakit", "Alpa", "Tidak Hadir"]),
            keterangan: z.string().optional(),
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
            data: SiswaHarianWalasItemSchema,
          }),
        },
      },
    },
    404: {
      description: "Student not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

walasRouter.openapi(updateWalasStudentStatusRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { status, keterangan } = c.req.valid("json");

  const [record] = await db
    .select()
    .from(daily_attendance_records)
    .where(eq(daily_attendance_records.record_code, id))
    .limit(1);

  if (!record) {
    return c.json({ success: false, message: "Siswa tidak ditemukan" }, 404);
  }

  const newKet = keterangan || (status === "Hadir" ? "Tepat waktu" : "-");
  await db
    .update(daily_attendance_records)
    .set({
      attendance_status: mapWalasStatusToDbStatus(status),
      keterangan: newKet,
      updated_at: new Date(),
    })
    .where(eq(daily_attendance_records.id, record.id));

  const allList = await getWalasDailyRecords();
  const updatedItem = allList.find((s) => s.id === id) || allList[0]!;

  return c.json(
    {
      success: true,
      message: `Data kehadiran "${updatedItem.nama_siswa}" berhasil diubah.`,
      data: updatedItem,
    },
    200
  );
});

/**
 * 4. DELETE /api/v1/walas/monitoring/siswa/:id
 */
export const deleteWalasStudentRoute = createRoute({
  method: "delete",
  path: "/monitoring/siswa/:id",
  tags: [API_TAGS.WALAS],
  summary: "Remove Student from Daily Homeroom Attendance",
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Student removed from PostgreSQL",
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

walasRouter.openapi(deleteWalasStudentRoute, async (c) => {
  const { id } = c.req.valid("param");
  await db
    .delete(daily_attendance_records)
    .where(eq(daily_attendance_records.record_code, id));
  return c.json({ success: true, message: "Data siswa berhasil dihapus." }, 200);
});

/**
 * 5. GET /api/v1/walas/rekap/bulan-ini
 */
export const getWalasRekapBulanIniRoute = createRoute({
  method: "get",
  path: "/rekap/bulan-ini",
  tags: [API_TAGS.WALAS],
  summary: "Get Monthly Attendance Recap for Homeroom Class",
  responses: {
    200: {
      description: "Monthly recap data from PostgreSQL",
      content: {
        "application/json": {
          schema: z.object({
            rekap: z.object({
              hadir: z.number(),
              izin: z.number(),
              sakit: z.number(),
              alfa: z.number(),
              total_siswa: z.number(),
              persentase: z.number(),
            }),
            siswa_list: z.array(
              z.object({
                no: z.number(),
                id: z.string(),
                nisn: z.string(),
                nama_siswa: z.string(),
                hadir: z.number(),
                izin: z.number(),
                sakit: z.number(),
                alpa: z.number(),
                persentase: z.number(),
              })
            ),
          }),
        },
      },
    },
  },
});

walasRouter.openapi(getWalasRekapBulanIniRoute, async (c) => {
  const walasSiswaList = await getWalasDailyRecords();
  const siswaList = walasSiswaList.map((s, idx) => ({
    no: idx + 1,
    id: `rkw-${s.id}`,
    nisn: s.nisn,
    nama_siswa: s.nama_siswa,
    hadir: s.status === "Hadir" ? 1 : 0,
    izin: s.status === "Izin" ? 1 : 0,
    sakit: s.status === "Sakit" ? 1 : 0,
    alpa: s.status === "Tidak Hadir" || s.status === "Alpa" ? 1 : 0,
    persentase: s.status === "Hadir" ? 100 : 0,
  }));
  const total = siswaList.length;
  const countHadir = siswaList.reduce((acc, s) => acc + s.hadir, 0);
  const countIzin = siswaList.reduce((acc, s) => acc + s.izin, 0);
  const countSakit = siswaList.reduce((acc, s) => acc + s.sakit, 0);
  const countAlfa = siswaList.reduce((acc, s) => acc + s.alpa, 0);
  const persentase = total > 0 ? Math.round((countHadir / total) * 100) : 0;

  return c.json(
    {
      rekap: {
        hadir: countHadir,
        izin: countIzin,
        sakit: countSakit,
        alfa: countAlfa,
        total_siswa: total,
        persentase,
      },
      siswa_list: siswaList,
    },
    200
  );
});

/**
 * 6. POST /api/v1/walas/absensi/simpan
 */
export const saveWalasAbsensiRoute = createRoute({
  method: "post",
  path: "/absensi/simpan",
  tags: [API_TAGS.WALAS],
  summary: "Save Homeroom Daily Attendance Session",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            kelas: z.string(),
            tanggal: z.string(),
            siswa: z.array(SiswaHarianWalasItemSchema),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Homeroom attendance saved in PostgreSQL",
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

walasRouter.openapi(saveWalasAbsensiRoute, async (c) => {
  const { kelas, tanggal, siswa } = c.req.valid("json");
  const [session] = await db.select().from(daily_attendances).limit(1);

  let sessionId = session?.id;
  if (!sessionId) {
    const [cls] = await db
      .select()
      .from(classes)
      .where(or(eq(classes.name, kelas), eq(classes.name, "X RPL 1")))
      .limit(1);
    if (cls) {
      const [newSession] = await db
        .insert(daily_attendances)
        .values({
          class_id: cls.id,
          attendance_date: new Date().toISOString().split("T")[0] || "2026-11-11",
          status: "active",
        })
        .returning();
      sessionId = newSession?.id;
    }
  }

  if (sessionId) {
    for (const s of siswa) {
      const [st] = await db.select().from(students).where(eq(students.nisn, s.nisn)).limit(1);
      if (st) {
        const [existingRec] = await db
          .select()
          .from(daily_attendance_records)
          .where(eq(daily_attendance_records.student_id, st.id))
          .limit(1);

        if (existingRec) {
          await db
            .update(daily_attendance_records)
            .set({
              record_code: s.id,
              attendance_status: mapWalasStatusToDbStatus(s.status),
              jam_masuk: s.jam_masuk || "—",
              keterangan: s.keterangan || "Tepat waktu",
              updated_at: new Date(),
            })
            .where(eq(daily_attendance_records.id, existingRec.id));
        } else {
          await db.insert(daily_attendance_records).values({
            daily_attendance_id: sessionId,
            student_id: st.id,
            record_code: s.id,
            attendance_status: mapWalasStatusToDbStatus(s.status),
            attendance_source: "manual",
            jam_masuk: s.jam_masuk || "—",
            keterangan: s.keterangan || "Tepat waktu",
          });
        }
      }
    }
  }

  return c.json(
    {
      success: true,
      message: `Data absensi kelas ${kelas} tanggal ${tanggal} berhasil disimpan!`,
    },
    200
  );
});
