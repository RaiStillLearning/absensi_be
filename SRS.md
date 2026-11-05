# software_requirements_specification (SRS)
## Sistem Absensi Sekolah — SMK Ghama Caraka

**Versi:** 1.0.0  
**Status:** Draft  
**Referensi:** PRD v1.0.0

---

## 1. Pendahuluan

### 1.1 Tujuan

Dokumen ini mendefinisikan kebutuhan perangkat lunak Sistem Absensi Sekolah, meliputi kebutuhan fungsional, non-fungsional, hak akses, validasi, API, dan kriteria penerimaan.

### 1.2 Ruang Lingkup

Sistem menyediakan layanan backend untuk mendukung:

- Autentikasi pengguna.
- Otorisasi berdasarkan role.
- Pengelolaan data sekolah.
- Pengelolaan jadwal.
- Pencatatan absensi.
- Monitoring absensi.
- Rekap absensi.
- Pengelolaan profil.

### 1.3 Istilah

| Istilah | Definisi |
|---|---|
| `admin` | Pengguna dengan kewenangan administrasi global |
| `walas` | Wali kelas |
| `guru` | Guru mata pelajaran |
| `siswa` | Peserta didik |
| `daily_attendance` | Absensi harian kelas |
| `subject_attendance` | Absensi per sesi mata pelajaran |
| `rbac` | Role-Based Access Control |
| `api` | Application Programming Interface |

---

## 2. Gambaran Sistem

### 2.1 Arsitektur Umum

Sistem terdiri dari:

1. Frontend SvelteKit.
2. Backend Bun dan Hono.
3. Database PostgreSQL.
4. Drizzle ORM.
5. OpenAPI dan Swagger UI.

Frontend berkomunikasi dengan backend melalui REST API berbasis JSON.

### 2.2 Role Pengguna

Sistem memiliki empat role:

- `admin`
- `walas`
- `guru`
- `siswa`

### 2.3 Lingkungan Operasional

| Komponen | Teknologi |
|---|---|
| Runtime | Bun |
| Backend framework | Hono |
| Bahasa | TypeScript |
| Database | PostgreSQL |
| ORM | Drizzle ORM |
| Validasi | Zod |
| API documentation | OpenAPI |
| API interface | Swagger UI |
| Container database | Docker |

---

## 3. Kebutuhan Fungsional

### 3.1 Autentikasi

| ID | Kebutuhan |
|---|---|
| `FR_AUTH_001` | Sistem harus menyediakan endpoint login |
| `FR_AUTH_002` | Sistem harus memverifikasi kredensial pengguna |
| `FR_AUTH_003` | Sistem harus mengidentifikasi role pengguna |
| `FR_AUTH_004` | Sistem harus membatasi endpoint berdasarkan autentikasi |
| `FR_AUTH_005` | Sistem harus menyediakan mekanisme logout atau invalidasi sesi sesuai strategi autentikasi |

### 3.2 Admin

| ID | Kebutuhan |
|---|---|
| `FR_ADMIN_001` | Admin dapat melihat dashboard global |
| `FR_ADMIN_002` | Admin dapat mengelola data kelas |
| `FR_ADMIN_003` | Admin dapat mengelola data guru |
| `FR_ADMIN_004` | Admin dapat mengelola jadwal |
| `FR_ADMIN_005` | Admin dapat memonitor absensi |
| `FR_ADMIN_006` | Admin dapat melihat laporan absensi |

### 3.3 Wali Kelas

| ID | Kebutuhan |
|---|---|
| `FR_WALAS_001` | Walas dapat melihat dashboard kelas binaannya |
| `FR_WALAS_002` | Walas dapat melihat daftar siswa kelas binaannya |
| `FR_WALAS_003` | Walas dapat mencatat absensi harian kelas |
| `FR_WALAS_004` | Walas dapat memonitor kehadiran kelas binaannya |
| `FR_WALAS_005` | Walas dapat melihat rekap bulanan |
| `FR_WALAS_006` | Walas dapat melihat dan mengelola profilnya |

### 3.4 Guru Mata Pelajaran

| ID | Kebutuhan |
|---|---|
| `FR_GURU_001` | Guru dapat melihat dashboard kelas yang diajar |
| `FR_GURU_002` | Guru dapat melihat jadwal mengajarnya |
| `FR_GURU_003` | Guru dapat mencatat absensi sesi mata pelajaran |
| `FR_GURU_004` | Guru hanya dapat mengakses sesi yang menjadi kewenangannya |
| `FR_GURU_005` | Guru dapat melihat rekap absensi yang menjadi kewenangannya |
| `FR_GURU_006` | Guru dapat melihat dan mengelola profilnya |

### 3.5 Siswa

| ID | Kebutuhan |
|---|---|
| `FR_SISWA_001` | Siswa dapat melihat dashboard pribadi |
| `FR_SISWA_002` | Siswa dapat melihat jadwal |
| `FR_SISWA_003` | Siswa dapat melakukan absensi mandiri sesuai aturan backend |
| `FR_SISWA_004` | Siswa dapat melihat riwayat absensi pribadi |
| `FR_SISWA_005` | Siswa dapat melihat dan mengelola profilnya |

### 3.6 Validasi Absensi

| ID | Kebutuhan |
|---|---|
| `FR_ATT_001` | Sistem harus membedakan absensi harian kelas dan absensi sesi mata pelajaran |
| `FR_ATT_002` | Sistem harus memvalidasi identitas pengguna |
| `FR_ATT_003` | Sistem harus memvalidasi kewenangan pengguna |
| `FR_ATT_004` | Sistem harus mencegah pencatatan ganda sesuai aturan bisnis |
| `FR_ATT_005` | Sistem harus menyimpan waktu pencatatan absensi |
| `FR_ATT_006` | Sistem harus menyimpan identitas pencatat absensi |
| `FR_ATT_007` | Sistem harus memvalidasi periode absensi |
| `FR_ATT_008` | Sistem harus menyediakan riwayat absensi berdasarkan kewenangan |

---

## 4. Kebutuhan Non-Fungsional

### 4.1 Keamanan

- Password tidak boleh disimpan dalam bentuk plaintext.
- Endpoint privat wajib membutuhkan autentikasi.
- Otorisasi harus dilakukan di backend.
- Pengguna tidak boleh mengakses data milik pengguna lain tanpa kewenangan.
- Input harus divalidasi menggunakan Zod.
- Database harus menggunakan parameterized query melalui ORM.
- Secret dan konfigurasi sensitif disimpan di environment variables.

### 4.2 Performa

- Endpoint harus menghindari query database yang tidak efisien.
- Data berjumlah besar harus menggunakan pagination.
- Endpoint dashboard harus menggunakan query agregasi yang sesuai.
- Batas ukuran request harus ditentukan dan diterapkan.

### 4.3 Reliability

- Kegagalan database harus menghasilkan error yang terkontrol.
- Operasi yang memerlukan konsistensi data harus menggunakan transaksi.
- Sistem harus memiliki mekanisme logging error.
- Data absensi tidak boleh mengalami duplikasi akibat request berulang.

### 4.4 Maintainability

- Kode harus menggunakan TypeScript.
- Struktur backend harus modular.
- Validasi request dan response harus konsisten.
- Dokumentasi API harus diperbarui ketika kontrak berubah.
- Identifier teknis wajib menggunakan `snake_case`.

### 4.5 Compatibility

- API harus dapat digunakan oleh frontend SvelteKit.
- Format request dan response harus berupa JSON.
- API menggunakan prefix `/api/v1`.
- Dokumentasi API tersedia melalui Swagger UI.

---

## 5. Kebutuhan Antarmuka API

### 5.1 Konvensi

Base URL:

`/api/v1`

Contoh endpoint:

| Method | Endpoint | Fungsi |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Login |
| `GET` | `/api/v1/admin/dashboard` | Dashboard admin |
| `GET` | `/api/v1/walas/dashboard` | Dashboard walas |
| `GET` | `/api/v1/guru/dashboard` | Dashboard guru |
| `GET` | `/api/v1/siswa/dashboard` | Dashboard siswa |

Endpoint di atas merupakan rancangan awal dan harus dicocokkan dengan kontrak frontend sebelum implementasi.

### 5.2 Format Request

Contoh:

```json
{
  "username": "sample_user",
  "password": "sample_password"
}
```

### 5.3 Format Response Sukses

```json
{
  "success": true,
  "message": "Data berhasil diambil",
  "data": {
    "id": "sample_id"
  }
}
```

### 5.4 Format Response Error

```json
{
  "success": false,
  "message": "Validasi gagal",
  "errors": [
    {
      "field": "username",
      "message": "Username wajib diisi"
    }
  ]
}
```

### 5.5 HTTP Status

| Status | Penggunaan |
|---|---|
| `200` | Request berhasil |
| `201` | Resource berhasil dibuat |
| `400` | Request tidak valid |
| `401` | Belum terautentikasi |
| `403` | Tidak memiliki izin |
| `404` | Resource tidak ditemukan |
| `409` | Konflik data |
| `422` | Validasi bisnis gagal |
| `500` | Kesalahan internal server |

---

## 6. Kebutuhan Otorisasi

| Fitur | Admin | Walas | Guru | Siswa |
|---|---|---|---|---|
| Dashboard global | Ya | Tidak | Tidak | Tidak |
| Dashboard kelas binaan | Ya | Ya | Tidak | Tidak |
| Dashboard mengajar | Ya | Tidak | Ya | Tidak |
| Dashboard pribadi | Ya | Tidak | Tidak | Ya |
| Kelola kelas | Ya | Tidak | Tidak | Tidak |
| Kelola guru | Ya | Tidak | Tidak | Tidak |
| Kelola jadwal | Ya | Tidak | Tidak | Tidak |
| Absensi harian kelas | Monitoring | Ya | Tidak | Tidak |
| Absensi sesi mapel | Monitoring | Tidak | Ya | Tidak |
| Absensi mandiri | Monitoring | Tidak | Tidak | Ya |
| Riwayat pribadi | Sesuai kebutuhan admin | Sesuai kelas | Sesuai sesi | Ya |

Keterangan: tabel ini merupakan matriks rancangan awal. Akses monitoring admin dan batas pengelolaan profil harus disesuaikan dengan aturan sekolah.

---

## 7. Use Case

### 7.1 Login

**Aktor:** Seluruh role.

Alur:

1. Pengguna mengirim kredensial.
2. Backend memvalidasi input.
3. Backend memverifikasi kredensial.
4. Backend menentukan role pengguna.
5. Backend mengembalikan informasi autentikasi.

### 7.2 Absensi Harian

**Aktor:** Walas.

Alur:

1. Walas login.
2. Backend memverifikasi role.
3. Backend memverifikasi kelas binaan.
4. Walas membuka daftar siswa.
5. Walas mengirim data absensi harian.
6. Backend memvalidasi data.
7. Backend menyimpan absensi.

### 7.3 Absensi Mata Pelajaran

**Aktor:** Guru.

Alur:

1. Guru login.
2. Guru memilih sesi pembelajaran.
3. Backend memverifikasi jadwal dan kewenangan guru.
4. Guru mengirim data absensi siswa.
5. Backend memvalidasi data.
6. Backend menyimpan absensi sesi mata pelajaran.

### 7.4 Absensi Mandiri

**Aktor:** Siswa.

Alur:

1. Siswa login.
2. Siswa membuka fitur absensi.
3. Backend memeriksa identitas siswa.
4. Backend memeriksa aturan absensi yang berlaku.
5. Backend menerima atau menolak permintaan.
6. Backend menyimpan hasil absensi apabila valid.

Metode dan aturan detail absensi mandiri masih perlu dikonfirmasi.

---

## 8. Acceptance Criteria

| ID | Kriteria |
|---|---|
| `AC_001` | Login berhasil hanya dengan kredensial valid |
| `AC_002` | Pengguna tidak dapat mengakses endpoint role lain tanpa izin |
| `AC_003` | Walas tidak dapat mengelola kelas di luar kelas binaannya |
| `AC_004` | Guru tidak dapat mencatat absensi sesi yang bukan kewenangannya |
| `AC_005` | Siswa hanya dapat melihat riwayat absensi pribadinya |
| `AC_006` | Absensi harian dan sesi mapel tersimpan terpisah |
| `AC_007` | Request absensi ganda ditangani sesuai aturan bisnis |
| `AC_008` | API memiliki dokumentasi OpenAPI |
| `AC_009` | Format response dan error konsisten |
| `AC_010` | Pengujian untuk fungsi utama berhasil |

---

## 9. Pengujian

- Unit testing untuk fungsi validasi dan bisnis.
- Integration testing untuk database.
- API testing untuk endpoint.
- Authorization testing untuk seluruh role.
- Negative testing untuk request tidak valid.
- Regression testing ketika kontrak API berubah.

---

## 10. Traceability

| PRD | SRS |
|---|---|
| Pengelolaan pengguna | `FR_AUTH_001`–`FR_AUTH_005` |
| Admin | `FR_ADMIN_001`–`FR_ADMIN_006` |
| Walas | `FR_WALAS_001`–`FR_WALAS_006` |
| Guru | `FR_GURU_001`–`FR_GURU_006` |
| Siswa | `FR_SISWA_001`–`FR_SISWA_005` |
| Pengelolaan absensi | `FR_ATT_001`–`FR_ATT_008` |

---

**Akhir dokumen SRS**