/**
 * Laporan Bulanan RBM (PDF) — Taman Nasional Tambora
 * ---------------------------------------------------
 * Membuat PDF laporan bulanan per resor dari laporan berstatus "Diterima":
 *   cover → lembar pengesahan → rangkuman hasil → lampiran dokumentasi per jenis kegiatan.
 *
 * Bentuk dokumen diambil dari TEMPLATE Google Docs (hasil konversi
 * templates/Template_Laporan_Bulanan_RBM.docx). Placeholder {{...}} di template
 * diganti otomatis; {{ISI_LAPORAN}} dan {{LAMPIRAN}} diganti tabel & foto.
 *
 * Dua jalur:
 *   1. Resor   : halaman laporan/ di GitHub Pages → doPost {aksi:'laporan_bulanan'} + kode akses.
 *   2. Verifikator : menu "RBM → Buat laporan bulanan (PDF)…" di Google Sheets.
 *
 * Pasang: tempel file ini sebagai LaporanBulanan.gs, jalankan setupLaporanBulanan() sekali,
 * isi URL template di sheet "Pengesahan", lalu buat deployment versi baru.
 */

var SHEET_PENGESAHAN = 'Pengesahan';
var BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
var MAKS_PDF_PER_10MENIT = 5;              // per resor, lewat web
var MAKS_PDF_WEB_BYTES = 30 * 1024 * 1024; // di atas ini, PDF hanya bisa diambil verifikator dari Drive
var FONT = 'Arial';

// Isi awal sheet Pengesahan. Setelah sheet dibuat, ubah nama/NIP di SHEET, bukan di sini.
var PEJABAT_AWAL = [
  ['BALAI', 'Kepala Balai Taman Nasional Tambora', 'Abdul Azis Bakry, S.Pi., M.Si.', '197307281999031003', 'Dompu'],
  ['SPTN Wilayah I Kore', 'Kepala SPTN Wilayah I Kore', 'Santiago Pereira, S.P., M.M.', '197409261995101001', 'Kore'],
  ['SPTN Wilayah II Pekat', 'Kepala SPTN Wilayah II Pekat', 'Abdul Basit Nasriyanto, S.Hut., M.Sc.', '197305171999031001', 'Pekat']
];

/* ======================= SETUP ======================= */

function setupLaporanBulanan() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var sh = ss.getSheetByName(SHEET_PENGESAHAN);
  if (!sh) {
    sh = ss.insertSheet(SHEET_PENGESAHAN);
    sh.getRange('A:E').setNumberFormat('@'); // NIP 18 digit harus teks, bukan angka
    var rows = [['Kunci', 'Jabatan (tertulis di laporan)', 'Nama', 'NIP', 'Tempat']].concat(PEJABAT_AWAL);
    sh.getRange(1, 1, rows.length, 5).setValues(rows);
    sh.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#e8f0e8');
    var r = rows.length + 2;
    sh.getRange(r, 1, 3, 2).setValues([
      ['TEMPLATE', ''],
      ['Catatan', 'Tempel URL Google Docs template laporan di sel B' + r + '. Kolom "Kunci" jangan diubah (harus sama dengan nama SPTN di rencana).'],
      ['Catatan', 'Bila pejabat berganti, cukup ubah Nama/NIP di sheet ini. Kepala Resor diketik oleh resor saat mengunduh.']
    ]);
    sh.getRange(r, 1).setFontWeight('bold');
    sh.setColumnWidth(2, 260); sh.setColumnWidth(3, 260); sh.setColumnWidth(4, 170);
  }
  if (!props.getProperty('LAPBUL_FOLDER_ID')) {
    props.setProperty('LAPBUL_FOLDER_ID', DriveApp.createFolder('Laporan Bulanan RBM ' + RENCANA.tahun).getId());
  }
  Logger.log('Sheet "Pengesahan" siap. Isi URL template, lalu buat deployment versi baru.');
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('RBM')
    .addItem('Buat laporan bulanan (PDF)…', 'bukaDialogLaporan')
    .addToUi();
}

/* ======================= JALUR WEB (RESOR) ======================= */

/** Dipanggil dari doPost bila d.aksi === 'laporan_bulanan'. */
function laporanBulananWeb_(d) {
  try {
    if (!d || !RENCANA.resor[d.resor]) return { ok: false, error: 'Resor tidak valid.' };
    var kode = PropertiesService.getScriptProperties().getProperty('KODE_' + d.resor);
    if (String(d.kode_akses || '') !== kode) return { ok: false, error: 'Kode akses tidak cocok untuk ' + RENCANA.resor[d.resor] + '.' };
    var o = opsi_(d);
    if (typeof o === 'string') return { ok: false, error: o };
    if (!remPdf_(d.resor)) return { ok: false, error: 'Terlalu banyak permintaan PDF dari resor ini. Coba lagi 10 menit lagi.' };

    var h = buatLaporanBulanan_(o);
    var bytes = h.pdf.getBytes();
    if (bytes.length > MAKS_PDF_WEB_BYTES) {
      return { ok: false, error: 'PDF berhasil dibuat tetapi terlalu besar (' + (bytes.length / 1048576).toFixed(1) + ' MB) untuk diunduh lewat web. Hubungi verifikator; file tersimpan di Drive kantor dengan nama "' + h.namaFile + '.pdf".' };
    }
    return {
      ok: true, nama: h.namaFile + '.pdf', pdf: Utilities.base64Encode(bytes),
      jumlah: h.jumlah, foto: h.foto, menunggu: h.menunggu
    };
  } catch (ex) {
    return { ok: false, error: ex.message };
  }
}

function remPdf_(rid) {
  var c = CacheService.getScriptCache(), k = 'pdf_' + rid, n = Number(c.get(k) || 0);
  if (n >= MAKS_PDF_PER_10MENIT) return false;
  c.put(k, String(n + 1), 600);
  return true;
}

/* ======================= JALUR MENU (VERIFIKATOR) ======================= */

function bukaDialogLaporan() {
  var bulanNow = bulanMaks_();
  var optResor = Object.keys(RENCANA.resor).map(function (r) {
    return '<option value="' + r + '" data-tempat="' + esc_(tempatResor_(r)) + '">' + esc_(RENCANA.resor[r]) + ' — ' + esc_(RENCANA.sptn[r]) + '</option>';
  }).join('');
  var optBulan = BULAN_ID.slice(0, bulanNow).map(function (b, i) {
    return '<option value="' + (i + 1) + '"' + (i + 1 === Math.max(1, bulanNow - 1) ? ' selected' : '') + '>' + b + ' ' + RENCANA.tahun + '</option>';
  }).join('');
  var html = [
    '<style>body{font:14px Arial,sans-serif;margin:0}label{display:block;font-weight:bold;margin:10px 0 4px}',
    'input,select,textarea{width:100%;box-sizing:border-box;padding:6px;font:inherit}textarea{height:60px}',
    'button{margin-top:14px;padding:8px 16px;font:inherit;font-weight:bold}#out{margin-top:12px}.err{color:#b00020}</style>',
    '<form id="f">',
    '<label>Resor</label><select name="resor" id="resor">' + optResor + '</select>',
    '<label>Bulan</label><select name="bulan">' + optBulan + '</select>',
    '<label>Nama Kepala Resor</label><input name="nama_kr" required maxlength="120">',
    '<label>NIP Kepala Resor</label><input name="nip_kr" required maxlength="24">',
    '<label>Dasar</label><textarea name="dasar" required maxlength="600" placeholder="mis. DIPA Balai TN Tambora TA 2026"></textarea>',
    '<label>Tempat penandatanganan</label><input name="tempat" id="tempat" maxlength="60">',
    '<button type="submit" id="b">Buat PDF</button></form><div id="out"></div>',
    '<script>',
    'var f=document.getElementById("f"),o=document.getElementById("out"),b=document.getElementById("b"),rs=document.getElementById("resor");',
    'function tp(){document.getElementById("tempat").value=rs.options[rs.selectedIndex].dataset.tempat;}rs.onchange=tp;tp();',
    'f.onsubmit=function(e){e.preventDefault();var d={};new FormData(f).forEach(function(v,k){d[k]=v;});',
    'b.disabled=true;o.textContent="Membuat dokumen… (bisa 1–3 menit bila fotonya banyak)";',
    'google.script.run.withSuccessHandler(function(r){b.disabled=false;o.innerHTML="<b>Selesai.</b> "+r.jumlah+" laporan, "+r.foto+" foto."+(r.menunggu?"<br>Catatan: "+r.menunggu+" laporan bulan ini masih Menunggu dan tidak dimuat.":"")+"<br><a target=_blank href=\'"+r.pdfUrl+"\'>Buka PDF</a> · <a target=_blank href=\'"+r.docUrl+"\'>Buka versi Google Docs (bisa disunting)</a>";})',
    '.withFailureHandler(function(e){b.disabled=false;o.innerHTML="<span class=err>"+(e.message||e)+"</span>";}).buatLaporanDariMenu(d);};',
    '</script>'
  ].join('');
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(480).setHeight(600), 'Laporan bulanan RBM');
}

/** Dipanggil dari dialog menu. Hanya pengguna yang bisa membuka Sheets ini yang dapat menjalankannya. */
function buatLaporanDariMenu(d) {
  var o = opsi_(d);
  if (typeof o === 'string') throw new Error(o);
  var h = buatLaporanBulanan_(o);
  return { pdfUrl: h.pdfUrl, docUrl: h.docUrl, jumlah: h.jumlah, foto: h.foto, menunggu: h.menunggu };
}

/* ======================= VALIDASI ======================= */

function bulanMaks_() {
  var now = new Date();
  if (now.getFullYear() > RENCANA.tahun) return 12;
  if (now.getFullYear() < RENCANA.tahun) return 0;
  return now.getMonth() + 1;
}

/** Kembalikan objek opsi yang sudah bersih, atau string pesan kesalahan. */
function opsi_(d) {
  var bersih = function (v, maks) { return String(v == null ? '' : v).replace(/[{}]/g, '').replace(/\s+/g, ' ').trim().slice(0, maks); };
  if (!RENCANA.resor[d.resor]) return 'Resor tidak valid.';
  var bulan = Number(d.bulan);
  if (!(bulan >= 1 && bulan <= 12) || Math.floor(bulan) !== bulan) return 'Bulan tidak valid.';
  if (bulan > bulanMaks_()) return 'Bulan ' + BULAN_ID[bulan - 1] + ' ' + RENCANA.tahun + ' belum berjalan.';
  var nama = bersih(d.nama_kr, 120), nip = bersih(d.nip_kr, 24), dasar = bersih(d.dasar, 600);
  if (nama.length < 3) return 'Nama Kepala Resor wajib diisi.';
  if (!/^[\d ]+$/.test(nip) || nip.replace(/ /g, '').length < 8) return 'NIP Kepala Resor hanya boleh berisi angka (boleh dengan spasi).';
  if (dasar.length < 5) return 'Dasar laporan wajib diisi (minimal 5 karakter).';
  return {
    resor: d.resor, bulan: bulan, nama_kr: nama, nip_kr: nip, dasar: dasar,
    tempat: bersih(d.tempat, 60) || tempatResor_(d.resor)
  };
}

function tempatResor_(rid) { return String(RENCANA.resor[rid]).replace(/^Resor\s+/i, ''); }

/* ======================= PEMBUAT DOKUMEN ======================= */

function bacaPengesahan_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PENGESAHAN);
  if (!sh) throw new Error('Sheet "Pengesahan" belum ada. Jalankan setupLaporanBulanan() di editor Apps Script.');
  var v = sh.getDataRange().getDisplayValues();
  var pej = {}, tpl = '';
  v.slice(1).forEach(function (r) {
    var k = String(r[0]).trim();
    if (k === 'TEMPLATE') tpl = String(r[1]).trim();
    else if (k && k !== 'Catatan') pej[k] = { jabatan: r[1], nama: r[2], nip: r[3], tempat: r[4] };
  });
  var m = tpl.match(/\/d\/([-\w]{20,})/) || tpl.match(/^([-\w]{20,})$/);
  if (!m) throw new Error('URL template Google Docs belum diisi di sheet "Pengesahan" (baris TEMPLATE).');
  return { pejabat: pej, templateId: m[1] };
}

function buatLaporanBulanan_(o) {
  var tz = Session.getScriptTimeZone();
  var cfg = bacaPengesahan_();
  var rid = o.resor, namaResor = RENCANA.resor[rid], sptn = RENCANA.sptn[rid];
  var pjS = cfg.pejabat[sptn], pjB = cfg.pejabat['BALAI'];
  if (!pjS) throw new Error('Data pejabat "' + sptn + '" belum ada di sheet Pengesahan.');
  if (!pjB) throw new Error('Data pejabat "BALAI" belum ada di sheet Pengesahan.');

  var periode = BULAN_ID[o.bulan - 1] + ' ' + RENCANA.tahun;
  var data = ambilData_(rid, o.bulan);
  if (!data.bulanIni.length) {
    throw new Error('Belum ada laporan berstatus Diterima untuk ' + namaResor + ' bulan ' + periode + '.' +
      (data.menunggu ? ' Ada ' + data.menunggu + ' laporan yang masih menunggu verifikasi.' : ''));
  }

  var namaFile = 'Laporan RBM ' + RENCANA.tahun + '-' + ('0' + o.bulan).slice(-2) + ' ' + namaResor;
  var folder = folderResor_(namaResor);
  [namaFile, namaFile + '.pdf'].forEach(function (n) {   // versi lama → Sampah (bisa dipulihkan 30 hari)
    var it = folder.getFilesByName(n);
    while (it.hasNext()) it.next().setTrashed(true);
  });

  var salinan = DriveApp.getFileById(cfg.templateId).makeCopy(namaFile, folder);
  var doc = DocumentApp.openById(salinan.getId());
  var body = doc.getBody();
  var nilai = {
    RESOR: namaResor, RESOR_KAPITAL: namaResor.toUpperCase(),
    SPTN: sptn, SPTN_KAPITAL: sptn.toUpperCase(),
    PERIODE: periode, PERIODE_KAPITAL: periode.toUpperCase(),
    TEMPAT_SPTN: pjS.tempat || sptn.split(' ').pop(),
    DASAR: o.dasar,
    TEMPAT_TTD: o.tempat, TANGGAL_TTD: Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy'),
    JABATAN_KR: 'Kepala ' + namaResor, NAMA_KR: o.nama_kr, NIP_KR: o.nip_kr,
    JABATAN_SPTN: pjS.jabatan, NAMA_SPTN: pjS.nama, NIP_SPTN: pjS.nip,
    JABATAN_BALAI: pjB.jabatan, NAMA_BALAI: pjB.nama, NIP_BALAI: pjB.nip
  };
  Object.keys(nilai).forEach(function (k) { ganti_(body, '{{' + k + '}}', nilai[k]); });

  var lebar = body.getPageWidth() - body.getMarginLeft() - body.getMarginRight();
  sisipkan_(body, '{{ISI_LAPORAN}}', function (w) { tulisIsi_(w, data, rid, periode, lebar, tz); });
  var foto = 0;
  sisipkan_(body, '{{LAMPIRAN}}', function (w) { foto = tulisLampiran_(w, data, rid, lebar, tz); });
  doc.saveAndClose();

  var pdf = salinan.getAs(MimeType.PDF).setName(namaFile + '.pdf');
  var pdfFile = folder.createFile(pdf);
  return {
    pdf: pdf, namaFile: namaFile, pdfUrl: pdfFile.getUrl(), docUrl: salinan.getUrl(),
    jumlah: data.bulanIni.length, foto: foto, menunggu: data.menunggu
  };
}

function folderResor_(namaResor) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('LAPBUL_FOLDER_ID');
  if (!id) throw new Error('Folder laporan bulanan belum dibuat. Jalankan setupLaporanBulanan().');
  var root = DriveApp.getFolderById(id);
  var it = root.getFoldersByName(namaResor);
  return it.hasNext() ? it.next() : root.createFolder(namaResor);
}

/** Laporan Diterima milik resor s.d. bulan terpilih (untuk kumulatif) + yang khusus bulan ini. */
function ambilData_(rid, bulan) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LAPORAN);
  var rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, KOLOM.length).getValues() : [];
  var g = function (r, k) { return r[COL[k] - 1]; };
  var semua = [], menunggu = 0;
  rows.forEach(function (r) {
    if (!g(r, 'ID') || g(r, 'Kode Resor') !== rid) return;
    var b = Number(g(r, 'Bulan')), st = g(r, 'Status') || 'Menunggu';
    if (b === bulan && st === 'Menunggu') menunggu++;
    if (st !== 'Diterima' || b > bulan) return;
    var tgl = g(r, 'Tanggal Pelaksanaan');
    semua.push({
      id: String(g(r, 'ID')), tanggal: tgl instanceof Date ? tgl : new Date(tgl), bulan: b,
      kode: String(g(r, 'Kode Kegiatan')), nama: String(g(r, 'Jenis Kegiatan')), indikator: String(g(r, 'Indikator')),
      volume: Number(g(r, 'Volume')) || 0, satuan: String(g(r, 'Satuan')), lokasi: String(g(r, 'Lokasi') || ''),
      catatan: String(g(r, 'Catatan Hasil') || ''), petugas: String(g(r, 'Nama Petugas') || ''),
      bukti: String(g(r, 'Bukti Dukung') || '').split(/\s+/).filter(function (u) { return /^https?:/.test(u); })
    });
  });
  semua.sort(function (a, b) { return a.tanggal - b.tanggal || (a.id < b.id ? -1 : 1); });
  return { semua: semua, bulanIni: semua.filter(function (l) { return l.bulan === bulan; }), menunggu: menunggu };
}

/** Realisasi sesuai aturan dashboard (assets/rbm.js). */
function realisasi_(metode, list) {
  if (!list.length) return 0;
  if (metode === 'bulan') return Object.keys(list.reduce(function (s, l) { s[l.bulan] = 1; return s; }, {})).length;
  if (metode === 'persen') return list[list.length - 1].volume; // list sudah urut tanggal
  return list.reduce(function (s, l) { return s + l.volume; }, 0);
}

/** Kelompok kegiatan berurutan: kegiatan rencana resor (urut kode), lalu kegiatan di luar rencana. */
function kelompokKegiatan_(rid, data) {
  var keg = Object.keys(RENCANA.kegiatan).filter(function (k) { return RENCANA.kegiatan[k].resor === rid; }).sort();
  var out = keg.map(function (k) {
    var r = RENCANA.kegiatan[k];
    return {
      kode: k, nama: r.nama, indikator: r.indikator, satuan: r.satuan, target: r.target, metode: r.metode,
      sd: data.semua.filter(function (l) { return l.kode === k; }),
      ini: data.bulanIni.filter(function (l) { return l.kode === k; })
    };
  });
  var luar = {};
  data.bulanIni.filter(function (l) { return l.kode === 'LUAR-RENCANA'; }).forEach(function (l) {
    var k = l.nama.toLowerCase();
    if (!luar[k]) { luar[k] = { kode: 'LUAR-RENCANA', nama: l.nama, indikator: 'Kegiatan di luar rencana', satuan: l.satuan, target: null, metode: 'jumlah', sd: [], ini: [] }; out.push(luar[k]); }
    luar[k].ini.push(l); luar[k].sd.push(l);
  });
  return out;
}

/* ---------- isi laporan ---------- */

function tulisIsi_(w, data, rid, periode, lebar, tz) {
  var grup = kelompokKegiatan_(rid, data);
  var rencana = grup.filter(function (g) { return g.target != null; });
  var capaian = rencana.map(function (g) { return g.target ? Math.min(100, realisasi_(g.metode, g.sd) / g.target * 100) : 0; });
  var rata = capaian.length ? capaian.reduce(function (s, x) { return s + x; }, 0) / capaian.length : 0;
  var jenisIni = grup.filter(function (g) { return g.ini.length; }).length;

  w.p('A. Ringkasan', { bold: true, size: 11, before: 10 });
  w.p('Pada bulan ' + periode + ', ' + RENCANA.resor[rid] + ' melaksanakan ' + data.bulanIni.length +
    ' kegiatan terverifikasi dari ' + jenisIni + ' jenis kegiatan. Rata-rata capaian kegiatan terhadap target tahunan ' +
    RENCANA.tahun + ' sampai dengan bulan ini adalah ' + angka_(rata, 1) + '% (setiap kegiatan dihitung maksimal 100%).',
    { size: 10, align: 'justify' });

  w.p('B. Rekapitulasi capaian terhadap target tahunan', { bold: true, size: 11, before: 10 });
  var sel = [['No', 'Jenis Kegiatan', 'Satuan', 'Target Tahunan', 'Realisasi Bulan Ini', 'Realisasi s.d. Bulan Ini', 'Capaian s.d. Bulan Ini']];
  var barisInd = [], no = 0, indSaatIni = null;
  grup.forEach(function (g) {
    if (g.indikator !== indSaatIni) { indSaatIni = g.indikator; barisInd.push(sel.length); sel.push(['', g.indikator, '', '', '', '', '']); }
    var sd = realisasi_(g.metode, g.sd), ini = realisasi_(g.metode, g.ini);
    var satuanTampil = g.metode === 'persen' ? '%' : g.satuan;
    sel.push([String(++no), g.nama, satuanTampil,
      g.target == null ? '–' : angka_(g.target),
      g.ini.length ? angka_(ini) : '–',
      g.target == null ? angka_(sd) : (g.sd.length ? angka_(sd) : '0'),
      g.target ? angka_(sd / g.target * 100, 0) + '%' : '–']);
  });
  var t = w.tabel(sel);
  gayaTabel_(t, lebar, [0.05, 0.37, 0.12, 0.11, 0.11, 0.11, 0.13], barisInd, [0, 3, 4, 5, 6]);
  w.p('Realisasi dihitung dari laporan berstatus Diterima. Satuan "Bulan" dihitung dari jumlah bulan yang memiliki laporan; ' +
    'satuan persen memakai nilai laporan terakhir.', { size: 8, italic: true });

  w.p('C. Uraian kegiatan bulan ' + periode, { bold: true, size: 11, before: 10 });
  var sel2 = [['No', 'Tanggal / ID', 'Jenis Kegiatan', 'Volume', 'Lokasi', 'Uraian Hasil Kegiatan', 'Petugas']];
  no = 0;
  grup.forEach(function (g) {
    g.ini.forEach(function (l) {
      sel2.push([String(++no), Utilities.formatDate(l.tanggal, tz, 'dd/MM/yyyy') + ' ' + l.id, g.nama,
        angka_(l.volume) + ' ' + (g.metode === 'persen' ? '%' : l.satuan), l.lokasi || '–', l.catatan, l.petugas]);
    });
  });
  var t2 = w.tabel(sel2);
  gayaTabel_(t2, lebar, [0.05, 0.13, 0.17, 0.09, 0.12, 0.30, 0.14], [], [0]);

  w.p('Dokumen ini dibuat otomatis dari sistem pelaporan RBM pada ' +
    Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm') + ' WITA. Laporan yang masih menunggu verifikasi, direvisi, atau ditolak tidak dimuat.',
    { size: 8, italic: true, before: 8 });
}

/* ---------- lampiran ---------- */

function tulisLampiran_(w, data, rid, lebar, tz) {
  var grup = kelompokKegiatan_(rid, data).filter(function (g) { return g.ini.length; });
  // InlineImage memakai piksel (1 pt = 4/3 px); lebar kolom dalam poin
  var nFoto = 0, maxW = (lebar / 2 - 16) * 4 / 3, maxH = 200 * 4 / 3;
  grup.forEach(function (g, gi) {
    w.p((gi + 1) + '. ' + g.nama, { bold: true, size: 11, before: gi ? 14 : 6 });
    w.p(g.indikator, { italic: true, size: 9 });
    g.ini.forEach(function (l) {
      w.p(Utilities.formatDate(l.tanggal, tz, 'dd/MM/yyyy') + ' · ' + l.id + (l.lokasi ? ' · ' + l.lokasi : ''), { bold: true, size: 9, before: 6 });
      var foto = [], dok = [];
      l.bukti.forEach(function (url) {
        var m = url.match(/\/d\/([-\w]{20,})/);
        try {
          var f = DriveApp.getFileById(m[1]);
          if (/^image\/(jpeg|png|gif)$/.test(f.getMimeType())) foto.push(f.getBlob());
          else dok.push({ nama: f.getName(), url: url });
        } catch (e) { dok.push({ nama: 'File tidak dapat dibaca', url: url }); }
      });
      if (foto.length) {
        var baris = [];
        for (var i = 0; i < foto.length; i += 2) baris.push(['', '']);
        var t = w.tabel(baris);
        t.setBorderWidth(0);
        t.setColumnWidth(0, lebar / 2); t.setColumnWidth(1, lebar / 2);
        foto.forEach(function (blob, i) {
          var cell = t.getRow(Math.floor(i / 2)).getCell(i % 2);
          var par = cell.getChild(0).asParagraph();
          par.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
          try {
            var img = par.appendInlineImage(blob);
            var s = Math.min(1, maxW / img.getWidth(), maxH / img.getHeight());
            img.setWidth(Math.round(img.getWidth() * s)).setHeight(Math.round(img.getHeight() * s));
            var cap = cell.appendParagraph('Foto ' + (i + 1));
            cap.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
            gayaTeks_(cap, { size: 8, italic: true });
            nFoto++;
          } catch (e) {
            par.appendText('[foto tidak dapat dimuat]');
          }
        });
      }
      dok.forEach(function (x) {
        var p = w.p('Dokumen pendukung: ' + x.nama, { size: 9 });
        var tx = p.editAsText(), awal = 'Dokumen pendukung: '.length;
        tx.setLinkUrl(awal, awal + x.nama.length - 1, x.url);
      });
    });
  });
  if (grup.some(function (g) { return g.ini.some(function (l) { return l.bukti.length; }); })) {
    w.p('Dokumen pendukung selain foto tersimpan di Google Drive kantor; tautannya hanya dapat dibuka oleh akun yang diberi akses.', { size: 8, italic: true, before: 10 });
  }
  return nFoto;
}

/* ======================= UTIL DOKUMEN ======================= */

/** Ganti semua placeholder (teks biasa, aman dari karakter khusus) dengan mempertahankan format. */
function ganti_(body, ph, val) {
  var pola = ph.replace(/[{}]/g, '\\$&'), r, n = 0;
  val = String(val == null ? '' : val);
  while ((r = body.findText(pola)) && n++ < 50) {
    var t = r.getElement().asText(), s = r.getStartOffset(), e = r.getEndOffsetInclusive();
    if (val) { t.insertText(s, val); t.deleteText(s + val.length, e + val.length); }
    else t.deleteText(s, e);
  }
}

/** Sisipkan konten di posisi paragraf penanda, lalu buang penandanya. */
function sisipkan_(body, penanda, isi) {
  var r = body.findText(penanda.replace(/[{}]/g, '\\$&'));
  if (!r) throw new Error('Penanda ' + penanda + ' tidak ditemukan di template.');
  var el = r.getElement();
  while (el.getParent().getType() !== DocumentApp.ElementType.BODY_SECTION) el = el.getParent();
  var idx = body.getChildIndex(el);
  var w = {
    p: function (teks, gaya) { var p = body.insertParagraph(idx++, teks || ''); gayaTeks_(p, gaya || {}); return p; },
    tabel: function (sel) { var t = body.insertTable(idx++, sel); return t; }
  };
  isi(w);
  if (idx < body.getNumChildren() - 1) body.removeChild(el); // paragraf terakhir dokumen tidak boleh dihapus
  else el.asParagraph().setText('');
}

function gayaTeks_(p, g) {
  p.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  p.setSpacingBefore(g.before || 0).setSpacingAfter(g.after == null ? 3 : g.after).setLineSpacing(1.1);
  p.setIndentFirstLine(0).setIndentStart(0);
  var A = DocumentApp.HorizontalAlignment;
  p.setAlignment(g.align === 'center' ? A.CENTER : g.align === 'justify' ? A.JUSTIFY : A.LEFT);
  var tx = p.editAsText();
  if (tx.getText().length) {
    tx.setFontFamily(FONT).setFontSize(g.size || 10).setBold(!!g.bold).setItalic(!!g.italic).setUnderline(false);
  }
}

function gayaTabel_(t, lebar, porsi, barisKelompok, kolomTengah) {
  t.setBorderWidth(0.5).setBorderColor('#666666');
  porsi.forEach(function (p, c) { t.setColumnWidth(c, Math.round(lebar * p)); });
  var A = DocumentApp.HorizontalAlignment;
  for (var r = 0; r < t.getNumRows(); r++) {
    var row = t.getRow(r), kelompok = barisKelompok.indexOf(r) >= 0;
    for (var c = 0; c < row.getNumCells(); c++) {
      var cell = row.getCell(c);
      cell.setPaddingTop(2).setPaddingBottom(2).setPaddingLeft(4).setPaddingRight(4);
      cell.setVerticalAlignment(DocumentApp.VerticalAlignment.TOP);
      var par = cell.getChild(0).asParagraph();
      par.setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(1);
      if (r === 0 || kolomTengah.indexOf(c) >= 0) par.setAlignment(A.CENTER);
      var tx = cell.editAsText();
      if (tx.getText().length) tx.setFontFamily(FONT).setFontSize(8.5).setBold(r === 0 || kelompok).setItalic(false);
      if (r === 0) cell.setBackgroundColor('#dfeadf');
      else if (kelompok) cell.setBackgroundColor('#f2f2f2');
    }
  }
}

function angka_(x, d) {
  d = d == null ? 2 : d;
  var f = Math.pow(10, d), v = Math.round(Number(x) * f) / f;
  var s = String(v).split('.');
  s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return s.join(',');
}

function esc_(s) {
  return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}
