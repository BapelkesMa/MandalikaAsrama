# Asrama Mandalika – Pemesanan Kamar Bapelkes Mataram

Situs statis untuk GitHub Pages dengan Google Sheets sebagai tempat penyimpanan data.

| Halaman | Untuk siapa | Isi |
|---|---|---|
| `index.html` | Tamu umum & instansi | Tipe kamar, kalender sisa kamar, formulir pemesanan, cek status |
| `peserta.html` | Peserta pelatihan | Nomor kamar, teman sekamar, kode QR check-in (dibuka dari link WhatsApp) |
| `admin.html` | Petugas asrama | Verifikasi reservasi, kode billing SIMPONI, status kamar, rooming list otomatis |

## Coba dulu tanpa pengaturan (mode demo)

Unggah semua file ke GitHub Pages apa adanya. Selama `API_URL` di `assets/config.js` masih kosong,
situs berjalan dalam **mode demo**: data contoh tersimpan di browser masing-masing, PIN petugas `1234`.
Cocok untuk ditunjukkan ke pimpinan sebelum dipakai sungguhan.

## Menghubungkan ke Google Sheets (mode sungguhan)

1. Buat Google Spreadsheet baru dengan akun kantor, beri nama misalnya **Data Asrama Mandalika**.
2. Di spreadsheet, buka **Ekstensi → Apps Script**. Hapus isi `Code.gs`, lalu tempel seluruh isi
   file `apps-script/Code.gs` dari folder ini. Simpan.
3. Di editor Apps Script, pilih fungsi **setup** di menu atas, klik **Jalankan**, dan izinkan akses.
   Sheet `Tipe`, `Kamar`, `Reservasi`, dan `Peserta` akan dibuat beserta contoh isinya.
   PIN petugas awal muncul di **Log eksekusi**.
4. Ganti PIN: **Setelan project (ikon roda gigi) → Properti skrip → ADMIN_PIN**. Gunakan PIN yang panjang.
   Opsional: tambahkan properti **ADMIN_EMAIL** agar petugas menerima email setiap ada pemesanan baru.
5. Klik **Terapkan → Deployment baru → Jenis: Aplikasi web**.
   - Jalankan sebagai: **Saya**
   - Yang memiliki akses: **Siapa saja**
6. Salin **URL aplikasi web** (berakhiran `/exec`) ke `API_URL` di `assets/config.js`.
7. Lengkapi juga nomor WhatsApp petugas, alamat, jam check-in/out, dan tata tertib di `assets/config.js`,
   lalu unggah ulang ke GitHub.

## Menyesuaikan data asrama

Semua diatur langsung di Google Sheets:

- **Tipe**: `id` (huruf kecil tanpa spasi), nama, kapasitas per kamar, fasilitas, tarif (teks bebas,
  misalnya sesuai ketentuan PNBP), dan `foto` (URL gambar, boleh dikosongkan).
- **Kamar**: satu baris per kamar. Kolom `tipe` harus sama dengan `id` di sheet Tipe.
  Kamar berstatus `perbaikan` tidak dihitung sebagai kamar tersedia.
- **Reservasi** dan **Peserta** diisi otomatis oleh situs. Boleh dikoreksi manual bila perlu.

Setelah mengubah `Code.gs`, buat **Terapkan → Kelola deployment → Edit → Versi baru** agar perubahan berlaku.

## Alur kerja petugas

1. Tamu mengirim pemesanan → status **Menunggu verifikasi** (kamar sudah dikunci sementara).
2. Petugas membuka **Kelola**, mengubah status ke **Disetujui**, mengisi kode billing SIMPONI,
   lalu menekan **Kirim kabar lewat WhatsApp** (pesan sudah tersusun otomatis).
3. Setelah bukti bayar diterima → status **Lunas**, kirim kabar lagi.
4. Tolak atau batalkan bila perlu; kamar otomatis kembali tersedia.

Untuk pelatihan: buka **Rooming list pelatihan**, isi nama dan tanggal, unggah daftar peserta
(Excel/CSV dengan kolom nama, jenis kelamin, instansi, no HP), klik **Cari kamar kosong & susun**,
periksa, lalu **Simpan & buat link peserta**. Kirim link ke tiap peserta lewat tombol WhatsApp.

## Catatan keamanan dan data pribadi

- Halaman tamu hanya menampilkan jumlah sisa kamar, bukan data tamu lain.
- Cek status membutuhkan kode reservasi **dan** 4 angka terakhir nomor HP.
- Link peserta memakai kode acak 12 karakter. Jangan sebarkan rooming list lengkap di grup publik.
- Spreadsheet hanya dibagikan ke petugas yang berwenang (sesuai UU Pelindungan Data Pribadi).

## Untuk pengembang

`assets/core.js` berisi semua aturan (ketersediaan, validasi, rooming). File yang sama dipakai
browser (mode demo) dan server. Setelah mengubahnya, jalankan `./build-gs.sh` untuk membuat ulang
`apps-script/Code.gs`, lalu tempel ulang ke Apps Script.
