/*
 * Pengaturan situs. Ubah bagian ini saja, lalu unggah ulang ke GitHub.
 */
window.CONFIG = {
  // URL Web App dari Google Apps Script (berakhiran /exec).
  // Biarkan kosong untuk MODE DEMO: data hanya tersimpan di browser yang sedang dipakai.
  API_URL: '',

  NAMA_ASRAMA: 'Asrama Mandalika',
  INSTANSI: 'Balai Pelatihan Kesehatan (Bapelkes) Mataram',

  // Nomor WhatsApp petugas, format internasional tanpa + (contoh: 6281234567890)
  WHATSAPP_PETUGAS: '',
  EMAIL: '',
  ALAMAT: 'Jl. Gora II, Selagalas, Kec. Sandubaya, Kota Mataram, Nusa Tenggara Barat',
  JAM_LAYANAN: '[Jam layanan petugas]',

  // Sesuaikan dengan aturan asrama
  JAM_CHECKIN: '[jam check-in]',
  JAM_CHECKOUT: '[jam check-out]',
  // Foto (file .jpg di folder yang sama dengan index.html)
  FOTO_GEDUNG: 'foto-gedung.jpg',
  FOTO_KAMAR: ['foto-kamar-1.jpg', 'foto-kamar-2.jpg'],
  FOTO_RESTO: 'foto-resto.jpg',

  TATA_TERTIB: [
    'Tunjukkan kode reservasi atau kode QR saat check-in.',
    'Dilarang merokok di dalam kamar dan area asrama.',
    'Kunci kamar dikembalikan ke resepsionis saat check-out.'
  ]
};
