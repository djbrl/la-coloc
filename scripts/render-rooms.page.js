// A room per character, run in the page by render-rooms.mjs. Dense on purpose: it's a tool, not the site. The camera stands
// on the sidewalk, as on the landing, and the furniture comes from the landing's scene (render-landing.page.js).
window.__render = async () => {
  /* furniture */
  const C = { wall: 0xd88a45, side: 0xcb7636, skirt: 0xb96a2c, ceil: 0xecd5ac, floor: 0x8a5d38, plank: 0x6d4628 };
  const RW = 8, RD = 5, RH = 4.4, B = -2.6;
  const ROOMS = [
    // At the desk, with the screens lit.
    async (K, root, who) => { devDesk(K, root, 1, -2); chair(K, -.05, -.72); server(K, 2.9, -.6); await person(root, who, -.05, .74, -.72, .55, 'sit', .4); },
    // At the fridge, can in hand.
    async (K, root, who) => { fridgeOpen(K, 1.3, -2.05); K.carton(1.3, 2.55, -2.1, .85, .1); K.put(1.5, 1.1, .85, 0xc23b2a, -1.1, 0, -2.15); K.put(1.56, .06, .9, 0xf0e4cc, -1.1, 1.1, -2.15); K.put(1.5, .06, .36, 0x6d4628, -1.1, 2.5, -2.4); for (const [mx, mc] of [[-1.6, 0xf7efe0], [-1.3, 0x1f7a78], [-1, 0xc23b2a], [-.65, 0xf7efe0]]) K.cyl(.09, .2, mc, mx, 2.56, -2.4); await person(root, who, -.1, 0, -.72, .55, 'holding-right', .3); },
    // On the bed, among the cartons.
    async (K, root, who) => { await inBed(K, root, -.2, -1.15, 0, who); K.carton(2.6, 0, -1.4, 1.05, .35); K.carton(2.65, .84, -1.42, .85, -.2); poster(K, 1.1, 1.5, B + .03, .85, 1.15, 0x1c3f7a, 0xf0b23a, 0xf7efe0); },
  ];
  const CHARACTERS = ['female-a', 'male-a', 'female-b', 'male-b', 'female-c', 'male-c', 'female-d', 'male-d', 'female-e', 'male-e', 'female-f', 'male-f'];
  const w = 480, h = 300, fw = 5.6, dist = 16, cy = 1.5;
  for (let i = 0; i < CHARACTERS.length; i++) {
    const scene = new THREE.Scene(); const root = new THREE.Group(); scene.add(root); const K = kit(root);
    K.put(RW, .2, RD, C.floor, 0, -.2, -.1); for (let p = 0; p < 9; p++) K.put(.03, .005, RD, C.plank, -3.8 + p * .95, 0, -.1);
    K.put(RW, RH, .15, C.wall, 0, 0, B - .08); K.put(.15, RH, RD, C.side, -RW / 2, 0, -.1); K.put(.15, RH, RD, C.side, RW / 2, 0, -.1); K.put(RW, .2, RD, C.ceil, 0, RH, -.1); K.put(RW, .5, .06, C.skirt, 0, 0, B + .02);
    lights3(K, -3.8, 3.8, RH - .3, B + .12);
    await ROOMS[i % ROOMS.length](K, root, CHARACTERS[i]);
    const pl = (c, p, d, x, y, z) => { const l = new THREE.PointLight(c, p, d, 1.8); l.position.set(x, y, z); scene.add(l); return l; };
    scene.add(new THREE.HemisphereLight(0xc4aeb8, 0x5a4034, 1.05));
    const key = pl(0xffc27a, 34, 18, .4, 3.4, .6); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -.002; key.shadow.radius = 4;
    pl(0xffb06a, 10, 12, -2.6, 3.2, 1); pl(0xffa860, 8, 8, 0, .6, 4);
    const fov = 2 * Math.atan(fw * h / w / 2 / dist) * 180 / Math.PI;
    const cam = new THREE.PerspectiveCamera(fov, w / h, .1, 100); cam.position.set(0, cy, dist); cam.lookAt(0, cy, 0);
    const r = rig(w, h, 0x120c1c, 1); r.render(scene, cam); out[CHARACTERS[i]] = r.domElement.toDataURL('image/png'); r.dispose();
  }
  return out;
};
