# Form & Dashboard Capaian RBM — Taman Nasional Tambora

Petugas resor melaporkan kegiatan lewat form web tanpa perlu akun. Verifikator memeriksa laporan di Google Sheets. Dashboard menampilkan capaian terverifikasi dibandingkan dengan rencana awal tahun.

```
Petugas resor ──► form/ (GitHub Pages) ──► Google Apps Script ──► Google Sheets "Laporan"
                                                         └──────► Google Drive (bukti dukung)
Verifikator ubah kolom Status di Sheets (Diterima / Revisi / Ditolak)
Dashboard ◄── dashboard/ (GitHub Pages) ◄── rekap angka dari Apps Script (tanpa data pribadi)
```

## Isi repository

| Path | Fungsi |
|---|---|
| `index.html` | Halaman awal |
| `form/index.html` | Form laporan untuk petugas resor |
| `dashboard/index.html` | Dashboard capaian |
| `assets/config.js` | **Satu-satunya file yang perlu diubah:** URL Apps Script |
| `assets/rbm.js` | Logika hitung capaian (dipakai bersama form & dashboard) |
| `assets/style.css` | Tampilan (mode terang & gelap) |
| `assets/logo.png` | Logo kantor (unggah sendiri; bila tidak ada, tampil tulisan "RBM") |
| `data/Baseline_RBM_TNTambora_2026.xlsx` | Baseline asli dari kantor |
| `data/rencana_2026.json` / `.csv` | Rencana hasil konversi (6 resor, 100 kegiatan) |
| `scripts/excel_to_rencana.py` | Konversi Excel ke JSON/CSV/Rencana.gs |
| `apps-script/Code.gs` | Backend: menerima laporan, menyimpan bukti, menyajikan rekap |
| `apps-script/Rencana.gs` | Salinan rencana untuk validasi di server (dibuat otomatis) |

## Pemasangan (sekali saja)

### A. Google (pakai akun Google kantor, bukan akun pribadi)

1. Buat **Google Sheets** baru, misalnya "Laporan RBM 2026".
2. Buka menu **Ekstensi → Apps Script**.
3. Tempel isi `apps-script/Code.gs` ke file `Code.gs`. Lalu tambah file baru bernama `Rencana`, dan tempel isi `apps-script/Rencana.gs`.
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

## Pengamanan

- Petugas tidak perlu akun. Pengirim dikendalikan dengan **kode akses per resor**: server menolak laporan bila kode tidak cocok dengan resor yang dipilih. Bila kode bocor, jalankan `gantiKodeAkses('R3')` di editor Apps Script.
- Server hanya menerima kegiatan yang ada di rencana resor tersebut, atau kegiatan yang ditandai "di luar rencana".
- Bukti dukung disimpan di Drive kantor dan **tidak dibagikan publik**.
- Data yang dapat dibaca publik melalui dashboard hanya berisi ID, tanggal, resor, kode kegiatan, volume, dan status. Nama petugas, catatan, lokasi, dan bukti tidak ikut.
- Ada rem sederhana terhadap spam: maksimal 20 kiriman per resor per 10 menit.

## Ganti tahun / ubah rencana

1. Perbarui file Excel dengan kolom yang sama.
2. Jalankan `python scripts/excel_to_rencana.py data/Baseline_RBM_TNTambora_2027.xlsx 2027`.
3. Ubah `TAHUN` dan `RENCANA_URL` di `assets/config.js`.
4. Tempel `apps-script/Rencana.gs` yang baru ke Apps Script, lalu buat deployment **versi baru**.
5. Untuk tahun baru, gunakan Google Sheets baru (ulangi langkah A).

> Mengubah rencana di tengah tahun akan mengubah kode kegiatan (`R1-01`, dst.) bila urutan baris berubah. Tambahkan baris baru **di akhir** daftar resor tersebut agar kode laporan lama tetap cocok.
