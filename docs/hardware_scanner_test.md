# Panduan Pengujian Hardware Barcode Scanner — JR HC-P20
## Sistem Absensi Sekolah — SMK Ghama Caraka

Dokumen ini memuat panduan lengkap untuk melakukan pengujian integrasi hardware barcode scanner **JRKK / CASHCOW HC-P20 (2D Omnidirectional Desktop Barcode Scanner)** dengan backend Sistem Absensi Sekolah.

---

## 1. Spesifikasi Hardware

* **Brand**: JRKK / CASHCOW
* **Model**: HC-P20
* **Tipe**: 2D Omnidirectional Desktop Barcode Scanner
* **Interface**: USB Wired (USB HID POS / USB HID Keyboard)
* **Default Mode**: Auto-sensing / Auto-Scan (sensor menyala otomatis saat mendeteksi barcode)
* **Karakter Suffix Bawaan**: `Enter` (`CR` / `LF`)

---

## 2. Cara Menjalankan PostgreSQL

Pastikan Docker Desktop aktif di Mac Anda, lalu jalankan:

```bash
docker compose up -d
```

Verifikasi bahwa container `absensi-postgres` berstatus sehat:

```bash
docker compose ps
```

---

## 3. Cara Menjalankan Seed Siswa Dummy

Jalankan perintah seed untuk membuat satu siswa dummy, kelas, sesi absensi hari ini, dan barcode token unik:

```bash
bun run db:seed
```

Script ini **idempotent** (aman dijalankan berkali-kali tanpa menghasilkan data duplikat).

---

## 4. Cara Mendapatkan Barcode Token Pengujian

Setelah menjalankan `bun run db:seed`, token acak aman akan ditampilkan di konsol terminal:

```text
STUDENT CREATED:
NISN: 9999999901
NAME: TEST SISWA BARCODE
CLASS: X PPLG 1

BARCODE TOKEN:
ghama_scan_ed575058483d0003d89f142a969b3b31

BARCODE FORMAT:
QR_CODE

IMPORTANT:
Save this token for barcode generation.
```

> [!NOTE]
> Token mentah (*plaintext*) hanya disimpan di sisi client/seed dan tidak disimpan di database. Database hanya menyimpan hash SHA-256 (`token_hash`) demi keamanan.

---

## 5. Cara Mengubah Token Menjadi QR Code

Ada beberapa cara mudah untuk mengubah token menjadi QR Code:

### Opsi A (Paling Mudah — Langsung dari Halaman Test)
Buka halaman `http://localhost:3000/dev/scanner-test`. Halaman ini **otomatis menampilkan QR Code visual** dari token siswa dummy aktif di layar MacBook Anda. Anda bisa langsung mengarahkan scanner HC-P20 ke layar.

### Opsi B (Buka di Layar Ponsel)
Generate QR Code melalui URL generator aman:
```text
https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=ghama_scan_ed575058483d0003d89f142a969b3b31
```
Buka URL di atas di browser ponsel Anda, lalu arahkan layar ponsel ke depan scanner HC-P20.

---

## 6. Cara Menghubungkan Scanner HC-P20 ke Mac

1. Colokkan kabel USB scanner HC-P20 ke port USB / hub adaptor MacBook Anda.
2. Lampu scanner akan menyala dan berbunyi satu kali tanda daya masuk.
3. macOS mengenali scanner sebagai **USB Keyboard (HID)** secara otomatis (*Plug & Play*, tidak membutuhkan driver khusus).
4. Letakkan scanner di meja dengan sudut menghadap ke depan. Sensor auto-sensing akan menyala otomatis saat barcode didekatkan.

---

## 7. Cara Menguji Scanner Melalui Halaman Development

1. Jalankan server backend:
   ```bash
   bun run dev
   ```
2. Buka browser dan akses:
   [http://localhost:3000/dev/scanner-test](http://localhost:3000/dev/scanner-test)
3. Pastikan indikator berstatus hijau: **Backend Online**.
4. Kolom input **"INPUT SCANNER"** otomatis terfokus dan terus dijaga fokusnya.
5. Arahkan QR code (di layar HP atau cetakan) ke moncong scanner HC-P20.
6. **Alur Scan Otomatis**:
   * Scanner membaca QR code dan mengeluarkan bunyi *bip* hardware.
   * Scanner mengetik token ke kolom input dan mengirim tombol `Enter`.
   * Frontend mengirim `POST /api/v1/attendance/daily/scan` ke backend.
   * Muncul banner hijau: **"✓ Absensi Berhasil Tercatat"**, nama siswa **TEST SISWA BARCODE**, kelas **X PPLG 1**, dan waktu scan.
   * Speaker browser mengeluarkan bunyi *bip konfirmasi*.
   * Input otomatis dikosongkan dan siap menerima scan berikutnya tanpa perlu klik mouse atau reload halaman.

---

## 8. Cara Menguji Scan Duplikat

1. Setelah scan pertama berhasil, arahkan kembali barcode yang sama ke scanner HC-P20.
2. Scanner akan mengirim token yang sama.
3. Backend menolak dengan status HTTP `409 Conflict`.
4. Halaman menampilkan banner peringatan oranye:
   ```text
   ⚠️ Siswa sudah melakukan absensi
   ```
5. Untuk mereset absensi dummy agar bisa menguji scan sukses kembali, klik tombol **"↺ Reset Absensi Hari Ini"** di halaman test.

---

## 9. Cara Menguji Barcode Invalid

1. Di halaman scanner test, klik tombol **"❌ Test Barcode Invalid"** atau scan sembarang barcode/QR code barang lain (misalnya barcode buku, makanan, atau teks acak).
2. Backend mencari hash token dan tidak menemukannya di database.
3. Backend menolak dengan status HTTP `404 Not Found`.
4. Halaman menampilkan banner merah:
   ```text
   ❌ Barcode tidak valid
   ```

---

## 10. Cara Memastikan Data Benar-Benar Masuk PostgreSQL

Anda dapat memverifikasi langsung data yang tersimpan di database PostgreSQL melalui command line:

```bash
bun -e "
import { queryClient } from './src/config/database';
const records = await queryClient\`
  SELECT r.id, s.full_name, s.nisn, c.name as class_name, r.attendance_status, r.check_in_at 
  FROM daily_attendance_records r
  JOIN students s ON r.student_id = s.id
  JOIN daily_attendances a ON r.daily_attendance_id = a.id
  JOIN classes c ON a.class_id = c.id;
\`;
console.table(records);
await queryClient.end();
"
```

Output akan menampilkan baris absensi riil siswa:

| id | full_name | nisn | class_name | attendance_status | check_in_at |
|---|---|---|---|---|---|
| `<uuid>` | TEST SISWA BARCODE | 9999999901 | X PPLG 1 | present | `2026-11-06 ...` |

