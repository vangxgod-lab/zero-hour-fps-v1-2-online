# Zero Hour v1.2 – map siang hari, karakter 3D, animasi senjata

Jalankan: `npm install` lalu `npm start`, buka http://localhost:3000
(struktur: `server.js` di root, file game di folder `public/`).

## Yang baru di v1.2
- **Map ala arena Rivals**: kontainer (20ft/40ft, ada yang 2 tingkat), tumpukan crate, tangga, dok, barikade beton, drum.
  Semua bisa dipanjat dengan lompat (crate 1,0 → 1,8 → 2,6 m jadi "tangga"; atap kontainer & posisi sniper bisa dicapai).
- **Suasana siang**: langit gradasi, matahari, awan, kabut tipis, bayangan (kualitas High), kota & crane di kejauhan.
- **Karakter 3D** (`public/models/player.glb`) dipasang untuk semua pemain, skala 1,8 m sesuai hitbox.
- **Animasi**: idle / jalan / lari (dari file GLB) + dibuat khusus: pegang senjata dua tangan (IK), bidik (ADS),
  hentakan tembak, **reload** (tangan kiri ke magasin), ganti senjata, pump shotgun, bolt sniper, lompat, jalan mundur, mati.
  Pemain lain melihat animasi yang sama lewat jaringan (ganti senjata, reload, bidik, tembak, mati).
- **V** = kamera orang ketiga (lihat karakter sendiri). Di HP: tombol CAM.

## Kontrol
| | PC | HP |
|---|---|---|
| Ganti senjata | **1–8**, scroll mouse, **Q** | ketuk nomor di kiri atas, atau **SWAP** |
| Tembak / zoom | klik kiri / tahan klik kanan | **FIRE** / **ZOOM** |
| Isi ulang / lompat | R / Spasi | R / JUMP |
| Kamera orang ketiga | **V** | **CAM** |

## Catatan teknis
- `GLTFLoader` dan `SkeletonUtils` dimuat dari CDN jsDelivr (three r128). Kalau gagal dimuat, game tetap jalan dengan avatar kotak.
- Semua angka senjata ada di `public/weapons.js` (termasuk titik pegangan tangan: `hold`).
- Layout map ada di `server.js` (bagian "Tembok keliling" sampai `MAP`).


## Deploy online (GitHub + Render)

Lihat **[DEPLOY-ONLINE-ID.md](DEPLOY-ONLINE-ID.md)** untuk langkah upload GitHub dan deployment Render. Proyek ini memakai Render **Web Service** (bukan Static Site) karena Node.js dan Socket.IO harus tetap berjalan. File `render.yaml` sudah disediakan.
