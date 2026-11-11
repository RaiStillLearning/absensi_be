# Wali Kelas (Homeroom Teacher) Endpoints

> [!NOTE]
> Endpoints untuk Wali Kelas memantau absensi harian kelas binaan, mengelola status kehadiran siswa, dan melihat rekap bulanan.

## Tag: `Walas`

### Dashboard
- `GET /api/v1/walas/dashboard`: Ringkasan profil wali kelas dan statistik kehadiran kelas bulan ini.

### Monitoring Harian Kelas Binaan
- `GET /api/v1/walas/monitoring?tanggal=...&status=...&cari=...`: Daftar presensi harian siswa di kelas binaan beserta metrik ringkasan.
- `PUT /api/v1/walas/monitoring/siswa/:id`: Mengubah status kehadiran siswa harian dan catatan keterangan.
- `DELETE /api/v1/walas/monitoring/siswa/:id`: Menghapus data kehadiran siswa dari pemantauan harian.

### Rekapitulasi & Sesi
- `GET /api/v1/walas/rekap/bulan-ini`: Rekapitulasi kehadiran bulanan kelas dan persentase kehadiran per siswa.
- `POST /api/v1/walas/absensi/simpan`: Menyimpan hasil presensi harian kelas.
