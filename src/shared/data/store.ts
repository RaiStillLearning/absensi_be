import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  initialAdminProfile,
  initialAktivitasTerbaru,
  initialDashboardStats,
  initialGuru,
  initialJadwal,
  initialKelas,
  initialRekapKehadiran5Hari,
  initialRingkasanAbsensi,
  initialSiswaPerKelas,
  initialSiswaProfile,
  initialAbsensi,
  type AdminProfile,
  type GuruItem,
  type JadwalItem,
  type KelasItem,
  type SiswaAbsensiItem,
  type SiswaProfile,
  type AbsensiItem,
} from "./initial_data";

export interface SiswaHarianWalasItem {
  no: number;
  id: string;
  nis: string;
  nisn: string;
  nama_siswa: string;
  jam_masuk?: string;
  status: "Hadir" | "Izin" | "Sakit" | "Alpa" | "Tidak Hadir";
  keterangan: string;
}

export const initialWalasSiswaList: SiswaHarianWalasItem[] = [
  { no: 1, id: "w-1", nis: "242510001", nisn: "1234567891", nama_siswa: "Ahmad Rizky Pratama", jam_masuk: "06:45", status: "Hadir", keterangan: "Tepat waktu" },
  { no: 2, id: "w-2", nis: "242510002", nisn: "1234567892", nama_siswa: "Aisyah Nurfadila", jam_masuk: "06:50", status: "Hadir", keterangan: "Tepat waktu" },
  { no: 3, id: "w-3", nis: "242510003", nisn: "1234567893", nama_siswa: "Bima Satria", jam_masuk: "06:55", status: "Hadir", keterangan: "Tepat waktu" },
  { no: 4, id: "w-4", nis: "242510004", nisn: "1234567894", nama_siswa: "Citra Lestari", status: "Izin", keterangan: "Keperluan keluarga" },
  { no: 5, id: "w-5", nis: "242510005", nisn: "1234567895", nama_siswa: "Daffa Pratama", status: "Tidak Hadir", keterangan: "Tanpa keterangan" },
  { no: 6, id: "w-6", nis: "242510006", nisn: "1234567896", nama_siswa: "Eka Putri Lestari", jam_masuk: "06:48", status: "Hadir", keterangan: "Tepat waktu" },
  { no: 7, id: "w-7", nis: "242510007", nisn: "1234567897", nama_siswa: "Fahri Ramadhan", jam_masuk: "06:52", status: "Hadir", keterangan: "Tepat waktu" },
  { no: 8, id: "w-8", nis: "242510008", nisn: "1234567898", nama_siswa: "Gita Amelia", status: "Sakit", keterangan: "Surat dokter" },
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_FILE = join(__dirname, "../../../.store_persistence.json");

class DataStore {
  adminProfile: AdminProfile = { ...initialAdminProfile };
  dashboardStats = { ...initialDashboardStats };
  rekapKehadiran5Hari = [...initialRekapKehadiran5Hari];
  aktivitasTerbaru = [...initialAktivitasTerbaru];
  ringkasanAbsensi = { ...initialRingkasanAbsensi };
  kelas: KelasItem[] = JSON.parse(JSON.stringify(initialKelas));
  guru: GuruItem[] = JSON.parse(JSON.stringify(initialGuru));
  jadwal: JadwalItem[] = JSON.parse(JSON.stringify(initialJadwal));
  absensi: AbsensiItem[] = JSON.parse(JSON.stringify(initialAbsensi));
  siswaPerKelas: Record<string, SiswaAbsensiItem[]> = JSON.parse(JSON.stringify(initialSiswaPerKelas));
  siswaProfile: SiswaProfile = { ...initialSiswaProfile };
  walasSiswaList: SiswaHarianWalasItem[] = JSON.parse(JSON.stringify(initialWalasSiswaList));

  // Sesi absensi guru/walas: key = `${kelas}__${mapel}__${tanggal}`
  sesiAbsensiMap: Map<string, SiswaAbsensiItem[]> = new Map();

  constructor() {
    this.load();
    this.updateStats();
  }

  load(): void {
    try {
      if (existsSync(STORE_FILE)) {
        const raw = readFileSync(STORE_FILE, "utf-8");
        const data = JSON.parse(raw);
        if (data.adminProfile) this.adminProfile = data.adminProfile;
        if (data.dashboardStats) this.dashboardStats = data.dashboardStats;
        if (data.rekapKehadiran5Hari) this.rekapKehadiran5Hari = data.rekapKehadiran5Hari;
        if (data.aktivitasTerbaru) this.aktivitasTerbaru = data.aktivitasTerbaru;
        if (data.ringkasanAbsensi) this.ringkasanAbsensi = data.ringkasanAbsensi;
        if (Array.isArray(data.kelas) && data.kelas.length > 0) this.kelas = data.kelas;
        if (Array.isArray(data.guru) && data.guru.length > 0) this.guru = data.guru;
        if (Array.isArray(data.jadwal) && data.jadwal.length > 0) this.jadwal = data.jadwal;
        if (Array.isArray(data.absensi) && data.absensi.length > 0) this.absensi = data.absensi;
        if (data.siswaPerKelas) this.siswaPerKelas = data.siswaPerKelas;
        if (data.siswaProfile) this.siswaProfile = data.siswaProfile;
        if (Array.isArray(data.walasSiswaList) && data.walasSiswaList.length > 0) this.walasSiswaList = data.walasSiswaList;
        if (Array.isArray(data.sesiAbsensiEntries)) {
          this.sesiAbsensiMap = new Map(data.sesiAbsensiEntries);
        }
      }
    } catch (err) {
      console.warn("Failed to load store persistence:", err);
    }
  }

  persist(): void {
    try {
      this.updateStats();
      const payload = {
        adminProfile: this.adminProfile,
        dashboardStats: this.dashboardStats,
        rekapKehadiran5Hari: this.rekapKehadiran5Hari,
        aktivitasTerbaru: this.aktivitasTerbaru,
        ringkasanAbsensi: this.ringkasanAbsensi,
        kelas: this.kelas,
        guru: this.guru,
        jadwal: this.jadwal,
        absensi: this.absensi,
        siswaPerKelas: this.siswaPerKelas,
        siswaProfile: this.siswaProfile,
        walasSiswaList: this.walasSiswaList,
        sesiAbsensiEntries: Array.from(this.sesiAbsensiMap.entries()),
      };
      writeFileSync(STORE_FILE, JSON.stringify(payload, null, 2), "utf-8");
    } catch (err) {
      console.warn("Failed to persist store:", err);
    }
  }

  updateStats(): void {
    this.dashboardStats.total_kelas = this.kelas.length;
    this.dashboardStats.total_guru = this.guru.length;
    this.ringkasanAbsensi.total_kelas = this.kelas.length;
  }

  // Helper untuk membuat session key
  getSessionKey(kelas: string, mapel: string, tanggal: string): string {
    const rawTgl = (tanggal || "2026-06-06").trim();
    const normTgl = rawTgl.includes("T") ? rawTgl.split("T")[0] : rawTgl;
    return `${(kelas || "X RPL 1").trim()}__${(mapel || "Pemrograman Web").trim()}__${normTgl}`;
  }

  getAbsensiSesi(kelas: string, mapel: string, tanggal: string): SiswaAbsensiItem[] {
    const key = this.getSessionKey(kelas, mapel, tanggal);
    if (this.sesiAbsensiMap.has(key)) {
      return this.sesiAbsensiMap.get(key)!;
    }
    const template = this.siswaPerKelas[kelas] || this.siswaPerKelas["X RPL 1"] || [];
    const cloned: SiswaAbsensiItem[] = JSON.parse(JSON.stringify(template));
    this.sesiAbsensiMap.set(key, cloned);
    this.persist();
    return cloned;
  }

  saveAbsensiSesi(kelas: string, mapel: string, tanggal: string, siswaList: SiswaAbsensiItem[]): void {
    const key = this.getSessionKey(kelas, mapel, tanggal);
    this.sesiAbsensiMap.set(key, JSON.parse(JSON.stringify(siswaList)));
    this.persist();
  }

  updateStudentStatus(kelas: string, mapel: string, tanggal: string, siswaId: string, status: "Hadir" | "Izin" | "Sakit" | "Alpa"): void {
    const current = this.getAbsensiSesi(kelas, mapel, tanggal);
    const updated = current.map((s) => (s.id === siswaId ? { ...s, status } : s));
    this.saveAbsensiSesi(kelas, mapel, tanggal, updated);
  }

  deleteStudentFromSession(kelas: string, mapel: string, tanggal: string, siswaId: string): void {
    const current = this.getAbsensiSesi(kelas, mapel, tanggal);
    const updated = current.filter((s) => s.id !== siswaId);
    this.saveAbsensiSesi(kelas, mapel, tanggal, updated);
  }
}

export const store = new DataStore();
