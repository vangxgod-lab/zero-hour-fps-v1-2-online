const express = require('express'), http = require('http'), fs = require('fs'), path = require('path'), { Server } = require('socket.io');
const app = express(), server = http.createServer(app), io = new Server(server);
// Folder "public" dipakai kalau ada; kalau file game ditaruh sejajar server.js, folder ini sendiri yang dipakai.
const PUB = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;

// Endpoint ringan untuk health check Render (dan pemeriksaan server lokal).
app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'zero-hour-fps', version: '1.2.0' });
});

app.use(express.static(PUB, {
  etag: true,
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
}));
const WEAPONS = require(path.join(PUB, 'weapons.js')), WP = WEAPONS.list, RANGE = WEAPONS.RANGE;

// ---------- Peta (dipakai server untuk raycast, dikirim ke klien untuk render) ----------
// Setiap objek = kotak padat dari lantai (0) sampai tinggi h (dipakai untuk tabrakan & peluru).
// k = jenis tampilan, c = warna, y0 = tinggi dasar tampilan (objek yang ditumpuk di atas objek lain).
// Lompatan pemain ±1,6 m, jadi crate setinggi 1,0 → 1,8 → 2,6 membentuk "tangga" ke atas kontainer.
const boxes = [];
const add = (x, z, w, d, h, k, c, y0 = 0) => boxes.push({ x, z, w, d, h, k, c, y0 });
const COL = { red: 0xb23a2e, blue: 0x2c5d9b, green: 0x2f7d4f, orange: 0xd9822b, yellow: 0xd8b32e, teal: 0x2a8f8f, white: 0xc9d1d6, grey: 0x6d7a83 };
const WOOD = [0xe0bd8a, 0xd1a46c, 0xefd0a0];
const cont = (x, z, w, d, h, c, y0) => add(x, z, w, d, h, 'container', c, y0);   // kontainer (20ft = 6 m, 40ft = 12 m)
const crate = (x, z, s, h, y0, c = 0xffffff) => add(x, z, s, s, h, 'crate', c, y0);

// Tembok keliling
add(0, -30.5, 62, 1, 6, 'wall', 0xcfc9bb); add(0, 30.5, 62, 1, 6, 'wall', 0xcfc9bb);
add(-30.5, 0, 1, 62, 6, 'wall', 0xcfc9bb); add(30.5, 0, 1, 62, 6, 'wall', 0xcfc9bb);

// Pusat arena: kontainer putih panjang + tangga di sisi barat + crate di sisi timur + posisi sniper di atas
cont(0, 0, 12, 2.4, 2.6, COL.white);
[[-6.5, 2.5], [-7.5, 2.0], [-8.5, 1.5], [-9.5, 1.0], [-10.5, 0.5]].forEach(([x, h]) => add(x, 0, 1, 2.4, h, 'steps', 0xa7a398));
crate(7.0, 0, 1.4, 1.0, 0, WOOD[1]);
crate(-2.5, 0, 1.2, 3.8, 2.6, WOOD[0]); crate(2.5, 0, 1.0, 3.4, 2.6, WOOD[2]);

// Satu kuadran, dicerminkan ke 4 sisi (warna kontainer dibedakan agar tiap sudut mudah dikenali)
const QCOL = [['red', 'blue', 'orange'], ['green', 'yellow', 'teal'], ['blue', 'orange', 'red'], ['teal', 'red', 'green']];
let qi = 0;
for (const sx of [1, -1]) for (const sz of [1, -1]) {
  const [c1, c2, c3] = QCOL[qi++], X = x => sx * x, Z = z => sz * z;
  // a) kontainer 40ft + crate untuk naik
  cont(X(15), Z(9), 12, 2.4, 2.6, COL[c1]);
  crate(X(21.9), Z(9), 1.4, 1.0, 0, WOOD[qi % 3]);
  // b) menara kontainer 2 tingkat; atap bawah bisa dipanjat lewat crate, lalu crate di atap → atap tingkat 2
  cont(X(25), Z(15), 2.4, 12, 2.6, COL[c2]);
  cont(X(25), Z(12), 2.4, 6, 5.2, COL[c3], 2.6);
  crate(X(22.5), Z(19), 1.4, 1.0, 0, WOOD[(qi + 1) % 3]);
  crate(X(25), Z(15.7), 1.2, 3.8, 2.6, WOOD[(qi + 2) % 3]);
  // c) tumpukan crate bertingkat 1,0 → 1,8 → 2,6
  crate(X(8), Z(24.5), 1.6, 1.0, 0, WOOD[0]); crate(X(9.6), Z(24.5), 1.6, 1.8, 0, WOOD[1]); crate(X(9.6), Z(26.1), 1.6, 2.6, 0, WOOD[2]);
  // d) barikade beton
  add(X(16), Z(18), 5, 0.8, 1.1, 'barrier', 0xb1ada3); add(X(5), Z(14), 0.8, 4, 1.1, 'barrier', 0xb1ada3);
  // e) dok rendah + crate di atasnya
  add(X(10), Z(14), 5, 5, 1.2, 'dock', 0x9a968c); crate(X(11), Z(15), 1.0, 2.2, 1.2, WOOD[1]);
  // f) drum
  add(X(20), Z(5), 0.9, 0.9, 1.2, 'barrel', 0xb23a2e); add(X(21.1), Z(4.2), 0.9, 0.9, 1.2, 'barrel', 0x2c5d9b);
}
const MAP = { size: 60, boxes };
const SPAWNS = [[-25, -25], [25, -25], [-25, 25], [25, 25], [0, -26], [0, 26], [-26, 0], [26, 0]];
const MAX_PER_ROOM = 8, HP = 100, REGEN_DELAY = 5000, rooms = {}; // rooms[kode] = { [socketId]: player }

const num = (v, lim) => Math.max(-lim, Math.min(lim, +v || 0));
const pub = p => ({ id: p.id, n: p.n, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, hp: p.hp, alive: p.alive, w: p.w });
const board = r => Object.values(rooms[r] || {}).map(p => ({ id: p.id, n: p.n, k: p.k, d: p.d }));

function pickSpawn(room) {
  let best = SPAWNS[0], bd = -1;
  for (const s of SPAWNS) {
    let md = 1e9;
    for (const q of Object.values(rooms[room])) if (q.alive) md = Math.min(md, Math.hypot(q.x - s[0], q.z - s[1]));
    md += Math.random() * 5;
    if (md > bd) { bd = md; best = s; }
  }
  return best;
}
function rayBox(o, d, b) {
  const mn = [b.x - b.w / 2, 0, b.z - b.d / 2], mx = [b.x + b.w / 2, b.h, b.z + b.d / 2];
  let t0 = 0, t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) return Infinity; continue; }
    let a = (mn[i] - o[i]) / d[i], c = (mx[i] - o[i]) / d[i];
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    if (t0 > t1) return Infinity;
  }
  return t0;
}
function raySphere(o, d, c, r) {
  const ox = c[0] - o[0], oy = c[1] - o[1], oz = c[2] - o[2];
  const tca = ox * d[0] + oy * d[1] + oz * d[2];
  if (tca < 0) return null;
  const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
  return d2 > r * r ? null : tca - Math.sqrt(r * r - d2);
}
// Sebar peluru acak dalam kerucut dengan setengah-sudut `deg` derajat.
function spreadDir(dir, deg) {
  if (deg <= 0) return dir;
  const up = Math.abs(dir[1]) > .99 ? [1, 0, 0] : [0, 1, 0];
  let r = [dir[1] * up[2] - dir[2] * up[1], dir[2] * up[0] - dir[0] * up[2], dir[0] * up[1] - dir[1] * up[0]];
  const rl = Math.hypot(...r); r = r.map(v => v / rl);
  const u = [dir[1] * r[2] - dir[2] * r[1], dir[2] * r[0] - dir[0] * r[2], dir[0] * r[1] - dir[1] * r[0]];
  const a = Math.random() * Math.PI * 2, m = Math.sqrt(Math.random()) * Math.tan(deg * Math.PI / 180);
  const o = dir.map((v, i) => v + r[i] * Math.cos(a) * m + u[i] * Math.sin(a) * m), l = Math.hypot(...o);
  return o.map(v => v / l);
}
// Damage berkurang linear antara jarak fo[0] dan fo[1], lalu tetap di fo[2] (pengali minimum).
const falloff = (t, w) => t <= w.fo[0] ? 1 : t >= w.fo[1] ? w.fo[2] : 1 - (1 - w.fo[2]) * (t - w.fo[0]) / (w.fo[1] - w.fo[0]);

io.on('connection', socket => {
  let me = null;

  socket.on('player-join', ({ name, room } = {}) => {
    if (me) return;
    const code = String(room || 'ARENA').replace(/[^\w-]/g, '').slice(0, 16).toUpperCase() || 'ARENA';
    rooms[code] = rooms[code] || {};
    if (Object.keys(rooms[code]).length >= MAX_PER_ROOM) return socket.emit('room-full');
    const n = String(name || 'Player').replace(/[<>]/g, '').trim().slice(0, 12) || 'Player';
    const [x, z] = pickSpawn(code);
    me = rooms[code][socket.id] = {
      id: socket.id, room: code, n, x, y: 0, z, yaw: 0, pitch: 0, hp: HP, alive: true, k: 0, d: 0,
      last: 0, w: WEAPONS.DEFAULT, swUntil: 0, hurt: 0
    };
    socket.join(code);
    socket.emit('init', {
      id: socket.id, room: code, map: MAP, me: pub(me),
      players: Object.values(rooms[code]).filter(q => q !== me).map(pub)
    });
    socket.to(code).emit('player-join', pub(me));
    io.to(code).emit('scoreboard', board(code));
  });

  socket.on('player-move', s => {
    if (!me || !me.alive || !s || !Array.isArray(s.p)) return;
    me.x = num(s.p[0], MAP.size / 2); me.z = num(s.p[2], MAP.size / 2);
    me.y = Math.max(0, num(s.p[1], 20)); me.yaw = num(s.yaw, 100); me.pitch = num(s.pitch, 2); me.a = s.a ? 1 : 0;
    socket.to(me.room).volatile.emit('player-move', { id: me.id, x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: me.pitch, a: me.a });
  });

  // Ganti senjata: server mencatat senjata aktif + jeda ganti, lalu memberi tahu pemain lain.
  socket.on('player-switch', ({ w } = {}) => {
    if (!me || !me.alive || !Number.isInteger(w) || w < 0 || w >= WP.length || w === me.w) return;
    me.w = w; me.swUntil = Date.now() + WP[w].switchMs * .4;
    socket.to(me.room).emit('player-switch', { id: me.id, w });
  });

  // Pemain lain hanya perlu tahu kapan reload dimulai (untuk animasi); durasinya dari data senjata.
  socket.on('player-reload', () => {
    if (!me || !me.alive || Date.now() - (me.rl || 0) < 300) return;
    me.rl = Date.now(); socket.to(me.room).emit('player-reload', { id: me.id });
  });

  socket.on('player-shoot', ({ d, ads, mv, air } = {}) => {
    const now = Date.now();
    if (!me || !me.alive || !Array.isArray(d) || now < me.swUntil) return;
    const wp = WP[me.w];
    if (now - me.last < wp.interval * .6) return;          // batas fire rate per senjata (toleransi lag)
    me.last = now;
    const l = Math.hypot(+d[0], +d[1], +d[2]);
    if (!l || !isFinite(l)) return;
    const base = [d[0] / l, d[1] / l, d[2] / l], o = [me.x, me.y + 1.6, me.z];
    // Sebaran: membidik (ADS) mengecilkan, bergerak/melompat membesarkan.
    const sp = wp.spread * (ads ? wp.adsMul : 1) * (mv ? 1.5 : 1) * (air ? 2 : 1);

    const hits = new Map(), ends = [], others = Object.values(rooms[me.room]).filter(q => q !== me && q.alive);
    for (let i = 0; i < wp.pellets; i++) {
      const dir = spreadDir(base, sp);
      let tMax = RANGE, type = 0, target = null, head = false;
      for (const b of MAP.boxes) { const t = rayBox(o, dir, b); if (t < tMax) { tMax = t; type = 1; } }
      if (dir[1] < -1e-6) { const t = -o[1] / dir[1]; if (t < tMax) { tMax = t; type = 1; } }   // lantai
      for (const q of others) {
        let t = raySphere(o, dir, [q.x, q.y + 1.6, q.z], 0.3);
        if (t !== null && t < tMax) { tMax = t; target = q; head = true; }
        t = raySphere(o, dir, [q.x, q.y + 0.8, q.z], 0.55);
        if (t !== null && t < tMax) { tMax = t; target = q; head = false; }
      }
      if (target) {
        type = 2;
        const h = hits.get(target) || { dmg: 0, head: false };
        h.dmg += wp.dmg * (head ? wp.headMul : 1) * falloff(tMax, wp); h.head = h.head || head;
        hits.set(target, h);
      }
      ends.push([+(o[0] + dir[0] * tMax).toFixed(2), +(o[1] + dir[1] * tMax).toFixed(2), +(o[2] + dir[2] * tMax).toFixed(2), type]);
    }
    io.to(me.room).emit('player-shoot', { id: me.id, w: me.w, o, es: ends });

    for (const [target, h] of hits) {
      target.hp -= Math.max(1, Math.round(h.dmg)); target.hurt = now;
      const dead = target.hp <= 0;
      socket.emit('hit-confirm', { head: h.head, kill: dead });
      io.to(target.id).emit('player-damaged', { hp: Math.max(0, target.hp) });
      if (!dead) continue;

      target.alive = false; target.hp = 0; target.d++; me.k++;
      const room = me.room, tid = target.id;
      io.to(room).emit('player-kill', { k: me.n, v: target.n, vid: tid, h: h.head, w: me.w });
      io.to(room).emit('scoreboard', board(room));
      setTimeout(() => {
        const q = rooms[room] && rooms[room][tid];
        if (!q) return;
        const [x, z] = pickSpawn(room);
        Object.assign(q, { x, y: 0, z, hp: HP, alive: true, hurt: 0 });
        io.to(room).emit('player-respawn', pub(q));
      }, 3000);
    }
  });

  socket.on('disconnect', () => {
    if (!me) return;
    const room = me.room;
    delete rooms[room][socket.id];
    io.to(room).emit('player-leave', socket.id);
    if (Object.keys(rooms[room]).length) io.to(room).emit('scoreboard', board(room));
    else delete rooms[room];
  });
});

// Regenerasi darah: +10 HP/detik setelah 5 detik tidak terkena tembakan.
setInterval(() => {
  const now = Date.now();
  for (const r in rooms) for (const p of Object.values(rooms[r]))
    if (p.alive && p.hp < HP && now - p.hurt > REGEN_DELAY) {
      p.hp = Math.min(HP, p.hp + 10); io.to(p.id).emit('hp-update', { hp: p.hp });
    }
}, 1000);

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`ZERO HOUR v1.2 siap di 0.0.0.0:${PORT}`);
});

// Penutupan rapi saat Render mengganti instance / menghentikan service.
function shutdown(signal) {
  console.log(`${signal} diterima; menutup Zero Hour...`);
  io.close(() => {
    server.close(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
