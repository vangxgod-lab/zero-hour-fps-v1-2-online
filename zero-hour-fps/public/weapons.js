// Definisi senjata — dipakai SERVER (damage, fire rate, spread) dan KLIEN (model, suara, animasi).
// Satu sumber data supaya angka tidak pernah berbeda antara server dan klien.
// model: [lebar, tinggi, panjang, x, y, z, warna] — ujung laras ada di sisi z negatif.
(function (root) {
  'use strict';
  const L = [
    {
      key: 'pistol', name: 'M9 Pistol', short: 'PISTOL', mode: 'semi',
      interval: 170, dmg: 24, headMul: 2, pellets: 1, spread: 1.2, adsMul: .4, fo: [20, 50, .6],
      mag: 12, reload: 1100, switchMs: 250, kick: .018, zoom: 1.25, speed: 1.05, scope: false,
      vm: [.22, -.22, -.4], tracer: 0xffd27a, fl: .8, muzzle: [0, .01, -.24],
      snd: { f0: 260, f1: 60, dur: .1, type: 'square', vol: .22, nz: .3, nf: 5000 },
      model: [[.055, .075, .26, 0, .01, -.1, 0x2b3640], [.045, .13, .07, 0, -.09, .01, 0x15191d], [.058, .02, .1, 0, .055, -.05, 0x0e1114]]
    },
    {
      key: 'revolver', name: 'Magnum .44', short: 'MAGNUM', mode: 'semi',
      interval: 520, dmg: 55, headMul: 2, pellets: 1, spread: .8, adsMul: .3, fo: [30, 70, .7],
      mag: 6, reload: 2000, switchMs: 350, kick: .05, zoom: 1.4, speed: 1, scope: false,
      vm: [.22, -.22, -.4], tracer: 0xffe9a8, fl: 1.3, muzzle: [0, .02, -.31],
      snd: { f0: 180, f1: 40, dur: .22, type: 'sawtooth', vol: .35, nz: .5, nf: 3500 },
      model: [[.045, .055, .34, 0, .02, -.13, 0xaab4bc], [.075, .085, .1, 0, 0, 0, 0x8e99a2], [.05, .14, .07, 0, -.1, .07, 0x4a2f1c]]
    },
    {
      key: 'smg', name: 'Vector SMG', short: 'SMG', mode: 'auto',
      interval: 62, dmg: 13, headMul: 1.8, pellets: 1, spread: 2.4, adsMul: .5, fo: [12, 35, .45],
      mag: 35, reload: 1500, switchMs: 280, kick: .012, zoom: 1.3, speed: 1.12, scope: false,
      vm: [.24, -.23, -.4], tracer: 0xffd27a, fl: .9, muzzle: [0, .01, -.46],
      snd: { f0: 300, f1: 80, dur: .07, type: 'square', vol: .18, nz: .22, nf: 6000 },
      model: [[.065, .1, .36, 0, 0, -.12, 0x222b33], [.03, .03, .14, 0, .01, -.38, 0x111111], [.04, .2, .06, 0, -.15, -.06, 0x111111], [.045, .12, .06, 0, -.1, .1, 0x15191d]]
    },
    {
      key: 'ar', name: 'Assault Rifle', short: 'RIFLE', mode: 'auto',
      interval: 100, dmg: 20, headMul: 2.5, pellets: 1, spread: 1.6, adsMul: .35, fo: [25, 60, .65],
      mag: 30, reload: 1800, switchMs: 400, kick: .022, zoom: 1.5, speed: 1, scope: false,
      vm: [.24, -.24, -.42], tracer: 0xffb02e, fl: 1, muzzle: [0, .02, -.68],
      snd: { f0: 220, f1: 50, dur: .12, type: 'sawtooth', vol: .3, nz: .35, nf: 4500 },
      model: [[.075, .1, .46, 0, 0, -.15, 0x1f2a33], [.03, .03, .3, 0, .02, -.52, 0x0e1114], [.05, .17, .08, 0, -.13, -.12, 0x111111],
        [.06, .11, .2, 0, -.01, .2, 0x2f3b45], [.04, .1, .06, 0, -.1, .04, 0x15191d], [.025, .035, .12, 0, .075, -.1, 0x0e1114]]
    },
    {
      key: 'burst', name: 'Burst Rifle', short: 'BURST', mode: 'burst', burst: 3, burstCd: 260,
      interval: 60, dmg: 22, headMul: 2.2, pellets: 1, spread: 1, adsMul: .3, fo: [30, 70, .7],
      mag: 30, reload: 1700, switchMs: 380, kick: .016, zoom: 1.7, speed: 1, scope: false,
      vm: [.24, -.24, -.42], tracer: 0xff9a2e, fl: 1, muzzle: [0, .02, -.6],
      snd: { f0: 260, f1: 60, dur: .09, type: 'sawtooth', vol: .26, nz: .3, nf: 5000 },
      model: [[.07, .1, .4, 0, 0, -.12, 0x2a2f36], [.078, .02, .2, 0, .04, -.15, 0xff9a2e], [.03, .03, .25, 0, .02, -.45, 0x0e1114],
        [.05, .16, .07, 0, -.13, -.1, 0x111111], [.06, .11, .18, 0, -.01, .2, 0x2f3b45], [.04, .05, .16, 0, .085, -.08, 0x111111]]
    },
    {
      key: 'shotgun', name: 'Pump Shotgun', short: 'SHOTGUN', mode: 'semi',
      interval: 900, dmg: 11, headMul: 1.5, pellets: 8, spread: 5.5, adsMul: .75, fo: [6, 22, .15],
      mag: 6, reload: 2200, switchMs: 450, kick: .06, zoom: 1.15, speed: .98, scope: false,
      vm: [.24, -.24, -.4], tracer: 0xffc46b, fl: 1.8, muzzle: [0, 0, -.37],
      snd: { f0: 120, f1: 30, dur: .3, type: 'sawtooth', vol: .4, nz: .7, nf: 2500 },
      model: [[.07, .08, .5, 0, 0, -.1, 0x2a2a2a], [.045, .045, .46, 0, -.06, -.18, 0x111111], [.085, .06, .16, 0, -.065, -.22, 0x6b4a2b], [.06, .12, .22, 0, -.02, .28, 0x6b4a2b]]
    },
    {
      key: 'lmg', name: 'Light Machine Gun', short: 'LMG', mode: 'auto',
      interval: 85, dmg: 18, headMul: 2, pellets: 1, spread: 2.2, adsMul: .5, fo: [25, 60, .6],
      mag: 80, reload: 3800, switchMs: 650, kick: .02, zoom: 1.3, speed: .85, scope: false,
      vm: [.24, -.26, -.36], tracer: 0xffb02e, fl: 1.2, muzzle: [0, .02, -.86],
      snd: { f0: 160, f1: 45, dur: .12, type: 'sawtooth', vol: .3, nz: .4, nf: 3500 },
      model: [[.09, .12, .56, 0, 0, -.15, 0x2a3138], [.035, .035, .3, 0, .02, -.7, 0x0e1114], [.15, .13, .12, 0, -.14, -.1, 0x3b4a2f],
        [.06, .12, .22, 0, -.01, .24, 0x2f3b45], [.05, .04, .1, 0, .085, -.2, 0x111111]]
    },
    {
      key: 'sniper', name: 'Sniper Rifle', short: 'SNIPER', mode: 'semi',
      interval: 1250, dmg: 80, headMul: 3, pellets: 1, spread: 5, adsMul: 0, fo: [80, 100, 1],
      mag: 5, reload: 2600, switchMs: 600, kick: .09, zoom: 4, speed: .85, scope: true,
      vm: [.2, -.22, -.3], tracer: 0x9ff3ff, fl: 1.6, muzzle: [0, .01, -.9],
      snd: { f0: 140, f1: 25, dur: .5, type: 'sawtooth', vol: .45, nz: .8, nf: 2000 },
      model: [[.06, .085, .7, 0, 0, -.2, 0x2b3a2a], [.025, .025, .35, 0, .01, -.72, 0x0e1114], [.05, .05, .24, 0, .085, -.15, 0x111111],
        [.058, .058, .03, 0, .085, -.28, 0x2ee6c5], [.06, .12, .25, 0, -.01, .3, 0x2b3a2a], [.04, .09, .05, 0, -.09, .05, 0x15191d]]
    }
  ];
  // Titik pegangan di koordinat lokal senjata (depan = -z): r = tangan kanan (grip), l = tangan kiri (pegangan depan),
  // m = lokasi magasin (untuk animasi reload). pump/bolt = gerakan tambahan setelah menembak.
  const HOLD = {
    pistol:   { r: [0, -.08, .01],  l: [-.012, -.1, .03], m: [0, -.12, .01] },
    revolver: { r: [0, -.09, .07],  l: [-.012, -.1, .09], m: [0, -.02, .02] },
    smg:      { r: [0, -.1, .1],    l: [0, -.07, -.26],   m: [0, -.15, -.06] },
    ar:       { r: [0, -.1, .04],   l: [0, -.07, -.32],   m: [0, -.13, -.12] },
    burst:    { r: [0, -.09, .04],  l: [0, -.07, -.3],    m: [0, -.13, -.1] },
    shotgun:  { r: [0, -.08, .06],  l: [0, -.1, -.22],    m: [0, -.04, -.05], pump: true },
    lmg:      { r: [0, -.1, .06],   l: [0, -.08, -.34],   m: [0, -.15, -.1] },
    sniper:   { r: [0, -.09, .06],  l: [0, -.07, -.4],    m: [0, -.07, -.1], bolt: true }
  };
  L.forEach((w, i) => { w.id = i; if (!w.burst) w.burst = 1; if (!w.burstCd) w.burstCd = 0; w.hold = HOLD[w.key]; });
  const api = { list: L, DEFAULT: 3, RANGE: 100 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WEAPONS = api;
})(typeof self !== 'undefined' ? self : this);
