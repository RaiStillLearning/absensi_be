# Sistem Absensi Sekolah — SMK Ghama Caraka (Backend)

[![Runtime](https://img.shields.io/badge/Bun-v1.4+-black?logo=bun)](https://bun.sh/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Framework](https://img.shields.io/badge/Hono-v4.13+-orange?logo=hono)](https://hono.dev/)
[![Database](https://img.shields.io/badge/PostgreSQL-17-blue?logo=postgresql)](https://www.postgresql.org/)
[![ORM](https://img.shields.io/badge/Drizzle_ORM-v0.45+-brightgreen?logo=drizzle)](https://orm.drizzle.team/)
[![Documentation](https://img.shields.io/badge/OpenAPI-3.0_/_Swagger_UI-green?logo=swagger)](http://localhost:3000/docs/api)

Backend RESTful API modern, modular, dan terstruktur untuk **Sistem Absensi Sekolah SMK Ghama Caraka**, dibangun dengan fokus pada performa tinggi, type safety end-to-end, dan pemisahan hak akses berbasis peran (*role-based access control*).

---

## 📌 Ringkasan Proyek

Sistem Absensi Sekolah SMK Ghama Caraka dirancang untuk memusatkan pengelolaan, pencatatan, pemantauan, dan rekapitulasi kehadiran siswa secara digital. 

Sistem membedakan secara tegas antara:
1. **Absensi Harian Kelas**: Dikelola oleh **Wali Kelas (Walas)** untuk memantau status kehadiran umum harian (Hadir, Sakit, Izin, Alpa) dan dispensasi siswa di kelas binaannya.
2. **Absensi Sesi Mata Pelajaran**: Dikelola oleh **Guru Mata Pelajaran** untuk memverifikasi kehadiran siswa pada setiap jam pelajaran tertentu.

### 👥 Peran Pengguna (Roles)

| Role | Tanggung Jawab Utama |
|---|---|
| **Admin** | Manajemen master data (pengguna, kelas, jurusan, mata pelajaran, jadwal), konfigurasi sistem, dan rekapitulasi sekolah. |
| **Walas** *(Wali Kelas)* | Monitoring absensi harian kelas binaan, validasi pengajuan dispensasi/surat izin, dan laporan berkala. |
| **Guru** *(Guru Mapel)* | Verifikasi presensi siswa per sesi mata pelajaran sesuai jadwal mengajar dan jurnal pembelajaran. |
| **Siswa** | Check-in kehadiran mandiri, melihat jadwal pelajaran, riwayat absensi, dan mengajukan izin/sakit. |

---

## 🛠 Technology Stack

| Layer / Komponen | Teknologi | Keterangan |
|---|---|---|
| **Runtime & Package Manager** | [Bun](https://bun.sh/) | Runtime ultra-cepat, all-in-one JavaScript/TypeScript runtime & package manager. |
| **Framework** | [Hono](https://hono.dev/) & `@hono/zod-openapi` | Framework web modern berorientasi performa dengan integrasi OpenAPI otomatis. |
| **Language** | [TypeScript](https://www.typescriptlang.org/) | Strict mode, full type-safety. |
| **Validation** | [Zod](https://zod.dev/) | Schema validation untuk request payload, query parameter, dan env config. |
| **Database** | [PostgreSQL 17](https://www.postgresql.org/) | Relational database (containerized dengan Docker Desktop). |
| **ORM** | [Drizzle ORM](https://orm.drizzle.team/) & Drizzle Kit | Lightweight, type-safe SQL ORM dan migrasi database. |
| **Documentation** | [Swagger UI](https://swagger.io/) & OpenAPI 3.0 | Dokumentasi interaktif code-first via `@hono/swagger-ui`. |
| **Testing** | [Bun Test](https://bun.sh/docs/cli/test) | Native test runner bawaan Bun. |

---

## 🏗 Arsitektur Sistem

```mermaid
flowchart TD
    Client["Client (SvelteKit Frontend / Mobile / Swagger UI)"]
    
    subgraph Backend["Backend Application (Bun + Hono)"]
        Router["Hono Router (/api/v1)"]
        Middleware["Middlewares (CORS, Logger, Error Handler)"]
        Routes["Route Handlers & OpenAPI Schemas"]
        Services["Domain Modules & Logic"]
        ORM["Drizzle ORM"]
    end
    
    subgraph Storage["Data Tier"]
        DB[("PostgreSQL 17 Database")]
    end

    Client -->|HTTP / JSON| Router
    Router --> Middleware
    Middleware --> Routes
    Routes --> Services
    Services --> ORM
    ORM -->|TCP:5432| DB
```

---

## 📁 Struktur Direktori

```text
absensi_be/
├── docs/
│   └── api/
│       ├── README.md               # Panduan dokumentasi API
│       ├── conventions.md          # Konvensi REST API, status code, & respons JSON
│       ├── endpoints/              # Rancangan endpoint arsitektur per peran
│       │   ├── auth.md             # Endpoint autentikasi (login, refresh, me)
│       │   ├── admin.md            # Endpoint manajemen admin
│       │   ├── walas.md            # Endpoint wali kelas
│       │   ├── guru.md             # Endpoint guru mata pelajaran
│       │   └── siswa.md            # Endpoint siswa
│       └── openapi.json            # Spesifikasi OpenAPI 3.0 yang diekspor otomatis
│
├── src/
│   ├── config/
│   │   ├── env.ts                  # Validasi variabel lingkungan via Zod
│   │   ├── database.ts             # Koneksi client PostgreSQL & Drizzle instance
│   │   └── schema.ts               # Schema placeholder Drizzle ORM
│   │
│   ├── routes/
│   │   └── index.ts                # Spesifikasi rute (/health, /api/v1) & sub-router
│   │
│   ├── middlewares/
│   │   └── error-handler.ts        # Error handler & 404 handler terpusat
│   │
│   ├── modules/                    # Modul bisnis domain (akan diimplementasikan)
│   │
│   ├── shared/
│   │   ├── types/
│   │   │   └── api.ts              # Format tipe response standar & pagination
│   │   ├── utils/
│   │   │   └── response.ts         # Response helper (success, error, paginated)
│   │   └── constants/
│   │       └── index.ts            # Konstanta aplikasi & tag OpenAPI
│   │
│   ├── scripts/
│   │   └── generate-openapi.ts     # Script sinkronisasi file openapi.json
│   │
│   ├── app.ts                      # Konfigurasi instance Hono & OpenAPI
│   └── server.ts                   # Entrypoint server HTTP Bun
│
├── drizzle/                        # Direktori migrasi database Drizzle
├── tests/                          # Automated tests (Bun Test)
│   ├── app.test.ts                 # Test endpoint dasar (/health, /api/v1, OpenAPI, 404)
│   └── database.test.ts            # Test konektivitas database PostgreSQL
│
├── PRD.md                          # Product Requirements Document
├── SRS.md                          # Software Requirements Specification
├── SDD.md                          # Software Design Document
├── .env.example                    # Template variabel lingkungan
├── .gitignore                      # Aturan pengabaian file Git
├── docker-compose.yml              # Konfigurasi PostgreSQL Docker
├── drizzle.config.ts               # Konfigurasi Drizzle Kit
├── package.json                    # Script Bun dan daftar dependensi
├── tsconfig.json                   # Konfigurasi compiler TypeScript (Strict)
└── README.md                       # Dokumentasi utama proyek
```

---

## 🚀 Panduan Memulai (Quickstart)

### 1. Prasyarat
* [Bun](https://bun.sh/) (v1.4+) terinstal di sistem Anda.
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) aktif.

### 2. Kloning Repositori & Persiapan Environment
```bash
git clone https://github.com/RaiStillLearning/absensi_be.git
cd absensi_be

# Salin template variabel lingkungan
cp .env.example .env
```

Pastikan variabel pada `.env` sudah sesuai:
```env
APP_PORT=3000
APP_ENV=development
DATABASE_URL=postgresql://absensi_user:change_me@localhost:5432/absensi_db
CORS_ORIGIN=http://localhost:5173
POSTGRES_USER=absensi_user
POSTGRES_PASSWORD=change_me
POSTGRES_DB=absensi_db
```

### 3. Jalankan Database PostgreSQL
Nyalakan container database PostgreSQL:
```bash
docker compose up -d
```
Verifikasi bahwa container berstatus sehat:
```bash
docker compose ps
```

### 4. Install Dependensi
```bash
bun install
```

### 5. Jalankan Server Development
```bash
bun run dev
```

Server akan aktif di `http://localhost:3000`.

---

## 📖 Endpoint Dokumentasi & API

| Endpoint | Method | Deskripsi |
|---|---|---|
| `/docs/api` | `GET` | **Interactive Swagger UI** (Dokumentasi lengkap interaktif) |
| `/docs/api/openapi.json` | `GET` | Raw OpenAPI 3.0 JSON Specification |
| `/dev/scanner-test` | `GET` | **Hardware Barcode Scanner Test Page** (JR HC-P20, Dev only) |
| `/health` | `GET` | Health check status server |
| `/api/v1` | `GET` | API v1 metadata & service identity |
| `/api/v1/attendance/daily/scan` | `POST` | Scan barcode/QR kehadiran harian siswa |

### Format Standar JSON Response

**Success Response:**
```json
{
  "success": true,
  "message": "Backend is running",
  "data": {
    "status": "healthy"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Validation Error",
  "errors": [
    {
      "field": "username",
      "message": "Field is required"
    }
  ]
}
```

---

## 📜 Script Package yang Tersedia

Semua script dijalankan menggunakan runtime Bun:

```bash
# Menjalankan server development dengan hot reload
bun run dev

# Menjalankan server dalam mode produksi
bun run start

# Menjalankan pemeriksaan tipe data TypeScript (strict)
bun run typecheck

# Menjalankan seluruh rangkaian automated tests
bun run test

# Menghasilkan dan menyinkronkan docs/api/openapi.json
bun run docs:generate

# Generate migrasi database Drizzle
bun run db:generate

# Menjalankan migrasi ke PostgreSQL
bun run db:migrate

# Seed data dummy untuk pengujian scanner HC-P20
bun run db:seed

# Membuka GUI Drizzle Studio untuk eksplorasi database
bun run db:studio
```

---

## 📚 Dokumen Spesifikasi Terkait

Proyek ini dirancang berdasarkan dokumen arsitektur dan spesifikasi resmi:
* [PRD (Product Requirements Document)](file:///PRD.md)
* [SRS (Software Requirements Specification)](file:///SRS.md)
* [SDD (Software Design Document)](file:///SDD.md)
* [Dokumentasi & Konvensi API](file:///docs/api/conventions.md)
* [Panduan Pengujian Hardware Scanner HC-P20](file:///docs/hardware_scanner_test.md)
