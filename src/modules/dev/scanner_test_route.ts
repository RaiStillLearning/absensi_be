import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../../config/database";
import { env } from "../../config/env";
import {
  classes,
  class_students,
  daily_attendance_records,
  daily_attendances,
  student_barcodes,
  students,
} from "../../config/schema";

export const dev_scanner_router = new Hono();

// Security guard: Ensure dev routes are only available in non-production environments
dev_scanner_router.use("*", async (c, next) => {
  if (env.APP_ENV === "production") {
    return c.notFound();
  }
  return next();
});

const TOKEN_CACHE_FILE = join(process.cwd(), ".dev_scanner_dummy_token.json");

/**
 * Get active dummy student and token information
 */
dev_scanner_router.get("/api/dummy-student-info", async (c) => {
  const dummy_nisn = "9999999901";

  const student = (
    await db.select().from(students).where(eq(students.nisn, dummy_nisn)).limit(1)
  )[0];

  if (!student) {
    return c.json({ success: false, message: "Dummy student not found. Run 'bun run db:seed' first." }, 404);
  }

  // Get active barcode
  const barcode = (
    await db
      .select()
      .from(student_barcodes)
      .where(
        and(
          eq(student_barcodes.student_id, student.id),
          eq(student_barcodes.is_active, true)
        )
      )
      .limit(1)
  )[0];

  let raw_token = "";
  if (existsSync(TOKEN_CACHE_FILE)) {
    try {
      const cached = JSON.parse(readFileSync(TOKEN_CACHE_FILE, "utf-8"));
      if (cached.token_hash === barcode?.token_hash) {
        raw_token = cached.token;
      }
    } catch {
      // Ignore cache error
    }
  }

  // Check today attendance status
  const attendance_record = (
    await db
      .select()
      .from(daily_attendance_records)
      .where(eq(daily_attendance_records.student_id, student.id))
      .limit(1)
  )[0];

  return c.json({
    success: true,
    data: {
      student_id: student.id,
      nisn: student.nisn,
      full_name: student.full_name,
      class_name: "X PPLG 1",
      token: raw_token,
      has_attended_today: Boolean(attendance_record),
      last_check_in_at: attendance_record?.check_in_at || null,
    },
  });
});

/**
 * Reset dummy student attendance records (Development only)
 */
dev_scanner_router.post("/api/reset-dummy-attendance", async (c) => {
  const dummy_nisn = "9999999901";

  const student = (
    await db.select().from(students).where(eq(students.nisn, dummy_nisn)).limit(1)
  )[0];

  if (!student) {
    return c.json({ success: false, message: "Dummy student not found" }, 404);
  }

  await db
    .delete(daily_attendance_records)
    .where(eq(daily_attendance_records.student_id, student.id));

  return c.json({
    success: true,
    message: "Data absensi dummy berhasil direset untuk pengujian ulang.",
  });
});

/**
 * HTML UI for Hardware Barcode Scanner Test (JR HC-P20)
 */
dev_scanner_router.get("/scanner-test", (c) => {
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hardware Barcode Scanner Test — JR HC-P20 | SMK Ghama Caraka</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --card-border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --success: #10b981;
      --success-bg: rgba(16, 185, 129, 0.15);
      --warning: #f59e0b;
      --warning-bg: rgba(245, 158, 11, 0.15);
      --error: #ef4444;
      --error-bg: rgba(239, 68, 68, 0.15);
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    body {
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .container {
      width: 100%;
      max-width: 900px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--card-border);
    }
    .header h1 {
      font-size: 20px;
      font-weight: 700;
      color: #fff;
    }
    .header p {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
      background: var(--success-bg);
      color: var(--success);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 8px var(--success);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
    }
    .scan-box {
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: #0f172a;
      border: 2px dashed #475569;
      border-radius: 12px;
      padding: 20px;
      transition: all 0.2s ease;
    }
    .scan-box.active {
      border-color: var(--primary);
      box-shadow: 0 0 15px rgba(59, 130, 246, 0.25);
    }
    .scan-box label {
      font-size: 14px;
      font-weight: 600;
      color: #93c5fd;
      display: flex;
      justify-content: space-between;
    }
    .scan-input {
      width: 100%;
      background: #1e293b;
      border: 2px solid #334155;
      border-radius: 8px;
      padding: 14px 18px;
      font-size: 18px;
      color: #fff;
      font-family: monospace;
      outline: none;
      transition: border-color 0.2s ease;
    }
    .scan-input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
    }
    .scan-hint {
      font-size: 12px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .result-banner {
      display: none;
      border-radius: 10px;
      padding: 16px 20px;
      animation: slideDown 0.25s ease forwards;
    }
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .result-banner.success {
      display: block;
      background: var(--success-bg);
      border: 1px solid var(--success);
      color: #ecfdf5;
    }
    .result-banner.duplicate {
      display: block;
      background: var(--warning-bg);
      border: 1px solid var(--warning);
      color: #fffbeb;
    }
    .result-banner.error {
      display: block;
      background: var(--error-bg);
      border: 1px solid var(--error);
      color: #fef2f2;
    }
    .result-title {
      font-size: 18px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .result-details {
      margin-top: 10px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
      background: rgba(0, 0, 0, 0.2);
      padding: 12px;
      border-radius: 8px;
    }
    .detail-item {
      display: flex;
      flex-direction: column;
    }
    .detail-label {
      font-size: 11px;
      text-transform: uppercase;
      opacity: 0.75;
      letter-spacing: 0.5px;
    }
    .detail-value {
      font-size: 15px;
      font-weight: 600;
      margin-top: 2px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    @media (max-width: 768px) {
      .grid-2 { grid-template-columns: 1fr; }
    }
    .qr-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 12px;
    }
    .qr-frame {
      background: #ffffff;
      padding: 12px;
      border-radius: 12px;
      display: inline-block;
      box-shadow: 0 4px 10px rgba(0,0,0,0.5);
    }
    .qr-frame img {
      display: block;
      width: 170px;
      height: 170px;
    }
    .token-text {
      font-family: monospace;
      font-size: 13px;
      background: #0f172a;
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid var(--card-border);
      word-break: break-all;
      color: #38bdf8;
      max-width: 100%;
    }
    .btn {
      cursor: pointer;
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 6px;
      border: none;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn-primary {
      background: var(--primary);
      color: #fff;
    }
    .btn-primary:hover {
      background: var(--primary-hover);
    }
    .btn-secondary {
      background: #334155;
      color: #f1f5f9;
    }
    .btn-secondary:hover {
      background: #475569;
    }
    .btn-danger {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.4);
    }
    .btn-danger:hover {
      background: rgba(239, 68, 68, 0.35);
    }
    .history-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      font-size: 13px;
    }
    .history-table th {
      text-align: left;
      padding: 8px 12px;
      background: #0f172a;
      color: var(--text-muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--card-border);
    }
    .history-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #293548;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-success { background: rgba(16,185,129,0.2); color: #34d399; }
    .badge-duplicate { background: rgba(245,158,11,0.2); color: #fbbf24; }
    .badge-error { background: rgba(239,68,68,0.2); color: #f87171; }
    .instructions {
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.6;
    }
    .instructions ol {
      padding-left: 18px;
      margin-top: 6px;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div>
        <h1>Hardware Barcode Scanner Test — JR HC-P20</h1>
        <p>Sistem Absensi Sekolah — SMK Ghama Caraka (Development Harness)</p>
      </div>
      <div class="status-badge" id="backendStatus">
        <span class="status-dot"></span>
        <span>Backend Online</span>
      </div>
    </div>

    <!-- Active Scanner Input Box -->
    <div class="scan-box active" id="scanBox">
      <label for="scanInput">
        <span>INPUT SCANNER (READY TO SCAN)</span>
        <span id="scannerStatusText" style="color: #34d399; font-size: 12px;">Auto-Focus Active • USB HID</span>
      </label>
      <input 
        type="text" 
        id="scanInput" 
        class="scan-input" 
        placeholder="Arahkan scanner HC-P20 ke barcode / QR code..." 
        autocomplete="off" 
        autofocus 
      />
      <div class="scan-hint">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <span>Scanner mengirim string + Enter otomatis. Fokus input dijaga terus-menerus tanpa perlu klik mouse.</span>
      </div>
    </div>

    <!-- Live Scan Result Card -->
    <div id="resultBanner" class="result-banner">
      <div id="resultTitle" class="result-title"></div>
      <div id="resultDetails" class="result-details"></div>
    </div>

    <!-- Split Section: QR Code on Screen & Test Controls -->
    <div class="grid-2">
      <!-- On Screen QR Code for direct physical scanner pointing -->
      <div class="card qr-card">
        <div style="width: 100%; display: flex; justify-content: space-between; align-items: center;">
          <h2 style="font-size: 15px; font-weight: 600;">Barcode Token Siswa Dummy</h2>
          <button class="btn btn-danger" id="btnResetAttendance" title="Hapus catatan kehadiran dummy hari ini agar bisa scan sukses kembali">
            ↺ Reset Absensi Hari Ini
          </button>
        </div>

        <div class="qr-frame" id="qrContainer">
          <img id="qrImage" src="" alt="QR Code Siswa Dummy" />
        </div>

        <div style="width: 100%; text-align: left;">
          <p style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">RAW TOKEN STRING:</p>
          <div class="token-text" id="tokenDisplay">Memuat token dummy...</div>
        </div>

        <div style="display: flex; gap: 8px; width: 100%;">
          <button class="btn btn-secondary" style="flex: 1;" id="btnSimulateScan">
            ⚡ Test Scan Token Ini
          </button>
          <button class="btn btn-secondary" style="flex: 1;" id="btnTestInvalid">
            ❌ Test Barcode Invalid
          </button>
        </div>
      </div>

      <!-- Hardware Test Instructions -->
      <div class="card">
        <h2 style="font-size: 15px; font-weight: 600; margin-bottom: 8px;">Panduan Uji Scanner JR HC-P20</h2>
        <div class="instructions">
          <ol>
            <li><strong>Koneksi USB</strong>: Colokkan kabel USB scanner JR HC-P20 ke MacBook.</li>
            <li><strong>Mode USB HID</strong>: Scanner dikenali sebagai USB Keyboard otomatis oleh macOS.</li>
            <li><strong>Auto Scan</strong>: Tempatkan scanner di atas meja. Sensor infra merah scanner akan otomatis menyala saat objek barcode mendekat.</li>
            <li><strong>Arahkan ke QR Code</strong>: Arahkan layar HP atau cetakan QR Code di samping ke moncong scanner HC-P20.</li>
            <li><strong>Bip & Enter</strong>: Scanner akan berbunyi bip, mengetik token ke input di atas, lalu mengirim tombol Enter.</li>
            <li><strong>Tanpa Klik Mouse</strong>: Hasil absensi langsung muncul di atas secara instan dan input otomatis siap kembali untuk scan berikutnya.</li>
          </ol>
        </div>

        <div style="margin-top: 14px; padding: 10px; background: #0f172a; border-radius: 8px; border: 1px solid var(--card-border);">
          <div style="font-size: 12px; font-weight: 600; color: #38bdf8;">Hardware Info:</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
            JRKK / CASHCOW HC-P20 2D Omnidirectional Desktop Barcode Scanner • USB Wired HID Interface
          </div>
        </div>
      </div>
    </div>

    <!-- Scan History Log -->
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h2 style="font-size: 15px; font-weight: 600;">Riwayat Scan Sesi Ini (Real-Time)</h2>
        <span id="scanCount" style="font-size: 12px; color: var(--text-muted);">0 scan tercatat</span>
      </div>
      <div style="overflow-x: auto;">
        <table class="history-table">
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Token Preview</th>
              <th>Nama Siswa</th>
              <th>Status</th>
              <th>Pesan</th>
            </tr>
          </thead>
          <tbody id="historyBody">
            <tr>
              <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">
                Belum ada scan yang dilakukan. Arahkan scanner ke barcode.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    // Web Audio API beep synthesizer for instant hardware audio feedback
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    function playBeep(type) {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'success') {
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch A5
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
      } else if (type === 'duplicate') {
        // Double tone warning
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
      } else {
        // Low error buzz
        osc.frequency.setValueAtTime(220, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
      }
    }

    const scanInput = document.getElementById('scanInput');
    const resultBanner = document.getElementById('resultBanner');
    const resultTitle = document.getElementById('resultTitle');
    const resultDetails = document.getElementById('resultDetails');
    const historyBody = document.getElementById('historyBody');
    const scanCountEl = document.getElementById('scanCount');
    const tokenDisplay = document.getElementById('tokenDisplay');
    const qrImage = document.getElementById('qrImage');
    const btnSimulateScan = document.getElementById('btnSimulateScan');
    const btnTestInvalid = document.getElementById('btnTestInvalid');
    const btnResetAttendance = document.getElementById('btnResetAttendance');

    let activeDummyToken = '';
    let scanHistory = [];
    let isSubmitting = false;
    let autoSubmitTimer = null;

    // Enforce permanent focus on scan input for hands-free scanning
    function keepFocus() {
      if (document.activeElement !== scanInput) {
        scanInput.focus();
      }
    }

    document.addEventListener('click', (e) => {
      // Don't hijack focus if clicking buttons
      if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A') {
        keepFocus();
      }
    });

    window.addEventListener('focus', keepFocus);
    window.addEventListener('load', keepFocus);

    // Fetch dummy student info on load
    async function loadDummyInfo() {
      try {
        const res = await fetch('/dev/api/dummy-student-info');
        const json = await res.json();
        if (json.success && json.data.token) {
          activeDummyToken = json.data.token;
          tokenDisplay.textContent = activeDummyToken;
          // Generate QR Code on screen via safe reliable QR generator API
          qrImage.src = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(activeDummyToken);
        } else {
          tokenDisplay.textContent = 'Token belum di-seed. Jalankan "bun run db:seed"';
        }
      } catch (err) {
        tokenDisplay.textContent = 'Gagal memuat info dummy student.';
      }
    }

    loadDummyInfo();

    // Reset dummy student attendance
    btnResetAttendance.addEventListener('click', async () => {
      try {
        const res = await fetch('/dev/api/reset-dummy-attendance', { method: 'POST' });
        const json = await res.json();
        if (json.success) {
          showResult('success', 'Status Absensi Direset', {
            'Info': json.message,
            'Status Siswa': 'Siap melakukan absensi kembali'
          });
          playBeep('success');
        }
      } catch (err) {
        alert('Gagal mereset absensi: ' + err.message);
      }
      keepFocus();
    });

    // Simulate scan buttons for instant testing
    btnSimulateScan.addEventListener('click', () => {
      if (!activeDummyToken) {
        alert('Token dummy belum tersedia. Jalankan seed terlebih dahulu.');
        return;
      }
      scanInput.value = activeDummyToken;
      handleScanSubmit(activeDummyToken);
    });

    btnTestInvalid.addEventListener('click', () => {
      const invalidToken = 'ghama_invalid_token_99999999';
      scanInput.value = invalidToken;
      handleScanSubmit(invalidToken);
    });

    // Scanner key listener (Enter suffix)
    scanInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (autoSubmitTimer) clearTimeout(autoSubmitTimer);
        const val = scanInput.value.trim();
        if (val) {
          handleScanSubmit(val);
        }
      }
    });

    // Fallback: Auto-submit after 300ms pause if scanner doesn't send Enter suffix
    scanInput.addEventListener('input', () => {
      if (autoSubmitTimer) clearTimeout(autoSubmitTimer);
      const val = scanInput.value.trim();
      // If token length is substantial (e.g., > 15 chars typical for our random tokens)
      if (val.length >= 15) {
        autoSubmitTimer = setTimeout(() => {
          if (!isSubmitting && scanInput.value.trim()) {
            handleScanSubmit(scanInput.value.trim());
          }
        }, 300);
      }
    });

    // Core Scan Submission to API
    async function handleScanSubmit(rawToken) {
      if (isSubmitting) return;
      isSubmitting = true;
      scanInput.disabled = true;

      const scanTime = new Date();
      const requestId = crypto.randomUUID();

      try {
        const res = await fetch('/api/v1/attendance/daily/scan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            barcode_token: rawToken,
            request_id: requestId,
          }),
        });

        const json = await res.json();

        if (res.status === 200 && json.success) {
          // Success
          playBeep('success');
          showResult('success', '✓ Absensi Berhasil Tercatat', {
            'Nama Siswa': json.data.student_name,
            'NISN': json.data.nisn,
            'Kelas': json.data.class_name,
            'Status': json.data.attendance_status.toUpperCase(),
            'Waktu Scan': new Date(json.data.check_in_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB',
          });
          addHistoryRecord(scanTime, rawToken, json.data.student_name, 'SUCCESS', 'Absensi berhasil');
        } else if (res.status === 409) {
          // Duplicate
          playBeep('duplicate');
          showResult('duplicate', '⚠️ ' + json.message, {
            'Status': 'SUDAH ABSEN',
            'Keterangan': 'Siswa telah tercatat hadir pada sesi absensi ini.',
            'Waktu Percobaan': scanTime.toLocaleTimeString('id-ID') + ' WIB'
          });
          addHistoryRecord(scanTime, rawToken, 'TEST SISWA BARCODE', 'DUPLICATE', json.message);
        } else {
          // Invalid or error
          playBeep('error');
          showResult('error', '❌ ' + (json.message || 'Gagal Melakukan Absensi'), {
            'Kode Status': res.status,
            'Token Diterima': rawToken.substring(0, 15) + '...',
            'Pesan Sistem': json.message || 'Barcode tidak valid'
          });
          addHistoryRecord(scanTime, rawToken, '-', 'ERROR', json.message || 'Error');
        }
      } catch (err) {
        playBeep('error');
        showResult('error', '❌ Koneksi Terputus', {
          'Error': err.message,
          'Saran': 'Pastikan backend server sedang berjalan di port 3000.'
        });
        addHistoryRecord(scanTime, rawToken, '-', 'FAILED', err.message);
      } finally {
        isSubmitting = false;
        scanInput.disabled = false;
        scanInput.value = '';
        keepFocus();
      }
    }

    function showResult(type, title, details) {
      resultBanner.className = 'result-banner ' + type;
      resultTitle.textContent = title;

      let detailsHtml = '';
      for (const [key, val] of Object.entries(details)) {
        detailsHtml += '<div class="detail-item"><span class="detail-label">' + key + '</span><span class="detail-value">' + val + '</span></div>';
      }
      resultDetails.innerHTML = detailsHtml;
    }

    function addHistoryRecord(time, token, name, status, message) {
      const timeStr = time.toLocaleTimeString('id-ID');
      const tokenPreview = token.length > 12 ? token.substring(0, 10) + '...' : token;
      
      scanHistory.unshift({
        time: timeStr,
        token: tokenPreview,
        name: name,
        status: status,
        message: message
      });

      if (scanHistory.length > 15) scanHistory.pop();

      scanCountEl.textContent = scanHistory.length + ' scan tercatat';

      let html = '';
      for (const rec of scanHistory) {
        let badgeClass = 'badge-success';
        if (rec.status === 'DUPLICATE') badgeClass = 'badge-duplicate';
        if (rec.status === 'ERROR' || rec.status === 'FAILED') badgeClass = 'badge-error';

        html += '<tr>' +
          '<td>' + rec.time + '</td>' +
          '<td style="font-family: monospace;">' + rec.token + '</td>' +
          '<td><strong>' + rec.name + '</strong></td>' +
          '<td><span class="badge ' + badgeClass + '">' + rec.status + '</span></td>' +
          '<td style="color: var(--text-muted);">' + rec.message + '</td>' +
          '</tr>';
      }
      historyBody.innerHTML = html;
    }
  </script>
</body>
</html>`;

  return c.html(html);
});

