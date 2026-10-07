/* Logika bersama form & dashboard: memuat rencana, data laporan, dan menghitung capaian. */
(function () {
  const CFG = window.RBM_CONFIG;

  async function muatRencana() {
    const r = await fetch(CFG.RENCANA_URL, { cache: 'no-cache' });
    if (!r.ok) throw new Error('Gagal memuat rencana (' + r.status + ')');
    return r.json();
  }

  async function muatLaporan(rencana) {
    if (!CFG.API_URL) return { contoh: true, diperbarui: new Date().toISOString(), laporan: dataContoh(rencana) };
    const r = await fetch(CFG.API_URL, { cache: 'no-cache' });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Gagal memuat data laporan');
    return { contoh: false, diperbarui: j.diperbarui, laporan: j.laporan };
  }

  /** Bulan yang sudah berjalan pada tahun rencana (untuk info sisa waktu & data contoh). */
  function bulanBerjalan(tahun) {
    const now = new Date();
    if (now.getFullYear() > tahun) return 12;
    if (now.getFullYear() < tahun) return 0;
    return now.getMonth() + 1;
  }

  /** Realisasi satu kegiatan dari daftar laporan (sudah difilter statusnya). */
  function realisasi(keg, list) {
    if (!list.length) return 0;
    if (keg.metode === 'bulan') return new Set(list.map(l => l.bulan)).size;
    if (keg.metode === 'persen') {
      const last = list.slice().sort((a, b) => a.tanggal < b.tanggal ? -1 : 1).pop();
      return last.volume;
    }
    return list.reduce((s, l) => s + (Number(l.volume) || 0), 0);
  }

  const MASUK = s => s !== 'Ditolak';           // dilaporkan & belum ditolak
  const DITERIMA = s => s === 'Diterima';

  /**
   * Hitung capaian setiap kegiatan.
   * persenDiterima / persenMasuk dibatasi 100 untuk rata-rata; nilai asli tetap ada.
   */
  function hitung(rencana, laporan) {
    const perKeg = {};
    laporan.forEach(l => { (perKeg[l.kegiatan] = perKeg[l.kegiatan] || []).push(l); });

    return rencana.kegiatan.map(k => {
      const semua = perKeg[k.id] || [];
      const masuk = realisasi(k, semua.filter(l => MASUK(l.status)));
      const diterima = realisasi(k, semua.filter(l => DITERIMA(l.status)));
      const pD = k.target ? diterima / k.target * 100 : 0;
      const pM = k.target ? masuk / k.target * 100 : 0;
      // Target dihitung tahunan (belum ada jadwal bulanan dari resor).
      let status;
      if (pD >= 100) status = 'tercapai';
      else if (pD > 0) status = 'berjalan';
      else status = 'belum';
      return {
        ...k, masuk, diterima,
        persenDiterima: pD, persenMasuk: pM,
        capD: Math.min(100, pD), capM: Math.min(100, pM),
        status,
        jumlahLaporan: semua.length,
        menunggu: semua.filter(l => l.status === 'Menunggu').length
      };
    });
  }

  const rata = arr => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;

  /* ---------- data contoh (mode tanpa API) ---------- */
  function dataContoh(rencana) {
    let seed = 20260107;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const bb = Math.max(1, bulanBerjalan(rencana.tahun));
    const out = [];
    let n = 1;
    const kinerja = { R1: 0.95, R2: 0.7, R3: 0.85, R4: 0.55, R5: 0.8, R6: 0.65 };
    rencana.kegiatan.forEach(k => {
      const f = (kinerja[k.resor] || 0.7) * (0.45 + rnd() * 0.85);
      let jml;
      if (k.metode === 'persen') jml = 2;
      else if (k.metode === 'bulan') jml = Math.round(bb * f);
      else jml = Math.round(k.target * bb / 12 * f);
      jml = Math.min(jml, k.metode === 'jumlah' ? Math.max(k.target, 1) * 1.1 : 12);
      const bulanDipakai = new Set();
      for (let i = 0; i < jml; i++) {
        let bulan = 1 + Math.floor(rnd() * bb);
        if (k.metode === 'bulan') { bulan = i + 1; if (bulan > bb) break; }
        bulanDipakai.add(bulan);
        const hari = 1 + Math.floor(rnd() * 27);
        const umur = bb - bulan; // laporan lama lebih mungkin sudah diverifikasi
        const p = rnd();
        let status = 'Diterima';
        if (umur === 0 && p < 0.55) status = 'Menunggu';
        else if (p < 0.06) status = 'Revisi';
        else if (p < 0.09) status = 'Ditolak';
        else if (umur <= 1 && p < 0.25) status = 'Menunggu';
        const vol = k.metode === 'persen' ? Math.round(55 + rnd() * 35)
          : (k.satuan === 'Publikasi Media Sosial' ? 1 + Math.floor(rnd() * 3) : 1);
        out.push({
          id: 'LAP-' + rencana.tahun + '-' + String(n++).padStart(4, '0'),
          tanggal: `${rencana.tahun}-${String(bulan).padStart(2, '0')}-${String(hari).padStart(2, '0')}`,
          bulan, resor: k.resor, kegiatan: k.id, nama_kegiatan: '', sesuai: true, volume: vol, status
        });
      }
    });
    const luar = [
      ['R3', 'Pendampingan tim peneliti universitas'], ['R4', 'Evakuasi pendaki tersesat'],
      ['R1', 'Pembersihan jalur pascalongsor'], ['R5', 'Rapat koordinasi desa penyangga']
    ];
    luar.forEach(([r, nama], i) => out.push({
      id: 'LAP-' + rencana.tahun + '-' + String(n++).padStart(4, '0'),
      tanggal: `${rencana.tahun}-${String(Math.min(bb, 3 + i * 2)).padStart(2, '0')}-12`,
      bulan: Math.min(bb, 3 + i * 2), resor: r, kegiatan: 'LUAR-RENCANA', nama_kegiatan: nama, sesuai: false, volume: 1,
      status: i === 1 ? 'Diterima' : 'Menunggu'
    }));
    return out;
  }

  const fmt = (x, d = 0) => Number(x).toLocaleString('id-ID', { maximumFractionDigits: d, minimumFractionDigits: d });
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  window.RBM = { CFG, muatRencana, muatLaporan, hitung, bulanBerjalan, rata, fmt, esc, BULAN, MASUK, DITERIMA };
})();
