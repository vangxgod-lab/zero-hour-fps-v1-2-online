// Avatar pemain: memasang model GLB berrig (Mixamo) + animasi senjata.
// - Animasi bawaan model (Idle / Walk / Run) dipadukan sesuai kecepatan gerak.
// - Pegang senjata, bidik (ADS), reload, ganti senjata, hentakan tembak, pump/bolt, lompat dan mati
//   dibuat secara prosedural: kedua tangan dipasang ke senjata dengan IK dua-tulang.
// Model menghadap +z di file; di game arah depan = -z, jadi model diputar 180°.
(function (root) {
  'use strict';
  const HEIGHT = 1.8, MODEL_H = 16.64, SCALE = HEIGHT / MODEL_H;
  const P_HIP = [.17, 1.36, -.02], P_ADS = [.06, 1.5, -.08];     // titik putar senjata di dada (hip-fire / bidik)
  const G_HIP = [.04, -.22, -.2], G_ADS = [-.04, -.1, -.3];      // posisi grip kanan relatif ke titik putar
  const AIM_PIVOT_Y = 1.4;

  const V = THREE.Vector3, Q = THREE.Quaternion;
  const _p0 = new V(), _p1 = new V(), _p2 = new V(), _d0 = new V(), _d1 = new V(), _e = new V(), _a = new V(), _h = new V(), _t = new V();
  const _qd = new Q(), _qw = new Q(), _qp = new Q(), _qa = new Q(), _qb = new Q(), _qr = new Q();
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  // ---------- Pengambilan sampel klip animasi (tanpa AnimationMixer supaya bisa dicampur & dibalik bebas) ----------
  function prepClip(clip) {
    const m = {};
    for (const tr of clip.tracks) { const i = tr.name.lastIndexOf('.'); if (tr.name.slice(i + 1) === 'quaternion') m[tr.name.slice(0, i)] = tr; }
    return { dur: clip.duration, m };
  }
  function sampleQ(tr, t, out) {
    const T = tr.times, Vv = tr.values, n = T.length;
    if (n === 1 || t <= T[0]) return out.fromArray(Vv, 0);
    if (t >= T[n - 1]) return out.fromArray(Vv, (n - 1) * 4);
    let i = 1; while (T[i] < t) i++;
    out.fromArray(Vv, (i - 1) * 4); _qb.fromArray(Vv, i * 4);
    return out.slerp(_qb, (t - T[i - 1]) / (T[i] - T[i - 1]));
  }

  // ---------- IK ----------
  // Putar `bone` supaya arah bone -> child menuju `target` (hanya swing, tanpa twist).
  function aimBone(bone, child, target) {
    bone.getWorldPosition(_p0); child.getWorldPosition(_p1);
    _d0.subVectors(_p1, _p0); _d1.subVectors(target, _p0);
    if (_d0.lengthSq() < 1e-12 || _d1.lengthSq() < 1e-12) return;
    _d0.normalize(); _d1.normalize();
    _qd.setFromUnitVectors(_d0, _d1);
    bone.getWorldQuaternion(_qw); _qw.premultiply(_qd);
    bone.parent.getWorldQuaternion(_qp); _qp.invert();
    bone.quaternion.copy(_qp.multiply(_qw));
    bone.updateMatrixWorld(true);
  }
  // IK dua-tulang: bahu(arm) -> siku(fore) -> tangan(hand) mencapai `target`; `pole` = arah tekuk siku.
  function solveArm(arm, fore, hand, handEnd, target, pole) {
    arm.getWorldPosition(_a); fore.getWorldPosition(_e); hand.getWorldPosition(_h);
    const L1 = _a.distanceTo(_e), L2 = _e.distanceTo(_h);
    _t.subVectors(target, _a);
    const dist = clamp(_t.length(), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
    _t.normalize();
    const x = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, L1 * L1 - x * x));
    _p2.copy(pole); _p2.addScaledVector(_t, -_p2.dot(_t));                // pole tegak lurus sumbu bahu->target
    if (_p2.lengthSq() < 1e-8) _p2.set(0, -1, 0).addScaledVector(_t, _t.y);
    _p2.normalize();
    const elbow = _d0.copy(_a).addScaledVector(_t, x).addScaledVector(_p2, h).clone();
    const reach = _d1.copy(_a).addScaledVector(_t, dist).clone();
    aimBone(arm, fore, elbow);
    aimBone(fore, hand, reach);
  }

  // ---------- Fungsi pembentuk avatar ----------
  function create(gltf, protos, defs) {
    const model = THREE.SkeletonUtils.clone(gltf.scene);
    const bones = {}; let skinned = 0;
    model.traverse(o => {
      if (o.isBone) bones[o.name] = o;
      if (o.isSkinnedMesh) { o.frustumCulled = false; o.castShadow = true; skinned++; }
    });
    const clips = {}; gltf.animations.forEach(c => clips[c.name] = prepClip(c));
    const bindQ = {}; for (const n in bones) bindQ[n] = bones[n].quaternion.clone();   // pose awal (T/A-pose) untuk tulang tanpa track
    const need = ['Hips', 'Spine', 'Spine1', 'Spine2', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHand_End', 'RightArm', 'RightForeArm', 'RightHand', 'RightHand_End'];
    const missing = need.filter(n => !bones[n]);
    if (missing.length || !skinned || !clips.Idle || !clips.Walk || !clips.Run) throw new Error('Model karakter tidak cocok: ' + (missing.join(',') || 'klip/mesh hilang'));

    const group = new THREE.Group(), body = new THREE.Group(), pivot = new THREE.Group();
    pivot.rotation.y = Math.PI; pivot.scale.setScalar(SCALE); pivot.add(model);
    const mount = new THREE.Group(), holder = new THREE.Group();
    mount.add(holder);
    body.add(pivot, mount); group.add(body);
    const guns = protos.map(p => { const g = p.clone(); g.visible = false; holder.add(g); g.traverse(o => { if (o.isMesh) o.castShadow = false; }); return g; });

    const flashes = guns.map(g => g.getObjectByName('flash'));
    const av = {
      group, body, bones, weapon: 3, dead: false, flashT: 0,
      w: [1, 0, 0], tIdle: Math.random() * 4, tWalk: 0, tRun: 0, tAir: .15,
      reload: null, sw: null, kick: 0, cyc: -1, cycDur: 1, ads: 0, deadT: 0, aimPitch: 0
    };
    const setGun = i => { av.weapon = i; guns.forEach((g, k) => g.visible = k === i && !av.dead); };
    av.setWeapon = i => { av.sw = null; av.reload = null; setGun(i); };
    av.startSwitch = (i, ms) => { av.reload = null; av.sw = { t: 0, dur: Math.max(.15, ms / 1000), to: i, done: false }; };
    av.startReload = ms => { if (!av.sw) av.reload = { t: 0, dur: Math.max(.3, ms / 1000) }; };
    av.fire = ms => { av.kick = 1; av.flashT = .05; const h = defs[av.weapon].hold; if (h.pump || h.bolt) { av.cyc = 0; av.cycDur = clamp(ms / 1000 * .85, .3, 1.1); } };
    av.die = () => { if (av.dead) return; av.dead = true; av.deadT = 0; av.reload = null; av.sw = null; setGun(av.weapon); };
    av.revive = () => { av.dead = false; av.deadT = 0; body.rotation.x = 0; body.position.y = 0; setGun(av.weapon); };
    setGun(3);

    // st: { speed (m/dtk), dir (+1 maju / -1 mundur), air, pitch, ads (0/1) }
    av.update = (dt, st) => {
      const rdt = Math.min(dt, .25); dt = Math.min(dt, .05);      // timer pakai waktu nyata (sinkron dgn reload asli); penghalusan pakai dt terbatas
      const speed = st.speed || 0, dir = st.dir < 0 ? -1 : 1, air = !!st.air;

      // --- timer status ---
      if (av.sw) { av.sw.t += rdt; if (!av.sw.done && av.sw.t >= av.sw.dur * .5) { av.sw.done = true; setGun(av.sw.to); } if (av.sw.t >= av.sw.dur) av.sw = null; }
      if (av.reload) { av.reload.t += rdt; if (av.reload.t >= av.reload.dur) av.reload = null; }
      av.kick = Math.max(0, av.kick - rdt * 7); av.flashT = Math.max(0, av.flashT - rdt);
      flashes.forEach((f, i) => { if (f) f.visible = i === av.weapon && av.flashT > 0 && !av.dead; });
      if (av.cyc >= 0) { av.cyc += rdt / av.cycDur; if (av.cyc >= 1) av.cyc = -1; }
      av.ads += ((st.ads && !av.sw ? 1 : 0) - av.ads) * (1 - Math.exp(-14 * dt));
      if (av.dead) av.deadT += rdt;
      const def = defs[av.weapon], hold = def.hold;

      // --- locomotion: campur klip Idle/Walk/Run ---
      const target = air ? [0, 0, 1] : speed < .4 ? [1, 0, 0] : speed < 3.4 ? [0, 1, 0] : [0, 0, 1];
      const k = 1 - Math.exp(-12 * dt);
      for (let i = 0; i < 3; i++) av.w[i] += (target[i] - av.w[i]) * k;
      av.tIdle = (av.tIdle + rdt) % clips.Idle.dur;
      if (!air) {
        av.tWalk = (av.tWalk + rdt * clamp(speed / 1.7, .3, 2) * dir + clips.Walk.dur * 8) % clips.Walk.dur;
        av.tRun = (av.tRun + rdt * clamp(speed / 5.2, .4, 2) * dir + clips.Run.dur * 8) % clips.Run.dur;
      } else av.tRun += (av.tAir - av.tRun) * k;                     // di udara: bekukan pose langkah lebar
      const names = {}; for (const c of [clips.Idle, clips.Walk, clips.Run]) for (const n in c.m) names[n] = 1;
      const src = [[clips.Idle, av.tIdle], [clips.Walk, av.tWalk], [clips.Run, av.tRun]];
      for (const n in names) {
        const b = bones[n]; if (!b) continue;
        let sum = 0, have = false;
        for (let i = 0; i < 3; i++) {
          const wgt = av.w[i], tr = src[i][0].m[n]; if (wgt < 1e-3) continue;
          if (tr) sampleQ(tr, src[i][1], _qa); else _qa.copy(bindQ[n]);       // klip tanpa track tulang ini = pose awal
          if (!have) { _qr.copy(_qa); have = true; sum = wgt; } else { sum += wgt; _qr.slerp(_qa, wgt / sum); }
        }
        if (have) b.quaternion.copy(_qr);
      }
      group.updateMatrixWorld(true);

      // --- mati: jatuh ke belakang, lengan lemas ---
      if (av.dead) {
        const f = smooth(av.deadT / .6);
        body.rotation.x = -f * Math.PI / 2 * .96; body.position.y = f * .12; mount.visible = false;
        group.updateMatrixWorld(true);
        return;
      }
      mount.visible = true; body.rotation.x = 0; body.position.y = 0;

      // --- membidik: dada ikut menunduk/mendongak sesuai pitch ---
      group.updateMatrixWorld(true);
      group.getWorldQuaternion(_qa);
      _d1.set(1, 0, 0).applyQuaternion(_qa);                         // sumbu kanan avatar (dunia)
      av.aimPitch += (clamp(st.pitch || 0, -1.3, 1.3) - av.aimPitch) * (1 - Math.exp(-20 * dt));
      [['Spine', .2], ['Spine1', .3], ['Spine2', .3]].forEach(([n, f]) => {
        const b = bones[n];
        b.getWorldQuaternion(_qw); b.parent.getWorldQuaternion(_qp);
        _qd.setFromAxisAngle(_d1, av.aimPitch * f);
        _qw.premultiply(_qd); _qp.invert(); b.quaternion.copy(_qp.multiply(_qw));
        b.updateMatrixWorld(true);
      });

      // --- posisi senjata di dada + animasi (ADS, hentakan, reload, ganti) ---
      const a = smooth(av.ads), p = lerp3(P_HIP, P_ADS, a), g = lerp3(G_HIP, G_ADS, a);
      let dipY = 0, tiltX = 0, roll = 0, gz = 0;
      if (av.sw) { const s = Math.sin(clamp(av.sw.t / av.sw.dur, 0, 1) * Math.PI); dipY -= .5 * s; tiltX -= .7 * s; }
      let rp = -1, tilt = 0;
      if (av.reload) {
        rp = av.reload.t / av.reload.dur;
        tilt = smooth((rp - .08) / .12) * (1 - smooth((rp - .82) / .14));
        roll = -tilt * .5; tiltX -= tilt * .2; dipY -= tilt * .06;
      }
      tiltX += av.kick * .06; gz += av.kick * .05;
      mount.position.set(p[0], p[1] + dipY, p[2]);
      mount.rotation.set(av.aimPitch + tiltX, 0, roll);
      const r = hold.r;
      holder.position.set(g[0] - r[0], g[1] - r[1], g[2] - r[2] + gz);
      group.updateMatrixWorld(true);

      // --- target tangan (koordinat lokal senjata) ---
      const gun = guns[av.weapon];
      let R = r.slice(), L = hold.l.slice();
      if (rp >= 0) {                                                  // reload: tangan kiri ke magasin, tarik, pasang, kembali
        const m = hold.m, out = [m[0], m[1] - .2, m[2] + .05];
        if (rp < .18) L = lerp3(hold.l, m, smooth(rp / .18));
        else if (rp < .42) L = lerp3(m, out, smooth((rp - .18) / .24));
        else if (rp < .6) L = [out[0], out[1] + Math.sin((rp - .42) * 40) * .012, out[2]];
        else if (rp < .8) L = lerp3(out, m, smooth((rp - .6) / .2));
        else L = lerp3(m, hold.l, smooth((rp - .8) / .2));
      } else if (av.cyc >= 0 && av.cyc < 1) {
        const c = av.cyc;
        if (hold.pump) { const s = c < .15 ? 0 : Math.sin(clamp((c - .15) / .7, 0, 1) * Math.PI); L[2] += .13 * s; }
        if (hold.bolt) { const up = smooth(c / .2) * (1 - smooth((c - .75) / .2)), back = smooth((c - .2) / .2) * (1 - smooth((c - .55) / .2)); R[1] += .06 * up; R[2] += .12 * back; }
      }
      const toWorld = (v, out) => out.set(v[0], v[1], v[2]).applyMatrix4(gun.matrixWorld);
      const Rw = toWorld(R, new V()), Lw = toWorld(L, new V());
      gun.getWorldQuaternion(_qa);
      const fwd = new V(0, 0, -1).applyQuaternion(_qa);              // arah laras (dunia)

      solveArm(bones.RightArm, bones.RightForeArm, bones.RightHand, bones.RightHand_End, Rw, _t.set(.5, -1, .35).clone());
      solveArm(bones.LeftArm, bones.LeftForeArm, bones.LeftHand, bones.LeftHand_End, Lw, _t.set(-.5, -1, .35).clone());
      // telapak tangan menghadap searah laras
      aimBone(bones.RightHand, bones.RightHand_End, _p2.copy(Rw).addScaledVector(fwd, .12));
      aimBone(bones.LeftHand, bones.LeftHand_End, _p2.copy(Lw).addScaledVector(fwd, .12));
      model.updateMatrixWorld(true);
    };
    return av;
  }
  root.Avatar = { create, HEIGHT };
})(typeof self !== 'undefined' ? self : globalThis);
