# Administrator Endpoints

> [!NOTE]
> Endpoints untuk hak akses Administrator dalam pengelolaan dashboard statistik, master data kelas, master data guru, jadwal pelajaran, monitoring presensi harian seluruh sekolah, dan profil admin.

## Tag: `Admin`

### Dashboard
- `GET /api/v1/dashboard/stats`: Ringkasan statistik (total siswa, guru, kelas, kehadiran).
- `GET /api/v1/dashboard/rekap-kehadiran`: Data rekap kehadiran 5 hari terakhir untuk grafik.
- `GET /api/v1/dashboard/aktivitas-terbaru`: Log riwayat aktivitas terbaru sistem.
- `GET /api/v1/dashboard/ringkasan-absensi`: Ringkasan status presensi hari ini.

### Manajemen Kelas
- `GET /api/v1/kelas`: Mengambil daftar seluruh kelas.
- `POST /api/v1/kelas`: Menambahkan kelas baru (`nama_kelas`, `tingkat`, `jurusan`, `tahun_ajaran`, `wali_kelas`).
- `GET /api/v1/kelas/:id`: Mengambil detail satu kelas berdasarkan ID.
- `PUT /api/v1/kelas/:id`: Memperbarui data kelas.
- `DELETE /api/v1/kelas/:id`: Menghapus data kelas.

### Manajemen Guru
- `GET /api/v1/guru`: Mengambil daftar seluruh guru (termasuk status wali kelas).
- `POST /api/v1/guru`: Menambahkan guru baru (`nama_guru`, `mata_pelajaran`, `nip`, `email`, `nomor_telepon`, `is_walas`, `kelas_walas`).
- `GET /api/v1/guru/:id`: Mengambil detail satu guru.
- `PUT /api/v1/guru/:id`: Memperbarui data guru.
- `DELETE /api/v1/guru/:id`: Menghapus data guru.

### Jadwal Pelajaran
- `GET /api/v1/jadwal?kelas=...&hari=...`: Mengambil jadwal pelajaran dengan filter.
- `POST /api/v1/jadwal`: Menambahkan jadwal pelajaran baru.
- `GET /api/v1/jadwal/:id`: Mengambil detail satu jadwal.
- `PUT /api/v1/jadwal/:id`: Memperbarui jadwal pelajaran.
- `DELETE /api/v1/jadwal/:id`: Menghapus jadwal pelajaran.

### Monitoring Absensi Sekolah
- `GET /api/v1/absensi?tanggal=...&kelas=...&cari_siswa=...`: Monitoring presensi harian seluruh siswa.

### Profil Admin
- `GET /api/v1/admin/profil`: Mengambil data profil admin.
- `PUT /api/v1/admin/profil`: Memperbarui data profil admin.
