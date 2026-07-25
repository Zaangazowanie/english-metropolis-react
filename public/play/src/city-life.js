import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, neonMat, toonMat, toonVertexMat, GeoBatch } from './materials.js';
import { BOULEVARD } from './transit-layout.js';
import { makeRoute } from './crowd.js';

const RADIALS = [
  { angle: Math.PI / 2, color: PALETTE.cyan },
  { angle: Math.PI / 2 + (2 * Math.PI) / 3, color: 0x8b7dff },
  { angle: Math.PI / 2 - (2 * Math.PI) / 3, color: PALETTE.coral },
];

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
  // One batched toon mesh for the whole venue plus its terrace; only the
  // glazing and the lit sign need materials of their own.
  const shell = new GeoBatch();
  const ink = 0x111a30;
  const stone = kind === 'market' ? 0x315a62 : 0xdce3e8;
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  shell.add(box(8.8, 0.5, 5.4, 0, 0.25, 0), stone);
  shell.add(box(8.2, 3.8, 4.7, 0, 2.15, 0.15), ink);
  for (const x of [-2.5, 0, 2.5]) shell.add(box(0.11, 2.35, 0.18, x, 1.85, -2.35), accent);
  shell.add(box(8.7, 0.18, 1.8, 0, 3.25, -2.78), accent);
  shell.add(box(8.7, 0.16, 5.25, 0, 4.15, 0.05), 0xc1cddd);
  for (const x of [-2.6, 0, 2.6]) {
    shell.add(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 12).translate(x, 0.82, -4.1), 0xd8e1e6);
    shell.add(new THREE.CylinderGeometry(0.05, 0.07, 0.76, 7).translate(x, 0.42, -4.1), 0x23324c);
    shell.add(new THREE.ConeGeometry(1.15, 0.48, 12).rotateX(Math.PI).translate(x, 2.72, -4.1), accent);
    shell.add(new THREE.CylinderGeometry(0.04, 0.04, 2.25, 6).translate(x, 1.65, -4.1), 0x23324c);
    for (const side of [-1, 1]) shell.add(box(0.55, 0.62, 0.55, x + side * 0.9, 0.32, -4.1), 0x23324c);
  }
  g.add(shell.build(toonVertexMat(), { name: `${kind}-venue-shell` }));

  const glazing = new THREE.Mesh(box(7.45, 2.25, 0.12, 0, 1.85, -2.25), new THREE.MeshStandardMaterial({
    color: 0x74d7dc, emissive: 0x14354b, emissiveIntensity: 0.88,
    metalness: 0.46, roughness: 0.19, transparent: true, opacity: 0.82,
  }));
  g.add(glazing);

  const sign = new THREE.Group();
  addSign(sign, title, subtitle, `#${new THREE.Color(accent).getHexString()}`, 5.4);
  sign.position.set(0, 4.75, -2.57);
  g.add(sign);
  return g;
}

function buildVendor(kind, accent) {
  const g = new THREE.Group();
  g.name = `${kind}-vendor`;
  const shell = new GeoBatch();
  const chromeParts = [];
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const bodyColor = kind === 'flowers' ? 0x18515b : 0x243653;
  shell.add(box(2.5, 1.25, 1.35, 0, 0.83, 0), bodyColor);
  for (const x of [-1.02, 1.02]) {
    shell.add(new THREE.CylinderGeometry(0.33, 0.33, 0.16, 12).rotateZ(Math.PI / 2)
      .translate(x, 0.38, 0.72), 0x101522);
  }
  shell.add(box(2.75, 0.17, 1.75, 0, 3.7, 0), accent);
  chromeParts.push(box(2.75, 0.14, 1.55, 0, 1.52, 0));
  for (const x of [-1.08, 1.08]) chromeParts.push(box(0.08, 2.3, 0.08, x, 2.55, 0));

  if (kind === 'flowers') {
    const bloomColors = [0xff6f91, 0xffb84d, 0xe961c2, 0xf4e5a3, 0x67e8d3];
    for (let i = 0; i < 18; i++) {
      const x = -0.92 + (i % 6) * 0.37;
      const z = -0.38 + Math.floor(i / 6) * 0.38;
      const h = 0.58 + (i % 3) * 0.08;
      shell.add(new THREE.CylinderGeometry(0.018, 0.025, 0.72, 5)
        .scale(1, h / 0.72, 1).translate(x, 1.57 + h / 2, z), 0x2a8d69);
      const s = 0.82 + (i % 4) * 0.08;
      shell.add(new THREE.IcosahedronGeometry(0.16, 0).scale(s, s, s)
        .translate(x, 1.55 + h, z), bloomColors[i % bloomColors.length]);
    }
  } else {
    for (const x of [-0.72, 0, 0.72]) {
      chromeParts.push(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 10).translate(x, 1.66, 0));
    }
    const menu = new THREE.Group();
    addSign(menu, kind === 'coffee' ? 'ESPRESSO' : 'NIGHT BITES',
      kind === 'coffee' ? 'ROASTED HERE' : 'HOT + FRESH',
      `#${new THREE.Color(accent).getHexString()}`, 2.15);
    menu.scale.setScalar(0.62);
    menu.position.set(0, 2.76, 0.9);
    g.add(menu);
  }
  g.add(shell.build(toonVertexMat(), { name: `${kind}-vendor-shell` }));
  const chromeMesh = new THREE.Mesh(mergeGeometries(chromeParts, false),
    new THREE.MeshStandardMaterial({ color: 0xaabbd2, metalness: 0.86, roughness: 0.22 }));
  chromeParts.forEach((c) => c.dispose());
  chromeMesh.castShadow = true;
  g.add(chromeMesh);
  return g;
}

function buildHubActivity(group, lowPower, animated) {
  group.userData.colliderObjects = [];
  group.userData.colliderBoxes = [];
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
    group.userData.colliderObjects.push(bench);
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
    group.userData.colliderObjects.push(vendor);
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
    group.userData.colliderBoxes.push({
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      hw: 0.17,
      hd: 0.17,
      source: 'plaza-bollard',
    });
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

// Hub routes: a ring around the plaza plus a loop out and back along each
// boulevard. Agents follow these instead of solving avoidance every frame.
export function hubRoutes() {
  const routes = [];
  for (const radius of [12.6, 15.4, 18.2]) {
    const points = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      points.push({ x: Math.cos(a) * radius, z: Math.sin(a) * radius });
    }
    routes.push(makeRoute(points));
  }
  for (const line of RADIALS) {
    const dirX = Math.cos(line.angle), dirZ = -Math.sin(line.angle);
    for (const side of [-1, 1]) {
      const lat = side * 5.6;
      const near = 30, far = Math.min(BOULEVARD.carEndD - 8, 210);
      routes.push(makeRoute([
        { x: dirX * near - dirZ * lat, z: dirZ * near + dirX * lat },
        { x: dirX * far - dirZ * lat, z: dirZ * far + dirX * lat },
        { x: dirX * far - dirZ * (lat + side * 1.4), z: dirZ * far + dirX * (lat + side * 1.4) },
        { x: dirX * near - dirZ * (lat + side * 1.4), z: dirZ * near + dirX * (lat + side * 1.4) },
      ]));
    }
  }
  return routes;
}

export class CityLife {
  // crowd is the shared GPU crowd owned by main.js; CityLife just populates the
  // hub share of it. people stays empty by design — ambient walkers step around
  // the player themselves rather than joining an O(n) collision list.
  constructor(scene, { lowPower = false, crowd = null } = {}) {
    this.scene = scene;
    this.lowPower = lowPower;
    this.group = new THREE.Group();
    this.group.name = 'cbd-street-life';
    this.animated = [];
    buildHubActivity(this.group, lowPower, this.animated);
    this.scene.add(this.group);
    this.colliderObjects = this.group.userData.colliderObjects || [];
    this.colliderBoxes = this.group.userData.colliderBoxes || [];
    this.people = [];
    this.crowd = crowd;
    this.routes = hubRoutes();
    this.agents = [];
    this.setDensity(lowPower ? 26 : 60);
  }

  setDensity(value) {
    if (!this.crowd) return;
    const want = Math.max(0, value | 0);
    while (this.agents.length > want) this.crowd.despawn(this.agents.pop());
    while (this.agents.length < want) {
      const route = this.routes[this.agents.length % this.routes.length];
      const agent = this.crowd.spawn({
        route,
        speed: 0.95 + Math.random() * 0.6,
        height: 0.93 + Math.random() * 0.16,
        dialect: 'hub',
      });
      if (!agent) break;
      this.agents.push(agent);
    }
  }

  setColliders() { /* routes are authored clear of the hub furniture */ }

  update(t, dt) {
    for (const item of this.animated) item.userData.update?.(t, dt);
  }
}

function addParkedFleet(group, rng, { accent, secondary, code, lowPower, roadLayout }) {
  const count = lowPower ? 1 : 2;
  const bodyParts = [], glassParts = [], wheelParts = [], headParts = [], tailParts = [];
  const axis = new THREE.Vector3(0, 1, 0);
  const transform = (geometry, x, z, yaw, localX = 0, localY = 0, localZ = 0) => {
    geometry.translate(localX, localY, localZ);
    geometry.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromAxisAngle(axis, yaw),
      new THREE.Vector3(1, 1, 1),
    ));
    return geometry;
  };
  const tint = (geometry, color) => {
    const values = new Float32Array(geometry.attributes.position.count * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < values.length; i += 3) {
      values[i] = c.r; values[i + 1] = c.g; values[i + 2] = c.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
    return geometry;
  };
  const addBox = (bucket, size, vehicle, local, color = null) => {
    let geometry = transform(new THREE.BoxGeometry(...size), vehicle.x, vehicle.z, vehicle.yaw, ...local);
    if (color !== null) geometry = tint(geometry, color);
    bucket.push(geometry);
  };

  for (let index = 0; index < count; index++) {
    const outerX = roadLayout?.outerXs?.[index] ?? (index ? 10 : -10);
    const laneOffset = (roadLayout?.laneWidth || 3.2) * 0.52 * (index ? 1 : -1);
    const vehicle = {
      x: outerX + laneOffset,
      z: index ? -7.2 : 6.4,
      yaw: index ? Math.PI : 0,
    };
    const width = 1.56 + rng() * 0.24;
    const length = 3.25 + rng() * 0.85;
    const style = (rng() * 4) | 0;
    const baseColor = new THREE.Color(index ? secondary : accent)
      .offsetHSL((rng() - 0.5) * 0.18, 0.06, (rng() - 0.5) * 0.12);
    addBox(bodyParts, [width, 0.42, length], vehicle, [0, 0.54, 0], baseColor);
    addBox(bodyParts, [width - 0.08, 0.18, 0.86], vehicle, [0, 0.78, -length * 0.36], baseColor);
    const cabinLength = style === 2 ? 1.78 : style === 3 ? 2.08 : 1.48;
    const cabinHeight = style === 3 ? 0.68 : 0.5;
    addBox(glassParts, [width - 0.28, cabinHeight, cabinLength], vehicle,
      [0, 1.02 + cabinHeight * 0.12, style === 2 ? 0.22 : 0.04]);
    addBox(bodyParts, [width - 0.16, 0.09, cabinLength + 0.04], vehicle,
      [0, 1.3 + cabinHeight * 0.28, style === 2 ? 0.22 : 0.04], baseColor);
    if (style === 1) addBox(bodyParts, [0.62, 0.2, 0.3], vehicle, [0, 1.58, 0.02], 0xffd45a);
    if (style === 0) addBox(bodyParts, [width * 0.7, 0.08, 0.2], vehicle, [0, 0.89, length * 0.5], baseColor);

    for (const side of [-1, 1]) for (const axle of [-1, 1]) {
      const wheel = new THREE.CylinderGeometry(0.25, 0.25, 0.16, 10);
      wheel.rotateZ(Math.PI / 2);
      wheelParts.push(transform(wheel, vehicle.x, vehicle.z, vehicle.yaw,
        side * width * 0.5, 0.3, axle * length * 0.3));
    }
    for (const side of [-1, 1]) {
      addBox(headParts, [0.28, 0.14, 0.06], vehicle, [side * width * 0.3, 0.66, -length * 0.51]);
      addBox(tailParts, [0.27, 0.14, 0.06], vehicle, [side * width * 0.3, 0.66, length * 0.51]);
    }
    group.userData.colliderBoxes.push({
      localX: vehicle.x, localZ: vehicle.z, hw: width * 0.58, hd: length * 0.55,
      source: `${code}-parked-car-${index}`,
    });
  }

  const addMerged = (parts, material, name, castShadow = false) => {
    if (!parts.length) return;
    const geometry = mergeGeometries(parts, false);
    parts.forEach((part) => part.dispose());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = castShadow;
    group.add(mesh);
  };
  addMerged(bodyParts, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.32 }), 'parked-car-bodies', true);
  addMerged(glassParts, new THREE.MeshStandardMaterial({ color: 0x16344d, metalness: 0.58, roughness: 0.16 }), 'parked-car-glass');
  addMerged(wheelParts, toonMat(0x0a101d), 'parked-car-wheels', true);
  addMerged(headParts, new THREE.MeshBasicMaterial({ color: 0xcafff7, toneMapped: false }), 'parked-car-headlights');
  addMerged(tailParts, new THREE.MeshBasicMaterial({ color: 0xff4f74, toneMapped: false }), 'parked-car-taillights');
}

export function buildDistrictLife(rng, {
  accent, secondary, nearEdge, code = 'metro', lowPower = false, roadLayout = null,
}) {
  const g = new THREE.Group();
  g.name = 'district-street-life';
  g.userData.colliderBoxes = [];
  const accentHex = accent instanceof THREE.Color ? accent.getHex() : accent;
  const secondaryHex = secondary instanceof THREE.Color ? secondary.getHex() : secondary;
  // Every cart, table, chair and parasol on this block merges into two meshes.
  // These were eleven InstancedMesh objects holding two to twelve instances
  // each, which is the worst of both worlds: instancing overhead with none of
  // the amortisation.
  const props = new GeoBatch();
  const chrome = [];
  const neonBits = new GeoBatch();
  const box = (w, h, d, x, y, z, yaw = 0, s = 1) => {
    const geo = new THREE.BoxGeometry(w * s, h * s, d * s);
    if (yaw) geo.rotateY(yaw);
    return geo.translate(x, y, z);
  };
  const cartSlots = lowPower ? [-10.5] : [-12.2, 12.2];
  const colors = [accentHex, secondaryHex, 0xffb84d];
  const goodsColors = [0xff6f91, 0x4deeea, 0xffb84d, 0xe6e0d6, 0x43c59e];
  cartSlots.forEach((slot, index) => {
    const x = slot + (rng() - 0.5) * 0.9;
    const z = nearEdge + 0.72;
    const yaw = Math.PI + (rng() - 0.5) * 0.12;
    g.userData.colliderBoxes.push({
      localX: x, localZ: z, hw: 0.92, hd: 0.62, source: `${code}-vendor-cart`,
    });
    props.add(box(2.25, 1.08, 1.2, x, 0.72, z, yaw, 0.66),
      new THREE.Color(colors[(index + 1) % colors.length]).multiplyScalar(0.64));
    chrome.push(box(2.5, 0.12, 1.42, x, 1.11, z, yaw, 0.66));
    props.add(box(2.55, 0.15, 1.55, x, 2.55, z, yaw, 0.66),
      new THREE.Color(colors[index % colors.length]));
    neonBits.add(box(1.5, 0.48, 0.08, x, 2.05, z - 0.44, yaw, 0.66), accentHex);
    for (const px of [-0.72, 0.72]) for (const pz of [-0.38, 0.38]) {
      props.add(new THREE.CylinderGeometry(0.045, 0.055, 2.15, 6)
        .scale(0.66, 0.66, 0.66).translate(x + px, 1.77, z + pz), 0x32425a);
    }
    for (const wx of [-0.72, 0.72]) {
      props.add(new THREE.CylinderGeometry(0.28, 0.28, 0.14, 10)
        .rotateZ(Math.PI / 2).scale(0.66, 0.66, 0.66)
        .translate(x + wx, 0.3, z + 0.42), 0x101522);
    }
    for (let item = 0; item < 8; item++) {
      props.add(new THREE.IcosahedronGeometry(0.13, 0).scale(0.66, 0.66, 0.66)
        .translate(x - 0.65 + (item % 4) * 0.43, 1.22 + (item % 2) * 0.08,
          z - 0.25 + Math.floor(item / 4) * 0.38),
        goodsColors[(item + index * 2) % goodsColors.length]);
    }
  });
  const tableSlots = lowPower ? [7.2] : [-7.5, 7.5];
  tableSlots.forEach((x, index) => {
    const z = nearEdge + 2.45;
    g.userData.colliderBoxes.push({
      localX: x, localZ: z, hw: 1.12, hd: 0.68, source: `${code}-cafe-table`,
    });
    props.add(new THREE.CylinderGeometry(0.48, 0.48, 0.1, 10).translate(x, 0.75, z), 0xbecbd6);
    props.add(new THREE.CylinderGeometry(0.035, 0.045, 2.1, 6).translate(x, 1.43, z), 0x1b2941);
    props.add(new THREE.ConeGeometry(0.92, 0.38, 10).rotateX(Math.PI).translate(x, 2.42, z), accentHex);
    for (const side of [-1, 1]) props.add(box(0.46, 0.5, 0.45, x + side * 0.72, 0.25, z), 0x1b2941);
  });
  const propMesh = props.build(toonVertexMat(), { name: `${code}-street-props` });
  if (propMesh) g.add(propMesh);
  const neonMesh = neonBits.build(new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.88, toneMapped: false,
  }), { castShadow: false, receiveShadow: false, name: `${code}-street-neon` });
  if (neonMesh) g.add(neonMesh);
  if (chrome.length) {
    const chromeMesh = new THREE.Mesh(
      mergeGeometries(chrome, false),
      new THREE.MeshStandardMaterial({ color: 0xaabbd2, metalness: 0.84, roughness: 0.24 }),
    );
    chrome.forEach((c) => c.dispose());
    chromeMesh.castShadow = true;
    g.add(chromeMesh);
  }

  // Patrons used to be 27 InstancedMesh objects PER DISTRICT posed on the CPU.
  // The district now just publishes where people should stand; the shared GPU
  // crowd fills those spots, so a busy cafe terrace costs no extra draw calls.
  g.userData.patronSlots = (lowPower ? [-7.5, 7.5] : [-17, -9, -4, 4, 9, 17])
    .map((x, index) => ({
      x, z: nearEdge + 3.1 + (index % 2) * 0.55,
      heading: index % 2 ? -0.5 : 0.5,
      height: 0.92 + (index % 3) * 0.04,
    }));
  addParkedFleet(g, rng, {
    accent: accentHex, secondary: secondaryHex, code, lowPower, roadLayout,
  });
  g.userData.venueCode = code;
  return g;
}
