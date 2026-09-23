/* Asrama Mandalika - server Google Apps Script.
 * File ini dibuat dari assets/core.js + apps-script/adapter.gs.js.
 * Salin SELURUH isi file ini ke Code.gs di editor Apps Script. */

/*
 * Logika inti Asrama Mandalika.
 * File ini dipakai di dua tempat:
 *   1. di browser, untuk mode demo (data tersimpan di browser);
 *   2. disalin utuh ke apps-script/Code.gs, untuk server Google Sheets.
 * Jika mengubah aturan di sini, salin juga ke Code.gs (atau jalankan build-gs.sh).
 */
var Core = (function () {
  var ACTIVE = ['menunggu', 'disetujui', 'lunas', 'pelatihan'];
  var STATUS = ['menunggu', 'disetujui', 'lunas', 'ditolak', 'batal', 'selesai', 'pelatihan'];
  var KAMAR_STATUS = ['siap', 'terisi', 'kotor', 'perbaikan'];
  var MAKS_MALAM = 30;
  var MAKS_KAMAR = 20;

  function addDays(s, n) {
    var d = new Date(s + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !isNaN(Date.parse(s)); }
  function nights(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5); }
  function txt(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 200); }
  function digits(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }
  function overlap(r, masuk, keluar) { return r.masuk < keluar && masuk < r.keluar; }
  function isActive(r) { return ACTIVE.indexOf(r.status) >= 0; }
  function find(list, fn) { for (var i = 0; i < list.length; i++) if (fn(list[i])) return list[i]; return null; }

  function tipeOf(db, id) { return find(db.tipe, function (t) { return t.id === id; }); }
  function roomsOf(db, tipe) { return db.kamar.filter(function (k) { return k.tipe === tipe && k.status !== 'perbaikan'; }); }
  function bookedOn(db, tipe, d, exceptKode) {
    var s = 0;
    db.reservasi.forEach(function (r) {
      if (r.kode !== exceptKode && r.tipe === tipe && isActive(r) && r.masuk <= d && d < r.keluar) s += Number(r.jumlah) || 0;
    });
    return s;
  }
  function freeOn(db, tipe, d, exceptKode) { return Math.max(0, roomsOf(db, tipe).length - bookedOn(db, tipe, d, exceptKode)); }
  function minFree(db, tipe, masuk, keluar, exceptKode) {
    var m = Infinity;
    for (var d = masuk; d < keluar; d = addDays(d, 1)) m = Math.min(m, freeOn(db, tipe, d, exceptKode));
    return m === Infinity ? 0 : m;
  }
  // Kamar tertentu yang masih kosong untuk seluruh rentang tanggal (dipakai rooming list).
  function freeRooms(db, masuk, keluar) {
    var taken = {};
    db.reservasi.forEach(function (r) {
      if (isActive(r) && r.kamar && overlap(r, masuk, keluar)) {
        String(r.kamar).split(',').forEach(function (n) { taken[n.trim()] = true; });
      }
    });
    var out = [];
    db.tipe.forEach(function (t) {
      var free = minFree(db, t.id, masuk, keluar);
      var cand = roomsOf(db, t.id).filter(function (k) { return !taken[k.no]; });
      cand.slice(0, Math.max(0, free)).forEach(function (k) {
        out.push({ no: k.no, tipe: k.tipe, tipeNama: t.nama, lantai: k.lantai, kapasitas: Number(k.kapasitas) || Number(t.kapasitas) || 2 });
      });
    });
    return out;
  }

  function publicTipe(t) {
    return { id: t.id, nama: t.nama, kapasitas: t.kapasitas, fasilitas: t.fasilitas, tarif: t.tarif, foto: t.foto };
  }
  function publicRes(db, r) {
    var t = tipeOf(db, r.tipe);
    return {
      kode: r.kode, nama: r.nama, tipe: r.tipe, tipeNama: t ? t.nama : r.tipe, jumlah: r.jumlah,
      masuk: r.masuk, keluar: r.keluar, status: r.status, billing: r.billing || '', catatan: r.catatan_petugas || ''
    };
  }
  function makeKode(prefix, masuk, rand) {
    return prefix + '-' + masuk.slice(2).replace(/-/g, '') + '-' + rand(4).toUpperCase();
  }

  function handle(db, action, p, ctx) {
    p = p || {};
    var ops = { inserts: [], updates: [] };
    function insert(table, obj) { db[table].push(obj); ops.inserts.push({ table: table, obj: obj }); }
    function update(table, obj, fields) {
      Object.keys(fields).forEach(function (k) { obj[k] = fields[k]; });
      ops.updates.push({ table: table, obj: obj, fields: fields });
    }
    function fail(msg) { return { result: { ok: false, error: msg }, ops: ops }; }
    function ok(data) { var o = { ok: true }; Object.keys(data || {}).forEach(function (k) { o[k] = data[k]; }); return { result: o, ops: ops }; }
    function checkRange(masuk, keluar, allowPast) {
      if (!isDate(masuk) || !isDate(keluar)) return 'Tanggal masuk dan keluar wajib diisi.';
      if (!allowPast && masuk < ctx.today) return 'Tanggal masuk sudah lewat.';
      var n = nights(masuk, keluar);
      if (n < 1) return 'Tanggal keluar harus setelah tanggal masuk.';
      if (n > MAKS_MALAM) return 'Lama menginap paling banyak ' + MAKS_MALAM + ' malam.';
      return null;
    }

    if (String(action).indexOf('admin') === 0) {
      if (!ctx.pin || String(p.pin || '') !== String(ctx.pin)) return fail('PIN petugas salah.');
    }

    switch (action) {
      case 'config':
        return ok({ tipe: db.tipe.map(publicTipe) });

      case 'ketersediaan': {
        var tipe = txt(p.tipe, 30);
        if (!tipeOf(db, tipe)) return fail('Tipe kamar tidak dikenal.');
        if (!isDate(p.dari) || !isDate(p.sampai)) return fail('Rentang tanggal tidak valid.');
        var hari = {}, d = p.dari, n = 0;
        while (d <= p.sampai && n < 93) { hari[d] = freeOn(db, tipe, d); d = addDays(d, 1); n++; }
        return ok({ total: roomsOf(db, tipe).length, hari: hari });
      }

      case 'pesan': {
        if (txt(p.website)) return fail('Permintaan ditolak.');
        var r = {
          nama: txt(p.nama, 100), instansi: txt(p.instansi, 150), hp: digits(p.hp).slice(0, 15),
          email: txt(p.email, 120), keperluan: txt(p.keperluan, 100), tipe: txt(p.tipe, 30),
          jumlah: parseInt(p.jumlah, 10), masuk: txt(p.masuk, 10), keluar: txt(p.keluar, 10),
          catatan_tamu: txt(p.catatan, 300)
        };
        if (!r.nama) return fail('Nama pemesan wajib diisi.');
        if (r.hp.length < 9) return fail('Nomor WhatsApp belum lengkap.');
        var t = tipeOf(db, r.tipe);
        if (!t) return fail('Pilih tipe kamar.');
        if (!(r.jumlah >= 1 && r.jumlah <= MAKS_KAMAR)) return fail('Jumlah kamar 1 sampai ' + MAKS_KAMAR + '.');
        var e1 = checkRange(r.masuk, r.keluar);
        if (e1) return fail(e1);
        var sisa = minFree(db, r.tipe, r.masuk, r.keluar);
        if (sisa < r.jumlah) return fail(t.nama + ' hanya tersisa ' + sisa + ' kamar pada tanggal itu. Ubah tanggal atau jumlah kamar.');
        r.kode = makeKode('MDL', r.masuk, ctx.rand);
        r.dibuat = ctx.now;
        r.status = 'menunggu';
        r.billing = ''; r.catatan_petugas = ''; r.kamar = '';
        insert('reservasi', r);
        return ok({ reservasi: publicRes(db, r) });
      }

      case 'cek': {
        var kode = txt(p.kode, 30).toUpperCase();
        var hp4 = digits(p.hp4).slice(-4);
        var rc = find(db.reservasi, function (x) { return String(x.kode).toUpperCase() === kode; });
        if (!rc || hp4.length !== 4 || digits(rc.hp).slice(-4) !== hp4) return fail('Kode reservasi atau 4 digit terakhir nomor HP tidak cocok.');
        return ok({ reservasi: publicRes(db, rc) });
      }

      case 'peserta': {
        var tok = txt(p.k, 40);
        var ps = tok ? find(db.peserta, function (x) { return x.token === tok; }) : null;
        if (!ps) return fail('Link info kamar tidak ditemukan. Minta link baru ke panitia pelatihan.');
        var km = find(db.kamar, function (k) { return k.no === ps.kamar; });
        var tp = km ? tipeOf(db, km.tipe) : null;
        var teman = db.peserta.filter(function (x) {
          return x.token !== ps.token && x.kamar === ps.kamar && x.kode_reservasi === ps.kode_reservasi;
        }).map(function (x) { return { nama: x.nama, instansi: x.instansi }; });
        return ok({ peserta: { nama: ps.nama, pelatihan: ps.pelatihan, kamar: ps.kamar, lantai: km ? km.lantai : '', tipeNama: tp ? tp.nama : '', masuk: ps.masuk, keluar: ps.keluar, teman: teman } });
      }

      case 'adminData': {
        var groups = {};
        db.peserta.forEach(function (x) {
          var key = x.pelatihan + '|' + x.masuk + '|' + x.keluar;
          if (!groups[key]) groups[key] = { pelatihan: x.pelatihan, masuk: x.masuk, keluar: x.keluar, peserta: [] };
          groups[key].peserta.push({ token: x.token, nama: x.nama, jk: x.jk, instansi: x.instansi, hp: x.hp, kamar: x.kamar });
        });
        var res = db.reservasi.slice().sort(function (a, b) { return String(b.dibuat).localeCompare(String(a.dibuat)); });
        return ok({
          tipe: db.tipe.map(publicTipe),
          kamar: db.kamar.map(function (k) { return { no: k.no, tipe: k.tipe, lantai: k.lantai, kapasitas: k.kapasitas, status: k.status || 'siap', catatan: k.catatan || '' }; }),
          reservasi: res.map(function (x) {
            var o = publicRes(db, x);
            o.instansi = x.instansi; o.hp = x.hp; o.email = x.email; o.keperluan = x.keperluan;
            o.catatanTamu = x.catatan_tamu; o.dibuat = x.dibuat; o.kamar = x.kamar;
            return o;
          }),
          pelatihan: Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return String(b.masuk).localeCompare(String(a.masuk)); })
        });
      }

      case 'adminStatus': {
        var ra = find(db.reservasi, function (x) { return x.kode === p.kode; });
        if (!ra) return fail('Reservasi tidak ditemukan.');
        var st = txt(p.status, 20);
        if (STATUS.indexOf(st) < 0) return fail('Status tidak dikenal.');
        if (st !== ra.status && ACTIVE.indexOf(st) >= 0 && !isActive(ra)) {
          var s2 = minFree(db, ra.tipe, ra.masuk, ra.keluar, ra.kode);
          if (s2 < Number(ra.jumlah)) return fail('Kamar sudah tidak cukup untuk mengaktifkan kembali reservasi ini (sisa ' + s2 + ').');
        }
        update('reservasi', ra, { status: st, billing: txt(p.billing, 60), catatan_petugas: txt(p.catatan, 300), kamar: txt(p.kamar, 200) });
        return ok({ reservasi: publicRes(db, ra) });
      }

      case 'adminKamar': {
        var kk = find(db.kamar, function (k) { return k.no === p.no; });
        if (!kk) return fail('Kamar tidak ditemukan.');
        if (KAMAR_STATUS.indexOf(p.status) < 0) return fail('Status kamar tidak dikenal.');
        update('kamar', kk, { status: p.status });
        return ok({});
      }

      case 'adminKamarBebas': {
        var e2 = checkRange(p.masuk, p.keluar, true);
        if (e2) return fail(e2);
        return ok({ kamar: freeRooms(db, p.masuk, p.keluar) });
      }

      case 'adminRooming': {
        var pel = txt(p.pelatihan, 150);
        if (!pel) return fail('Nama pelatihan wajib diisi.');
        var e3 = checkRange(p.masuk, p.keluar, true);
        if (e3) return fail(e3);
        var list = (p.kamar || []).filter(function (k) { return k && k.peserta && k.peserta.length; });
        if (!list.length) return fail('Belum ada peserta yang ditempatkan.');
        var bebas = {};
        freeRooms(db, p.masuk, p.keluar).forEach(function (k) { bebas[k.no] = k; });
        var perTipe = {};
        for (var i = 0; i < list.length; i++) {
          var info = bebas[list[i].no];
          if (!info) return fail('Kamar ' + list[i].no + ' sudah tidak kosong. Susun ulang rooming list.');
          (perTipe[info.tipe] = perTipe[info.tipe] || []).push(list[i]);
        }
        var hasil = [];
        Object.keys(perTipe).forEach(function (tp2) {
          var rooms = perTipe[tp2];
          var rr = {
            kode: makeKode('PLT', p.masuk, ctx.rand), dibuat: ctx.now, nama: pel, instansi: 'Bapelkes Mataram',
            hp: '', email: '', keperluan: 'Pelatihan internal', tipe: tp2, jumlah: rooms.length,
            masuk: p.masuk, keluar: p.keluar, catatan_tamu: '', status: 'pelatihan', billing: '', catatan_petugas: '',
            kamar: rooms.map(function (k) { return k.no; }).join(', ')
          };
          insert('reservasi', rr);
          rooms.forEach(function (k) {
            k.peserta.forEach(function (x) {
              var row = {
                token: ctx.rand(12), pelatihan: pel, kode_reservasi: rr.kode, nama: txt(x.nama, 100),
                jk: x.jk === 'P' ? 'P' : 'L', instansi: txt(x.instansi, 150), hp: digits(x.hp).slice(0, 15),
                kamar: k.no, masuk: p.masuk, keluar: p.keluar, dibuat: ctx.now
              };
              insert('peserta', row);
              hasil.push({ token: row.token, nama: row.nama, jk: row.jk, instansi: row.instansi, hp: row.hp, kamar: row.kamar });
            });
          });
        });
        return ok({ peserta: hasil });
      }

      default:
        return fail('Perintah tidak dikenal.');
    }
  }

  return { handle: handle, addDays: addDays, nights: nights, STATUS: STATUS, KAMAR_STATUS: KAMAR_STATUS };
})();

/* ================================================================
 * Bagian di bawah ini khusus Google Apps Script (penghubung ke Sheets)
 * ================================================================ */

var TABLES = {
  tipe:      { sheet: 'Tipe',      cols: ['id', 'nama', 'kapasitas', 'fasilitas', 'tarif', 'foto'] },
  kamar:     { sheet: 'Kamar',     cols: ['no', 'tipe', 'lantai', 'kapasitas', 'status', 'catatan'] },
  reservasi: { sheet: 'Reservasi', cols: ['kode', 'dibuat', 'nama', 'instansi', 'hp', 'email', 'keperluan', 'tipe', 'jumlah', 'masuk', 'keluar', 'catatan_tamu', 'status', 'billing', 'catatan_petugas', 'kamar'] },
  peserta:   { sheet: 'Peserta',   cols: ['token', 'pelatihan', 'kode_reservasi', 'nama', 'jk', 'instansi', 'hp', 'kamar', 'masuk', 'keluar', 'dibuat'] }
};
var WRITE_ACTIONS = ['pesan', 'adminStatus', 'adminKamar', 'adminRooming'];

function doGet(e) { return run_(e.parameter.action, e.parameter); }

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { /* abaikan */ }
  return run_(body.action, body);
}

function run_(action, p) {
  var write = WRITE_ACTIONS.indexOf(action) >= 0;
  var lock = LockService.getScriptLock();
  if (write) lock.waitLock(20000);
  try {
    var props = PropertiesService.getScriptProperties();
    var tz = Session.getScriptTimeZone();
    var now = new Date();
    var ctx = {
      today: Utilities.formatDate(now, tz, 'yyyy-MM-dd'),
      now: Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm'),
      pin: props.getProperty('ADMIN_PIN'),
      rand: rand_
    };
    var db = load_();
    var out = Core.handle(db, action, p || {}, ctx);
    apply_(out.ops);
    if (action === 'pesan' && out.result.ok) notify_(props, out.result.reservasi, db);
    return json_(out.result);
  } catch (err) {
    return json_({ ok: false, error: 'Terjadi kesalahan di server: ' + err.message });
  } finally {
    if (write) lock.releaseLock();
  }
}

function load_() {
  var db = {};
  var tz = Session.getScriptTimeZone();
  Object.keys(TABLES).forEach(function (name) {
    var sh = sheet_(name);
    var values = sh.getDataRange().getValues();
    var head = values.shift().map(function (h) { return String(h).trim().toLowerCase(); });
    db[name] = [];
    values.forEach(function (row, i) {
      if (row[0] === '' || row[0] === null) return;
      var o = { _row: i + 2 };
      head.forEach(function (h, j) {
        var v = row[j];
        if (v instanceof Date) v = Utilities.formatDate(v, tz, h === 'dibuat' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
        o[h] = (v === null || v === undefined) ? '' : (typeof v === 'number' ? v : String(v).trim());
      });
      ['no', 'id', 'tipe', 'status', 'kode', 'token', 'kamar', 'hp'].forEach(function (k) { if (k in o) o[k] = String(o[k]); });
      db[name].push(o);
    });
  });
  return db;
}

function apply_(ops) {
  ops.inserts.forEach(function (op) {
    var t = TABLES[op.table];
    sheet_(op.table).appendRow(t.cols.map(function (c) { return cell_(op.obj[c]); }));
  });
  ops.updates.forEach(function (op) {
    var t = TABLES[op.table];
    var sh = sheet_(op.table);
    Object.keys(op.fields).forEach(function (f) {
      var col = t.cols.indexOf(f);
      if (col >= 0 && op.obj._row) sh.getRange(op.obj._row, col + 1).setValue(cell_(op.fields[f]));
    });
  });
}

// Simpan sebagai teks agar nomor HP, tanggal, dan kode tidak diubah otomatis oleh Sheets,
// dan cegah isian tamu dibaca sebagai rumus.
function cell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v;
  var s = String(v);
  if (/^[=+\-@]/.test(s) || /^0\d+$/.test(s) || /^\d+$/.test(s) && s.length > 6 || /^\d{4}-\d{2}-\d{2}/.test(s)) return "'" + s;
  return s;
}

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TABLES[name].sheet);
  if (!sh) throw new Error('Sheet "' + TABLES[name].sheet + '" belum ada. Jalankan fungsi setup() sekali.');
  return sh;
}

function rand_(n) {
  var s = '';
  while (s.length < n) s += Utilities.getUuid().replace(/-/g, '');
  return s.slice(0, n);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function notify_(props, r, db) {
  var to = props.getProperty('ADMIN_EMAIL');
  if (!to || !r) return;
  var full = null;
  db.reservasi.forEach(function (x) { if (x.kode === r.kode) full = x; });
  try {
    MailApp.sendEmail(to, 'Pemesanan baru Asrama Mandalika: ' + r.kode,
      'Ada pemesanan baru yang menunggu verifikasi.\n\n' +
      'Kode: ' + r.kode + '\nNama: ' + r.nama + '\nInstansi: ' + (full ? full.instansi : '') +
      '\nWhatsApp: ' + (full ? full.hp : '') + '\nKamar: ' + r.tipeNama + ' x ' + r.jumlah +
      '\nTanggal: ' + r.masuk + ' s.d. ' + r.keluar + '\n\nBuka halaman petugas untuk memverifikasi.');
  } catch (err) { /* email gagal tidak membatalkan pemesanan */ }
}

/**
 * Jalankan SEKALI dari editor Apps Script (pilih fungsi setup, klik Jalankan).
 * Membuat sheet, header, contoh tipe & kamar, dan PIN petugas awal.
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABLES).forEach(function (name) {
    var t = TABLES[name];
    var sh = ss.getSheetByName(t.sheet) || ss.insertSheet(t.sheet);
    if (sh.getLastRow() === 0) {
      sh.appendRow(t.cols);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, t.cols.length).setFontWeight('bold');
    }
    sh.getRange(1, 1, sh.getMaxRows(), t.cols.length).setNumberFormat('@');
  });
  var tipe = ss.getSheetByName('Tipe');
  if (tipe.getLastRow() === 1) {
    tipe.getRange(2, 1, 3, 6).setValues([
      ['vip', 'Kamar VIP', '2', 'Tempat tidur besar, AC, kamar mandi dalam, meja kerja', '[Tarif PNBP]', ''],
      ['standar', 'Kamar Standar', '2', 'Dua tempat tidur, AC, kamar mandi dalam, lemari', '[Tarif PNBP]', ''],
      ['asrama', 'Kamar Asrama', '4', 'Empat tempat tidur, kamar mandi bersama, loker', '[Tarif PNBP]', '']
    ]);
  }
  var kamar = ss.getSheetByName('Kamar');
  if (kamar.getLastRow() === 1) {
    var rows = [];
    ['101', '102', '103', '104'].forEach(function (n) { rows.push(['M-' + n, 'vip', '1', '2', 'siap', '']); });
    ['105', '106', '107', '108', '201', '202', '203', '204', '205', '206'].forEach(function (n) { rows.push(['M-' + n, 'standar', n.charAt(0), '2', 'siap', '']); });
    ['207', '208'].forEach(function (n) { rows.push(['M-' + n, 'asrama', '2', '4', 'siap', '']); });
    kamar.getRange(2, 1, rows.length, 6).setValues(rows);
  }
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_PIN')) props.setProperty('ADMIN_PIN', 'GantiPinIni-' + rand_(6));
  Logger.log('Selesai. PIN petugas: ' + props.getProperty('ADMIN_PIN') +
    '\nGanti PIN di Project Settings > Script properties > ADMIN_PIN.');
}
