/**
 * Backend Form & Dashboard RBM — Taman Nasional Tambora
 * ------------------------------------------------------
 * Dipasang sebagai Google Apps Script yang TERIKAT (bound) pada Google Sheets kantor.
 * Butuh juga file Rencana.gs (dibuat otomatis oleh scripts/excel_to_rencana.py).
 *
 * Langkah singkat (detail di README.md):
 *   1. Buat Google Sheets baru → Ekstensi → Apps Script.
 *   2. Tempel Code.gs, Rencana.gs, dan LaporanBulanan.gs.
 *   3. Jalankan fungsi setup() sekali → izinkan akses → lihat kode akses resor di sheet "Pengaturan".
 *   4. Terapkan → Deployment baru → Aplikasi web
 *        Jalankan sebagai : Saya (akun kantor)
 *        Akses            : Siapa saja
 *   5. Salin URL /exec ke assets/config.js di repository.
 *
 * Atur zona waktu proyek Apps Script ke Asia/Makassar (Setelan proyek → Zona waktu).
 *
 * Data publik (doGet) SENGAJA hanya berisi angka rekap: tanpa nama petugas,
 * catatan, koordinat, maupun link bukti dukung.
 */

var SHEET_LAPORAN = 'Laporan';
var SHEET_PENGATURAN = 'Pengaturan';
var STATUS = ['Menunggu', 'Diterima', 'Revisi', 'Ditolak'];

var KOLOM = [
  'ID', 'Waktu Kirim', 'Tanggal Pelaksanaan', 'Bulan', 'Kode Resor', 'Resor',
  'Nama Petugas', 'Indikator', 'Kode Kegiatan', 'Jenis Kegiatan', 'Sesuai Rencana',
  'Volume', 'Satuan', 'Lokasi', 'Koordinat', 'Catatan Hasil', 'Bukti Dukung',
  'Revisi dari ID', 'Status', 'Catatan Verifikator', 'Tanggal Verifikasi'
];
var COL = {}; KOLOM.forEach(function (k, i) { COL[k] = i + 1; });

var MAKS_FILE = 5;                 // jumlah file bukti per laporan
var MAKS_TOTAL_BYTES = 20 * 1024 * 1024; // total bukti (setelah decode)
var MAKS_KIRIM_PER_10MENIT = 20;   // per resor, rem sederhana terhadap spam

/* ======================= SETUP ======================= */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();

  // Sheet Laporan
  var sh = ss.getSheetByName(SHEET_LAPORAN) || ss.insertSheet(SHEET_LAPORAN);
  if (sh.getLastRow() === 0) {
    sh.appendRow(KOLOM);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, KOLOM.length).setFontWeight('bold').setBackground('#e8f0e8');
  }
  var aturan = SpreadsheetApp.newDataValidation().requireValueInList(STATUS, true).setAllowInvalid(false).build();
  sh.getRange(2, COL['Status'], sh.getMaxRows() - 1, 1).setDataValidation(aturan);
  sh.setColumnWidth(COL['Catatan Hasil'], 320);
  sh.setColumnWidth(COL['Bukti Dukung'], 260);

  // Warna status
  var rngStatus = sh.getRange(2, COL['Status'], sh.getMaxRows() - 1, 1);
  var warna = { 'Diterima': '#d7f0d7', 'Revisi': '#fdebc8', 'Ditolak': '#f8d4d4', 'Menunggu': '#eeeeee' };
  var rules = Object.keys(warna).map(function (s) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(s).setBackground(warna[s]).setRanges([rngStatus]).build();
  });
  sh.setConditionalFormatRules(rules);

  // Folder bukti di Drive
  if (!props.getProperty('BUKTI_FOLDER_ID')) {
    var folder = DriveApp.createFolder('Bukti Dukung RBM ' + RENCANA.tahun);
    props.setProperty('BUKTI_FOLDER_ID', folder.getId());
  }

  // Kode akses per resor (dibuat acak bila belum ada)
  Object.keys(RENCANA.resor).forEach(function (rid) {
    if (!props.getProperty('KODE_' + rid)) {
      props.setProperty('KODE_' + rid, String(Math.floor(100000 + Math.random() * 900000)));
    }
  });
  tulisPengaturan_();
  setupLaporanBulanan(); // sheet Pengesahan & folder laporan bulanan (LaporanBulanan.gs)
  Logger.log('Setup selesai. Kode akses ada di sheet "Pengaturan".');
}

/** Tulis ulang sheet Pengaturan (kode akses & folder). Sheet ini jangan dibagikan. */
function tulisPengaturan_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var sh = ss.getSheetByName(SHEET_PENGATURAN) || ss.insertSheet(SHEET_PENGATURAN);
  sh.clear();
  sh.appendRow(['Kode Resor', 'Nama Resor', 'Kode Akses Form']);
  Object.keys(RENCANA.resor).forEach(function (rid) {
    sh.appendRow([rid, RENCANA.resor[rid], props.getProperty('KODE_' + rid)]);
  });
  sh.appendRow(['']); // baris pemisah (appendRow menolak array kosong)
  sh.appendRow(['Folder bukti', 'https://drive.google.com/drive/folders/' + props.getProperty('BUKTI_FOLDER_ID')]);
  sh.appendRow(['Catatan', 'Ganti kode: jalankan gantiKodeAkses("R1") di editor Apps Script.']);
  sh.getRange(1, 1, 1, 3).setFontWeight('bold');
}

/** Ganti kode akses satu resor, mis. bila bocor. Contoh: gantiKodeAkses('R3') */
function gantiKodeAkses(rid) {
  if (!RENCANA.resor[rid]) throw new Error('Kode resor tidak dikenal: ' + rid);
  PropertiesService.getScriptProperties().setProperty('KODE_' + rid, String(Math.floor(100000 + Math.random() * 900000)));
  tulisPengaturan_();
}

/** Simple trigger: cap tanggal verifikasi saat kolom Status diubah. */
function onEdit(e) {
  var sh = e.range.getSheet();
  if (sh.getName() !== SHEET_LAPORAN || e.range.getColumn() !== COL['Status'] || e.range.getRow() < 2) return;
  sh.getRange(e.range.getRow(), COL['Tanggal Verifikasi']).setValue(e.value && e.value !== 'Menunggu' ? new Date() : '');
}

/* ======================= TERIMA LAPORAN ======================= */

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (d && d.aksi === 'laporan_bulanan') return json_(laporanBulananWeb_(d)); // lihat LaporanBulanan.gs
    var err = validasi_(d);
    if (err) return json_({ ok: false, error: err });

    if (!rem_(d.resor)) return json_({ ok: false, error: 'Terlalu banyak kiriman dari resor ini dalam 10 menit terakhir. Coba lagi nanti.' });

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LAPORAN);
      // nomor urut disimpan di Script Properties agar tidak dobel walau ada baris yang dihapus
      var props = PropertiesService.getScriptProperties();
      var no = Number(props.getProperty('NO_URUT') || 0) + 1;
      props.setProperty('NO_URUT', String(no));
      var id = 'LAP-' + RENCANA.tahun + '-' + ('0000' + no).slice(-4);
      var links = simpanBukti_(id, d);

      var keg = RENCANA.kegiatan[d.kegiatan];
      var sesuai = keg ? 'Ya' : 'Tidak';
      var p = d.tanggal.split('-').map(Number);
      var tgl = new Date(p[0], p[1] - 1, p[2]); // tengah malam zona waktu proyek Apps Script
      sh.appendRow([
        id, new Date(), tgl, tgl.getMonth() + 1, d.resor, RENCANA.resor[d.resor],
        teks_(d.petugas, 100), keg ? keg.indikator : teks_(d.indikator, 120), keg ? d.kegiatan : 'LUAR-RENCANA',
        keg ? keg.nama : teks_(d.kegiatan_lain, 200), sesuai,
        Number(d.volume) || 1, keg ? keg.satuan : teks_(d.satuan_lain || 'Kegiatan', 40),
        teks_(d.lokasi, 200), teks_(d.koordinat, 60), teks_(d.catatan, 5000), links.join('\n'),
        teks_(d.revisi_dari, 20), 'Menunggu', '', ''
      ]);
      return json_({ ok: true, id: id, sesuai: sesuai });
    } finally {
      lock.releaseLock();
    }
  } catch (ex) {
    return json_({ ok: false, error: 'Gagal memproses laporan: ' + ex.message });
  }
}

function validasi_(d) {
  var props = PropertiesService.getScriptProperties();
  if (!d || !RENCANA.resor[d.resor]) return 'Resor tidak valid.';
  if (String(d.kode_akses || '') !== props.getProperty('KODE_' + d.resor)) return 'Kode akses tidak cocok untuk ' + RENCANA.resor[d.resor] + '.';
  if (!d.petugas || String(d.petugas).trim().length < 3) return 'Nama petugas wajib diisi.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.tanggal || '')) return 'Tanggal pelaksanaan tidak valid.';
  var pt = d.tanggal.split('-').map(Number);
  var t = new Date(pt[0], pt[1] - 1, pt[2]);
  if (pt[0] !== RENCANA.tahun || t.getMonth() !== pt[1] - 1) return 'Tanggal harus di tahun ' + RENCANA.tahun + '.';
  if (t.getTime() > Date.now() + 86400000) return 'Tanggal pelaksanaan tidak boleh di masa depan.';
  if (d.kegiatan === 'LUAR-RENCANA') {
    if (!d.kegiatan_lain || String(d.kegiatan_lain).trim().length < 5) return 'Nama kegiatan di luar rencana wajib diisi.';
  } else {
    var keg = RENCANA.kegiatan[d.kegiatan];
    if (!keg) return 'Jenis kegiatan tidak dikenal.';
    if (keg.resor !== d.resor) return 'Kegiatan tersebut bukan rencana ' + RENCANA.resor[d.resor] + '.';
  }
  var v = Number(d.volume);
  if (!(v > 0) || v > 100000) return 'Volume capaian tidak valid.';
  if (!d.catatan || String(d.catatan).trim().length < 30) return 'Catatan hasil kegiatan minimal 30 karakter.';
  if (!d.bukti || !d.bukti.length) return 'Minimal satu file bukti dukung.';
  if (d.bukti.length > MAKS_FILE) return 'Maksimal ' + MAKS_FILE + ' file bukti.';
  for (var i = 0; i < d.bukti.length; i++) {
    if (!/^image\/(jpeg|png|webp)$|^application\/pdf$/.test(String(d.bukti[i].type || ''))) return 'Tipe file tidak diizinkan: ' + d.bukti[i].name;
  }
  return null;
}

function simpanBukti_(id, d) {
  var root = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('BUKTI_FOLDER_ID'));
  var nama = RENCANA.resor[d.resor];
  var it = root.getFoldersByName(nama);
  var folder = it.hasNext() ? it.next() : root.createFolder(nama);

  var total = 0, links = [];
  d.bukti.forEach(function (f, i) {
    var mime = String(f.type || '');
    if (!/^image\/(jpeg|png|webp)$|^application\/pdf$/.test(mime)) throw new Error('Tipe file tidak diizinkan: ' + mime);
    var bytes = Utilities.base64Decode(f.data);
    total += bytes.length;
    if (total > MAKS_TOTAL_BYTES) throw new Error('Total ukuran bukti melebihi 20 MB.');
    var namaFile = id + '_' + (i + 1) + '_' + String(f.name || 'bukti').replace(/[^\w.\-]+/g, '_').slice(0, 80);
    var file = folder.createFile(Utilities.newBlob(bytes, mime, namaFile));
    links.push(file.getUrl());
  });
  return links;
}

function rem_(rid) {
  var c = CacheService.getScriptCache();
  var k = 'kirim_' + rid;
  var n = Number(c.get(k) || 0);
  if (n >= MAKS_KIRIM_PER_10MENIT) return false;
  c.put(k, String(n + 1), 600);
  return true;
}

/* ======================= DATA DASHBOARD ======================= */

function doGet(e) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LAPORAN);
  var rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, KOLOM.length).getValues() : [];
  var laporan = rows.filter(function (r) { return r[0]; }).map(function (r) {
    var tgl = r[COL['Tanggal Pelaksanaan'] - 1];
    return {
      id: r[COL['ID'] - 1],
      tanggal: tgl instanceof Date ? Utilities.formatDate(tgl, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(tgl),
      bulan: Number(r[COL['Bulan'] - 1]),
      resor: r[COL['Kode Resor'] - 1],
      kegiatan: r[COL['Kode Kegiatan'] - 1],
      nama_kegiatan: r[COL['Kode Kegiatan'] - 1] === 'LUAR-RENCANA' ? r[COL['Jenis Kegiatan'] - 1] : '',
      sesuai: r[COL['Sesuai Rencana'] - 1] === 'Ya',
      volume: Number(r[COL['Volume'] - 1]) || 0,
      status: r[COL['Status'] - 1] || 'Menunggu'
    };
  });
  return json_({ ok: true, tahun: RENCANA.tahun, diperbarui: new Date().toISOString(), laporan: laporan });
}

/* ======================= UTIL ======================= */

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function teks_(v, maks) {
  // potong & netralkan awalan formula agar isian tidak dieksekusi Sheets
  var s = String(v == null ? '' : v).trim().slice(0, maks);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
