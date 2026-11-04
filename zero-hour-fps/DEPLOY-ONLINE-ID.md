# Deploy Zero Hour v1.2 ke GitHub + Render

Paket ini adalah **Zero Hour v1.2 saja** (tidak digabung dengan v2.11). Map, karakter, senjata, UI, dan gameplay v1.2 dipertahankan. Perubahan kode khusus hosting: endpoint `/health`, cache aset statis di production, binding port Render, dan shutdown rapi.

## A. Upload ke GitHub

1. Ekstrak ZIP ini dengan WinRAR.
2. Buka folder `zero-hour-fps`.
3. Buat repository baru di <https://github.com/new>.
4. Upload **isi folder `zero-hour-fps`** ke root repository (jangan upload folder pembungkus `zero-hour-fps` sebagai satu tingkat tambahan).
5. Pastikan `server.js`, `package.json`, `render.yaml`, `README.md`, dan `public/` berada langsung di root repository.
6. Commit changes ke branch `main`.

Jangan upload folder `node_modules` bila ada.

## B. Deploy ke Render

1. Masuk ke <https://dashboard.render.com/> dan hubungkan GitHub.
2. Pilih **New → Blueprint**.
3. Pilih repository Zero Hour v1.2 yang baru di-upload.
4. Render membaca `render.yaml`. Pastikan service bertipe **Web Service**, runtime Node, region Singapore, dan instance Free (jika masih tersedia pada akun).
5. Klik **Apply / Deploy Blueprint**.
6. Tunggu hingga status service menjadi **Live**.

Render akan memberikan domain sendiri, misalnya `https://nama-service.onrender.com`. Domain contoh ini bukan alamat sebenarnya; gunakan URL yang tampil pada dashboard Render.

## C. Tes server

Buka `https://NAMA-SERVICE.onrender.com/health`. Hasil yang diharapkan:

```json
{
  "ok": true,
  "service": "zero-hour-fps",
  "version": "1.2.0"
}
```

Lalu buka halaman utama di domain yang sama. Buka game pada dua perangkat, masukkan nama berbeda dan kode room yang sama, kemudian tekan Play.

## D. Catatan multiplayer

- Game menggunakan Socket.IO pada origin yang sama (`io()`); tidak perlu memasukkan `localhost` atau IP laptop ke HTML.
- Render Web Service mendukung WebSocket dan Socket.IO juga dapat menggunakan polling fallback.
- Untuk versi ini, room dan state pemain disimpan di memori satu proses Node. Pertahankan **satu instance**; jangan menambah instance atau autoscaling sebelum menambahkan shared state/adapter seperti Redis.
- Deployment ulang atau restart server akan mengakhiri room aktif.
- Layanan Free dapat sleep saat idle, sehingga pemain pertama mungkin menunggu server bangun.

## E. Jalankan lokal

```bash
npm install
npm start
```

Buka <http://localhost:3000>.
