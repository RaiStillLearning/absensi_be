/**
 * Initial Mock & Seeding Data for SMK Ghama Caraka Attendance Backend
 * Directly synchronized with the frontend schemas and mock models.
 */

export interface AdminProfile {
  nama_lengkap: string;
  username: string;
  email: string;
  peran: string;
  foto_profil?: string;
}

export interface KelasItem {
  id: number;
  nama_kelas: string;
  tingkat: string;
  jurusan: string;
  wali_kelas: string;
  tahun_ajaran?: string;
}

export interface GuruItem {
  id: number;
  nama_guru: string;
  mata_pelajaran: string;
  nip?: string;
  email?: string;
  nomor_telepon?: string;
  is_walas: boolean;
  kelas_walas: string;
  isWalas?: boolean;
  kelasWalas?: string;
}

export interface JadwalItem {
  id: number;
  kelas: string;
  hari: string;
  jam_ke: number;
  waktu_mulai: string;
  waktu_selesai: string;
  mata_pelajaran: string;
  guru: string;
}

export interface AbsensiItem {
  nama_siswa: string;
  nisn: string;
  kelas: string;
  status: "Hadir" | "Izin" | "Sakit" | "Alpa" | "Alpha";
  jam_masuk: string;
  keterangan: string;
}

export interface SiswaAbsensiItem {
  no: number;
  id: string;
  nama_siswa: string;
  nisn: string;
  status: "Hadir" | "Izin" | "Sakit" | "Alpa";
  catatan?: string;
}

export interface SiswaProfile {
  nisn: string;
  nis: string;
  nama_lengkap: string;
  kelas: string;
  jurusan: string;
  tempat_lahir: string;
  tanggal_lahir: string;
  jenis_kelamin: "Laki-laki" | "Perempuan";
  agama: string;
  alamat: string;
  telepon: string;
  nama_wali: string;
  telepon_wali: string;
  email: string;
  status_akun: "Aktif" | "Non-Aktif";
  foto_profil?: string;
}

export const initialAdminProfile: AdminProfile = {
  nama_lengkap: "Admin",
  username: "admin",
  email: "admin@sekolah.example",
  peran: "Administrator",
  foto_profil: "",
};

export const initialRingkasanAbsensi = {
  total_siswa: 320,
  total_kelas: 12,
  tanggal: "Senin, 19 Oktober 2026",
  hadir: 301,
  izin: 9,
  sakit: 6,
  alpha: 4,
};

export const initialDashboardStats = {
  total_siswa: initialRingkasanAbsensi.total_siswa,
  total_guru: 28,
  total_kelas: initialRingkasanAbsensi.total_kelas,
  kehadiran_hari_ini: Math.round((initialRingkasanAbsensi.hadir / initialRingkasanAbsensi.total_siswa) * 100),
  kenaikan_kehadiran: 2,
};

export const initialRekapKehadiran5Hari = [
  { hari: "Senin", hadir: initialRingkasanAbsensi.hadir, izin: initialRingkasanAbsensi.izin, sakit: initialRingkasanAbsensi.sakit, alpha: initialRingkasanAbsensi.alpha },
  { hari: "Selasa", hadir: 305, izin: 7, sakit: 5, alpha: 3 },
  { hari: "Rabu", hadir: 298, izin: 11, sakit: 7, alpha: 4 },
  { hari: "Kamis", hadir: 308, izin: 5, sakit: 5, alpha: 2 },
  { hari: "Jumat", hadir: 302, izin: 8, sakit: 6, alpha: 4 },
];

export const initialAktivitasTerbaru = [
  { jenis: "absensi" as const, judul: "Absensi kelas diperbarui", deskripsi: "Ibu Rina mengisi absensi X RPL 1.", waktu: "5 menit lalu" },
  { jenis: "siswa" as const, judul: "Siswa baru ditambahkan", deskripsi: "Andi Pratama masuk ke kelas X TKJ 2.", waktu: "15 menit lalu" },
  { jenis: "izin" as const, judul: "Pengajuan izin diterima", deskripsi: "Siti Aisyah · XI AKL 1 · keperluan keluarga.", waktu: "32 menit lalu" },
  { jenis: "jadwal" as const, judul: "Jadwal pelajaran diperbarui", deskripsi: "Jadwal XII RPL 1 berhasil disimpan.", waktu: "1 jam lalu" },
  { jenis: "laporan" as const, judul: "Laporan mingguan tersedia", deskripsi: "Rekap absensi 12–18 Oktober siap diunduh.", waktu: "2 jam lalu" },
];

export const initialKelas: KelasItem[] = [
  { id: 1, nama_kelas: "X RPL 1", tingkat: "X", jurusan: "RPL", wali_kelas: "Bu Sari", tahun_ajaran: "2026/2027" },
  { id: 2, nama_kelas: "X RPL 2", tingkat: "X", jurusan: "RPL", wali_kelas: "Pak Andi", tahun_ajaran: "2026/2027" },
  { id: 3, nama_kelas: "XI RPL 1", tingkat: "XI", jurusan: "RPL", wali_kelas: "Bu Dewi", tahun_ajaran: "2026/2027" },
  { id: 4, nama_kelas: "XI RPL 2", tingkat: "XI", jurusan: "RPL", wali_kelas: "Pak Budi", tahun_ajaran: "2026/2027" },
  { id: 5, nama_kelas: "XII RPL 1", tingkat: "XII", jurusan: "RPL", wali_kelas: "Bu Rina", tahun_ajaran: "2026/2027" },
  { id: 6, nama_kelas: "XII RPL 2", tingkat: "XII", jurusan: "RPL", wali_kelas: "Pak Yusuf", tahun_ajaran: "2026/2027" },
  { id: 7, nama_kelas: "X TKJ 1", tingkat: "X", jurusan: "TKJ", wali_kelas: "Bu Maya", tahun_ajaran: "2026/2027" },
  { id: 8, nama_kelas: "X TKJ 2", tingkat: "X", jurusan: "TKJ", wali_kelas: "Pak Dedi", tahun_ajaran: "2026/2027" },
  { id: 9, nama_kelas: "XI TKJ 1", tingkat: "XI", jurusan: "TKJ", wali_kelas: "Pak Hasan", tahun_ajaran: "2026/2027" },
  { id: 10, nama_kelas: "XI AKL 1", tingkat: "XI", jurusan: "AKL", wali_kelas: "Bu Lestari", tahun_ajaran: "2026/2027" },
  { id: 11, nama_kelas: "XII TKJ 1", tingkat: "XII", jurusan: "TKJ", wali_kelas: "Pak Joko", tahun_ajaran: "2026/2027" },
  { id: 12, nama_kelas: "XII AKL 1", tingkat: "XII", jurusan: "AKL", wali_kelas: "Bu Nur", tahun_ajaran: "2026/2027" },
];

export const initialGuru: GuruItem[] = [
  { id: 1, nama_guru: "Bu Sari", mata_pelajaran: "Matematika", nip: "198501152010012001", email: "sari@smkghamacaraka.sch.id", nomor_telepon: "081234567801", is_walas: true, kelas_walas: "X RPL 1", isWalas: true, kelasWalas: "X RPL 1" },
  { id: 2, nama_guru: "Pak Andi", mata_pelajaran: "Pemrograman Dasar", nip: "198703202012011002", email: "andi@smkghamacaraka.sch.id", nomor_telepon: "081234567802", is_walas: true, kelas_walas: "X RPL 2", isWalas: true, kelasWalas: "X RPL 2" },
  { id: 3, nama_guru: "Bu Dewi", mata_pelajaran: "Bahasa Indonesia", nip: "199005122015022003", email: "dewi@smkghamacaraka.sch.id", nomor_telepon: "081234567803", is_walas: true, kelas_walas: "XI RPL 1", isWalas: true, kelasWalas: "XI RPL 1" },
  { id: 4, nama_guru: "Pak Budi", mata_pelajaran: "Pemrograman Web", nip: "198408102009011004", email: "budi@smkghamacaraka.sch.id", nomor_telepon: "081234567804", is_walas: true, kelas_walas: "XI RPL 2", isWalas: true, kelasWalas: "XI RPL 2" },
  { id: 5, nama_guru: "Bu Rina Pratiwi, S.Pd.", mata_pelajaran: "Pemrograman Web", nip: "198905122015012008", email: "burina@ghamacaraka.sch.id", nomor_telepon: "0812-3456-7890", is_walas: true, kelas_walas: "X RPL 1", isWalas: true, kelasWalas: "X RPL 1" },
  { id: 6, nama_guru: "Pak Yusuf", mata_pelajaran: "Sistem Komputer", nip: "198611052011011006", email: "yusuf@smkghamacaraka.sch.id", nomor_telepon: "081234567806", is_walas: true, kelas_walas: "XII RPL 2", isWalas: true, kelasWalas: "XII RPL 2" },
  { id: 7, nama_guru: "Bu Maya", mata_pelajaran: "Bahasa Inggris", nip: "199107142016022007", email: "maya@smkghamacaraka.sch.id", nomor_telepon: "081234567807", is_walas: false, kelas_walas: "", isWalas: false, kelasWalas: "" },
  { id: 8, nama_guru: "Pak Dedi", mata_pelajaran: "Kewarganegaraan", nip: "198304222008011008", email: "dedi@smkghamacaraka.sch.id", nomor_telepon: "081234567808", is_walas: false, kelas_walas: "", isWalas: false, kelasWalas: "" },
  { id: 9, nama_guru: "Pak Hasan", mata_pelajaran: "Matematika", nip: "198909182014011009", email: "hasan@smkghamacaraka.sch.id", nomor_telepon: "081234567809", is_walas: false, kelas_walas: "", isWalas: false, kelasWalas: "" },
  { id: 10, nama_guru: "Bu Lestari", mata_pelajaran: "Bahasa Indonesia", nip: "199312012019022010", email: "lestari@smkghamacaraka.sch.id", nomor_telepon: "081234567810", is_walas: false, kelas_walas: "", isWalas: false, kelasWalas: "" },
  { id: 11, nama_guru: "Pak Joko", mata_pelajaran: "Basis Data", nip: "198806252013011011", email: "joko@smkghamacaraka.sch.id", nomor_telepon: "081234567811", is_walas: false, kelas_walas: "", isWalas: false, kelasWalas: "" },
  { id: 12, nama_guru: "Bu Nur", mata_pelajaran: "Pemrograman Web", nip: "199403162020022012", email: "nur@smkghamacaraka.sch.id", nomor_telepon: "081234567812", is_walas: false, kelas_walas: "", isWalas: false, kelasWalas: "" },
];

export const initialJadwal: JadwalItem[] = [
  { id: 1, kelas: "X RPL 1", hari: "Senin", jam_ke: 1, waktu_mulai: "07:00", waktu_selesai: "07:45", mata_pelajaran: "Matematika", guru: "Bu Sari" },
  { id: 2, kelas: "X RPL 1", hari: "Senin", jam_ke: 2, waktu_mulai: "07:45", waktu_selesai: "08:30", mata_pelajaran: "Bahasa Indonesia", guru: "Pak Budi" },
  { id: 3, kelas: "X RPL 1", hari: "Senin", jam_ke: 3, waktu_mulai: "08:45", waktu_selesai: "09:30", mata_pelajaran: "Pemrograman Dasar", guru: "Pak Andi" },
  { id: 4, kelas: "X RPL 1", hari: "Senin", jam_ke: 4, waktu_mulai: "09:30", waktu_selesai: "10:15", mata_pelajaran: "Sistem Komputer", guru: "Bu Rina" },
  { id: 5, kelas: "X RPL 1", hari: "Senin", jam_ke: 5, waktu_mulai: "10:15", waktu_selesai: "11:00", mata_pelajaran: "Basis Data", guru: "Pak Joko" },
  { id: 6, kelas: "X RPL 1", hari: "Selasa", jam_ke: 1, waktu_mulai: "07:00", waktu_selesai: "07:45", mata_pelajaran: "Bahasa Inggris", guru: "Bu Maya" },
  { id: 7, kelas: "X RPL 1", hari: "Selasa", jam_ke: 2, waktu_mulai: "07:45", waktu_selesai: "08:30", mata_pelajaran: "Pemrograman Web", guru: "Pak Andi" },
  { id: 8, kelas: "X RPL 1", hari: "Selasa", jam_ke: 3, waktu_mulai: "08:45", waktu_selesai: "09:30", mata_pelajaran: "Matematika", guru: "Bu Sari" },
  { id: 9, kelas: "X RPL 2", hari: "Senin", jam_ke: 1, waktu_mulai: "07:00", waktu_selesai: "07:45", mata_pelajaran: "Basis Data", guru: "Pak Joko" },
  { id: 10, kelas: "X RPL 2", hari: "Senin", jam_ke: 2, waktu_mulai: "07:45", waktu_selesai: "08:30", mata_pelajaran: "Kewarganegaraan", guru: "Pak Dedi" },
];

export const initialAbsensi: AbsensiItem[] = [
  { nama_siswa: "Ahmad Fauzan", nisn: "0102641001", kelas: "X RPL 1", status: "Hadir", jam_masuk: "06.42", keterangan: "Tepat waktu" },
  { nama_siswa: "Alya Putri", nisn: "0102641002", kelas: "X RPL 1", status: "Hadir", jam_masuk: "06.48", keterangan: "Tepat waktu" },
  { nama_siswa: "Bagas Pratama", nisn: "0102641003", kelas: "X RPL 2", status: "Izin", jam_masuk: "—", keterangan: "Keperluan keluarga" },
  { nama_siswa: "Citra Lestari", nisn: "0092641004", kelas: "XI RPL 1", status: "Hadir", jam_masuk: "06.51", keterangan: "Tepat waktu" },
  { nama_siswa: "Dimas Saputra", nisn: "0092641005", kelas: "XI RPL 2", status: "Sakit", jam_masuk: "—", keterangan: "Surat keterangan sakit" },
  { nama_siswa: "Fajar Ramadhan", nisn: "0082641006", kelas: "XII RPL 1", status: "Hadir", jam_masuk: "06.55", keterangan: "Tepat waktu" },
  { nama_siswa: "Intan Permata", nisn: "0082641007", kelas: "XII RPL 2", status: "Alpa", jam_masuk: "—", keterangan: "Tanpa keterangan" },
  { nama_siswa: "Nadia Safitri", nisn: "0102641008", kelas: "X RPL 2", status: "Hadir", jam_masuk: "06.58", keterangan: "Tepat waktu" },
];

export const initialSiswaPerKelas: Record<string, SiswaAbsensiItem[]> = {
  "X RPL 1": [
    { no: 1, id: "xrpl1-1", nama_siswa: "Ahmad Rizky Pratama", nisn: "1234567891", status: "Hadir" },
    { no: 2, id: "xrpl1-2", nama_siswa: "Aisyah Nurfadila", nisn: "1234567892", status: "Hadir" },
    { no: 3, id: "xrpl1-3", nama_siswa: "Bima Satria", nisn: "1234567893", status: "Hadir" },
    { no: 4, id: "xrpl1-4", nama_siswa: "Citra Lestari", nisn: "1234567894", status: "Izin", catatan: "Keperluan keluarga" },
    { no: 5, id: "xrpl1-5", nama_siswa: "Daffa Pratama", nisn: "1234567895", status: "Alpa" },
    { no: 6, id: "xrpl1-6", nama_siswa: "Eka Putri Lestari", nisn: "1234567896", status: "Hadir" },
    { no: 7, id: "xrpl1-7", nama_siswa: "Fahri Ramadhan", nisn: "1234567897", status: "Hadir" },
    { no: 8, id: "xrpl1-8", nama_siswa: "Gita Amelia", nisn: "1234567898", status: "Sakit", catatan: "Demam tinggi" },
  ],
  "X RPL 2": [
    { no: 1, id: "xrpl2-1", nama_siswa: "Bagas Prasetyo", nisn: "1234567901", status: "Hadir" },
    { no: 2, id: "xrpl2-2", nama_siswa: "Cantika Dewi", nisn: "1234567902", status: "Hadir" },
    { no: 3, id: "xrpl2-3", nama_siswa: "Dimas Wahyu Pratama", nisn: "1234567903", status: "Hadir" },
    { no: 4, id: "xrpl2-4", nama_siswa: "Fani Rahmawati", nisn: "1234567904", status: "Izin", catatan: "Acara keluarga" },
    { no: 5, id: "xrpl2-5", nama_siswa: "Gilang Permana", nisn: "1234567905", status: "Hadir" },
    { no: 6, id: "xrpl2-6", nama_siswa: "Hanif Maulana", nisn: "1234567906", status: "Hadir" },
    { no: 7, id: "xrpl2-7", nama_siswa: "Intan Permata Sari", nisn: "1234567907", status: "Sakit", catatan: "Flu berat" },
    { no: 8, id: "xrpl2-8", nama_siswa: "Kevin Sanjaya", nisn: "1234567908", status: "Alpa" },
  ],
  "XI RPL 1": [
    { no: 1, id: "xirpl1-1", nama_siswa: "Aditya Pratama", nisn: "1234567921", status: "Hadir" },
    { no: 2, id: "xirpl1-2", nama_siswa: "Bella Safitri", nisn: "1234567922", status: "Hadir" },
    { no: 3, id: "xirpl1-3", nama_siswa: "Doni Kusuma", nisn: "1234567923", status: "Hadir" },
    { no: 4, id: "xirpl1-4", nama_siswa: "Farah Nabila", nisn: "1234567924", status: "Hadir" },
    { no: 5, id: "xirpl1-5", nama_siswa: "Galih Saputra", nisn: "1234567925", status: "Izin", catatan: "Lomba olimpiade" },
    { no: 6, id: "xirpl1-6", nama_siswa: "Hesti Wulandari", nisn: "1234567926", status: "Hadir" },
    { no: 7, id: "xirpl1-7", nama_siswa: "Ilham Firmansyah", nisn: "1234567927", status: "Sakit", catatan: "Sakit gigi" },
    { no: 8, id: "xirpl1-8", nama_siswa: "Jihan Almira", nisn: "1234567928", status: "Hadir" },
  ],
};

export const initialSiswaProfile: SiswaProfile = {
  nisn: "0102641001",
  nis: "242510001",
  nama_lengkap: "Ahmad Rizky Pratama",
  kelas: "X RPL 1",
  jurusan: "Rekayasa Perangkat Lunak",
  tempat_lahir: "Depok",
  tanggal_lahir: "14 Maret 2008",
  jenis_kelamin: "Laki-laki",
  agama: "Islam",
  alamat: "Jl. H. Caraka No. 12, Cisalak, Depok",
  telepon: "0812-9876-5432",
  nama_wali: "Bambang Pratama",
  telepon_wali: "0813-1122-3344",
  email: "ahmad.rizky@siswa.ghamacaraka.sch.id",
  status_akun: "Aktif",
  foto_profil: "",
};

