'use strict';
const $ = i => document.getElementById(i);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tryP = f => { try { const r = f(); if (r && r.catch) r.catch(() => {}); } catch (e) {} };
const mobile = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
if (mobile) document.body.classList.add('touch');

// ---------- Pengaturan (tersimpan di localStorage) ----------
const S = { sens: 1, vol: 60, sound: true, gfx: 'high', name: '', room: 'ARENA' };
try { Object.assign(S, JSON.parse(localStorage.getItem('zerohour') || '{}')); } catch (e) {}
const save = () => { try { localStorage.setItem('zerohour', JSON.stringify(S)); } catch (e) {} };

// ---------- Senjata (data dibagi dengan server lewat weapons.js) ----------
const WL = WEAPONS.list, NW = WL.length, BASE_FOV = 78;

// ---------- Three.js ----------
const cv = $('c'), scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(BASE_FOV, 1, .1, 230), edges = [];
const ren = new THREE.WebGLRenderer({ canvas: cv, antialias: !mobile });
cam.rotation.order = 'YXZ';

// ---------- Suasana siang hari: langit, matahari, awan, kabut tipis, bayangan ----------
const SKY_HORIZON = 0xcfe6f7, SKY_TOP = 0x3f86d4, SUN_DIR = new THREE.Vector3(.45, .75, .38).normalize();
scene.background = new THREE.Color(SKY_HORIZON); scene.fog = new THREE.Fog(SKY_HORIZON, 45, 190);
scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x9a9488, .72), cam);
const sun = new THREE.DirectionalLight(0xfff0d2, .9); sun.position.copy(SUN_DIR).multiplyScalar(110); scene.add(sun);
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0006; sun.shadow.normalBias = .04;
{ const c = sun.shadow.camera; c.left = c.bottom = -42; c.right = c.top = 42; c.near = 20; c.far = 260; c.updateProjectionMatrix(); }
ren.shadowMap.type = THREE.PCFSoftShadowMap;
function softTex(draw) {
  const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d'));
  return new THREE.CanvasTexture(c);
}
(function buildSky() {
  const g = new THREE.SphereGeometry(150, 24, 16), pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(SKY_TOP), hor = new THREE.Color(SKY_HORIZON), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(hor).lerp(top, Math.pow(Math.max(0, pos.getY(i) / 150), .55));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dome = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -2; scene.add(dome);
  // matahari + cahaya sekitarnya
  const st = softTex(x => { const r = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,252,235,1)'); r.addColorStop(.1, 'rgba(255,246,205,1)'); r.addColorStop(.28, 'rgba(255,232,165,.35)'); r.addColorStop(1, 'rgba(255,225,150,0)');
    x.fillStyle = r; x.fillRect(0, 0, 128, 128); });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: st, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  sp.position.copy(SUN_DIR).multiplyScalar(140); sp.scale.set(70, 70, 1); sp.renderOrder = -1; scene.add(sp);
  // awan
  const ct = softTex(x => { for (const [px, py, r] of [[40, 70, 34], [70, 56, 40], [96, 72, 30], [64, 76, 36]]) {
    const gr = x.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128); } });
  for (let i = 0; i < 11; i++) {
    const a = i * 2.39 + .4, cl = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, fog: false, depthWrite: false, transparent: true, opacity: .88 }));
    cl.position.set(Math.cos(a) * 125, 38 + (i * 17) % 34, Math.sin(a) * 125); cl.scale.set(60 + (i % 3) * 14, 22, 1); cl.renderOrder = -1; scene.add(cl);
  }
})();
function applyGfx() {
  const hi = S.gfx === 'high';
  ren.setPixelRatio(hi ? Math.min(devicePixelRatio, 2) : 1);
  ren.setSize(innerWidth, innerHeight);
  cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
  scene.fog.far = hi ? 190 : 130; edges.forEach(e => e.visible = hi);
  if (ren.shadowMap.enabled !== hi) {                    // bayangan hanya di kualitas High
    ren.shadowMap.enabled = hi; sun.castShadow = hi;
    scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
  }
}
addEventListener('resize', applyGfx); applyGfx();

// ---------- Model senjata (dirakit dari kotak, dipakai untuk viewmodel dan pemain lain) ----------
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: .95, side: THREE.DoubleSide, depthWrite: false });
const flashGeo = new THREE.PlaneGeometry(.16, .16);
function buildGun(d) {
  const g = new THREE.Group();
  for (const [w, h, l, x, y, z, c] of d.model) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), new THREE.MeshLambertMaterial({ color: c }));
    m.position.set(x, y, z); g.add(m);
  }
  const f = new THREE.Group(); f.name = 'flash'; f.visible = false;
  [[0, 0, .4], [0, 0, 1.2], [0, Math.PI / 2, 0]].forEach(([rx, ry, rz]) => {
    const p = new THREE.Mesh(flashGeo, flashMat); p.rotation.set(rx, ry, rz); f.add(p);
  });
  f.scale.setScalar(d.fl); f.position.set(...d.muzzle); g.add(f);
  return g;
}
const protos = WL.map(buildGun);
const vmRoot = new THREE.Group(); cam.add(vmRoot);
const vms = protos.map((p, i) => { const g = p.clone(); g.position.set(...WL[i].vm); g.visible = false; vmRoot.add(g); return g; });
const vmFlash = vms.map(g => g.getObjectByName('flash'));

// Percikan di titik tembakan
const sparkGeo = new THREE.SphereGeometry(.07, 6, 6), fx = [];
function spark(p, col, big) {
  const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true }));
  m.position.set(p[0], p[1], p[2]); m.scale.setScalar(big ? 1.6 : 1); scene.add(m); fx.push({ m, t: .22, big });
}

// ---------- Status ----------
let socket, myId, map, mapG, playing = false, live = false, prev = 'menu', sendT, ac, board = [];
let yaw = 0, pitch = 0, vy = 0, onGround = true, fire = false, fireBuf = 0;   // fireBuf = sisa detik penyimpanan klik (input buffer)
let cur = WEAPONS.DEFAULT, lastW = 1, sw = null, ads = false, reloadEnd = 0, reloadW = 0, burstLeft = 0, nextShot = 0;
let ammo = WL.map(d => d.mag), recoilV = 0, kickAcc = 0, flashT = 0, moving = false, scoped = false, adsBlend = 0, bobT = 0, crossG = -1;
let tp = false, charGltf = null, selfAv = null, selfSp = 0;             // tp = kamera orang ketiga (tombol V)
const P = new THREE.Vector3(), tmp = new THREE.Vector3(), prevP = new THREE.Vector3();
const me = { hp: 100, alive: true }, keys = {}, joy = { x: 0, y: 0 }, remotes = {}, tracers = [];

// ---------- Suara (WebAudio, tanpa file) ----------
function tone(f0, f1, dur, type, vol) {
  if (!ac || !S.sound || S.vol <= 0 || vol <= 0) return;
  const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol * S.vol / 100, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g); g.connect(ac.destination); o.start(); o.stop(t + dur);
}
let noiseBuf;
function noise(dur, vol, freq) {
  if (!ac || !S.sound || S.vol <= 0 || vol <= 0) return;
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const a = noiseBuf.getChannelData(0); for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1;
  }
  const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; f.type = 'lowpass';
  f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(80, freq / 6), t + dur);
  g.gain.setValueAtTime(vol * S.vol / 100, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(f); f.connect(g); g.connect(ac.destination); s.start(t); s.stop(t + dur);
}
function gunshot(d, v = 1) { const s = d.snd; tone(s.f0, s.f1, s.dur, s.type, s.vol * v); noise(s.dur * 1.4, s.nz * v, s.nf); }

// ---------- Menu & pengaturan ----------
const show = id => document.querySelectorAll('.screen').forEach(s => s.classList.toggle('hidden', s.id !== id));
['sens', 'vol'].forEach(k => {
  const el = $(k); el.value = S[k]; $('o_' + k).textContent = S[k];
  el.oninput = () => { S[k] = +el.value; $('o_' + k).textContent = el.value; save(); };
});
$('sound').checked = S.sound; $('sound').onchange = e => { S.sound = e.target.checked; save(); };
$('gfx').value = S.gfx; $('gfx').onchange = e => { S.gfx = e.target.value; save(); applyGfx(); };
$('name').value = S.name; $('room').value = S.room;

const lock = () => tryP(() => cv.requestPointerLock());
function resume() { if (mobile) { live = true; show(null); } else lock(); }
function pauseGame() { live = false; fire = false; ads = false; fireBuf = 0; burstLeft = 0; show('pause'); }
$('play').onclick = () => {
  S.name = $('name').value.trim() || 'Player'; S.room = $('room').value.trim() || 'ARENA'; save();
  ac = ac || new (window.AudioContext || window.webkitAudioContext)();
  if (mobile) {
    tryP(() => document.documentElement.requestFullscreen());
    tryP(() => screen.orientation.lock('landscape'));
  }
  playing = true; $('hud').classList.remove('hidden'); connect(); show(null); resume();
};
$('bSet1').onclick = () => { prev = 'menu'; show('settings'); };
$('bSet2').onclick = () => { prev = 'pause'; show('settings'); };
$('bCred').onclick = () => show('credits');
$('bCredBack').onclick = () => show('menu');
$('back').onclick = () => show(prev);
$('resume').onclick = resume;
$('quit').onclick = leave;
cv.onclick = () => { if (playing && !live && !mobile) lock(); };
document.addEventListener('pointerlockchange', () => {
  live = document.pointerLockElement === cv;
  if (live) show(null); else if (playing) pauseGame();
});

// ---------- HUD ----------
const wbar = $('wbar');
WL.forEach((d, i) => {
  const e = document.createElement('div'); e.className = 'ws'; e.innerHTML = `<b>${i + 1}</b><span>${d.short}</span>`;
  e.addEventListener('touchstart', ev => { ev.preventDefault(); switchTo(i); }, { passive: false });
  wbar.appendChild(e);
});
const slots = [...wbar.children];
function hud() {
  const sel = sw ? sw.to : cur, d = WL[sel];
  $('hp').style.width = me.hp + '%';
  $('ammo').textContent = reloadEnd ? 'Isi ulang…' : ammo[sel] + ' / ' + d.mag;
  $('ammo').classList.toggle('low', !reloadEnd && ammo[sel] <= d.mag * .25);
  $('wname').textContent = d.name;
  slots.forEach((e, i) => e.classList.toggle('on', i === sel));
  $('dead').classList.toggle('hidden', me.alive);
}
function renderBoard() {
  const rows = [...board].sort((a, b) => b.k - a.k || a.d - b.d);
  $('sb').innerHTML = '<tr><th>Pemain<th>Skor<th>Mati</tr>' +
    rows.map(p => `<tr class="${p.id === myId ? 'me' : ''}"><td>${esc(p.n)}<td>${p.k}<td>${p.d}</tr>`).join('');
}

// ---------- Kontrol PC (pointer lock + keyboard + mouse) ----------
function look(dx, dy) {
  if (!live || !me.alive) return;
  const z = cam.fov / BASE_FOV;                       // makin zoom, makin lambat
  yaw -= dx * .0022 * S.sens * z;
  pitch = Math.max(-1.5, Math.min(1.5, pitch - dy * .0022 * S.sens * z));
}
addEventListener('keydown', e => {
  if (e.code === 'Tab') { e.preventDefault(); if (playing) { renderBoard(); $('sb').classList.remove('hidden'); } }
  if (live && !e.repeat) {
    if (e.code === 'KeyR') reload();
    if (e.code === 'KeyQ') switchTo(lastW);
    if (e.code === 'KeyV') toggleView();
    const m = /^Digit([1-8])$/.exec(e.code); if (m) switchTo(+m[1] - 1);
  }
  keys[e.code] = true;
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Tab') $('sb').classList.add('hidden'); });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; fire = false; ads = false; });
addEventListener('mousedown', e => {
  if (!live || mobile) return;
  if (e.button === 0) { fire = true; fireBuf = .16; }
  if (e.button === 2) ads = true;
});
addEventListener('mouseup', e => {
  if (mobile) return;
  if (e.button === 0) fire = false;
  if (e.button === 2) ads = false;
});
addEventListener('contextmenu', e => e.preventDefault());
let wheelT = 0;
addEventListener('wheel', e => {
  const now = performance.now();
  if (!live || now - wheelT < 120) return;
  wheelT = now; switchTo(((sw ? sw.to : cur) + (e.deltaY > 0 ? 1 : -1) + NW) % NW);
}, { passive: true });
document.addEventListener('mousemove', e => look(e.movementX, e.movementY));

// ---------- Kontrol Mobile (joystick, geser untuk membidik, tombol) ----------
if (mobile) {
  const NP = { passive: false }, base = $('joy'), knob = $('knob'), lz = $('look');
  let jid = null, lid = null, lx = 0, ly = 0;
  const moveJoy = t => {
    const r = base.getBoundingClientRect(), R = r.width / 2;
    let dx = t.clientX - (r.left + R), dy = t.clientY - (r.top + R); const m = Math.hypot(dx, dy);
    if (m > R) { dx *= R / m; dy *= R / m; }
    knob.style.transform = `translate(${dx}px,${dy}px)`; joy.x = dx / R; joy.y = -dy / R;
  };
  const endJoy = e => { for (const t of e.changedTouches) if (t.identifier === jid) { jid = null; joy.x = joy.y = 0; knob.style.transform = ''; } };
  base.addEventListener('touchstart', e => { e.preventDefault(); jid = e.changedTouches[0].identifier; moveJoy(e.changedTouches[0]); }, NP);
  base.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === jid) moveJoy(t); }, NP);
  base.addEventListener('touchend', endJoy); base.addEventListener('touchcancel', endJoy);

  lz.addEventListener('touchstart', e => { e.preventDefault(); const t = e.changedTouches[0]; lid = t.identifier; lx = t.clientX; ly = t.clientY; }, NP);
  lz.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === lid) { look((t.clientX - lx) * 1.6, (t.clientY - ly) * 1.6); lx = t.clientX; ly = t.clientY; }
  }, NP);
  const endLook = e => { for (const t of e.changedTouches) if (t.identifier === lid) lid = null; };
  lz.addEventListener('touchend', endLook); lz.addEventListener('touchcancel', endLook);

  const hold = (id, on, off) => {
    const b = $(id);
    b.addEventListener('touchstart', e => { e.preventDefault(); on(); }, NP);
    ['touchend', 'touchcancel'].forEach(n => b.addEventListener(n, e => { e.preventDefault(); if (off) off(); }, NP));
  };
  hold('bFire', () => { fire = true; fireBuf = .16; }, () => fire = false);
  hold('bJump', () => keys.Space = true, () => keys.Space = false);
  hold('bReload', reload);
  hold('bSwap', () => switchTo(((sw ? sw.to : cur) + 1) % NW));
  hold('bScope', () => { if (live && me.alive) ads = !ads; });
  hold('bView', () => { if (live) toggleView(); });
  hold('bPause', pauseGame);
}

// ---------- Peta: tekstur prosedural (canvas) ----------
function canvasTex(size, draw, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4; return t;
}
function speckle(x, n, size, a) {
  for (let i = 0; i < n; i++) { x.fillStyle = 'rgba(0,0,0,' + (Math.random() * a).toFixed(3) + ')'; x.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2); }
}
let TX = null;
function textures() {
  if (TX) return TX;
  return TX = {
    container: canvasTex(256, (x, s) => {                 // kontainer: rusuk bergelombang vertikal (1 tile = 2 m)
      x.fillStyle = '#e9e9e9'; x.fillRect(0, 0, s, s);
      for (let i = 0; i < 8; i++) { x.fillStyle = '#f7f7f7'; x.fillRect(i * 32 + 1, 0, 3, s); x.fillStyle = '#c2c2c2'; x.fillRect(i * 32 + 6, 0, 14, s); x.fillStyle = '#979797'; x.fillRect(i * 32 + 20, 0, 3, s); }
      speckle(x, 600, s, .13);
    }, true),
    crate: canvasTex(256, (x, s) => {                     // crate kayu: papan + bingkai + silang
      x.fillStyle = '#d4b07a'; x.fillRect(0, 0, s, s);
      for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#c9a46c' : '#dcbb88'; x.fillRect(0, i * 32, s, 32); x.fillStyle = 'rgba(80,50,20,.45)'; x.fillRect(0, i * 32, s, 2); }
      x.strokeStyle = '#8b5e2b'; x.lineWidth = 22; x.strokeRect(11, 11, s - 22, s - 22);
      x.lineWidth = 14; x.beginPath(); x.moveTo(14, 14); x.lineTo(s - 14, s - 14); x.moveTo(s - 14, 14); x.lineTo(14, s - 14); x.stroke();
      speckle(x, 350, s, .16);
    }, false),
    concrete: canvasTex(256, (x, s) => {                  // beton: panel + bintik (1 tile = 3 m)
      x.fillStyle = '#dcd8ce'; x.fillRect(0, 0, s, s);
      x.fillStyle = 'rgba(0,0,0,.2)'; x.fillRect(0, 0, s, 2); x.fillRect(0, 0, 2, s); x.fillRect(0, s / 2, s, 2); x.fillRect(s / 2, 0, 2, s);
      speckle(x, 1400, s, .1);
    }, true),
    floor: canvasTex(1024, (x, s) => {                    // lantai arena: aspal/beton, garis lajur, lingkaran tengah
      const k = s / 60, W = (v) => (v + 30) * k;
      x.fillStyle = '#868b8d'; x.fillRect(0, 0, s, s);
      speckle(x, 9000, s, .12);
      x.fillStyle = 'rgba(0,0,0,.12)'; for (let v = -30; v <= 30; v += 5) { x.fillRect(W(v) - 1, 0, 2, s); x.fillRect(0, W(v) - 1, s, 2); }
      x.strokeStyle = '#d9b72c'; x.lineWidth = 5; x.setLineDash([k * 2.2, k * 1.4]); x.strokeRect(W(-27.5), W(-27.5), 55 * k, 55 * k);
      x.setLineDash([]); x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 4; x.beginPath(); x.arc(W(0), W(0), 11 * k, 0, Math.PI * 2); x.stroke();
      x.setLineDash([k * 1.6, k * 1.6]); x.strokeStyle = 'rgba(255,255,255,.5)'; x.beginPath(); x.moveTo(W(-27.5), W(0)); x.lineTo(W(-12), W(0)); x.moveTo(W(12), W(0)); x.lineTo(W(27.5), W(0));
      x.moveTo(W(0), W(-27.5)); x.lineTo(W(0), W(-12)); x.moveTo(W(0), W(12)); x.lineTo(W(0), W(27.5)); x.stroke(); x.setLineDash([]);
    }, false)
  };
}
const matCache = {}, UV_UNIT = { container: 2, wall: 3, barrier: 3, dock: 3 };
function boxMat(k, c) {
  const key = k + c; if (matCache[key]) return matCache[key];
  const T = textures(), map = k === 'container' ? T.container : k === 'crate' ? T.crate : UV_UNIT[k] ? T.concrete : null;
  return matCache[key] = new THREE.MeshLambertMaterial({ color: c, map });
}
// Skala UV tiap sisi kotak agar rusuk/panel punya ukuran nyata (unit meter) di semua ukuran objek
function scaleUV(g, w, h, d, unit) {
  if (!unit) return;
  const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] / unit, uv.getY(i) * dims[f][1] / unit); }
  uv.needsUpdate = true;
}
// Latar jauh: gedung & crane pelabuhan di balik kabut (hanya hiasan, tanpa tabrakan)
function buildDecor(g) {
  let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const m1 = new THREE.MeshLambertMaterial({ color: 0x8fa3b5 }), m2 = new THREE.MeshLambertMaterial({ color: 0xa9b7c4 }), mc = new THREE.MeshLambertMaterial({ color: 0xd9822b });
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * Math.PI * 2 + rnd() * .15, r = 78 + rnd() * 30, w = 8 + rnd() * 12, d = 8 + rnd() * 12, h = 10 + rnd() * 32;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), i % 2 ? m1 : m2); b.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r); b.rotation.y = a; g.add(b);
  }
  [.9, 3.9].forEach(a => {
    const c = new THREE.Group();
    [-9, 9].forEach(o => { const leg = new THREE.Mesh(new THREE.BoxGeometry(1.6, 34, 1.6), mc); leg.position.set(o, 17, 0); c.add(leg); });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(24, 2.4, 2.4), mc); beam.position.y = 34; c.add(beam);
    const boom = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 40), mc); boom.position.set(0, 35.5, 14); c.add(boom);
    c.position.set(Math.cos(a) * 72, 0, Math.sin(a) * 72); c.rotation.y = Math.PI / 2 - a; g.add(c);
  });
}
function buildMap(m) {
  if (mapG) scene.remove(mapG);
  mapG = new THREE.Group(); map = m; edges.length = 0;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(m.size, m.size), new THREE.MeshLambertMaterial({ map: textures().floor }));
  fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; mapG.add(fl);
  for (const b of m.boxes) {
    const y0 = b.y0 || 0, rh = b.h - y0, k = b.k || 'crate', c = b.c === undefined ? 0xffffff : b.c;
    let mesh;
    if (k === 'barrel') mesh = new THREE.Mesh(new THREE.CylinderGeometry(b.w * .46, b.w * .46, rh, 14), boxMat('barrel', c));
    else { const g = new THREE.BoxGeometry(b.w, rh, b.d); scaleUV(g, b.w, rh, b.d, UV_UNIT[k]); mesh = new THREE.Mesh(g, boxMat(k, c)); }
    mesh.position.set(b.x, y0 + rh / 2, b.z); mesh.castShadow = mesh.receiveShadow = true; mapG.add(mesh);
  }
  buildDecor(mapG);
  scene.add(mapG); applyGfx();
}
function label(txt) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d'); x.font = '700 38px Arial'; x.textAlign = 'center';
  x.shadowColor = '#000'; x.shadowBlur = 6; x.fillStyle = '#fff'; x.fillText(txt, 128, 42);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  sp.scale.set(2, .5, 1); sp.position.y = 2.15; return sp;
}
// Avatar kotak sederhana = cadangan kalau model GLB belum / gagal dimuat.
function setFallbackGun(r) {
  if (r.gun) r.fb.remove(r.gun);
  const gm = protos[r.w].clone(); gm.position.set(.36, 1.02, -.05); r.fb.add(gm);
  r.gun = gm; r.flash = gm.getObjectByName('flash');
}
function setRemoteWeapon(r, w) {
  r.w = w;
  if (r.av) r.av.startSwitch(w, WL[w].switchMs); else setFallbackGun(r);
}
function attachAvatar(r) {
  if (!charGltf || r.av) return;
  try {
    r.av = Avatar.create(charGltf, protos, WL); r.av.setWeapon(r.w); if (r.dead) r.av.die();
    r.g.add(r.av.group); r.fb.visible = false;
  } catch (e) { console.warn('Avatar gagal dipasang, memakai avatar sederhana', e); r.av = null; }
}
function addRemote(s) {
  if (remotes[s.id]) return;
  const h = [...s.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;
  const g = new THREE.Group(), fb = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(.7, 1.3, .4), new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(h / 360, .6, .5) }));
  body.position.y = .65; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.28, 12, 12), new THREE.MeshLambertMaterial({ color: 0xd9b99b })); head.position.y = 1.55; head.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(.34, .1, .1), new THREE.MeshBasicMaterial({ color: 0x2ee6c5 })); visor.position.set(0, 1.58, -.24);
  fb.add(body, head, visor);
  g.add(fb, label(s.n)); g.position.set(s.x, s.y, s.z); g.visible = s.alive !== false; scene.add(g);
  const r = remotes[s.id] = {
    g, fb, tp: new THREE.Vector3(s.x, s.y, s.z), yaw: s.yaw || 0, pitch: 0, pv: 0, flashT: 0, ads: 0, sp: 0, vy: 0, hideT: 0,
    px: s.x, py: s.y, pz: s.z, dead: s.alive === false, w: Number.isInteger(s.w) ? s.w : WEAPONS.DEFAULT
  };
  setFallbackGun(r); attachAvatar(r);
}
const delRemote = id => { if (remotes[id]) { scene.remove(remotes[id].g); delete remotes[id]; } };

// ---------- Fisika & tabrakan ----------
function collide() {
  const R = .4;
  for (const b of map.boxes) {
    if (P.y >= b.h - .5) continue;
    const hx = b.w / 2, hz = b.d / 2;
    const cx = Math.max(b.x - hx, Math.min(P.x, b.x + hx)), cz = Math.max(b.z - hz, Math.min(P.z, b.z + hz));
    const dx = P.x - cx, dz = P.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= R * R) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (R - d) / d; P.x += dx * k; P.z += dz * k; }
    else {
      const px = hx - Math.abs(P.x - b.x), pz = hz - Math.abs(P.z - b.z);
      if (px < pz) P.x += (P.x >= b.x ? 1 : -1) * (px + R); else P.z += (P.z >= b.z ? 1 : -1) * (pz + R);
    }
  }
}
function groundY() {
  let g = 0;
  for (const b of map.boxes)
    if (P.y >= b.h - .5 && Math.abs(P.x - b.x) < b.w / 2 + .3 && Math.abs(P.z - b.z) < b.d / 2 + .3) g = Math.max(g, b.h);
  return g;
}
function spawnAt(x, z) {
  P.set(x, 0, z); yaw = Math.atan2(x, z); pitch = 0; vy = 0;
  me.hp = 100; me.alive = true;
  ammo = WL.map(d => d.mag); reloadEnd = 0; burstLeft = 0; sw = null; ads = false; kickAcc = 0; hud();
  prevP.copy(P); selfSp = 0; if (selfAv) { selfAv.revive(); selfAv.setWeapon(cur); }
}

// ---------- Senjata: ganti, isi ulang, tembak ----------
function applyWeapon(i) {                              // dipanggil di tengah animasi ganti
  if (i !== cur) lastW = cur;
  cur = i; hud();
  if (socket) socket.emit('player-switch', { w: i });
}
function switchTo(i) {
  if (!me.alive || !playing || i < 0 || i >= NW) return;
  if (sw && !sw.swapped) {                             // belum sempat ganti: cukup ubah tujuan
    if (i === cur) { sw = null; hud(); return; }
    sw.to = i; sw.dur = WL[i].switchMs; hud(); return;
  }
  if (i === cur) return;
  reloadEnd = 0; burstLeft = 0; ads = false;
  sw = { t0: performance.now(), dur: WL[i].switchMs, to: i, swapped: false };
  if (selfAv) selfAv.startSwitch(i, WL[i].switchMs);
  tone(500, 320, .06, 'square', .12); hud();
}
function reload() {
  const d = WL[cur];
  if (reloadEnd || sw || ammo[cur] >= d.mag || !me.alive) return;
  reloadEnd = performance.now() + d.reload; reloadW = cur; burstLeft = 0;
  if (selfAv) selfAv.startReload(d.reload);
  if (socket) socket.emit('player-reload');
  tone(300, 120, .2, 'square', .15); noise(.1, .15, 3000); hud();
}
// Arah tembakan: kamera orang pertama = arah pandang; orang ketiga = dari mata pemain ke titik yang dibidik kamera.
function rayBoxT(o, d, b) {
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
function aimDir(out) {
  const cp = Math.cos(pitch), dx = -Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp;
  if (!tp) return out.set(dx, dy, dz);
  const o = [cam.position.x, cam.position.y, cam.position.z], d = [dx, dy, dz];
  let t = 80; for (const b of map.boxes) t = Math.min(t, rayBoxT(o, d, b));
  return out.set(o[0] + dx * t - P.x, o[1] + dy * t - (P.y + 1.6), o[2] + dz * t - P.z).normalize();
}
function toggleView() {
  tp = !tp;
  if (selfAv) { selfAv.group.visible = tp; if (tp) { selfAv.setWeapon(sw ? sw.to : cur); selfAv.reload = null; if (!me.alive) selfAv.die(); } }
  if (tp && !selfAv) tp = false;                                  // model belum siap
}
function shoot(now, lastOfBurst) {
  const d = WL[cur];
  if (!me.alive || sw || reloadEnd || now < nextShot) return false;
  if (ammo[cur] <= 0) { reload(); return false; }
  ammo[cur]--;
  // Jadwal tembakan berikutnya mengikuti irama senjata (bukan waktu frame), jadi fire rate tetap benar di FPS rendah.
  nextShot = (nextShot > 0 && now - nextShot < 40 ? nextShot : now) + d.interval + (lastOfBurst || d.burst === 1 ? d.burstCd : 0);
  aimDir(tmp);
  if (selfAv) selfAv.fire(d.interval);
  socket.emit('player-shoot', { d: [tmp.x, tmp.y, tmp.z], ads: ads ? 1 : 0, mv: moving ? 1 : 0, air: onGround ? 0 : 1 });
  gunshot(d);
  const k = d.kick * (ads ? .6 : 1) * (1 + Math.random() * .3);   // sentakan ke atas + sedikit goyang kiri/kanan
  pitch = Math.min(1.5, pitch + k); yaw += (Math.random() - .5) * k * .7; kickAcc += k;
  recoilV = 1; flashT = .05;
  if (ammo[cur] === 0) reload(); else hud();
  return true;
}

// ---------- Jaringan (Socket.IO) ----------
function connect() {
  if (typeof io === 'undefined') {
    alert('Tidak bisa terhubung ke server.\n\nJalankan "node server.js" lalu buka http://localhost:3000 (jangan buka index.html langsung).');
    return leave();
  }
  socket = io();
  socket.on('connect', () => socket.emit('player-join', { name: S.name, room: S.room }));
  socket.on('room-full', () => { alert('Kamar penuh (maksimal 8 pemain). Coba kode kamar lain.'); leave(); });

  socket.on('init', d => {
    myId = d.id; $('rm').textContent = d.room; buildMap(d.map);
    cur = d.me.w; lastW = cur === 0 ? 1 : 0; spawnAt(d.me.x, d.me.z);
    for (const id in remotes) delRemote(id);
    d.players.forEach(addRemote);
    clearInterval(sendT);
    sendT = setInterval(() => { if (me.alive && socket) socket.emit('player-move', { p: [P.x, P.y, P.z], yaw, pitch, a: ads ? 1 : 0 }); }, 50);
  });
  socket.on('player-join', addRemote);
  socket.on('player-leave', delRemote);
  socket.on('player-move', s => { const r = remotes[s.id]; if (r) { r.tp.set(s.x, s.y, s.z); r.yaw = s.yaw; r.pitch = s.pitch; r.ads = s.a ? 1 : 0; } });
  socket.on('player-reload', s => { const r = remotes[s.id]; if (r && r.av) r.av.startReload(WL[r.w].reload); });
  socket.on('player-switch', s => { const r = remotes[s.id]; if (r) setRemoteWeapon(r, s.w); });
  socket.on('player-shoot', s => {
    const d = WL[s.w] || WL[0], a0 = new THREE.Vector3(...s.o), dist = a0.distanceTo(cam.position);
    for (const e of s.es) {
      const b = new THREE.Vector3(e[0], e[1], e[2]), a = a0.clone();
      a.addScaledVector(b.clone().sub(a).normalize(), .8); a.y -= .15;
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: d.tracer, transparent: true }));
      const life = d.key === 'sniper' ? .18 : .08;
      scene.add(l); tracers.push({ l, t: life, life });
      if (e[3] === 1) spark(e, 0xc9d6df); else if (e[3] === 2) spark(e, 0xff3b2f, true);
    }
    if (s.id !== myId) {
      gunshot(d, Math.max(0, 1 - dist / 40));
      const r = remotes[s.id]; if (r) { r.flashT = .05; if (r.av) r.av.fire(d.interval); }
    }
  });
  socket.on('hit-confirm', d => {
    const hm = $('hm'); hm.className = 'on' + (d.head ? ' head' : '') + (d.kill ? ' kill' : '');
    setTimeout(() => hm.className = '', d.kill ? 300 : 150);
    if (d.kill) tone(500, 1200, .18, 'square', .25); else tone(d.head ? 1400 : 900, 600, .07, 'sine', .3);
  });
  socket.on('player-damaged', d => {
    me.hp = d.hp; hud(); $('flash').style.opacity = .8; setTimeout(() => $('flash').style.opacity = 0, 80);
    tone(120, 60, .15, 'square', .3);
  });
  socket.on('hp-update', d => { me.hp = d.hp; hud(); });
  socket.on('player-kill', k => {
    if (k.vid === myId) { me.alive = false; fire = false; ads = false; burstLeft = 0; reloadEnd = 0; sw = null; me.hp = 0; if (selfAv) selfAv.die(); hud(); }
    else if (remotes[k.vid]) { const r = remotes[k.vid]; r.dead = true; if (r.av) { r.av.die(); r.hideT = 2.5; } else r.g.visible = false; }
    const div = document.createElement('div'), wn = (WL[k.w] || WL[0]).short;
    div.textContent = `${k.k} [${wn}] ${k.v}${k.h ? ' (headshot)' : ''}`;
    $('feed').appendChild(div); setTimeout(() => div.remove(), 5000);
  });
  socket.on('player-respawn', p => {
    if (p.id === myId) return spawnAt(p.x, p.z);
    const r = remotes[p.id]; if (!r) return addRemote(p);
    r.g.position.set(p.x, p.y, p.z); r.tp.set(p.x, p.y, p.z); r.px = p.x; r.py = p.y; r.pz = p.z; r.g.visible = true; r.dead = false; r.hideT = 0; r.sp = 0; r.vy = 0;
    if (r.av) r.av.revive();
  });
  socket.on('scoreboard', list => {
    board = list; const m = list.find(p => p.id === myId);
    if (m) { $('k').textContent = m.k; $('d').textContent = m.d; }
    if (!$('sb').classList.contains('hidden')) renderBoard();
  });
  socket.on('disconnect', reason => {
    if (playing && reason !== 'io client disconnect') { alert('Koneksi ke server terputus.'); leave(); }
  });
}
function leave() {
  playing = false; live = false; fire = false; ads = false; sw = null; reloadEnd = 0; burstLeft = 0; clearInterval(sendT);
  tp = false; if (selfAv) selfAv.group.visible = false;
  if (socket) { socket.disconnect(); socket = null; }
  for (const id in remotes) delRemote(id);
  $('hud').classList.add('hidden'); $('feed').innerHTML = ''; $('k').textContent = $('d').textContent = 0;
  if (document.pointerLockElement) document.exitPointerLock();
  show('menu');
}

// ---------- Loop utama ----------
let last = performance.now(), frames = 0, fpsT = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min((t - last) / 1000, .05), rdt = Math.min((t - last) / 1000, .25); last = t;
  if (playing && map) update(dt, rdt);
  if (map) ren.render(scene, cam);
  frames++; fpsT += dt;
  if (fpsT >= 1) { $('fps').textContent = Math.round(frames / fpsT) + ' FPS'; frames = 0; fpsT = 0; }
}
function update(dt, rdt = dt) {                           // dt = terbatas 0,05 (fisika), rdt = waktu nyata (animasi, kecepatan)
  const now = performance.now();
  if (!me.alive) ads = false;

  // Animasi ganti senjata: model berganti di tengah-tengah, senjata baru siap di akhir.
  if (sw) {
    const p = (now - sw.t0) / sw.dur;
    if (!sw.swapped && p >= .5) { sw.swapped = true; applyWeapon(sw.to); }
    if (p >= 1) { sw = null; hud(); }
  }
  if (reloadEnd && now >= reloadEnd) { ammo[reloadW] = WL[reloadW].mag; reloadEnd = 0; hud(); }
  const d = WL[cur];

  moving = false;
  if (live && me.alive) {
    let f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) + joy.y, s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + joy.x;
    moving = Math.abs(f) + Math.abs(s) > .1;
    const n = Math.max(1, Math.hypot(f, s)), sp = (keys.ShiftLeft ? 9 : 6) * d.speed * (ads ? .6 : 1), sn = Math.sin(yaw), cs = Math.cos(yaw);
    f /= n; s /= n;
    P.x += (-sn * f + cs * s) * sp * dt; P.z += (-cs * f - sn * s) * sp * dt;
    collide();
    P.x = Math.max(-29.5, Math.min(29.5, P.x)); P.z = Math.max(-29.5, Math.min(29.5, P.z));
    if (keys.Space && onGround) { vy = 8.5; onGround = false; }

    // Pemicu: auto = tahan; semi = satu tembakan per klik (klik disimpan 0,16 detik waktu-game); burst = 3 peluru per klik
    if (!sw && socket) {
      const click = fireBuf > 0;
      if (d.mode === 'auto') { if (fire) shoot(now); }
      else if (d.mode === 'semi') { if (click && shoot(now)) fireBuf = 0; }
      else {
        if (burstLeft <= 0 && click && now >= nextShot && !reloadEnd && ammo[cur] > 0) { fireBuf = 0; burstLeft = d.burst; }
        if (burstLeft > 0 && now >= nextShot) { burstLeft = shoot(now, burstLeft === 1) ? burstLeft - 1 : 0; }
      }
    }
  }
  fireBuf = Math.max(0, fireBuf - dt);
  vy -= 22 * dt; P.y += vy * dt;
  const g = groundY();
  if (P.y <= g) { P.y = g; vy = 0; onGround = true; } else onGround = false;

  // Zoom (klik kanan / tombol ZOOM) dan scope sniper
  const tf = BASE_FOV / (ads ? d.zoom : 1);
  if (Math.abs(cam.fov - tf) > .05) { cam.fov += (tf - cam.fov) * (1 - Math.exp(-14 * dt)); cam.updateProjectionMatrix(); }
  scoped = ads && d.scope && cam.fov < BASE_FOV * .6 && me.alive && !tp;
  $('scope').classList.toggle('hidden', !scoped);
  $('cross').classList.toggle('off', scoped || !me.alive);

  // Crosshair dinamis mengikuti sebaran peluru
  const spreadDeg = d.spread * (ads ? d.adsMul : 1) * (moving ? 1.5 : 1) * (onGround ? 1 : 2);
  const gp = 3 + Math.tan(spreadDeg * Math.PI / 180) / Math.tan(cam.fov * Math.PI / 360) * innerHeight / 2;
  if (Math.abs(gp - crossG) > .5) { crossG = gp; $('cross').style.setProperty('--g', gp.toFixed(1) + 'px'); }

  // Kamera + recoil (sentakan sebagian kembali turun otomatis)
  if (kickAcc > 0) { const r = kickAcc * (1 - Math.exp(-7 * dt)); kickAcc -= r; pitch = Math.max(-1.5, pitch - r * .55); }
  const eyeY = P.y + (me.alive ? 1.6 : .5);
  cam.rotation.set(pitch, yaw, 0);
  if (tp) {                                                      // kamera orang ketiga: di belakang-kanan pemain, dipendekkan jika terhalang
    const cp = Math.cos(pitch), fx = -Math.sin(yaw) * cp, fy = Math.sin(pitch), fz = -Math.cos(yaw) * cp, rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const o = [P.x, eyeY - .05, P.z];
    tmp.set(rx * .6 - fx * 3.2, .15 - fy * 3.2, rz * .6 - fz * 3.2); const L = tmp.length(); tmp.divideScalar(L);
    let t = L; for (const b of map.boxes) t = Math.min(t, rayBoxT(o, [tmp.x, tmp.y, tmp.z], b) - .3);
    t = Math.max(.4, t);
    cam.position.set(o[0] + tmp.x * t, Math.max(.3, o[1] + tmp.y * t), o[2] + tmp.z * t);
  } else cam.position.set(P.x, eyeY, P.z);

  // Avatar sendiri (terlihat di kamera orang ketiga)
  if (selfAv && tp) {
    const sdx = P.x - prevP.x, sdz = P.z - prevP.z, k2 = 1 - Math.exp(-10 * dt);
    selfSp += (Math.hypot(sdx, sdz) / Math.max(rdt, 1e-3) - selfSp) * k2;
    selfAv.group.position.set(P.x, P.y, P.z); selfAv.group.rotation.y = yaw;
    selfAv.update(rdt, { speed: selfSp, dir: sdx * -Math.sin(yaw) + sdz * -Math.cos(yaw) < -1e-4 ? -1 : 1, air: !onGround, pitch, ads: ads ? 1 : 0 });
  }
  prevP.copy(P);

  // Viewmodel: ayunan jalan, hentakan tembak, animasi ganti & reload, bergeser ke tengah saat zoom
  bobT += dt * (moving && onGround ? (keys.ShiftLeft ? 12 : 9) : 0);
  adsBlend += ((ads ? 1 : 0) - adsBlend) * (1 - Math.exp(-14 * dt));
  recoilV = Math.max(0, recoilV - dt * 9);
  let dip = 0, tilt = 0;
  if (sw) dip = Math.sin(Math.min(1, (now - sw.t0) / sw.dur) * Math.PI);
  if (reloadEnd) { const e = Math.sin(Math.max(0, Math.min(1, 1 - (reloadEnd - now) / WL[reloadW].reload)) * Math.PI); dip += e * .45; tilt = e; }
  const bw = moving && onGround ? 1 : 0, vm = d.vm;
  vmRoot.position.set(
    -vm[0] * adsBlend + Math.sin(bobT) * .012 * bw,
    (-.13 - vm[1]) * adsBlend - dip * .3 - Math.abs(Math.cos(bobT)) * .012 * bw,
    recoilV * .05 * (1 - adsBlend * .5));
  vmRoot.rotation.set(dip * .5 - tilt * .5 + recoilV * .12, 0, tilt * .5);
  flashT = Math.max(0, flashT - dt);
  vms.forEach((v, i) => { v.visible = i === cur && me.alive && !scoped && !tp; vmFlash[i].visible = i === cur && flashT > 0; });

  const k = 1 - Math.exp(-15 * dt);
  for (const id in remotes) {
    const r = remotes[id]; r.g.position.lerp(r.tp, k);
    let a = r.yaw - r.g.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a)); r.g.rotation.y += a * k;
    r.pv += (r.pitch - r.pv) * k;
    if (r.hideT > 0 && (r.hideT -= rdt) <= 0) r.g.visible = false;
    // kecepatan dari perubahan posisi (dihaluskan) → memilih animasi diam / jalan / lari / lompat
    const dx = r.g.position.x - r.px, dz = r.g.position.z - r.pz, dy = r.g.position.y - r.py, idt = 1 / Math.max(rdt, 1e-3), kk = 1 - Math.exp(-10 * dt);
    r.px = r.g.position.x; r.py = r.g.position.y; r.pz = r.g.position.z;
    r.sp += (Math.hypot(dx, dz) * idt - r.sp) * kk; r.vy += (dy * idt - r.vy) * kk;
    if (!r.g.visible) continue;
    if (r.av) {
      const yw = r.g.rotation.y;
      r.av.update(rdt, { speed: r.sp, dir: dx * -Math.sin(yw) + dz * -Math.cos(yw) < -1e-4 ? -1 : 1, air: Math.abs(r.vy) > 1.5, pitch: r.pv, ads: r.ads });
    } else {
      if (r.gun) r.gun.rotation.x += (r.pitch - r.gun.rotation.x) * k;
      r.flashT = Math.max(0, r.flashT - dt); if (r.flash) r.flash.visible = r.flashT > 0;
    }
  }
  for (let i = tracers.length - 1; i >= 0; i--) {
    const tr = tracers[i]; tr.t -= dt; tr.l.material.opacity = Math.max(0, tr.t / tr.life);
    if (tr.t <= 0) { scene.remove(tr.l); tr.l.geometry.dispose(); tr.l.material.dispose(); tracers.splice(i, 1); }
  }
  for (let i = fx.length - 1; i >= 0; i--) {
    const e = fx[i]; e.t -= dt; e.m.material.opacity = Math.max(0, e.t / .22); e.m.scale.setScalar((e.big ? 1.6 : 1) + (.22 - e.t) * 6);
    if (e.t <= 0) { scene.remove(e.m); e.m.material.dispose(); fx.splice(i, 1); }
  }
}
requestAnimationFrame(loop);

// ---------- Muat karakter (GLB). Kalau gagal / CDN tidak terjangkau, game tetap jalan dengan avatar kotak. ----------
if (THREE.GLTFLoader && THREE.SkeletonUtils && window.Avatar) {
  new THREE.GLTFLoader().load('models/player.glb', gltf => {
    gltf.scene.traverse(o => {
      if (!o.material) return;
      [].concat(o.material).forEach(m => {                      // warna palet dipakai apa adanya (selaras dengan peta); tanpa kilap logam
        if (m.map) m.map.encoding = THREE.LinearEncoding;
        if (m.emissiveMap) m.emissiveMap.encoding = THREE.LinearEncoding;
        m.metalness = 0; m.roughness = .9; m.needsUpdate = true;
      });
    });
    charGltf = gltf;
    for (const id in remotes) attachAvatar(remotes[id]);
    try { selfAv = Avatar.create(gltf, protos, WL); selfAv.group.visible = false; scene.add(selfAv.group); selfAv.setWeapon(cur); }
    catch (e) { console.warn('Avatar sendiri gagal dibuat', e); }
  }, undefined, e => console.warn('Model karakter gagal dimuat, memakai avatar sederhana', e));
}
