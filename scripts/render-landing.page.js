// The scene behind the landing's picture, run in the page by render-landing.mjs. Dense on purpose: it's a tool, not the site.
window.__render = async () => {
  const THREE = await import('/node_modules/.vite/deps/three.js');
  const { GLTFLoader } = await import('/node_modules/.vite/deps/three_examples_jsm_loaders_GLTFLoader__js.js');
  const { MeshoptDecoder } = await import('/node_modules/.vite/deps/three_examples_jsm_libs_meshopt_decoder__module__js.js');
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const out = {}, cx0 = 1.9;
  const rig = (w, h, clear, a) => { const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r.setPixelRatio(1); r.setSize(w, h); r.setClearColor(clear, a); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.outputColorSpace = THREE.SRGBColorSpace; return r; };
  const shade = (o) => o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
  const mat = (c, e, ei = 1.1) => new THREE.MeshStandardMaterial({ color: c, roughness: .9, flatShading: true, ...(e ? { emissive: e, emissiveIntensity: ei } : {}) });
  const kit = (root) => {
    const put = (w, h, d, c, x, y, z, e, ei) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, e, ei)); m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true; root.add(m); return m; };
    const cyl = (r, h, c, x, y, z, e) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), mat(c, e)); m.position.set(x, y + h / 2, z); m.castShadow = true; root.add(m); return m; };
    const ball = (r, c, x, y, z, e, ei) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat(c, e, ei)); m.position.set(x, y, z); root.add(m); return m; };
    const carton = (x, y, z, s = 1, yaw = 0) => { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(1, .8, .9), mat(0xb98c5a)); m.position.y = .4; const t = new THREE.Mesh(new THREE.BoxGeometry(1.01, .03, .2), mat(0x2f6fd0)); t.position.y = .8; g.add(m, t); shade(g); g.position.set(x, y, z); g.scale.setScalar(s); g.rotation.y = yaw; root.add(g); };
    return { put, cyl, ball, carton };
  };
  const person = async (root, p, x, y, z, yaw, anim, t = .3, h = 1.75, tilt = 0) => {
    const g = await loader.loadAsync(`/lobby/people/character-${p}.glb`); const m = g.scene; shade(m);
    const b = new THREE.Box3().setFromObject(m); m.scale.setScalar(h / b.getSize(new THREE.Vector3()).y);
    const holder = new THREE.Group(); holder.add(m); holder.position.set(x, y, z); holder.rotation.order = 'YXZ'; holder.rotation.y = yaw; holder.rotation.z = tilt; root.add(holder);
    const clip = g.animations.find((a) => a.name === anim); if (clip) { const mix = new THREE.AnimationMixer(m); mix.clipAction(clip).play(); mix.update(t); }
    return holder;
  };
  const screenTex = (bg, lines) => { const c = document.createElement('canvas'); c.width = 256; c.height = 160; const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 256, 160); for (let i = 0; i < 11; i++) { let x = 12 + (i % 4) * 14; const y = 12 + i * 13; for (let k = 0; k < 2 + (i * 7) % 4; k++) { const w = 14 + ((i * 13 + k * 29) % 44); g.fillStyle = lines[(i + k) % lines.length]; g.fillRect(x, y, w, 7); x += w + 8; } } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const screen = (root, w, h, x, y, z, tex) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex })); m.position.set(x, y, z); root.add(m); };
  const brickTex = (base, mortar) => { const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d'); g.fillStyle = mortar; g.fillRect(0, 0, 1024, 1024); const R = 8, C = 5, bh = 128, bw = 1024 / C; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; for (let r = 0; r < R; r++) for (let i = -1; i <= C; i++) { const x = i * bw + (r % 2 ? bw / 2 : 0); const v = rnd(); const col = new THREE.Color(base).offsetHSL((v - .5) * .025, 0, (rnd() - .5) * .07); g.fillStyle = '#' + col.getHexString(); g.fillRect(x + 5, r * bh + 5, bw - 10, bh - 10); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
  const brickBox = (root, tex, w, h, d, x, y, z) => { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(w / 2.6, h / 2); const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: t, roughness: .95 })); m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true; root.add(m); };

  // Shared furniture.
  const fridgeOpen = (K, x, z, y = 0) => { K.put(1.25, 2.55, 1, 0x2e7f86, x, y, z); K.put(1.08, 2.15, .04, 0xbfd6dc, x, y + .2, z + .5, 0xa9c9d2, .62); for (let i = 0; i < 3; i++) K.put(1.08, .04, .3, 0x8fb3bf, x, y + .75 + i * .55, z + .62); K.put(.28, .34, .2, 0xc22a2a, x - .3, y + .79, z + .62); K.put(.2, .42, .2, 0xf0d24a, x + .25, y + .79, z + .62); K.put(.22, .4, .2, 0x2e7f86, x - .22, y + 1.34, z + .62); K.put(.42, .2, .24, 0xe07b2e, x + .15, y + 1.34, z + .62); K.put(.5, .16, .24, 0xf7efe0, x - .1, y + 1.89, z + .62); const d = K.put(.08, 2.3, 1.05, 0x358e96, x + .66, y + .12, z + .92); d.rotation.y = .28; K.put(.08, .5, .05, 0xdfe7e8, x + .58, y + 1.3, z + 1.24); };
  const devDesk = (K, root, x, z, y = 0) => { K.put(3, .1, 1.25, 0x9d7a52, x, y + 1.05, z); K.put(.1, 1.05, 1.05, 0x333333, x - 1.25, y, z); K.put(.1, 1.05, 1.05, 0x333333, x + 1.25, y, z); const a = screenTex('#0f1f3d', ['#6ee7ff', '#ffd166', '#ff6b6b', '#c7f464']), b = screenTex('#12291f', ['#7CFFB2', '#7CFFB2', '#e6ffe6']); K.put(1.2, .78, .06, 0x161616, x - .68, y + 1.42, z - .32); screen(root, 1.1, .68, x - .68, y + 1.81, z - .285, a); K.put(1, .72, .06, 0x161616, x + .68, y + 1.38, z - .32); screen(root, .9, .62, x + .68, y + 1.74, z - .285, b); K.put(.1, .3, .1, 0x222222, x - .68, y + 1.15, z - .32); K.put(.1, .26, .1, 0x222222, x + .68, y + 1.15, z - .32); K.put(.5, .03, .18, 0x2a2a2a, x, y + 1.15, z + .28); K.cyl(.07, .2, 0xf0ece2, x + 1.15, y + 1.15, z + .25); };
  const server = (K, x, z, y = 0) => { K.put(1, .55, .9, 0xb08a58, x, y, z); K.put(.66, 1.25, .78, 0x1c1c1f, x, y + .55, z); for (let i = 0; i < 4; i++) K.put(.4, .035, .02, 0x303036, x, y + 1.6 - i * .22, z + .4); for (let i = 0; i < 4; i++) K.put(.05, .05, .02, i < 3 ? 0x41ff8f : 0xffc94d, x + .24, y + 1.6 - i * .22, z + .405, i < 3 ? 0x41ff8f : 0xffc94d, 2); };
  const stool = (K, x, z, y = 0) => { K.cyl(.38, .08, 0xc23b2a, x, y + .72, z); K.cyl(.05, .72, 0x222222, x, y, z); K.cyl(.28, .04, 0x222222, x, y, z); };
  const bedAt = (K, x, z, y = 0) => { K.put(3, .24, 1.8, 0x5a4332, x, y, z); K.put(2.9, .34, 1.72, 0xeee6d6, x, y + .24, z); K.put(.75, .2, 1.25, 0xfaf3e5, x - 1.02, y + .58, z); K.put(1.95, .24, 1.78, 0x1f7a78, x + .5, y + .58, z); K.put(1.95, .04, .22, 0xf0b23a, x + .5, y + .82, z + .3); K.put(1.95, .04, .22, 0xf0b23a, x + .5, y + .82, z - .35); };
  const laptop = (K, x, y, z) => { K.put(.55, .03, .4, 0x8a8a90, x, y, z); const l = K.put(.03, .36, .42, 0x9a9aa2, x + .29, y + .03, z); l.rotation.z = -.22; const g = K.put(.012, .3, .36, 0xcfe6ff, x + .265, y + .05, z, 0x9dc3ff, 1.4); g.rotation.z = -.22; };
  const chair = (K, x, z, y = 0) => { K.put(.72, .1, .72, 0xc23b2a, x, y + .68, z); K.cyl(.05, .68, 0x222222, x, y, z); K.put(.8, .04, .1, 0x222222, x, y, z); K.put(.1, .04, .8, 0x222222, x, y, z); };
  const inBed = async (K, root, x, z, y, who) => { bedAt(K, x, z, y); K.put(.28, .7, 1.1, 0xfaf3e5, x - 1.32, y + .58, z); const who3 = await person(root, who, x - .95, y + .62, z + .05, .95, 'sit', .4); K.put(1.95, .3, 1.78, 0x1f7a78, x + .5, y + .58, z); K.put(1.95, .04, .22, 0xf0b23a, x + .5, y + .88, z + .3); K.put(1.95, .04, .22, 0xf0b23a, x + .5, y + .88, z - .35); laptop(K, x + .05, y + .92, z + .32); return who3; };
  const lights3 = (K, x0, x1, y, z, sag = .22) => { for (let i = 0; i < 15; i++) { const t = i / 14; K.ball(.07, 0xffe08a, x0 + t * (x1 - x0), y - Math.sin(t * Math.PI * 3) ** 2 * sag, z, 0xffc94d, 2.4); } };
  const poster = (K, x, y, z, w, h, a, b, c) => { K.put(w, h, .03, a, x, y, z); K.put(w * .78, h * .3, .035, b, x, y + h * .6, z); K.put(w * .6, h * .08, .035, c, x, y + h * .4, z); K.put(w * .6, h * .08, .035, c, x, y + h * .24, z); };

  // Kenney's people all paint themselves from one atlas, with three columns of skin side by side. These three use a deeper
  // one: the same numbers as in lobby/landingRoom.ts.
  const atlas = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = '/lobby/people/Textures/colormap.png'; });
  const ac = document.createElement('canvas'); ac.width = atlas.width; ac.height = atlas.height; const ag = ac.getContext('2d'); ag.drawImage(atlas, 0, 0);
  const af = ag.createLinearGradient(0, 384, 0, 512); af.addColorStop(0, '#7c4630'); af.addColorStop(1, '#4f2c1e'); ag.fillStyle = af; ag.fillRect(320, 384, 192, 128);
  const deep = new THREE.CanvasTexture(ac); deep.flipY = false; deep.colorSpace = THREE.SRGBColorSpace; deep.magFilter = deep.minFilter = THREE.NearestFilter;
  const darkSkinned = (holder) => holder.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.map = deep; } });

  const C = { wall: 0xd88a45, side: 0xcb7636, skirt: 0xb96a2c, ceil: 0xecd5ac, floor: 0x8a5d38, plank: 0x6d4628, curtain: 0x7c2a20, fold: 0x5e1f17, frame: 0x14233a, sill: 0xb8a68a, brick: ['#5a2b3a', '#2e1721'], pave: 0x30263a };
  const OUT = { road: 0x1e1826, curb: 0x463a4a, lot: 0x241b2e, left: 0x35283f, right: 0x302a48, trim: 0x2a1a26 };
  const scene = new THREE.Scene(); const root = new THREE.Group(); scene.add(root); const K = kit(root);
  const RW = 11, RD = 5, RH = 5, B = -2.6, F = 2.4;
  K.put(RW, .2, RD, C.floor, 0, -.2, -.1); for (let i = 0; i < 12; i++) K.put(.03, .005, RD, C.plank, -5.2 + i * .95, 0, -.1);
  K.put(RW, RH, .15, C.wall, 0, 0, B - .08); K.put(.15, RH, RD, C.side, -RW / 2, 0, -.1); K.put(.15, RH, RD, C.side, RW / 2, 0, -.1); K.put(RW, .2, RD, C.ceil, 0, RH, -.1);
  K.put(RW, .5, .06, C.skirt, 0, 0, B + .02);
  darkSkinned(await inBed(K, root, -2.95, -1.15, 0, 'male-a'));
  K.put(.55, .5, .55, 0xb08a58, -4.75, 0, .35); K.put(.4, .04, .28, 0x2a2a2a, -4.75, .5, .35); K.cyl(.05, .2, 0xc22a2a, -4.6, .5, .5);
  K.carton(-4.55, 0, 1.45, 1.05, .35); K.carton(-4.5, .84, 1.42, .85, -.2);
  poster(K, -3.7, 2.15, B + .03, 1.2, 1.6, 0x1c3f7a, 0xf0b23a, 0xf7efe0); poster(K, -2.3, 2.45, B + .03, .85, 1.15, 0xc23b2a, 0x111111, 0xf7efe0);
  K.put(1.5, 1.1, .85, 0xc23b2a, -.95, 0, -2.15); K.put(1.56, .06, .9, 0xf0e4cc, -.95, 1.1, -2.15);
  K.put(.5, .1, .5, 0xeee6d6, -1.3, 1.16, -2.15); K.put(.5, .1, .5, 0xd8c8a8, -1.3, 1.26, -2.17); K.put(.5, .1, .5, 0xeee6d6, -1.3, 1.36, -2.13);
  for (const [cx, c] of [[-.75, 0xf7efe0], [-.5, 0x1f7a78]]) K.cyl(.09, .2, c, cx, 1.16, -2.2);
  K.put(1.5, .06, .36, 0x6d4628, -.95, 2.5, -2.4); for (const [mx, mc] of [[-1.45, 0xf7efe0], [-1.15, 0x1f7a78], [-.85, 0xc23b2a], [-.5, 0xf7efe0]]) K.cyl(.09, .2, mc, mx, 2.56, -2.4);
  fridgeOpen(K, .55, -2.05); K.carton(.55, 2.55, -2.1, .85, .1);
  const awa = await person(root, 'female-e', -.72, 0, -.72, .55, 'holding-right', .3); darkSkinned(awa); { const can = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .24, 10), mat(0xc22a2a)); can.position.set(-.3, .78, .62); awa.add(can); }
  devDesk(K, root, 3.35, -2.0); chair(K, 2.3, -.72);
  darkSkinned(await person(root, 'male-f', 2.3, .74, -.72, .55, 'sit', .4));
  server(K, 4.85, -.15); K.put(.04, .02, 2.4, 0x111111, 4.3, 0, -.2);
  K.put(3.6, .02, 2, 0x27408b, .3, .005, 1); for (const [zz, c] of [[.3, 0xf7b52c], [1, 0xd9541e], [1.7, 0xf7b52c]]) K.put(3.6, .03, .22, c, .3, .005, zz);
  K.put(1.3, .42, .8, 0xb08a58, 1.25, .02, 1.5); K.put(.8, .06, .7, 0xeee6d6, 1.1, .44, 1.5); K.put(.7, .02, .6, 0xc8501e, 1.1, .5, 1.5);
  for (const [cx, cz] of [[1.63, 1.35], [1.73, 1.65]]) K.cyl(.06, .2, 0xc22a2a, cx, .44, cz);
  K.put(.5, .1, .4, 0x3b5e8c, -1.1, 0, 1.3); K.put(.42, .08, .3, 0xc23b2a, -1.05, .1, 1.28);
  lights3(K, -5, 5.2, 4.75, B + .12);
  K.put(.02, 1.05, .02, 0x111111, .55, 3.95, .3); K.ball(.11, 0xfff0c0, .55, 3.89, .3, 0xffe2a0, 2);
  // Facade: brick round the one big window.
  const wx = 4.75, wb = .2, wt = 4.75, fz = F;
  const bt = brickTex(C.brick[0], C.brick[1]);
  const B0 = -6.6, B1 = 5.7, ROOF = 8, ground = -.32, mx = (B0 + B1) / 2, bw = B1 - B0;
  brickBox(root, bt, bw, ROOF - wt, .4, mx, wt, fz); brickBox(root, bt, bw, wb - ground, .4, mx, ground, fz);
  brickBox(root, bt, -wx - B0, wt - wb, .4, (B0 - wx) / 2, wb, fz); brickBox(root, bt, B1 - wx, wt - wb, .4, (B1 + wx) / 2, wb, fz);
  K.put(bw + .5, .28, .75, OUT.trim, mx, ROOF, fz);
  // On the roof: a water tank and an aerial, as on every roof in town.
  K.cyl(.5, .6, 0x1a1f33, -3.9, ROOF + .28 + .25, fz - .6); for (const dx of [-.35, .35]) K.put(.08, .25, .08, 0x222222, -3.9 + dx, ROOF + .28, fz - .6);
  K.put(.05, 1.1, .05, 0x222222, 3.8, ROOF + .28, fz - .2); K.put(.7, .04, .04, 0x222222, 3.8, ROOF + 1.1, fz - .2); K.put(.45, .04, .04, 0x222222, 3.8, ROOF + .9, fz - .2);
  // Next door: a lower house on the left, a taller one set back on the right. The darkest things in the picture, being the nearest.
  K.put(10, 5.6, .4, OUT.left, B0 - 5.05, ground, fz - 1.4); K.put(10.3, .2, .6, OUT.trim, B0 - 5.05, ground + 5.6, fz - 1.4);
  K.put(14, 8.8, .4, OUT.right, 18, ground, fz - 3.5); K.put(14.3, .2, .6, OUT.trim, 18, ground + 8.8, fz - 3.5);
  for (const [x, y, z, on] of [[-9.6, 3.2, fz - 1.15, 1], [-8.3, 3.2, fz - 1.15, 0], [-9.6, 1.2, fz - 1.15, 0], [-8.3, 1.2, fz - 1.15, 1], [11.4, 6, fz - 3.25, 0], [12.7, 6, fz - 3.25, 1], [11.4, 3.8, fz - 3.25, 1], [12.7, 3.8, fz - 3.25, 0], [11.4, 1.6, fz - 3.25, 0], [12.7, 1.6, fz - 3.25, 1]]) { K.put(.74, 1, .05, 0x151020, x, y, z); if (on) K.put(.6, .86, .05, 0x8a6a38, x, y + .07, z + .03, 0xffb45c, .55); else K.put(.6, .86, .05, 0x2a2a44, x, y + .07, z + .03); }
  // The sidewalk with its joints, the kerb, the road, and the lot behind.
  const SW = 8;
  K.put(70, .3, 90, OUT.lot, 0, -.62, fz - 45);
  K.put(70, .3, SW, C.pave, 0, -.62, fz + .2 + SW / 2);
  for (let i = 0; i < 40; i++) K.put(.03, .005, SW, OUT.curb, -30 + i * 1.7, ground, fz + .2 + SW / 2);
  for (const dz of [2.2, 4.4, 6.6]) K.put(70, .005, .03, OUT.curb, 0, ground, fz + .2 + dz);
  K.put(70, .3, .35, OUT.curb, 0, -.62, fz + .2 + SW);
  K.put(70, .3, 30, OUT.road, 0, -.8, fz + .2 + SW + 15);
  for (let i = 0; i < 16; i++) K.put(1.7, .005, .13, 0xe8e2d2, -26 + i * 3.8, -.5, fz + SW + 3.6);
  // Moving day: boxes on the sidewalk, under the window.
  K.carton(6.2, ground, fz + 1, .95, .3); K.carton(6.3, ground + .76, fz + .95, .7, -.25); K.carton(7.5, ground, fz + 1.5, .7, -.5);
  // The sky: nearly black overhead (it runs into the page's header), and the city's own glow on the horizon.
  const sc = document.createElement('canvas'); sc.width = 4; sc.height = 512; const sg = sc.getContext('2d'); const sf = sg.createLinearGradient(0, 512, 0, 0); sf.addColorStop(0, '#d8a070'); sf.addColorStop(.35, '#8e5a68'); sf.addColorStop(.64, '#50335f'); sf.addColorStop(.89, '#1c1430'); sg.fillStyle = sf; sg.fillRect(0, 0, 4, 512);
  const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(160, 28), new THREE.MeshBasicMaterial({ map: st })); sky.position.set(cx0, 13, fz - 72); root.add(sky);
  let sr = 11; const rand = () => (sr = (sr * 16807) % 2147483647) / 2147483647;
  const starPaint = [.25, .45, .8].map((a) => new THREE.MeshBasicMaterial({ color: 0xfff4e0, transparent: true, opacity: a }));
  for (let i = 0; i < 45; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(.05 + rand() * .05, 6, 4), starPaint[i % 3]); s.position.set(cx0 - 34 + rand() * 68, 14 + rand() * 10, fz - 71); root.add(s); }
  // The city behind, in three flat rows of the lobby's low-detail buildings: the further, the closer to the colour of the
  // glow behind it, as air does. Plenty of windows on, in a few colours, and here and there a sign: it's a city up late.
  const LOW = 'abcdefghijklmn'.split('');
  const paint = (color) => new THREE.MeshBasicMaterial({ color });
  const WINDOWS = [0xffc773, 0xffc773, 0xffa45c, 0xfff0c8, 0x8fd0ff];
  const SIGNS = [0x3fe0c8, 0xff5fa2, 0xffc94d, 0x6f9bff];
  // The street lights' glow, rising from the ground in front of each row: every row stands out from the one behind it.
  const gc = document.createElement('canvas'); gc.width = 4; gc.height = 256; const gg = gc.getContext('2d'); const gf = gg.createLinearGradient(0, 256, 0, 0); gf.addColorStop(0, 'rgba(255,205,120,.5)'); gf.addColorStop(.5, 'rgba(255,190,110,.16)'); gf.addColorStop(1, 'rgba(255,180,100,0)'); gg.fillStyle = gf; gg.fillRect(0, 0, 4, 256);
  const gt = new THREE.CanvasTexture(gc); gt.colorSpace = THREE.SRGBColorSpace;
  for (const [z, high] of [[-52, 17], [-33, 13], [-15, 10]]) { const glow = new THREE.Mesh(new THREE.PlaneGeometry(150, high), new THREE.MeshBasicMaterial({ map: gt, transparent: true, depthWrite: false })); glow.position.set(cx0, ground + high / 2, fz + z); root.add(glow); }
  for (const row of [{ z: -62, color: 0x3f2a50, H: [14, 20], n: 15, lit: 34, fade: .4, w: .34, signs: 0 }, { z: -42, color: 0x312143, H: [10, 15], n: 11, lit: 36, fade: .22, w: .34, signs: 3 }, { z: -24, color: 0x241834, H: [7, 11], n: 8, lit: 30, fade: .08, w: .34, signs: 4 }]) {
    const flat = paint(row.color), span = (row.z * -1 + 34) * 1.1; const haze = new THREE.Color(row.color);
    const lit = WINDOWS.map((c) => paint(new THREE.Color(c).lerp(haze, row.fade))); const signPaint = SIGNS.map((c) => paint(new THREE.Color(c).lerp(haze, row.fade)));
    for (let i = 0; i < row.n; i++) {
      const name = LOW[Math.floor(rand() * LOW.length)]; const g = await loader.loadAsync('/lobby/city/low-detail-building-' + name + '.glb'); const m = g.scene.clone(true);
      m.traverse((o) => { if (o.isMesh) o.material = flat; });
      const H = row.H[0] + rand() * (row.H[1] - row.H[0]); const bb = new THREE.Box3().setFromObject(m); const sz = bb.getSize(new THREE.Vector3()); const k = H / sz.y; m.scale.setScalar(k);
      const x = cx0 - span / 2 + (i + .2 + rand() * .6) * (span / row.n), z = fz + row.z - rand() * 4; m.position.set(x - (bb.min.x + sz.x / 2) * k, ground - bb.min.y * k, z); root.add(m);
      const front = z + bb.max.z * k + .1, wide = sz.x * k * .6, step = row.w * 2.4;
      for (let n = 0; n < row.lit; n++) { const win = new THREE.Mesh(new THREE.PlaneGeometry(row.w, row.w * 1.4), lit[Math.floor(rand() * lit.length)]); win.position.set(x + Math.round((rand() - .5) * wide / step) * step, ground + 2 + Math.round(rand() * (H * .78 - 2) / (step * 1.2)) * step * 1.2, front); root.add(win); }
      if (i % 3 === 1 && row.signs) { const sign = new THREE.Mesh(new THREE.PlaneGeometry(row.signs * .5, row.signs * .16), signPaint[i % signPaint.length]); sign.position.set(x, ground + H * .62, front + .05); root.add(sign); }
    }
  }
  // The two shops in the gap, between the near houses and the city: in shade, so the eye stays on the window.
  for (const [name, x, z, H] of [['a', 8.1, fz - 9, 5.2], ['d', 11.6, fz - 11, 7]]) { const g = await loader.loadAsync('/lobby/city/building-' + name + '.glb'); const m = g.scene.clone(true); shade(m); m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.setHex(0x9182a8); } }); const bb = new THREE.Box3().setFromObject(m); const sz = bb.getSize(new THREE.Vector3()); const k = H / sz.y; m.scale.setScalar(k); m.position.set(x - (bb.min.x + sz.x / 2) * k, ground - bb.min.y * k, z); root.add(m); }
  const fr = C.frame;
  K.put(wx * 2 + .3, .16, .5, fr, 0, wt - .08, fz); K.put(wx * 2 + .5, .14, .7, C.sill, 0, wb - .1, fz + .1); K.put(.16, wt - wb, .5, fr, -wx, wb, fz); K.put(.16, wt - wb, .5, fr, wx, wb, fz);
  K.put(.1, wt - wb, .3, fr, -1.75, wb, fz); K.put(.1, wt - wb, .3, fr, 1.42, wb, fz);
  K.put(.72, wt - wb - .1, .2, C.curtain, -wx + .42, wb + .1, fz - .3); K.put(.8, wt - wb - .1, .2, C.curtain, wx - .45, wb + .1, fz - .3);
  for (let i = 0; i < 5; i++) { K.put(.06, wt - wb - .1, .24, C.fold, -wx + .12 + i * .15, wb + .1, fz - .3); K.put(.06, wt - wb - .1, .24, C.fold, wx - .8 + i * .17, wb + .1, fz - .3); }
  const Pl = await loader.loadAsync('/lobby/houses/planter.glb'); shade(Pl.scene); Pl.scene.scale.setScalar(1.6); Pl.scene.position.set(-3.5, wb + .04, fz + .32); root.add(Pl.scene);
  const pz = fz + 2.5, px = 6.46;
  K.cyl(.3, 14, 0x4a4750, px, -.32, pz);
  for (const [y, h, w, dx] of [[.25, .75, .34, -.14], [1.5, .3, .22, .12], [8.4, .42, .3, .05]]) K.put(w, h, .05, 0x77705f, px + dx, y, pz + .29);
  // Light.
  const pl = (c, i, d, x, y, z) => { const l = new THREE.PointLight(c, i, d, 1.8); l.position.set(x, y, z); scene.add(l); return l; };
  scene.add(new THREE.HemisphereLight(0xc4aeb8, 0x5a4034, 1.05));
  const key = pl(0xffc27a, 42, 22, .55, 3.7, .4); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.002; key.shadow.radius = 4;
  pl(0xffb06a, 18, 14, -3.2, 3.8, 1); pl(0xd8efff, 3.5, 5, .45, 1.6, -.7); pl(0x7bb8ff, 6, 4, 3.4, 1.9, -1.1); pl(0xffa860, 14, 8, 0, .6, 5);
  const moon = new THREE.DirectionalLight(0xa58fc4, .9); moon.position.set(-5, 9, 22); scene.add(moon);
  const w = 2400, h = 1500, fw = 21, dist = 34, cy = 3.6; const fov = 2 * Math.atan(fw * h / w / 2 / dist) * 180 / Math.PI;
  const cam = new THREE.PerspectiveCamera(fov, w / h, .1, 200); cam.position.set(cx0, cy, fz + dist); cam.lookAt(cx0, cy, fz);
  const r = rig(w, h, 0x120c1c, 1); r.render(scene, cam); out.street = r.domElement.toDataURL('image/png'); r.dispose();
  return out;
};
