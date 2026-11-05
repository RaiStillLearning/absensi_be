# product_requirements_document (PRD)
## Sistem Absensi Sekolah — SMK Ghama Caraka

**Versi:** 1.0.0  
**Status:** Draft  
**Produk:** Sistem Absensi Sekolah  
**Backend:** Bun + Hono + TypeScript  
**Database:** PostgreSQL  
**ORM:** Drizzle ORM  
**Frontend:** SvelteKit  
**API Documentation:** Swagger UI / OpenAPI

---

## 1. Ringkasan Produk

Sistem Absensi Sekolah merupakan aplikasi untuk membantu SMK Ghama Caraka mengelola, mencatat, memantau, dan merekap kehadiran siswa secara digital.

Sistem menyediakan akses berdasarkan empat role utama:

- `admin`
- `walas`
- `guru`
- `siswa`

Setiap role memiliki hak akses dan tanggung jawab berbeda. Sistem membedakan absensi harian kelas yang dikelola wali kelas dengan absensi per sesi mata pelajaran yang dikelola guru mata pelajaran.

## 2. Latar Belakang dan Masalah

Pengelolaan absensi sekolah membutuhkan pencatatan yang terstruktur dan mudah dipantau.

Masalah yang ingin ditangani:

1. Pencatatan kehadiran perlu dikelola secara digital.
2. Wali kelas membutuhkan pemantauan kehadiran siswa dalam kelas binaannya.
3. Guru mata pelajaran membutuhkan pencatatan kehadiran berdasarkan sesi pembelajaran.
4. Admin membutuhkan pemantauan data absensi secara menyeluruh.
5. Siswa membutuhkan akses untuk melihat jadwal dan riwayat kehadiran.

## 3. Tujuan Produk

- Memusatkan pengelolaan data absensi sekolah.
- Memisahkan absensi harian kelas dan absensi sesi mata pelajaran.
- Memberikan akses sesuai tanggung jawab setiap role.
- Memudahkan pemantauan dan rekapitulasi kehadiran.
- Menyediakan API yang konsisten untuk frontend.

## 4. Target Pengguna

| Role | Tanggung jawab |
|---|---|
| `admin` | Mengelola dan memantau data sekolah |
| `walas` | Mengelola absensi harian kelas binaan |
| `guru` | Mengelola absensi sesi mata pelajaran |
| `siswa` | Melihat jadwal dan riwayat serta melakukan absensi mandiri sesuai aturan |

## 5. Ruang Lingkup Produk

### 5.1 Admin

- Dashboard global.
- Pengelolaan kelas.
- Pengelolaan guru.
- Pengelolaan jadwal.
- Monitoring absensi.
- Laporan absensi.

### 5.2 Wali Kelas (`walas`)

- Dashboard kelas binaan.
- Pencatatan absensi harian kelas.
- Monitoring kehadiran siswa.
- Rekap absensi bulanan.
- Pengelolaan profil.

### 5.3 Guru (`guru`)

- Dashboard kelas yang diajar.
- Pencatatan absensi berdasarkan sesi mata pelajaran.
- Rekap kehadiran.
- Pengelolaan profil.

### 5.4 Siswa (`siswa`)

- Dashboard siswa.
- Absensi mandiri.
- Melihat jadwal.
- Melihat riwayat absensi pribadi.
- Pengelolaan profil.

## 6. Prinsip Produk

1. Setiap pengguna hanya dapat mengakses data sesuai role dan kewenangannya.
2. Data absensi harian kelas dan absensi sesi mata pelajaran harus terpisah.
3. Validasi absensi wajib dilakukan di backend.
4. Frontend tidak boleh menjadi sumber kebenaran untuk validasi hak akses.
5. API menggunakan format JSON dengan penamaan `snake_case`.
6. Dokumentasi API dikelola menggunakan OpenAPI dan Swagger UI.

## 7. Batasan Produk

- Frontend dikembangkan oleh tim terpisah menggunakan SvelteKit.
- Backend tidak boleh mengubah kontrak frontend tanpa kesepakatan.
- Backend menggunakan Bun sebagai runtime.
- PostgreSQL berjalan melalui Docker.
- Drizzle ORM digunakan untuk pengelolaan database.
- Swagger UI tersedia di `/docs/api`.
- Implementasi fitur harus mengikuti kebutuhan yang telah disepakati.

## 8. Indikator Keberhasilan

- Pengguna dapat login sesuai role.
- Setiap role hanya dapat mengakses sumber daya yang diizinkan.
- Absensi harian dan absensi mata pelajaran tersimpan secara terpisah.
- Riwayat absensi dapat ditampilkan sesuai kewenangan.
- Rekap absensi dapat dihasilkan berdasarkan data yang tersedia.
- API terdokumentasi dan dapat diuji melalui Swagger UI.
- Seluruh API memiliki format respons dan error yang konsisten.

## 9. Risiko Produk

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Hak akses tidak tepat | Kebocoran data | Validasi RBAC di backend |
| Duplikasi absensi | Data tidak akurat | Constraint dan validasi database |
| Jadwal tidak sinkron | Absensi salah sesi | Validasi jadwal di backend |
| Aturan absensi belum jelas | Perbedaan implementasi | Konfirmasi aturan bisnis |
| Perubahan kontrak frontend | Integrasi terganggu | Dokumentasi OpenAPI sebagai acuan |

## 10. Keputusan yang Perlu Dikonfirmasi

| Topik | Pertanyaan |
|---|---|
| Absensi mandiri | Apakah siswa melakukan absensi berdasarkan jadwal, lokasi, barcode, atau metode lain? |
| Status kehadiran | Apakah status hanya `hadir`, `izin`, `sakit`, `alpha`, atau ada status lain? |
| Waktu absensi | Kapan periode absensi dibuka dan ditutup? |
| Zona waktu | Apakah sistem menggunakan `Asia/Jakarta`? |
| Koreksi absensi | Siapa yang boleh mengubah absensi setelah disimpan? |
| Keterlambatan | Apakah keterlambatan memiliki status tersendiri? |
| Jadwal | Bagaimana menangani jadwal pengganti dan perubahan jadwal? |
| Rekap | Apakah rekap bulanan menghitung absensi harian, sesi mata pelajaran, atau keduanya? |

## 11. Kriteria Penyelesaian Produk

Produk dianggap memenuhi ruang lingkup awal apabila:

- Empat role utama tersedia.
- Dashboard dan fitur sesuai dengan tanggung jawab role.
- Proses absensi berjalan dengan validasi backend.
- Data absensi dapat dipantau dan direkap.
- Integrasi frontend dan backend menggunakan kontrak API yang terdokumentasi.
- Pengujian fungsional dan keamanan dasar telah dilakukan.

---

**Akhir dokumen PRD**