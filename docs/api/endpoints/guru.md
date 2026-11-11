# Guru Mata Pelajaran (Subject Teacher) Endpoints

> [!NOTE]
> Endpoints untuk Guru Mata Pelajaran mengelola sesi absensi jam pelajaran, profil guru, dashboard, dan laporan rekapitulasi.

## Tag: `Guru`

### Dashboard & Profil
- `GET /api/v1/guru/dashboard`: Ringkasan dashboard guru (profil, kelas aktif mengajar, rekap kehadiran bulanan).
- `GET /api/v1/guru/profil`: Mengambil profil guru yang sedang aktif.
- `PUT /api/v1/guru/profil`: Memperbarui profil guru (nama, email, no HP, alamat, foto profil).

### Sesi Presensi Pelajaran
- `GET /api/v1/guru/absensi?kelas=...&mapel=...&tanggal=...`: Mengambil daftar siswa pada sesi presensi tertentu.
- `POST /api/v1/guru/absensi/simpan`: Menyimpan hasil presensi seluruh siswa untuk satu sesi.
- `PUT /api/v1/guru/absensi/status`: Mengubah status kehadiran satu siswa (`Hadir`, `Izin`, `Sakit`, `Alpa`).
- `DELETE /api/v1/guru/absensi/:id?kelas=...&mapel=...&tanggal=...`: Menghapus siswa dari sesi presensi.

### Rekapitulasi Presensi Sesi
- `GET /api/v1/guru/rekap?kelas=...&mapel=...&tanggal=...`: Rekapitulasi data presensi dan tabel siswa untuk ekspor laporan / cetak PDF.
