# software_design_document (SDD)
## Sistem Absensi Sekolah — SMK Ghama Caraka

**Versi:** 1.0.0  
**Status:** Draft  
**Referensi:** PRD v1.0.0 dan SRS v1.0.0

---

## 1. Tujuan Desain

Dokumen ini menjelaskan rancangan teknis backend Sistem Absensi Sekolah.

Fokus utama:

- Arsitektur backend.
- Struktur folder.
- Database dan relasi.
- Desain REST API.
- Autentikasi dan otorisasi.
- Validasi absensi.
- Error handling.
- Testing dan deployment.

## 2. Technology Stack

| Komponen | Teknologi |
|---|---|
| Runtime | Bun |
| Framework | Hono |
| Bahasa | TypeScript |
| Database | PostgreSQL 17 |
| ORM | Drizzle ORM |
| Validation | Zod |
| API specification | OpenAPI |
| API documentation | Swagger UI |
| Container | Docker |
| Testing | Bun Test |

Bun digunakan sebagai runtime dan package manager. Tidak diperlukan Node.js sebagai runtime kedua untuk backend ini.

## 3. Arsitektur Sistem

```mermaid
flowchart TD
    frontend["SvelteKit Frontend"]
    api["Hono REST API"]
    middleware["Middleware Layer"]
    modules["Business Modules"]
    orm["Drizzle ORM"]
    database[("PostgreSQL")]

    frontend --> api
    api --> middleware
    middleware --> modules
    modules --> orm
    orm --> database
```

### 3.1 Request Flow

1. Frontend mengirim HTTP request.
2. Hono menerima request.
3. Middleware menjalankan logging, CORS, autentikasi, dan validasi.
4. Route meneruskan request ke modul terkait.
5. Service menjalankan aturan bisnis.
6. Repository mengakses PostgreSQL melalui Drizzle ORM.
7. Backend mengembalikan response JSON.

### 3.2 Layer Responsibility

| Layer | Tanggung jawab |
|---|---|
| `routes` | Definisi endpoint |
| `middlewares` | Autentikasi, otorisasi, error handling |
| `modules` | Domain bisnis |
| `schemas` | Validasi input dan output |
| `services` | Business logic |
| `repositories` | Operasi database |
| `shared` | Utility, types, constants |
| `config` | Environment dan koneksi database |

---

## 4. Struktur Folder Backend

```text
backend/
├── docs/
│   └── api/
│       ├── README.md
│       ├── conventions.md
│       ├── openapi.json
│       └── endpoints/
│           ├── auth.md
│           ├── admin.md
│           ├── walas.md
│           ├── guru.md
│           └── siswa.md
│
├── drizzle/
│
├── src/
│   ├── config/
│   │   ├── env.ts
│   │   ├── database.ts
│   │   └── schema.ts
│   │
│   ├── middlewares/
│   │   ├── auth.middleware.ts
│   │   ├── rbac.middleware.ts
│   │   └── error_handler.middleware.ts
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.repository.ts
│   │   │   └── auth.schema.ts
│   │   │
│   │   ├── admin/
│   │   ├── walas/
│   │   ├── guru/
│   │   ├── siswa/
│   │   ├── classes/
│   │   ├── teachers/
│   │   ├── students/
│   │   ├── subjects/
│   │   ├── schedules/
│   │   └── attendance/
│   │
│   ├── routes/
│   │   └── index.ts
│   │
│   ├── shared/
│   │   ├── constants/
│   │   ├── types/
│   │   └── utils/
│   │
│   ├── app.ts
│   └── server.ts
│
├── tests/
│   ├── auth.test.ts
│   ├── attendance.test.ts
│   ├── authorization.test.ts
│   └── database.test.ts
│
├── .env
├── .env.example
├── .gitignore
├── docker-compose.yml
├── drizzle.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

**Catatan:** Struktur ini adalah target struktur arsitektur. Folder dan modul yang belum digunakan dapat dibuat bertahap sesuai fase implementasi.

Seluruh nama file dan folder menggunakan `snake_case`.

---

## 5. Database Design

### 5.1 Prinsip Desain

1. Gunakan PostgreSQL sebagai sumber data utama.
2. Gunakan primary key untuk setiap tabel.
3. Gunakan foreign key untuk menjaga relasi.
4. Gunakan unique constraint untuk mencegah data duplikat.
5. Gunakan transaksi untuk operasi yang membutuhkan konsistensi.
6. Simpan timestamp secara konsisten.
7. Pisahkan data absensi harian dengan absensi sesi mata pelajaran.

### 5.2 Rancangan Entitas Awal

| Tabel | Fungsi |
|---|---|
| `users` | Akun pengguna |
| `classes` | Data kelas |
| `students` | Data siswa |
| `teachers` | Data guru |
| `subjects` | Data mata pelajaran |
| `class_students` | Relasi siswa dengan kelas |
| `homeroom_assignments` | Penugasan wali kelas |
| `teaching_assignments` | Penugasan guru, kelas, dan mata pelajaran |
| `schedules` | Jadwal pembelajaran |
| `daily_attendances` | Absensi harian kelas |
| `daily_attendance_records` | Detail kehadiran harian siswa |
| `subject_attendance_sessions` | Sesi absensi mata pelajaran |
| `subject_attendance_records` | Detail kehadiran siswa per sesi |

Nama dan atribut tabel merupakan rancangan awal, bukan skema final. Relasi dan kebutuhan atribut harus dikonfirmasi terhadap data sekolah dan kontrak frontend.

### 5.3 Relasi Entitas

```mermaid
erDiagram
    users ||--o| students : has
    users ||--o| teachers : has

    classes ||--o{ class_students : contains
    students ||--o{ class_students : assigned

    teachers ||--o{ homeroom_assignments : manages
    classes ||--o{ homeroom_assignments : assigned

    teachers ||--o{ teaching_assignments : teaches
    classes ||--o{ teaching_assignments : receives
    subjects ||--o{ teaching_assignments : assigned

    teaching_assignments ||--o{ schedules : defines

    daily_attendances ||--o{ daily_attendance_records : contains
    students ||--o{ daily_attendance_records : receives

    schedules ||--o{ subject_attendance_sessions : creates
    subject_attendance_sessions ||--o{ subject_attendance_records : contains
    students ||--o{ subject_attendance_records : receives
```

### 5.4 Rancangan Kolom Umum

Tabel yang membutuhkan audit minimal mempertimbangkan:

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID | Primary key |
| `created_at` | TIMESTAMPTZ | Waktu pembuatan |
| `updated_at` | TIMESTAMPTZ | Waktu pembaruan |

Tambahkan `created_by` dan `updated_by` pada tabel yang membutuhkan audit pengguna.

### 5.5 Status Kehadiran

Usulan enum awal:

```text
attendance_status:
- hadir
- sakit
- izin
- alpha
```

Status ini harus dikonfirmasi sebelum dijadikan enum database final. Keterlambatan belum ditentukan apakah menjadi status tersendiri atau atribut tambahan.

---

## 6. API Design

### 6.1 API Convention

Base path:

```text
/api/v1
```

Dokumentasi:

```text
/docs/api
/docs/api/openapi.json
```

HTTP methods:

- `GET`: mengambil data.
- `POST`: membuat data atau menjalankan aksi.
- `PATCH`: memperbarui sebagian data.
- `PUT`: mengganti data.
- `DELETE`: menghapus data.

### 6.2 API Module

| Modul | Prefix |
|---|---|
| Auth | `/api/v1/auth` |
| Admin | `/api/v1/admin` |
| Walas | `/api/v1/walas` |
| Guru | `/api/v1/guru` |
| Siswa | `/api/v1/siswa` |

### 6.3 Contoh Route

```text
POST   /api/v1/auth/login

GET    /api/v1/admin/dashboard
GET    /api/v1/admin/classes
GET    /api/v1/admin/teachers
GET    /api/v1/admin/schedules
GET    /api/v1/admin/attendance

GET    /api/v1/walas/dashboard
GET    /api/v1/walas/classes
POST   /api/v1/walas/attendance
GET    /api/v1/walas/attendance/summary

GET    /api/v1/guru/dashboard
GET    /api/v1/guru/schedules
POST   /api/v1/guru/attendance/sessions
GET    /api/v1/guru/attendance/summary

GET    /api/v1/siswa/dashboard
GET    /api/v1/siswa/schedules
POST   /api/v1/siswa/attendance
GET    /api/v1/siswa/attendance/history
```

Route di atas merupakan contoh rancangan. Kontrak final harus mengikuti endpoint dan DTO frontend yang disepakati.

### 6.4 JSON Naming Convention

Semua JSON request dan response menggunakan `snake_case`.

Contoh:

```json
{
  "student_id": "uuid",
  "class_id": "uuid",
  "attendance_date": "2026-11-05",
  "attendance_status": "hadir",
  "created_at": "2026-11-05T08:00:00+07:00"
}
```

Tidak boleh menggunakan:

```json
{
  "studentId": "uuid",
  "classId": "uuid",
  "attendanceDate": "2026-11-05"
}
```

### 6.5 Response Convention

Sukses:

```json
{
  "success": true,
  "message": "Data berhasil diambil",
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "message": "Data tidak valid",
  "errors": [
    {
      "field": "student_id",
      "message": "Siswa tidak ditemukan"
    }
  ]
}
```

### 6.6 OpenAPI dan Swagger

Gunakan:

- `@hono/zod-openapi`
- `@hono/swagger-ui`
- Zod schemas

Ketentuan:

1. Setiap endpoint harus memiliki deskripsi.
2. Setiap endpoint harus memiliki tag sesuai modul.
3. Request body harus memiliki schema.
4. Response harus memiliki schema.
5. HTTP status harus didefinisikan.
6. Endpoint privat harus menggunakan security scheme.
7. Dokumentasi OpenAPI harus diperbarui bersama perubahan API.

---

## 7. Authentication dan Authorization

### 7.1 Authentication

Gunakan mekanisme token berbasis JWT atau strategi autentikasi lain yang disepakati.

Alur:

1. Pengguna mengirim kredensial.
2. Backend memvalidasi input.
3. Backend memverifikasi password.
4. Backend menerbitkan token.
5. Client menggunakan token pada request privat.
6. Middleware memverifikasi token.

Algoritma, masa berlaku token, refresh token, dan strategi logout harus diputuskan sebelum implementasi autentikasi.

### 7.2 RBAC

Role yang tersedia:

```text
user_role:
- admin
- walas
- guru
- siswa
```

Middleware:

- `auth.middleware.ts`: memverifikasi identitas.
- `rbac.middleware.ts`: memverifikasi role.
- Service: memverifikasi kepemilikan atau penugasan resource.

Pengecekan role saja tidak cukup. Backend juga harus memverifikasi hubungan pengguna dengan kelas, siswa, jadwal, dan sesi yang diakses.

### 7.3 Authorization Rules

- `admin` memiliki kewenangan administratif global sesuai kebijakan sekolah.
- `walas` hanya dapat mengakses kelas binaannya.
- `guru` hanya dapat mengakses kelas dan sesi yang menjadi penugasannya.
- `siswa` hanya dapat mengakses data pribadinya dan melakukan absensi yang memenuhi aturan.

---

## 8. Attendance Business Logic

### 8.1 Daily Attendance

`daily_attendances` merepresentasikan pencatatan absensi untuk kelas pada tanggal tertentu.

`daily_attendance_records` menyimpan status setiap siswa.

Validasi minimal:

1. Pengguna harus terautentikasi.
2. Role harus memiliki kewenangan.
3. Kelas harus berada dalam cakupan wali kelas.
4. Siswa harus terdaftar pada kelas terkait.
5. Tanggal absensi harus valid.
6. Duplikasi harus ditangani.
7. Operasi penyimpanan harus konsisten.

### 8.2 Subject Attendance

`subject_attendance_sessions` merepresentasikan sesi absensi mata pelajaran.

`subject_attendance_records` menyimpan kehadiran siswa pada sesi tersebut.

Validasi minimal:

1. Guru harus terautentikasi.
2. Guru harus memiliki penugasan pada sesi terkait.
3. Sesi harus valid.
4. Siswa harus termasuk peserta kelas.
5. Duplikasi pencatatan harus ditangani.
6. Penyimpanan detail harus menggunakan transaksi jika diperlukan.

### 8.3 Student Self Attendance

Absensi mandiri wajib divalidasi oleh backend.

Backend tidak boleh hanya mempercayai `student_id` atau `attendance_status` yang dikirim client.

Identitas siswa harus diambil dari identitas autentikasi yang sudah diverifikasi.

Aturan waktu, metode validasi, lokasi, barcode, dan batas absensi masih menunggu keputusan sekolah.

---

## 9. Error Handling

Gunakan global error handler.

Kategori error:

| Kategori | HTTP |
|---|---|
| Validation error | 400 |
| Unauthenticated | 401 |
| Unauthorized | 403 |
| Resource not found | 404 |
| Duplicate/conflict | 409 |
| Business rule violation | 422 |
| Internal error | 500 |

Ketentuan:

- Jangan mengirim stack trace ke client production.
- Catat detail error di server.
- Jangan mengekspos password, token, atau secret.
- Response error harus konsisten.

---

## 10. Database Migration

Gunakan Drizzle Kit.

Alur:

1. Definisikan schema TypeScript.
2. Generate migration.
3. Review migration.
4. Jalankan migration pada database development.
5. Jalankan test.
6. Terapkan migration ke environment target melalui prosedur deployment.

Jangan mengubah skema database production secara manual tanpa migration yang terdokumentasi.

---

## 11. Testing Strategy

### 11.1 Unit Test

Fokus pada:

- Validasi input.
- Business logic.
- Perhitungan rekap.
- Validasi periode absensi.
- Pengecekan kewenangan.

### 11.2 Integration Test

Fokus pada:

- Koneksi PostgreSQL.
- Operasi repository.
- Transaksi database.
- Constraint dan relasi.
- Migration.

### 11.3 API Test

Fokus pada:

- Login.
- Dashboard setiap role.
- Pencatatan absensi.
- Riwayat absensi.
- Error response.

### 11.4 Security Test

Fokus pada:

- Token tidak valid.
- Role tidak sesuai.
- Akses lintas kelas.
- Akses data siswa lain.
- Request duplikat.
- Manipulasi identifier pada request.

---

## 12. Deployment

### 12.1 Development

- Bun menjalankan backend.
- PostgreSQL berjalan di Docker.
- Environment disimpan di `.env`.
- Swagger UI tersedia di `/docs/api`.

### 12.2 Environment Variables

Contoh:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://absensi_user:strong_password@localhost:5432/absensi_db
JWT_SECRET=replace_with_strong_secret
```

Nama environment variable tetap menggunakan konvensi uppercase yang lazim untuk konfigurasi. Aturan `snake_case` berlaku pada identifier teknis yang menggunakan pemisah kata; variabel lingkungan dapat memakai `UPPER_SNAKE_CASE`.

Jangan commit `.env` ke repository.

### 12.3 Docker Database

- Image PostgreSQL 17.
- Persistent volume.
- Healthcheck.
- Port database development `5432`.
- Credential harus menggunakan secret yang aman.

---

## 13. Development Phases

| Fase | Fokus |
|---|---|
| 1 | Backend foundation dan Swagger |
| 2 | Finalisasi ERD dan schema database |
| 3 | Migration dan seed |
| 4 | Authentication dan RBAC |
| 5 | Master data |
| 6 | Jadwal dan penugasan |
| 7 | Absensi harian kelas |
| 8 | Absensi sesi mata pelajaran |
| 9 | Absensi mandiri siswa |
| 10 | Dashboard dan rekap |
| 11 | Testing integrasi frontend |
| 12 | Hardening dan deployment |

Urutan ini merupakan rekomendasi implementasi, bukan komitmen jadwal.

---

## 14. Keputusan Arsitektur yang Masih Terbuka

| ID | Keputusan | Status |
|---|---|---|
| `ADR_001` | Strategi JWT dan refresh token | Perlu konfirmasi |
| `ADR_002` | Zona waktu sistem | Perlu konfirmasi |
| `ADR_003` | Metode absensi mandiri siswa | Perlu konfirmasi |
| `ADR_004` | Status kehadiran final | Perlu konfirmasi |
| `ADR_005` | Aturan koreksi absensi | Perlu konfirmasi |
| `ADR_006` | Aturan jadwal pengganti | Perlu konfirmasi |
| `ADR_007` | Relasi tahun ajaran dan semester | Perlu konfirmasi |
| `ADR_008` | Kebijakan penghapusan data absensi | Perlu konfirmasi |

---

## 15. Aturan Wajib Penamaan

Semua identifier teknis harus menggunakan `snake_case`.

Contoh yang benar:

```text
student_id
class_id
attendance_date
attendance_status
created_at
updated_at

daily_attendances
subject_attendance_sessions
daily_attendance_records

auth.middleware.ts
attendance.service.ts
attendance.repository.ts
```

Contoh yang dilarang:

```text
studentId
classId
attendanceDate
createdAt
dailyAttendances
attendanceService
```

Aturan berlaku untuk:

- JSON request dan response.
- Database tables dan columns.
- Enum values.
- TypeScript variables.
- Function dan method names.
- File dan folder names.
- API query parameters.
- API path parameters.
- OpenAPI schema properties.
- DTO properties.

Pengecualian hanya untuk nama resmi teknologi, protokol, dan konvensi eksternal yang memang tidak dapat diubah.

---

**Akhir dokumen SDD**