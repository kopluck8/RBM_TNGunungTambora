# Form & Dashboard Capaian RBM — Taman Nasional Tambora

Petugas resor melaporkan kegiatan lewat form web tanpa perlu akun. Verifikator memeriksa laporan di Google Sheets. Dashboard menampilkan capaian terverifikasi dibandingkan dengan rencana awal tahun.

```
Petugas resor ──► form/ (GitHub Pages) ──► Google Apps Script ──► Google Sheets "Laporan"
                                                         └──────► Google Drive (bukti dukung)
Verifikator ubah kolom Status di Sheets (Diterima / Revisi / Ditolak)
Dashboard ◄── dashboard/ (GitHub Pages) ◄── rekap angka dari Apps Script (tanpa data pribadi)
Resor ──► laporan/ (kode akses) ──► Apps Script ──► template Google Docs ──► PDF laporan bulanan
```

## Isi repository

| Path | Fungsi |
|---|---|
| `index.html` | Halaman awal |
| `form/index.html` | Form laporan untuk petugas resor |
| `dashboard/index.html` | Dashboard capaian |
| `laporan/index.html` | Unduh PDF laporan bulanan untuk resor |
| `assets/config.js` | **Satu-satunya file yang perlu diubah:** URL Apps Script |
| `assets/rbm.js` | Logika hitung capaian (dipakai bersama form & dashboard) |
| `assets/style.css` | Tampilan (mode terang & gelap) |
| `assets/logo.png` | Logo kantor (unggah sendiri; bila tidak ada, tampil tulisan "RBM") |
| `data/Baseline_RBM_TNTambora_2026.xlsx` | Baseline asli dari kantor |
| `data/rencana_2026.json` / `.csv` | Rencana hasil konversi (6 resor, 100 kegiatan) |
| `scripts/excel_to_rencana.py` | Konversi Excel ke JSON/CSV/Rencana.gs |
| `apps-script/Code.gs` | Backend: menerima laporan, menyimpan bukti, menyajikan rekap |
| `apps-script/Rencana.gs` | Salinan rencana untuk validasi di server (dibuat otomatis) |
| `apps-script/LaporanBulanan.gs` | Pembuat PDF laporan bulanan + menu **RBM** di Sheets |
| `templates/Template_Laporan_Bulanan_RBM.docx` | Template laporan bulanan (kop, cover, pengesahan) berisi placeholder `{{...}}` |
| `scripts/buat_template_laporan.py` | Membuat ulang template dari format asli kantor |

## Pemasangan (sekali saja)

### A. Google (pakai akun Google kantor, bukan akun pribadi)

1. Buat **Google Sheets** baru, misalnya "Laporan RBM 2026".
2. Buka menu **Ekstensi → Apps Script**.
3. Tempel isi `apps-script/Code.gs` ke file `Code.gs`. Lalu tambah file baru bernama `Rencana` dan tempel isi `apps-script/Rencana.gs`, serta file `LaporanBulanan` dengan isi `apps-script/LaporanBulanan.gs`.
4. Di **Setelan proyek (ikon roda gigi)**, ubah **Zona waktu** ke `(GMT+08:00) Makassar`.
5. Pilih fungsi `setup`, klik **Jalankan**, lalu izinkan akses ke Sheets dan Drive.
   Hasilnya:
   - sheet **Laporan** dengan dropdown Status;
   - sheet **Pengaturan** yang berisi **kode akses tiap resor** (bagikan ke masing-masing resor secara internal);
   - folder Drive **"Bukti Dukung RBM 2026"**.
6. Klik **Terapkan → Deployment baru → Jenis: Aplikasi web**.
   - Jalankan sebagai: **Saya**
   - Yang memiliki akses: **Siapa saja**
7. Salin **URL aplikasi web** (berakhiran `/exec`).

> Setiap kali `Code.gs` diubah, buka **Terapkan → Kelola deployment → Edit → Versi baru**. Dengan cara ini URL-nya tetap sama.

### B. GitHub

1. Buat repository baru, misalnya `rbm-tambora`, lalu unggah seluruh isi folder ini.
2. Ubah `assets/config.js` dengan mengisi `API_URL: 'https://script.google.com/macros/s/.../exec'`.
3. Buka **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
4. Setelah 1–2 menit, situs tersedia di `https://<akun>.github.io/rbm-tambora/`.
   - Form: `.../form/`
   - Dashboard: `.../dashboard/`

Selama `API_URL` masih kosong, situs berjalan dalam **mode contoh**. Form hanya mensimulasikan pengiriman, dan dashboard memakai data acak.

## Verifikasi (rutin)

1. Buka Google Sheets, lalu sheet **Laporan**.
2. Periksa catatan hasil dan link **Bukti Dukung**.
3. Ubah kolom **Status**:
   - `Diterima`: dihitung sebagai capaian.
   - `Revisi`: tidak dihitung. Tulis alasannya di **Catatan Verifikator**, lalu petugas mengirim laporan baru dengan mengisi "ID laporan yang direvisi".
   - `Ditolak`: tidak dihitung.
4. Kolom **Tanggal Verifikasi** terisi otomatis. Dashboard memperbarui angka saat halamannya dibuka ulang.

Jangan menghapus baris laporan. Pakai status `Ditolak` supaya jejak audit tetap lengkap.

## Aturan perhitungan

| Satuan target | Cara menghitung realisasi |
|---|---|
| Kegiatan, Unit, Dokumen, Kelompok, Lokasi, Spesimen, Publikasi | Jumlah kolom **Volume** dari laporan yang diterima |
| Bulan (mis. Penjagaan Pos Merah Putih) | Jumlah **bulan berbeda** yang memiliki laporan diterima |
| Persen (Penggunaan QRIS) | Nilai dari laporan diterima **yang paling akhir** |

- **Capaian kegiatan** = realisasi ÷ target tahunan.
- **Capaian resor / indikator** = rata-rata capaian kegiatan, dengan setiap kegiatan dibatasi maksimal 100%. Satuan antarkegiatan berbeda, sehingga angkanya tidak bisa dijumlahkan langsung.
- **Target bersifat tahunan.** Resor belum menyusun jadwal bulanan, jadi tidak ada target per bulan atau pro-rata. Status kegiatan:
  - Tercapai: ≥ 100% target tahunan
  - Berjalan: sudah ada realisasi diterima, tetapi < 100%
  - Belum ada realisasi: belum ada laporan yang diterima
- **Kesesuaian dengan rencana** = porsi laporan yang jenis kegiatannya ada di rencana resor tersebut.

## Laporan bulanan (PDF)

PDF dibuat per resor per bulan dan hanya memuat laporan berstatus **Diterima**. Isinya berurutan:

1. **Cover**: kop surat, nama resor, SPTN, dan periode.
2. **Lembar pengesahan**:
   - Kepala Resor (nama dan NIP diketik oleh resor saat mengunduh);
   - *Menilai*: Kepala SPTN, terisi otomatis sesuai resor;
   - *Mengetahui*: Kepala Balai.
3. **Isi laporan**:
   - A. Ringkasan;
   - B. Rekapitulasi capaian terhadap target tahunan (bulan ini dan kumulatif);
   - C. Uraian kegiatan bulan ini.
4. **Lampiran dokumentasi** per jenis kegiatan. Foto ditempel langsung di lampiran. PDF bukti dukung ditulis sebagai tautan Drive, dan tautan itu hanya bisa dibuka oleh akun kantor.

### Pemasangan (sekali saja, setelah langkah A)

1. Tempel `apps-script/LaporanBulanan.gs` sebagai file baru `LaporanBulanan`, dan ganti `Rencana.gs` dengan versi terbaru (sekarang berisi target dan SPTN).
2. Jalankan fungsi `setupLaporanBulanan`, lalu izinkan akses ke Google Docs. Fungsi ini membuat:
   - sheet **Pengesahan** berisi nama dan NIP Kepala Balai serta Kepala SPTN;
   - folder Drive **"Laporan Bulanan RBM 2026"**.
3. Unggah `templates/Template_Laporan_Bulanan_RBM.docx` ke Google Drive kantor. Klik kanan file itu, pilih **Buka dengan → Google Dokumen**, lalu salin URL dokumen Google Docs yang terbuka.
4. Tempel URL tersebut di sheet **Pengesahan**, kolom B baris **TEMPLATE**.
5. Buka **Terapkan → Kelola deployment → Edit → Versi baru**.
6. Muat ulang Google Sheets. Menu **RBM** akan muncul.

### Cara pakai

- **Resor**: buka `.../laporan/`, lalu isi resor, kode akses, bulan, nama dan NIP Kepala Resor, tempat, serta dasar. Setelah itu PDF terunduh. Dalam 10 menit, setiap resor bisa membuat paling banyak 5 PDF.
- **Verifikator**: di Google Sheets, pilih menu **RBM → Buat laporan bulanan (PDF)…**. Hasilnya berupa link PDF dan versi Google Docs yang masih bisa disunting sebelum dicetak.
- Semua hasil tersimpan di folder **Laporan Bulanan RBM 2026 / <Resor>**. Bila laporan bulan yang sama dibuat ulang, versi lama dipindahkan ke Sampah dan masih bisa dipulihkan selama 30 hari.

### Mengubah tampilan atau pejabat

- **Pejabat berganti**: ubah Nama dan NIP di sheet **Pengesahan**. Kode tidak perlu diubah.
- **Kop, logo, atau teks tetap**: sunting dokumen template di Google Docs. Placeholder `{{...}}` jangan dihapus. Penanda `{{ISI_LAPORAN}}` dan `{{LAMPIRAN}}` harus berdiri sebagai paragraf sendiri dan tidak boleh berada di dalam tabel.
- Daftar placeholder: `RESOR`, `RESOR_KAPITAL`, `SPTN`, `SPTN_KAPITAL`, `PERIODE`, `PERIODE_KAPITAL`, `TEMPAT_SPTN`, `DASAR`, `TEMPAT_TTD`, `TANGGAL_TTD`, `JABATAN_KR`, `NAMA_KR`, `NIP_KR`, `JABATAN_SPTN`, `NAMA_SPTN`, `NIP_SPTN`, `JABATAN_BALAI`, `NAMA_BALAI`, `NIP_BALAI`.

> Batas Apps Script: satu kali pembuatan maksimal 6 menit. Satu bulan dengan sekitar 30 laporan dan 100 foto masih aman, tetapi perlu diuji di akun kantor. PDF di atas 30 MB tidak dikirim lewat web dan harus diambil verifikator dari Drive.

## Pengamanan

- Petugas tidak perlu akun. Pengirim dikendalikan dengan **kode akses per resor**: server menolak laporan bila kode tidak cocok dengan resor yang dipilih. Bila kode bocor, jalankan `gantiKodeAkses('R3')` di editor Apps Script.
- Server hanya menerima kegiatan yang ada di rencana resor tersebut, atau kegiatan yang ditandai "di luar rencana".
- Bukti dukung disimpan di Drive kantor dan **tidak dibagikan publik**.
- Data yang dapat dibaca publik melalui dashboard hanya berisi ID, tanggal, resor, kode kegiatan, volume, dan status. Nama petugas, catatan, lokasi, dan bukti tidak ikut.
- Ada rem sederhana terhadap spam: maksimal 20 kiriman per resor per 10 menit.
- PDF laporan bulanan memuat nama petugas, catatan, dan foto. Karena itu PDF hanya diberikan kepada resor yang memasukkan kode aksesnya sendiri dan tidak pernah tampil di dashboard publik.

## Ganti tahun / ubah rencana

1. Perbarui file Excel dengan kolom yang sama.
2. Jalankan `python scripts/excel_to_rencana.py data/Baseline_RBM_TNTambora_2027.xlsx 2027`.
3. Ubah `TAHUN` dan `RENCANA_URL` di `assets/config.js`.
4. Tempel `apps-script/Rencana.gs` yang baru ke Apps Script, lalu buat deployment **versi baru**.
5. Untuk tahun baru, gunakan Google Sheets baru (ulangi langkah A).

> Mengubah rencana di tengah tahun akan mengubah kode kegiatan (`R1-01`, dst.) bila urutan baris berubah. Tambahkan baris baru **di akhir** daftar resor tersebut agar kode laporan lama tetap cocok.
