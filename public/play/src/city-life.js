import * as THREE from 'three';
import { PALETTE, neonMat, toonMat } from './materials.js';
import { BOULEVARD } from './transit-layout.js';

const RADIALS = [
  { angle: Math.PI / 2, color: PALETTE.cyan },
  { angle: Math.PI / 2 + (2 * Math.PI) / 3, color: 0x8b7dff },
  { angle: Math.PI / 2 - (2 * Math.PI) / 3, color: PALETTE.coral },
];
const SKIN = [0xf0c7a8, 0x8e5d43, 0xdca47d, 0x5c382d, 0xc98562, 0xf2d2bc];
const CLOTH = [0xff6f91, 0x4deeea, 0xffb84d, 0x8b7dff, 0x2c8c7c, 0xe9e2d0, 0x3264a8];

function signTexture(title, subtitle, accent) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a1022';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 18, canvas.height);
  ctx.fillRect(0, canvas.height - 12, canvas.width, 12);
  ctx.fillStyle = '#f8f4ee';
  ctx.font = "800 48px 'Space Grotesk', sans-serif";
  ctx.textAlign = 'left';
  ctx.fillText(title.toUpperCase(), 46, 82);
  ctx.fillStyle = accent;
  ctx.font = "700 22px 'Space Grotesk', sans-serif";
  ctx.fillText(subtitle.toUpperCase(), 48, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function addSign(group, title, subtitle, accent, width = 4.8) {
  const texture = signTexture(title, subtitle, accent);
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width * 0.375),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide, toneMapped: false }),
  );
  panel.userData.signTexture = texture;
  const back = panel.clone();
  back.rotation.y = Math.PI;
  back.position.z = -0.15;
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.18, width * 0.375 + 0.18, 0.12),
    new THREE.MeshStandardMaterial({ color: 0xb9c9d8, metalness: 0.88, roughness: 0.2 }),
  );
  frame.position.z = -0.08;
  group.add(frame, panel, back);
  return panel;
}

function addBox(group, size, position, material, name = '') {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = name;
  group.add(mesh);
  return mesh;
}

function buildCafeVenue({ title, subtitle, accent, kind = 'cafe' }) {
  const g = new THREE.Group();
  g.name = `${kind}-venue`;
  const ink = toonMat(0x111a30);
  const stone = toonMat(kind === 'market' ? 0x315a62 : 0xdce3e8);
  const glass = new THREE.MeshStandardMaterial({
    color: 0x74d7dc, emissive: 0x14354b, emissiveIntensity: 0.88,
    metalness: 0.46, roughness: 0.19, transparent: true, opacity: 0.82,
  });
  const accentMat = toonMat(accent);
  addBox(g, [8.8, 0.5, 5.4], [0, 0.25, 0], stone, 'venue-plinth');
  addBox(g, [8.2, 3.8, 4.7], [0, 2.15, 0.15], ink, 'venue-shell');
  addBox(g, [7.45, 2.25, 0.12], [0, 1.85, -2.25], glass, 'venue-glazing');
  for (const x of [-2.5, 0, 2.5]) addBox(g, [0.11, 2.35, 0.18], [x, 1.85, -2.35], accentMat);
  addBox(g, [8.7, 0.18, 1.8], [0, 3.25, -2.78], accentMat, 'venue-awning');
  addBox(g, [8.7, 0.16, 5.25], [0, 4.15, 0.05], toonMat(0xc1cddd), 'venue-roof');
  const sign = new THREE.Group();
  addSign(sign, title, subtitle, `#${new THREE.Color(accent).getHexString()}`, 5.4);
  sign.position.set(0, 4.75, -2.57);
  g.add(sign);

  const tableMat = toonMat(0xd8e1e6);
  const chairMat = toonMat(0x23324c);
  const parasolMat = toonMat(accent);
  for (const x of [-2.6, 0, 2.6]) {
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 12), tableMat);
    table.position.set(x, 0.82, -4.1);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.76, 7), chairMat);
    stem.position.set(x, 0.42, -4.1);
    const parasol = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.48, 12), parasolMat);
    parasol.position.set(x, 2.72, -4.1);
    parasol.rotation.x = Math.PI;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.25, 6), chairMat);
    mast.position.set(x, 1.65, -4.1);
    g.add(table, stem, parasol, mast);
    for (const side of [-1, 1]) addBox(g, [0.55, 0.62, 0.55], [x + side * 0.9, 0.32, -4.1], chairMat);
  }
  return g;
}

function buildVendor(kind, accent) {
  const g = new THREE.Group();
  g.name = `${kind}-vendor`;
  const body = toonMat(kind === 'flowers' ? 0x18515b : 0x243653);
  const trim = toonMat(accent);
  const chrome = new THREE.MeshStandardMaterial({ color: 0xaabbd2, metalness: 0.86, roughness: 0.22 });
  addBox(g, [2.5, 1.25, 1.35], [0, 0.83, 0], body, `${kind}-cart`);
  addBox(g, [2.75, 0.14, 1.55], [0, 1.52, 0], chrome);
  for (const x of [-1.02, 1.02]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.16, 12), toonMat(0x101522));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.38, 0.72);
    g.add(wheel);
  }
  for (const x of [-1.08, 1.08]) addBox(g, [0.08, 2.3, 0.08], [x, 2.55, 0], chrome);
  addBox(g, [2.75, 0.17, 1.75], [0, 3.7, 0], trim, `${kind}-canopy`);

  if (kind === 'flowers') {
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.018, 0.025, 0.72, 5), toonMat(0x2a8d69), 18);
    const blooms = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.16, 0), toonMat(0xffffff), 18);
    const dummy = new THREE.Object3D();
    const colors = [0xff6f91, 0xffb84d, 0xe961c2, 0xf4e5a3, 0x67e8d3];
    for (let i = 0; i < 18; i++) {
      const x = -0.92 + (i % 6) * 0.37;
      const z = -0.38 + Math.floor(i / 6) * 0.38;
      const h = 0.58 + (i % 3) * 0.08;
      dummy.position.set(x, 1.57 + h / 2, z);
      dummy.rotation.set(0, 0, (i % 2 ? 1 : -1) * 0.08);
      dummy.scale.set(1, h / 0.72, 1);
      dummy.updateMatrix();
      stems.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 1.55 + h, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0.82 + (i % 4) * 0.08);
      dummy.updateMatrix();
      blooms.setMatrixAt(i, dummy.matrix);
      blooms.setColorAt(i, new THREE.Color(colors[i % colors.length]));
    }
    stems.instanceMatrix.needsUpdate = blooms.instanceMatrix.needsUpdate = true;
    if (blooms.instanceColor) blooms.instanceColor.needsUpdate = true;
    g.add(stems, blooms);
  } else {
    for (const x of [-0.72, 0, 0.72]) {
      const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 10), chrome);
      pan.position.set(x, 1.66, 0);
      g.add(pan);
    }
    const menu = new THREE.Group();
    addSign(menu, kind === 'coffee' ? 'ESPRESSO' : 'NIGHT BITES', kind === 'coffee' ? 'ROASTED HERE' : 'HOT + FRESH', `#${new THREE.Color(accent).getHexString()}`, 2.15);
    menu.scale.setScalar(0.62);
    menu.position.set(0, 2.76, 0.9);
    g.add(menu);
  }
  return g;
}

function buildHubActivity(group, lowPower, animated) {
  group.userData.colliderObjects = [];
  const beacon = new THREE.Group();
  beacon.name = 'central-language-beacon';
  const beaconChrome = new THREE.MeshStandardMaterial({ color: 0xb9c9d8, metalness: 0.9, roughness: 0.17 });
  const beaconBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.72, 5.25, 8),
    new THREE.MeshStandardMaterial({
      color: 0x1b5966, emissive: 0x0b4354, emissiveIntensity: 0.92,
      metalness: 0.76, roughness: 0.2,
    }),
  );
  beaconBody.position.y = 2.82;
  beaconBody.rotation.y = Math.PI / 8;
  beaconBody.castShadow = true;
  const beaconBase = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.82, 0.34, 24), toonMat(0x354966));
  beaconBase.position.y = 0.21;
  const beaconRing = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.09, 8, 48), neonMat(PALETTE.coral, 1.05));
  beaconRing.rotation.x = Math.PI / 2;
  beaconRing.position.y = 0.39;
  beacon.add(beaconBody, beaconBase, beaconRing);
  for (let rib = 0; rib < 4; rib++) {
    const angle = rib * Math.PI / 2 + Math.PI / 4;
    const lightBlade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 4.7, 0.055), neonMat(rib % 2 ? PALETTE.cyan : PALETTE.coral, 0.88));
    lightBlade.position.set(Math.cos(angle) * 0.62, 2.85, Math.sin(angle) * 0.62);
    beacon.add(lightBlade);
  }
  const beaconMessages = [
    ['SAY IT', 'YOUR VOICE MOVES THE CITY', PALETTE.coral],
    ['HEAR IT', 'FORTY-FOUR ENGLISHES', PALETTE.cyan],
    ['OWN IT', 'NEXT STOP: FLUENCY', 0xffb84d],
  ];
  beaconMessages.forEach(([title, subtitle, color], index) => {
    const side = new THREE.Group();
    addSign(side, title, subtitle, `#${new THREE.Color(color).getHexString()}`, 1.82);
    const angle = index * (Math.PI * 2 / 3);
    side.position.set(Math.sin(angle) * 0.73, 3.05, Math.cos(angle) * 0.73);
    side.rotation.y = angle;
    beacon.add(side);
  });
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.52, 1.35, 8), beaconChrome);
  crown.position.y = 6.05;
  const crownTip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), neonMat(PALETTE.cyan));
  crownTip.position.y = 7.38;
  beacon.add(crown, crownTip);
  group.add(beacon);
  group.userData.colliderObjects.push(beacon);

  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const bench = new THREE.Group();
    addBox(bench, [2.1, 0.16, 0.58], [0, 0.62, 0], beaconChrome);
    addBox(bench, [2.1, 0.4, 0.1], [0, 0.82, 0.29], toonMat(0x40536d));
    bench.position.set(Math.cos(angle) * 5.25, 0, Math.sin(angle) * 5.25);
    bench.rotation.y = -angle + Math.PI / 2;
    group.add(bench);
  }
  const venues = [
    { title: 'Metro Social', subtitle: 'Kitchen + late cafe', accent: PALETTE.coral, pos: [-18.8, -1.5] },
    { title: 'Platform 9', subtitle: 'Noodles + vinyl', accent: PALETTE.cyan, pos: [18.8, -0.5] },
    { title: 'Night Market', subtitle: 'Food, flowers, phrases', accent: 0xffb84d, pos: [0, 27] },
  ];
  for (const venue of venues) {
    const model = buildCafeVenue({ ...venue, kind: venue.title === 'Night Market' ? 'market' : 'cafe' });
    model.position.set(venue.pos[0], 0, venue.pos[1]);
    // Venue fronts are authored on local -Z; rotate that frontage toward the
    // plaza so glazing, signs and cafe tables address the actual footfall.
    model.rotation.y = Math.atan2(venue.pos[0], venue.pos[1]);
    model.scale.setScalar(venue.title === 'Night Market' ? 0.9 : 0.72);
    group.add(model);
    group.userData.colliderObjects.push(model);
  }

  const vendors = [
    ['flowers', -11.5, 1.4, 0.55, PALETTE.coral],
    ['food', 11.8, 3.6, -0.8, 0xffb84d],
    ['coffee', -5.8, 13.5, 2.7, PALETTE.cyan],
    ['flowers', 7.2, 14.1, -2.7, 0xe961c2],
  ];
  for (const [kind, x, z, yaw, color] of vendors.slice(0, lowPower ? 3 : 4)) {
    const vendor = buildVendor(kind, color);
    vendor.position.set(x, 0, z);
    vendor.rotation.y = yaw;
    vendor.scale.setScalar(0.78);
    group.add(vendor);
  }

  const bollardMat = new THREE.MeshStandardMaterial({ color: 0xaabbd2, metalness: 0.84, roughness: 0.25 });
  const glowMat = neonMat(PALETTE.cyan, 0.85);
  const bollards = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.15, 0.78, 8), bollardMat, 24);
  const caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 8), glowMat, 24);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const radius = i % 2 ? 20.9 : 19.9;
    dummy.position.set(Math.cos(angle) * radius, 0.39, Math.sin(angle) * radius);
    dummy.rotation.set(0, angle, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    bollards.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 0.8;
    dummy.updateMatrix();
    caps.setMatrixAt(i, dummy.matrix);
  }
  bollards.instanceMatrix.needsUpdate = caps.instanceMatrix.needsUpdate = true;
  group.add(bollards, caps);

  if (!lowPower) {
    const colors = [PALETTE.coral, PALETTE.cyan, 0xffb84d, 0x8b7dff];
    for (let i = 0; i < 4; i++) {
      const light = new THREE.PointLight(colors[i], 2.1, 15, 2.2);
      const a = i * Math.PI / 2 + Math.PI / 4;
      light.position.set(Math.cos(a) * 14, 3.8, Math.sin(a) * 14);
      group.add(light);
    }
  }

  const steam = [];
  for (const [x, z, phase] of [[11.8, 3.6, 0], [-5.8, 13.5, 1.8]]) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 7, 5),
      new THREE.MeshBasicMaterial({ color: 0xd8f4f0, transparent: true, opacity: 0.34, depthWrite: false }),
    );
    puff.position.set(x, 2.4, z);
    puff.userData.origin = new THREE.Vector3(x, 2.4, z);
    puff.userData.phase = phase;
    group.add(puff);
    steam.push(puff);
  }
  animated.push({
    userData: {
      update(t) {
        for (const puff of steam) {
          const cycle = (t * 0.34 + puff.userData.phase) % 1;
          puff.position.y = puff.userData.origin.y + cycle * 1.6;
          puff.position.x = puff.userData.origin.x + Math.sin(t * 1.4 + puff.userData.phase) * 0.12;
          puff.scale.setScalar(0.55 + cycle * 1.2);
          puff.material.opacity = (1 - cycle) * 0.32;
        }
      },
    },
  });
}

function setSegment(mesh, index, start, end, dummy, axis, delta) {
  delta.subVectors(end, start);
  const length = Math.max(0.01, delta.length());
  dummy.position.copy(start).add(end).multiplyScalar(0.5);
  dummy.quaternion.setFromUnitVectors(axis, delta.multiplyScalar(1 / length));
  dummy.scale.set(1, length, 1);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

class AmbientCrowd {
  constructor(scene, { lowPower = false } = {}) {
    this.scene = scene;
    this.capacity = lowPower ? 26 : 52;
    this.density = this.capacity;
    this.people = [];
    this.time = 0;
    this.dummy = new THREE.Object3D();
    this.axis = new THREE.Vector3(0, 1, 0);
    this.scratch = {
      forward: new THREE.Vector3(), right: new THREE.Vector3(),
      start: new THREE.Vector3(), end: new THREE.Vector3(), delta: new THREE.Vector3(),
    };
    this.makeMeshes();
    this.makePeople();
    this.update(0, 0);
  }

  makeMeshes() {
    const n = this.capacity;
    this.body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.2, 0.65, 5, 8), toonMat(0xffffff), n);
    this.head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 12, 8), toonMat(0xffffff), n);
    this.hair = new THREE.InstancedMesh(new THREE.SphereGeometry(0.185, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.52), toonMat(0xffffff), n);
    this.legs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.075, 0.09, 1, 8), toonMat(0xffffff), n * 2);
    this.arms = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.07, 1, 8), toonMat(0xffffff), n * 2);
    this.hands = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 9, 6), toonMat(0xffffff), n * 2);
    this.shoes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.1, 0.3), toonMat(0x101522), n * 2);
    this.bags = new THREE.InstancedMesh(new THREE.BoxGeometry(0.27, 0.38, 0.12), toonMat(0xffffff), n);
    for (const mesh of [this.body, this.head, this.hair, this.legs, this.arms, this.hands, this.shoes, this.bags]) {
      mesh.name = 'ambient-cbd-crowd';
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
    }
  }

  makePeople() {
    for (let i = 0; i < this.capacity; i++) {
      const hub = i < Math.floor(this.capacity * 0.38);
      const lineIndex = i % RADIALS.length;
      const side = i % 2 ? 1 : -1;
      const person = {
        position: new THREE.Vector3(),
        hub,
        lineIndex,
        side,
        d: 36 + ((i * 47) % Math.floor(BOULEVARD.carEndD - 54)),
        routeDir: i % 4 < 2 ? 1 : -1,
        speed: 0.68 + (i % 7) * 0.09,
        radius: 12.4 + (i % 4) * 1.85,
        angle: (i * 2.399) % (Math.PI * 2),
        phase: (i * 1.731) % (Math.PI * 2),
        height: 0.92 + (i % 6) * 0.025,
      };
      this.people.push(person);
      const cloth = new THREE.Color(CLOTH[i % CLOTH.length]);
      const lower = cloth.clone().lerp(new THREE.Color(0x14233b), 0.55);
      const skin = new THREE.Color(SKIN[i % SKIN.length]);
      this.body.setColorAt(i, cloth);
      this.head.setColorAt(i, skin);
      this.hair.setColorAt(i, new THREE.Color([0x191725, 0x3b2722, 0x6b4431, 0xd7c0a5][i % 4]));
      this.bags.setColorAt(i, new THREE.Color(CLOTH[(i + 3) % CLOTH.length]).multiplyScalar(0.72));
      for (const sideIndex of [0, 1]) {
        const limb = i * 2 + sideIndex;
        this.legs.setColorAt(limb, lower);
        this.arms.setColorAt(limb, cloth);
        this.hands.setColorAt(limb, skin);
      }
    }
    for (const mesh of [this.body, this.head, this.hair, this.legs, this.arms, this.hands, this.bags]) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  setDensity(value) {
    this.density = THREE.MathUtils.clamp(value | 0, 0, this.capacity);
    this.body.count = this.head.count = this.hair.count = this.bags.count = this.density;
    this.legs.count = this.arms.count = this.hands.count = this.shoes.count = this.density * 2;
  }

  update(t, dt) {
    this.time = t;
    const { forward, right, start, end, delta } = this.scratch;
    const dummy = this.dummy;
    for (let i = 0; i < this.density; i++) {
      const p = this.people[i];
      let heading;
      if (p.hub) {
        p.angle += dt * p.speed / p.radius * p.routeDir;
        p.position.set(Math.cos(p.angle) * p.radius, 0, Math.sin(p.angle) * p.radius);
        heading = p.angle + (p.routeDir > 0 ? -Math.PI / 2 : Math.PI / 2);
      } else {
        p.d += dt * p.speed * p.routeDir;
        if (p.d > BOULEVARD.carEndD - 7) { p.d = BOULEVARD.carEndD - 7; p.routeDir = -1; }
        if (p.d < 31) { p.d = 31; p.routeDir = 1; }
        const line = RADIALS[p.lineIndex];
        const dirX = Math.cos(line.angle), dirZ = -Math.sin(line.angle);
        const lat = p.side * (5.4 + (i % 4) * 0.2);
        p.position.set(dirX * p.d - dirZ * lat, 0, dirZ * p.d + dirX * lat);
        heading = Math.atan2(dirX * p.routeDir, dirZ * p.routeDir);
      }
      forward.set(Math.sin(heading), 0, Math.cos(heading));
      right.set(forward.z, 0, -forward.x);
      const gait = Math.sin(t * (5.2 + p.speed) + p.phase);
      const h = p.height;
      const hipY = 0.82 * h;
      const shoulderY = 1.42 * h;
      const bodyY = 1.18 * h + Math.abs(gait) * 0.018;

      dummy.position.set(p.position.x, bodyY, p.position.z);
      dummy.quaternion.setFromAxisAngle(this.axis, heading);
      dummy.scale.set(h, h, h);
      dummy.updateMatrix();
      this.body.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.position.x, 1.76 * h, p.position.z);
      dummy.scale.set(h, h, h);
      dummy.updateMatrix();
      this.head.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 1.86 * h;
      dummy.scale.set(h, h * 0.72, h);
      dummy.updateMatrix();
      this.hair.setMatrixAt(i, dummy.matrix);

      for (const side of [-1, 1]) {
        const limbIndex = i * 2 + (side > 0 ? 1 : 0);
        const stride = gait * 0.28 * side;
        start.set(p.position.x, hipY, p.position.z).addScaledVector(right, side * 0.12 * h);
        end.copy(p.position).addScaledVector(right, side * 0.12 * h).addScaledVector(forward, stride);
        end.y = 0.13;
        setSegment(this.legs, limbIndex, start, end, dummy, this.axis, delta);
        dummy.position.copy(end).addScaledVector(forward, 0.09);
        dummy.position.y = 0.08;
        dummy.quaternion.setFromAxisAngle(this.axis, heading);
        dummy.scale.set(h, h, h);
        dummy.updateMatrix();
        this.shoes.setMatrixAt(limbIndex, dummy.matrix);

        start.set(p.position.x, shoulderY, p.position.z).addScaledVector(right, side * 0.25 * h);
        end.copy(start).addScaledVector(forward, -stride * 0.72);
        end.addScaledVector(right, side * 0.025);
        end.y = 0.86 * h;
        setSegment(this.arms, limbIndex, start, end, dummy, this.axis, delta);
        dummy.position.copy(end);
        dummy.quaternion.identity();
        dummy.scale.set(h, h, h);
        dummy.updateMatrix();
        this.hands.setMatrixAt(limbIndex, dummy.matrix);
      }

      dummy.position.copy(p.position).addScaledVector(right, 0.25 * h);
      dummy.position.y = 1.08 * h;
      dummy.quaternion.setFromAxisAngle(this.axis, heading);
      dummy.scale.set(i % 3 === 0 ? h : 0.001, h, h);
      dummy.updateMatrix();
      this.bags.setMatrixAt(i, dummy.matrix);
    }
    for (const mesh of [this.body, this.head, this.hair, this.legs, this.arms, this.hands, this.shoes, this.bags]) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

export class CityLife {
  constructor(scene, { lowPower = false } = {}) {
    this.scene = scene;
    this.lowPower = lowPower;
    this.group = new THREE.Group();
    this.group.name = 'cbd-street-life';
    this.animated = [];
    buildHubActivity(this.group, lowPower, this.animated);
    this.scene.add(this.group);
    this.colliderObjects = this.group.userData.colliderObjects || [];
    this.crowd = new AmbientCrowd(scene, { lowPower });
    this.people = this.crowd.people.map((person) => person.position);
  }

  setDensity(value) { this.crowd.setDensity(value); }

  update(t, dt) {
    this.crowd.update(t, dt);
    for (const item of this.animated) item.userData.update?.(t, dt);
  }
}

export function buildDistrictLife(rng, { accent, secondary, nearEdge, code = 'metro', lowPower = false }) {
  const g = new THREE.Group();
  g.name = 'district-street-life';
  const accentHex = accent instanceof THREE.Color ? accent.getHex() : accent;
  const secondaryHex = secondary instanceof THREE.Color ? secondary.getHex() : secondary;
  const cartSlots = lowPower ? [-10.5] : [-12.2, 12.2];
  const cartCount = cartSlots.length;
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(2.25, 1.08, 1.2), toonMat(0xffffff), cartCount);
  const counter = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.5, 0.12, 1.42),
    new THREE.MeshStandardMaterial({ color: 0xaabbd2, metalness: 0.84, roughness: 0.24 }),
    cartCount,
  );
  const canopy = new THREE.InstancedMesh(new THREE.BoxGeometry(2.55, 0.15, 1.55), toonMat(0xffffff), cartCount);
  const menu = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.48, 0.08), neonMat(accentHex, 0.88), cartCount);
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.055, 2.15, 6), toonMat(0x32425a), cartCount * 4);
  const wheels = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.28, 0.14, 10), toonMat(0x101522), cartCount * 2);
  const goods = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.13, 0), toonMat(0xffffff), cartCount * 8);
  const tableSlots = lowPower ? [7.2] : [-7.5, 7.5];
  const tables = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.48, 0.48, 0.1, 10), toonMat(0xbecbd6), tableSlots.length);
  const masts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.045, 2.1, 6), toonMat(0x1b2941), tableSlots.length);
  const umbrellas = new THREE.InstancedMesh(new THREE.ConeGeometry(0.92, 0.38, 10), toonMat(accentHex), tableSlots.length);
  const chairs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.5, 0.45), toonMat(0x1b2941), tableSlots.length * 2);
  const dummy = new THREE.Object3D();
  const colors = [accentHex, secondaryHex, 0xffb84d];
  const goodsColors = [0xff6f91, 0x4deeea, 0xffb84d, 0xe6e0d6, 0x43c59e];
  const set = (mesh, index, x, y, z, yaw = 0, scale = 1) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  };
  let poleIndex = 0, wheelIndex = 0, goodsIndex = 0;
  cartSlots.forEach((slot, index) => {
    const x = slot + (rng() - 0.5) * 0.9;
    const z = nearEdge + 0.72;
    const yaw = Math.PI + (rng() - 0.5) * 0.12;
    set(body, index, x, 0.72, z, yaw, 0.66);
    set(counter, index, x, 1.11, z, yaw, 0.66);
    set(canopy, index, x, 2.55, z, yaw, 0.66);
    set(menu, index, x, 2.05, z - 0.44, yaw, 0.66);
    body.setColorAt(index, new THREE.Color(colors[(index + 1) % colors.length]).multiplyScalar(0.64));
    canopy.setColorAt(index, new THREE.Color(colors[index % colors.length]));
    for (const px of [-0.72, 0.72]) for (const pz of [-0.38, 0.38]) {
      set(poles, poleIndex++, x + px, 1.77, z + pz, 0, 0.66);
    }
    for (const wx of [-0.72, 0.72]) {
      dummy.position.set(x + wx, 0.3, z + 0.42);
      dummy.rotation.set(0, yaw, Math.PI / 2);
      dummy.scale.setScalar(0.66);
      dummy.updateMatrix();
      wheels.setMatrixAt(wheelIndex++, dummy.matrix);
    }
    for (let item = 0; item < 8; item++) {
      set(goods, goodsIndex, x - 0.65 + (item % 4) * 0.43, 1.22 + (item % 2) * 0.08, z - 0.25 + Math.floor(item / 4) * 0.38, 0, 0.66);
      goods.setColorAt(goodsIndex++, new THREE.Color(goodsColors[(item + index * 2) % goodsColors.length]));
    }
  });
  tableSlots.forEach((x, index) => {
    const z = nearEdge + 2.45;
    set(tables, index, x, 0.75, z);
    set(masts, index, x, 1.43, z);
    dummy.position.set(x, 2.42, z);
    dummy.rotation.set(Math.PI, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    umbrellas.setMatrixAt(index, dummy.matrix);
    for (const side of [-1, 1]) set(chairs, index * 2 + (side > 0 ? 1 : 0), x + side * 0.72, 0.25, z);
  });
  for (const mesh of [body, counter, canopy, menu, poles, wheels, goods, tables, masts, umbrellas, chairs]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    g.add(mesh);
  }
  for (const mesh of [body, canopy, goods]) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  const patronSlots = lowPower ? [-5.1, 5.1] : [-14.1, -5.1, 5.1, 14.1];
  const patronCount = patronSlots.length;
  const patronBodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.18, 0.58, 4, 8), toonMat(0xffffff), patronCount);
  const patronHeads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 10, 7), toonMat(0xffffff), patronCount);
  const patronLegs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.065, 0.08, 1, 7), toonMat(0x27344c), patronCount * 2);
  const patronArms = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.06, 1, 7), toonMat(0xffffff), patronCount * 2);
  const patronHands = new THREE.InstancedMesh(new THREE.SphereGeometry(0.065, 8, 5), toonMat(0xffffff), patronCount * 2);
  const axis = new THREE.Vector3(0, 1, 0);
  const delta = new THREE.Vector3();
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  patronSlots.forEach((x, index) => {
    const z = nearEdge + 3.1 + (index % 2) * 0.55;
    const h = 0.92 + (index % 3) * 0.04;
    const cloth = new THREE.Color(CLOTH[(index + Math.floor(rng() * CLOTH.length)) % CLOTH.length]);
    const skin = new THREE.Color(SKIN[(index + 2) % SKIN.length]);
    dummy.position.set(x, 1.12 * h, z);
    dummy.rotation.set(0, index % 2 ? -0.5 : 0.5, 0);
    dummy.scale.set(h, h, h);
    dummy.updateMatrix();
    patronBodies.setMatrixAt(index, dummy.matrix);
    patronBodies.setColorAt(index, cloth);
    dummy.position.set(x, 1.67 * h, z);
    dummy.updateMatrix();
    patronHeads.setMatrixAt(index, dummy.matrix);
    patronHeads.setColorAt(index, skin);
    for (const side of [-1, 1]) {
      const limbIndex = index * 2 + (side > 0 ? 1 : 0);
      start.set(x + side * 0.1, 0.76 * h, z);
      end.set(x + side * 0.11, 0.08, z + side * 0.04);
      setSegment(patronLegs, limbIndex, start, end, dummy, axis, delta);
      start.set(x + side * 0.22, 1.38 * h, z);
      end.set(x + side * 0.24, 0.82 * h, z + 0.05);
      setSegment(patronArms, limbIndex, start, end, dummy, axis, delta);
      patronArms.setColorAt(limbIndex, cloth);
      dummy.position.copy(end);
      dummy.quaternion.identity();
      dummy.scale.setScalar(h);
      dummy.updateMatrix();
      patronHands.setMatrixAt(limbIndex, dummy.matrix);
      patronHands.setColorAt(limbIndex, skin);
    }
  });
  for (const mesh of [patronBodies, patronHeads, patronLegs, patronArms, patronHands]) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    g.add(mesh);
  }
  g.userData.venueCode = code;
  return g;
}
