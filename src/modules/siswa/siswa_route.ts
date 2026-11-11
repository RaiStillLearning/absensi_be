import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, asc, eq, or } from "drizzle-orm";
import type { Context } from "hono";
import { db } from "../../config/database";
import {
  daily_attendance_records,
  schedules,
  students,
  subject_attendance_records,
} from "../../config/schema";
import { type DecodedAuthToken } from "../../middlewares/auth";
import { API_TAGS } from "../../shared/constants";
import { ErrorResponseSchema } from "../../shared/types/api";

export const siswaRouter = new OpenAPIHono();

export const SiswaProfileSchema = z
  .object({
    nisn: z.string().openapi({ example: "0102641001" }),
    nis: z.string().openapi({ example: "242510001" }),
    nama_lengkap: z.string().openapi({ example: "Ahmad Rizky Pratama" }),
    kelas: z.string().openapi({ example: "X RPL 1" }),
    jurusan: z.string().openapi({ example: "Rekayasa Perangkat Lunak" }),
    tempat_lahir: z.string().openapi({ example: "Depok" }),
    tanggal_lahir: z.string().openapi({ example: "14 Maret 2008" }),
    jenis_kelamin: z.enum(["Laki-laki", "Perempuan"]).openapi({ example: "Laki-laki" }),
    agama: z.string().openapi({ example: "Islam" }),
    alamat: z.string().openapi({ example: "Jl. H. Caraka No. 12, Cisalak, Depok" }),
    telepon: z.string().openapi({ example: "0812-9876-5432" }),
    nama_wali: z.string().openapi({ example: "Bambang Pratama" }),
    telepon_wali: z.string().openapi({ example: "0813-1122-3344" }),
    email: z.string().openapi({ example: "ahmad.rizky@siswa.ghamacaraka.sch.id" }),
    status_akun: z.enum(["Aktif", "Non-Aktif"]).openapi({ example: "Aktif" }),
    foto_profil: z.string().optional(),
  })
  .openapi("SiswaProfile");

async function getStudentFromContext(
  c: Context
): Promise<typeof students.$inferSelect | undefined> {
  const authUser = c.get("authUser") as DecodedAuthToken | undefined;
  const nisn = authUser?.sub;
  if (nisn) {
    const [student] = await db
      .select()
      .from(students)
      .where(eq(students.nisn, nisn))
      .limit(1);
    if (student) return student;
  }
  if (authUser?.username) {
    const [byNisnOrEmail] = await db
      .select()
      .from(students)
      .where(
        or(eq(students.nisn, authUser.username), eq(students.email, authUser.username))
      )
      .limit(1);
    if (byNisnOrEmail) return byNisnOrEmail;
  }
  if (authUser?.role === "admin") {
    const [first] = await db.select().from(students).orderBy(asc(students.nisn)).limit(1);
    return first;
  }
  return undefined;
}

function formatStudentProfile(st?: typeof students.$inferSelect) {
  return {
    nisn: st?.nisn || "",
    nis: st?.nis || "",
    nama_lengkap: st?.full_name || "",
    kelas: st?.kelas || "",
    jurusan: st?.jurusan || "",
    tempat_lahir: st?.tempat_lahir || "",
    tanggal_lahir: st?.tanggal_lahir || "",
    jenis_kelamin: ((st?.gender === "P" ? "Perempuan" : "Laki-laki") as
      | "Laki-laki"
      | "Perempuan"),
    agama: st?.agama || "",
    alamat: st?.alamat || "",
    telepon: st?.telepon || "",
    nama_wali: st?.nama_wali || "",
    telepon_wali: st?.telepon_wali || "",
    email: st?.email || "",
    status_akun: ((st?.status === "inactive" ? "Non-Aktif" : "Aktif") as "Aktif" | "Non-Aktif"),
    foto_profil: st?.foto_profil || "",
  };
}

/**
 * 1. GET /api/v1/siswa/profil
 */
export const getSiswaProfileRoute = createRoute({
  method: "get",
  path: "/profil",
  tags: [API_TAGS.SISWA],
  summary: "Get Current Student Profile",
  responses: {
    200: {
      description: "Student profile retrieved from PostgreSQL",
      content: {
        "application/json": {
          schema: SiswaProfileSchema,
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

siswaRouter.openapi(getSiswaProfileRoute, async (c) => {
  const st = await getStudentFromContext(c);
  if (!st) {
    return c.json({ success: false, message: "Data siswa tidak ditemukan" }, 404);
  }
  return c.json(formatStudentProfile(st), 200);
});

/**
 * 2. PUT /api/v1/siswa/profil
 */
export const updateSiswaProfileRoute = createRoute({
  method: "put",
  path: "/profil",
  tags: [API_TAGS.SISWA],
  summary: "Update Current Student Profile",
  request: {
    body: {
      content: {
        "application/json": {
          schema: SiswaProfileSchema.partial(),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Student profile updated in PostgreSQL",
      content: {
        "application/json": {
          schema: SiswaProfileSchema,
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

siswaRouter.openapi(updateSiswaProfileRoute, async (c) => {
  const body = c.req.valid("json");
  const current = await getStudentFromContext(c);
  if (!current) {
    return c.json({ success: false, message: "Data siswa tidak ditemukan" }, 404);
  }

  const [updated] = await db
    .update(students)
    .set({
      full_name: body.nama_lengkap ?? current.full_name,
      nis: body.nis ?? current.nis,
      kelas: body.kelas ?? current.kelas,
      jurusan: body.jurusan ?? current.jurusan,
      tempat_lahir: body.tempat_lahir ?? current.tempat_lahir,
      tanggal_lahir: body.tanggal_lahir ?? current.tanggal_lahir,
      gender:
        body.jenis_kelamin === "Perempuan"
          ? "P"
          : body.jenis_kelamin === "Laki-laki"
            ? "L"
            : current.gender,
      agama: body.agama ?? current.agama,
      alamat: body.alamat ?? current.alamat,
      telepon: body.telepon ?? current.telepon,
      nama_wali: body.nama_wali ?? current.nama_wali,
      telepon_wali: body.telepon_wali ?? current.telepon_wali,
      email: body.email ?? current.email,
      foto_profil: body.foto_profil ?? current.foto_profil,
      updated_at: new Date(),
    })
    .where(eq(students.id, current.id))
    .returning();

  return c.json(formatStudentProfile(updated), 200);
});

/**
 * 3. GET /api/v1/siswa/metrik-kehadiran
 */
export const getMetrikKehadiranRoute = createRoute({
  method: "get",
  path: "/metrik-kehadiran",
  tags: [API_TAGS.SISWA],
  summary: "Get Student Attendance Summary Metrics",
  responses: {
    200: {
      description: "Student attendance metrics retrieved from PostgreSQL",
      content: {
        "application/json": {
          schema: z.object({
            persentase: z.number().openapi({ example: 92 }),
            hadir: z.number().openapi({ example: 180 }),
            izin: z.number().openapi({ example: 10 }),
            sakit: z.number().openapi({ example: 5 }),
            alpa: z.number().openapi({ example: 2 }),
            total_hari: z.number().openapi({ example: 197 }),
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

siswaRouter.openapi(getMetrikKehadiranRoute, async (c) => {
  const st = await getStudentFromContext(c);
  if (!st) {
    return c.json({ success: false, message: "Data siswa tidak ditemukan" }, 404);
  }
  const studentNisn = st.nisn;
  const studentName = st.full_name;

  let hadir = 0;
  let izin = 0;
  let sakit = 0;
  let alpa = 0;

  if (st) {
    const records = await db
      .select({ status: daily_attendance_records.attendance_status })
      .from(daily_attendance_records)
      .where(eq(daily_attendance_records.student_id, st.id));

    for (const r of records) {
      if (r.status === "present") hadir++;
      else if (r.status === "excused") izin++;
      else if (r.status === "sick") sakit++;
      else if (r.status === "absent") alpa++;
    }
  }

  if (studentNisn || studentName) {
    const subjectRecords = await db
      .select()
      .from(subject_attendance_records)
      .where(
        or(
          eq(subject_attendance_records.nisn, studentNisn),
          eq(subject_attendance_records.nama_siswa, studentName)
        )
      );

    for (const sr of subjectRecords) {
      if (sr.status === "Hadir") hadir++;
      else if (sr.status === "Izin") izin++;
      else if (sr.status === "Sakit") sakit++;
      else alpa++;
    }
  }

  const total_hari = hadir + izin + sakit + alpa;
  const persentase = total_hari > 0 ? Math.round((hadir / total_hari) * 100) : 0;

  return c.json(
    {
      persentase,
      hadir,
      izin,
      sakit,
      alpa,
      total_hari,
      total_hadir: hadir,
      total_izin: izin,
      total_sakit: sakit,
      total_alpa: alpa,
      persentase_kehadiran: persentase,
    },
    200
  );
});

/**
 * 4. GET /api/v1/siswa/jadwal/hari-ini
 */
export const getJadwalHariIniRoute = createRoute({
  method: "get",
  path: "/jadwal/hari-ini",
  tags: [API_TAGS.SISWA],
  summary: "Get Today's Lessons for Student",
  responses: {
    200: {
      description: "Today's lessons from PostgreSQL",
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              id: z.string(),
              jam: z.string(),
              mata_pelajaran: z.string(),
              guru: z.string(),
              kelas: z.string(),
              ruang: z.string().optional(),
            })
          ),
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

siswaRouter.openapi(getJadwalHariIniRoute, async (c) => {
  const st = await getStudentFromContext(c);
  if (!st) {
    return c.json({ success: false, message: "Data siswa tidak ditemukan" }, 404);
  }
  const studentKelas = st.kelas;
  const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const currentDay = dayNames[new Date().getDay()] || "Senin";
  const targetDay = currentDay === "Minggu" || currentDay === "Sabtu" ? "Senin" : currentDay;

  let rows = await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.kelas, studentKelas), eq(schedules.hari, targetDay)))
    .orderBy(asc(schedules.jam_ke));

  if (rows.length === 0) {
    rows = await db
      .select()
      .from(schedules)
      .where(eq(schedules.kelas, studentKelas))
      .orderBy(asc(schedules.jam_ke))
      .limit(4);
  }

  return c.json(
    rows.map((j) => ({
      id: `j-${j.id}`,
      jam: `${j.waktu_mulai} – ${j.waktu_selesai}`,
      mata_pelajaran: j.mata_pelajaran,
      guru: j.guru,
      kelas: j.kelas,
      ruang: `Lab ${
        j.mata_pelajaran.toLowerCase().includes("web") ||
        j.mata_pelajaran.toLowerCase().includes("basis")
          ? "Komputer"
          : "Teori"
      } 1`,
    })),
    200
  );
});

/**
 * 5. GET /api/v1/siswa/jadwal/mingguan
 */
export const getJadwalMingguanRoute = createRoute({
  method: "get",
  path: "/jadwal/mingguan",
  tags: [API_TAGS.SISWA],
  summary: "Get Complete Weekly Schedule (Monday - Friday)",
  responses: {
    200: {
      description: "Weekly schedule retrieved from PostgreSQL",
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              hari: z.string(),
              tanggal: z.string(),
              isToday: z.boolean().optional(),
              pelajaran: z.array(
                z.object({
                  no: z.number(),
                  jam: z.string(),
                  mata_pelajaran: z.string(),
                  guru: z.string(),
                })
              ),
            })
          ),
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

siswaRouter.openapi(getJadwalMingguanRoute, async (c) => {
  const st = await getStudentFromContext(c);
  if (!st) {
    return c.json({ success: false, message: "Data siswa tidak ditemukan" }, 404);
  }
  const studentKelas = st.kelas;
  const allSchedules = await db
    .select()
    .from(schedules)
    .where(eq(schedules.kelas, studentKelas))
    .orderBy(asc(schedules.jam_ke));

  const days = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"];
  const now = new Date();
  const currentDayIndex = now.getDay();
  const currentDayName = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][
    currentDayIndex
  ];
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() - 1 + 7) % 7));

  const result = days.map((dayName, idx) => {
    const dayDate = new Date(monday);
    dayDate.setDate(monday.getDate() + idx);
    const tanggalLabel = dayDate.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    const lessons = allSchedules
      .filter((j) => j.hari.toLowerCase() === dayName.toLowerCase())
      .map((j, i) => ({
        no: j.jam_ke || i + 1,
        jam: `${j.waktu_mulai}–${j.waktu_selesai}`,
        mata_pelajaran: j.mata_pelajaran,
        guru: j.guru,
      }));

    return {
      hari: dayName,
      tanggal: tanggalLabel,
      isToday: dayName === currentDayName,
      pelajaran:
        lessons.length > 0
          ? lessons
          : [{ no: 1, jam: "07:00–08:30", mata_pelajaran: "Kegiatan Mandiri", guru: "Wali Kelas" }],
    };
  });

  return c.json(result, 200);
});

/**
 * 6. GET /api/v1/siswa/absensi/realtime
 */
export const getAbsensiRealtimeRoute = createRoute({
  method: "get",
  path: "/absensi/realtime",
  tags: [API_TAGS.SISWA],
  summary: "Get Realtime Student Attendance Check-in Status",
  responses: {
    200: {
      description: "Realtime attendance status from PostgreSQL",
      content: {
        "application/json": {
          schema: z.object({
            status_tercatat: z.boolean(),
            jenis: z.string(),
            kategori: z.string(),
            waktu: z.string(),
            tanggal: z.string(),
            pesan: z.string(),
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

siswaRouter.openapi(getAbsensiRealtimeRoute, async (c) => {
  const st = await getStudentFromContext(c);
  if (!st) {
    return c.json({ success: false, message: "Data siswa tidak ditemukan" }, 404);
  }
  let status = "Hadir";
  let jamMasuk = "06:45";
  let keterangan = "Tepat waktu";

  if (st) {
    const [rec] = await db
      .select()
      .from(daily_attendance_records)
      .where(eq(daily_attendance_records.student_id, st.id))
      .limit(1);
    if (rec) {
      if (rec.attendance_status === "present") status = "Hadir";
      else if (rec.attendance_status === "excused") status = "Izin";
      else if (rec.attendance_status === "sick") status = "Sakit";
      else status = "Alpa";
      jamMasuk = rec.jam_masuk || "06:45";
      keterangan = rec.keterangan || "Tepat waktu";
    }
  }

  const isPresent = status === "Hadir";
  const now = new Date();
  const dateFormatted = now.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return c.json(
    {
      status_tercatat: isPresent || status === "Izin" || status === "Sakit",
      jenis: isPresent ? "Absen Masuk" : `Presensi: ${status}`,
      kategori: isPresent ? "Tepat Waktu" : status,
      waktu: `${jamMasuk} WIB`,
      tanggal: dateFormatted,
      pesan: isPresent
        ? "Kehadiran Anda berhasil tercatat di sistem."
        : `Status kehadiran Anda hari ini tercatat: ${status} (${keterangan}).`,
      status_kehadiran: status,
      waktu_presensi: `${jamMasuk} WIB`,
      catatan: keterangan,
    },
    200
  );
});

/**
 * 7. GET /api/v1/siswa/kehadiran
 */
export const getRiwayatKehadiranRoute = createRoute({
  method: "get",
  path: "/kehadiran",
  tags: [API_TAGS.SISWA],
  summary: "Get Student Attendance History Records",
  request: {
    query: z.object({
      tanggal: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "Attendance history records from PostgreSQL",
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              id: z.string(),
              tanggal: z.string(),
              jam: z.string(),
              status: z.string(),
              keterangan: z.string(),
            })
          ),
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

siswaRouter.openapi(getRiwayatKehadiranRoute, async (c) => {
  const st = await getStudentFromContext(c);
  if (!st) {
    return c.json({ success: false, message: "Data siswa tidak ditemukan" }, 404);
  }
  const studentNisn = st.nisn;
  const studentName = st.full_name;

  const history: { id: string; tanggal: string; jam: string; status: string; keterangan: string }[] =
    [];

  if (st) {
    const dailyRecords = await db
      .select()
      .from(daily_attendance_records)
      .where(eq(daily_attendance_records.student_id, st.id));

    for (const r of dailyRecords) {
      const stLabel =
        r.attendance_status === "present"
          ? "Hadir"
          : r.attendance_status === "excused"
            ? "Izin"
            : r.attendance_status === "sick"
              ? "Sakit"
              : "Alpa";
      history.push({
        id: `rk-${r.id.slice(0, 8)}`,
        tanggal: new Date(r.check_in_at).toLocaleDateString("id-ID"),
        jam: r.jam_masuk ? `${r.jam_masuk} WIB` : "06:45 WIB",
        status: stLabel,
        keterangan: r.keterangan || "Tepat waktu",
      });
    }
  }

  const subjectRecords = await db
    .select()
    .from(subject_attendance_records)
    .where(
      or(
        eq(subject_attendance_records.nisn, studentNisn),
        eq(subject_attendance_records.nama_siswa, studentName)
      )
    );

  let idx = 1;
  for (const sr of subjectRecords) {
    history.push({
      id: `rk-sesi-${idx++}`,
      tanggal: sr.tanggal,
      jam: "07:00 – 07:45",
      status: sr.status,
      keterangan: sr.catatan || "—",
    });
  }

  return c.json(history, 200);
});

/**
 * 8. GET /api/v1/siswa/kehadiran/rekap
 */
export const getRekapKehadiranBulananRoute = createRoute({
  method: "get",
  path: "/kehadiran/rekap",
  tags: [API_TAGS.SISWA],
  summary: "Get Student Monthly Attendance Recapitulation & Breakdown",
  request: {
    query: z.object({
      bulan: z.string().optional().default("2025-01"),
    }),
  },
  responses: {
    200: {
      description: "Monthly recap and breakdown retrieved from PostgreSQL",
      content: {
        "application/json": {
          schema: z.object({
            bulanKey: z.string(),
            labelBulan: z.string(),
            hadir: z.number(),
            izin: z.number(),
            sakit: z.number(),
            alpa: z.number(),
            totalPencatatan: z.number(),
            persentaseHadir: z.number(),
            breakdown: z.array(
              z.object({
                key: z.string(),
                label: z.string(),
                count: z.number(),
                pct: z.number(),
                color: z.string(),
                dotColor: z.string(),
              })
            ),
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

siswaRouter.openapi(getRekapKehadiranBulananRoute, async (c) => {
  const { bulan } = c.req.valid("query");
  const bulanKey = (bulan || "2025-01").slice(0, 7);

  const st = await getStudentFromContext(c);
  if (!st) {
    return c.json({ success: false, message: "Data siswa tidak ditemukan" }, 404);
  }
  let hadir = 0;
  let izin = 0;
  let sakit = 0;
  let alpa = 0;

  if (st) {
    const dailyRecords = await db
      .select({ status: daily_attendance_records.attendance_status })
      .from(daily_attendance_records)
      .where(eq(daily_attendance_records.student_id, st.id));

    for (const rec of dailyRecords) {
      if (rec.status === "present") hadir++;
      else if (rec.status === "excused") izin++;
      else if (rec.status === "sick") sakit++;
      else if (rec.status === "absent") alpa++;
    }

    const subjectRecords = await db
      .select({ status: subject_attendance_records.status })
      .from(subject_attendance_records)
      .where(
        or(
          eq(subject_attendance_records.nisn, st.nisn),
          eq(subject_attendance_records.nama_siswa, st.full_name)
        )
      );

    for (const sr of subjectRecords) {
      if (sr.status === "Hadir") hadir++;
      else if (sr.status === "Izin") izin++;
      else if (sr.status === "Sakit") sakit++;
      else alpa++;
    }
  }

  const totalPencatatan = hadir + izin + sakit + alpa;
  const persentaseHadir = totalPencatatan > 0 ? Math.round((hadir / totalPencatatan) * 100) : 0;
  const safeDivisor = totalPencatatan > 0 ? totalPencatatan : 1;

  const monthNames = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  const mIndex = parseInt(bulanKey.slice(5, 7), 10) - 1;
  const yearStr = bulanKey.slice(0, 4);
  const labelBulan = `${monthNames[mIndex] || "Januari"} ${yearStr}`;

  const breakdown = [
    {
      key: "hadir",
      label: "Hadir",
      count: hadir,
      pct: Math.round((hadir / safeDivisor) * 100),
      color: "#10B981",
      dotColor: "#10B981",
    },
    {
      key: "izin",
      label: "Izin",
      count: izin,
      pct: Math.round((izin / safeDivisor) * 100),
      color: "#3B82F6",
      dotColor: "#3B82F6",
    },
    {
      key: "sakit",
      label: "Sakit",
      count: sakit,
      pct: Math.round((sakit / safeDivisor) * 100),
      color: "#F59E0B",
      dotColor: "#F59E0B",
    },
    {
      key: "alpa",
      label: "Alpa",
      count: alpa,
      pct: Math.round((alpa / safeDivisor) * 100),
      color: "#EF4444",
      dotColor: "#EF4444",
    },
  ];

  return c.json(
    {
      bulanKey,
      labelBulan,
      hadir,
      izin,
      sakit,
      alpa,
      totalPencatatan,
      persentaseHadir,
      breakdown,
    },
    200
  );
});
