# Siswa (Student) Endpoints

> [!NOTE]
> Endpoints untuk Siswa mengakses data profil pribadi, jadwal pelajaran mingguan, metrik kehadiran, riwayat presensi, dan status absensi realtime.

## Tag: `Siswa`

### Profil Siswa
- `GET /api/v1/siswa/profil`: Mengambil biodata profil lengkap siswa (NISN, NIS, nama, kelas, jurusan, kontak wali, dll).
- `PUT /api/v1/siswa/profil`: Memperbarui data profil siswa yang diizinkan.

### Dashboard & Jadwal
- `GET /api/v1/siswa/metrik-kehadiran`: Mengambil ringkasan persentase kehadiran, jumlah hari hadir, izin, sakit, dan alpa.
- `GET /api/v1/siswa/jadwal/hari-ini`: Mengambil daftar mata pelajaran yang dijadwalkan hari ini.
- `GET /api/v1/siswa/jadwal/mingguan`: Mengambil jadwal pelajaran mingguan lengkap (Senin s.d. Jumat).

### Presensi & Riwayat
- `GET /api/v1/siswa/absensi/realtime`: Mengambil status pencatatan absensi realtime hari ini (masuk/pulang, tepat waktu/terlambat).
- `GET /api/v1/siswa/kehadiran?tanggal=...`: Mengambil riwayat catatan absensi siswa.
- `GET /api/v1/siswa/kehadiran/rekap?bulan=YYYY-MM`: Mengambil rekapitulasi kehadiran bulanan beserta persentase dan rincian per status.

### Scan Barcode / QR Presensi
- `POST /api/v1/attendance/daily/scan`: Presensi mandiri menggunakan pemindaian barcode / token QR siswa.
