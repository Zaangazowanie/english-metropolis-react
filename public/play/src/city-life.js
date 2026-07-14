import * as THREE from 'three';
import { PALETTE, neonMat, toonMat } from './materials.js';
import { BOULEVARD } from './transit-layout.js';
import { heightAt } from './terrain.js';
import { circleHitsAABB } from './collision.js';

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

function setSegment(mesh, index, start, end, dummy, axis, delta, thickness = 1) {
  delta.subVectors(end, start);
  const length = Math.max(0.01, delta.length());
  dummy.position.copy(start).add(end).multiplyScalar(0.5);
  dummy.quaternion.setFromUnitVectors(axis, delta.multiplyScalar(1 / length));
  dummy.scale.set(thickness, length, thickness);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function createCharacterBatch(parent, count, name, moving = false) {
  const all = [];
  const add = (key, geometry, material, multiplier = 1, castShadow = true) => {
    const mesh = new THREE.InstancedMesh(geometry, material, count * multiplier);
    mesh.name = name;
    mesh.userData.characterPart = key;
    mesh.userData.instanceMultiplier = multiplier;
    mesh.castShadow = castShadow;
    mesh.frustumCulled = !moving;
    parent.add(mesh);
    all.push(mesh);
    return mesh;
  };
  const batch = {
    all,
    torso: add('torso', new THREE.CapsuleGeometry(0.2, 0.5, 4, 8), toonMat(0xffffff)),
    hips: add('hips', new THREE.BoxGeometry(0.36, 0.2, 0.24), toonMat(0xffffff)),
    collar: add('collar', new THREE.BoxGeometry(0.28, 0.08, 0.035), toonMat(0xffffff), 1, false),
    neck: add('neck', new THREE.CylinderGeometry(0.065, 0.075, 0.14, 7), toonMat(0xffffff)),
    head: add('head', new THREE.SphereGeometry(0.18, 12, 9), toonMat(0xffffff)),
    ears: add('ears', new THREE.SphereGeometry(0.039, 7, 5), toonMat(0xffffff), 2, false),
    hair: add('hair', new THREE.SphereGeometry(0.19, 11, 7, 0, Math.PI * 2, 0, Math.PI * 0.56), toonMat(0xffffff)),
    hairBack: add('hair-back', new THREE.SphereGeometry(0.155, 9, 7), toonMat(0xffffff)),
    bun: add('hair-bun', new THREE.SphereGeometry(0.09, 8, 6), toonMat(0xffffff)),
    hats: add('hat', new THREE.CylinderGeometry(0.19, 0.205, 0.1, 10), toonMat(0xffffff)),
    eyes: add('eyes', new THREE.SphereGeometry(0.027, 8, 6), toonMat(0xfaf7ef), 2, false),
    pupils: add('pupils', new THREE.SphereGeometry(0.0115, 7, 5), toonMat(0x172036), 2, false),
    brows: add('brows', new THREE.BoxGeometry(0.055, 0.012, 0.012), toonMat(0x251b25), 2, false),
    nose: add('nose', new THREE.IcosahedronGeometry(0.04, 1), toonMat(0xffffff), 1, false),
    mouth: add('mouth', new THREE.BoxGeometry(0.065, 0.014, 0.014), toonMat(0xb84c66), 1, false),
    glasses: add('glasses', new THREE.TorusGeometry(0.039, 0.0055, 5, 10), toonMat(0x172036), 2, false),
    upperLegs: add('upper-legs', new THREE.CylinderGeometry(0.075, 0.09, 1, 8), toonMat(0xffffff), 2),
    lowerLegs: add('lower-legs', new THREE.CylinderGeometry(0.065, 0.078, 1, 8), toonMat(0xffffff), 2),
    knees: add('knees', new THREE.SphereGeometry(0.078, 8, 6), toonMat(0xffffff), 2),
    shoes: add('shoes', new THREE.BoxGeometry(0.15, 0.1, 0.3), toonMat(0xffffff), 2),
    upperArms: add('upper-arms', new THREE.CylinderGeometry(0.055, 0.068, 1, 8), toonMat(0xffffff), 2),
    lowerArms: add('lower-arms', new THREE.CylinderGeometry(0.047, 0.057, 1, 8), toonMat(0xffffff), 2),
    elbows: add('elbows', new THREE.SphereGeometry(0.057, 8, 6), toonMat(0xffffff), 2),
    hands: add('hands', new THREE.CapsuleGeometry(0.05, 0.08, 3, 6), toonMat(0xffffff), 2),
    thumbs: add('thumbs', new THREE.SphereGeometry(0.026, 7, 5), toonMat(0xffffff), 2, false),
    bags: add('bags', new THREE.BoxGeometry(0.27, 0.38, 0.12), toonMat(0xffffff)),
  };
  batch.skinMeshes = [batch.neck, batch.head, batch.ears, batch.nose, batch.hands, batch.thumbs];
  batch.hairMeshes = [batch.hair, batch.hairBack, batch.bun];
  batch.topMeshes = [batch.torso, batch.collar, batch.upperArms, batch.lowerArms, batch.elbows];
  batch.lowerMeshes = [batch.hips, batch.upperLegs, batch.lowerLegs, batch.knees];
  return batch;
}

function colorCharacter(batch, index, { skin, hair, top, lower, accent, shoes }) {
  for (const mesh of batch.skinMeshes) {
    if (mesh.userData.instanceMultiplier === 2) {
      mesh.setColorAt(index * 2, skin);
      mesh.setColorAt(index * 2 + 1, skin);
    } else mesh.setColorAt(index, skin);
  }
  for (const mesh of batch.hairMeshes) mesh.setColorAt(index, hair);
  for (const mesh of batch.topMeshes) {
    if (mesh.userData.instanceMultiplier === 2) {
      mesh.setColorAt(index * 2, top);
      mesh.setColorAt(index * 2 + 1, top);
    } else mesh.setColorAt(index, top);
  }
  for (const mesh of batch.lowerMeshes) {
    if (mesh.userData.instanceMultiplier === 2) {
      mesh.setColorAt(index * 2, lower);
      mesh.setColorAt(index * 2 + 1, lower);
    } else mesh.setColorAt(index, lower);
  }
  batch.hats.setColorAt(index, accent);
  batch.bags.setColorAt(index, accent.clone().multiplyScalar(0.72));
  batch.shoes.setColorAt(index * 2, shoes);
  batch.shoes.setColorAt(index * 2 + 1, shoes);
}

function finishCharacterColors(batch) {
  for (const mesh of batch.all) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function setCharacterCount(batch, count) {
  for (const mesh of batch.all) mesh.count = count * mesh.userData.instanceMultiplier;
}

function placePart(mesh, index, position, quaternion, scale, dummy) {
  dummy.position.copy(position);
  dummy.quaternion.copy(quaternion);
  if (typeof scale === 'number') dummy.scale.setScalar(scale);
  else dummy.scale.copy(scale);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function poseCharacter(batch, index, pose, scratch) {
  const {
    dummy, axis, root, forward, right, start, middle, end, delta, temp, scale, yaw,
  } = scratch;
  const { x, y, z, heading, h, cycle, walking, style } = pose;
  root.set(x, y, z);
  forward.set(Math.sin(heading), 0, Math.cos(heading));
  right.set(forward.z, 0, -forward.x);
  yaw.setFromAxisAngle(axis, heading);
  const gait = walking ? Math.sin(cycle) : 0;
  const bob = walking ? Math.abs(gait) * 0.018 * h : Math.sin(cycle * 0.42) * 0.008 * h;
  const width = [0.9, 0.98, 1.07, 0.94][style % 4];

  start.set(x, y + 1.15 * h + bob, z);
  scale.set(h * width, h, h * (style % 3 === 0 ? 1.06 : 0.96));
  placePart(batch.torso, index, start, yaw, scale, dummy);
  start.set(x, y + 0.87 * h, z);
  scale.set(h * width, h, h);
  placePart(batch.hips, index, start, yaw, scale, dummy);
  start.copy(root).addScaledVector(forward, 0.205 * h);
  start.y = y + 1.43 * h;
  scale.set(h * width, h, h);
  placePart(batch.collar, index, start, yaw, scale, dummy);
  start.set(x, y + 1.51 * h, z);
  placePart(batch.neck, index, start, yaw, h, dummy);

  const headY = y + 1.72 * h + bob;
  start.set(x, headY, z);
  scale.set(h * (style % 3 === 1 ? 1.04 : 0.97), h, h);
  placePart(batch.head, index, start, yaw, scale, dummy);
  for (const side of [-1, 1]) {
    const pairIndex = index * 2 + (side > 0 ? 1 : 0);
    start.set(x, headY, z).addScaledVector(right, side * 0.178 * h);
    placePart(batch.ears, pairIndex, start, yaw, h, dummy);
  }
  start.set(x, headY + 0.105 * h, z).addScaledVector(forward, -0.018 * h);
  scale.set(h, h * 0.76, h);
  placePart(batch.hair, index, start, yaw, scale, dummy);
  start.set(x, headY + 0.01 * h, z).addScaledVector(forward, -0.105 * h);
  scale.set(style % 3 === 0 ? h : 0.001, style % 3 === 0 ? h * 1.3 : 0.001, style % 3 === 0 ? h * 0.72 : 0.001);
  placePart(batch.hairBack, index, start, yaw, scale, dummy);
  start.set(x, headY + 0.16 * h, z).addScaledVector(forward, -0.12 * h);
  placePart(batch.bun, index, start, yaw, style % 5 === 0 ? h : 0.001, dummy);
  start.set(x, headY + 0.205 * h, z);
  scale.set(style % 7 === 0 ? h : 0.001, style % 7 === 0 ? h : 0.001, style % 7 === 0 ? h : 0.001);
  placePart(batch.hats, index, start, yaw, scale, dummy);

  for (const side of [-1, 1]) {
    const pairIndex = index * 2 + (side > 0 ? 1 : 0);
    start.set(x, headY + 0.035 * h, z)
      .addScaledVector(right, side * 0.058 * h)
      .addScaledVector(forward, 0.166 * h);
    placePart(batch.eyes, pairIndex, start, yaw, h, dummy);
    start.addScaledVector(forward, 0.024 * h);
    placePart(batch.pupils, pairIndex, start, yaw, h, dummy);
    start.set(x, headY + 0.105 * h, z)
      .addScaledVector(right, side * 0.058 * h)
      .addScaledVector(forward, 0.174 * h);
    scale.set(h, h, h);
    placePart(batch.brows, pairIndex, start, yaw, scale, dummy);
    start.set(x, headY + 0.035 * h, z)
      .addScaledVector(right, side * 0.058 * h)
      .addScaledVector(forward, 0.198 * h);
    scale.set(style % 4 === 0 ? h : 0.001, style % 4 === 0 ? h : 0.001, style % 4 === 0 ? h : 0.001);
    placePart(batch.glasses, pairIndex, start, yaw, scale, dummy);
  }
  start.set(x, headY - 0.012 * h, z).addScaledVector(forward, 0.184 * h);
  scale.set(h * 0.7, h * 0.9, h * 1.15);
  placePart(batch.nose, index, start, yaw, scale, dummy);
  start.set(x, headY - 0.09 * h, z).addScaledVector(forward, 0.178 * h);
  placePart(batch.mouth, index, start, yaw, h, dummy);

  for (const side of [-1, 1]) {
    const pairIndex = index * 2 + (side > 0 ? 1 : 0);
    const legCycle = cycle + (side > 0 ? 0 : Math.PI);
    const stride = walking ? Math.sin(legCycle) * 0.27 * h : side * 0.018 * h;
    const lift = walking ? Math.max(0, Math.cos(legCycle)) * 0.085 * h : 0;
    start.set(x, y + 0.82 * h, z).addScaledVector(right, side * 0.105 * h);
    end.set(x, y + 0.105 * h + lift, z)
      .addScaledVector(right, side * 0.115 * h)
      .addScaledVector(forward, stride);
    middle.copy(start).lerp(end, 0.5).addScaledVector(forward, (0.105 + Math.max(0, -stride) * 0.18) * h);
    middle.y += 0.045 * h;
    setSegment(batch.upperLegs, pairIndex, start, middle, dummy, axis, delta, h);
    setSegment(batch.lowerLegs, pairIndex, middle, end, dummy, axis, delta, h);
    placePart(batch.knees, pairIndex, middle, yaw, h, dummy);
    start.copy(end).addScaledVector(forward, 0.085 * h);
    start.y = y + 0.06 * h + lift;
    scale.set(h, h, h);
    placePart(batch.shoes, pairIndex, start, yaw, scale, dummy);

    const armSwing = walking ? -Math.sin(legCycle) * 0.19 * h : (style % 2 ? 0.055 : -0.015) * h;
    start.set(x, y + 1.38 * h + bob, z).addScaledVector(right, side * 0.245 * h);
    end.set(x, y + (walking ? 0.9 : 0.96 + (style % 3) * 0.025) * h, z)
      .addScaledVector(right, side * 0.285 * h)
      .addScaledVector(forward, armSwing);
    middle.copy(start).lerp(end, 0.48)
      .addScaledVector(right, side * 0.035 * h)
      .addScaledVector(forward, 0.055 * h);
    setSegment(batch.upperArms, pairIndex, start, middle, dummy, axis, delta, h);
    setSegment(batch.lowerArms, pairIndex, middle, end, dummy, axis, delta, h);
    placePart(batch.elbows, pairIndex, middle, yaw, h, dummy);
    delta.subVectors(end, middle).normalize();
    temp.copy(end).addScaledVector(delta, 0.105 * h);
    setSegment(batch.hands, pairIndex, end, temp, dummy, axis, scratch.delta2, h);
    start.copy(end).lerp(temp, 0.62).addScaledVector(right, side * 0.045 * h).addScaledVector(forward, 0.012 * h);
    placePart(batch.thumbs, pairIndex, start, yaw, h, dummy);
  }

  const bagSide = style % 2 ? 1 : -1;
  start.copy(root).addScaledVector(right, bagSide * 0.275 * h).addScaledVector(forward, -0.025 * h);
  start.y = y + 1.03 * h;
  scale.set(style % 3 === 0 ? h : 0.001, style % 3 === 0 ? h : 0.001, style % 3 === 0 ? h : 0.001);
  placePart(batch.bags, index, start, yaw, scale, dummy);
}

function updateCharacterMatrices(batch) {
  for (const mesh of batch.all) mesh.instanceMatrix.needsUpdate = true;
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
    this.colliders = [];
    this.scratch = {
      dummy: this.dummy, axis: this.axis,
      forward: new THREE.Vector3(), right: new THREE.Vector3(),
      start: new THREE.Vector3(), middle: new THREE.Vector3(), end: new THREE.Vector3(),
      root: new THREE.Vector3(), temp: new THREE.Vector3(),
      delta: new THREE.Vector3(), delta2: new THREE.Vector3(),
      scale: new THREE.Vector3(), yaw: new THREE.Quaternion(), candidate: new THREE.Vector3(),
    };
    this.makeMeshes();
    this.makePeople();
    this.update(0, 0);
  }

  makeMeshes() {
    this.batch = createCharacterBatch(this.scene, this.capacity, 'ambient-cbd-crowd', true);
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
        collisionRadius: 0.31,
      };
      person.position.collisionRadius = person.collisionRadius;
      this.people.push(person);
      const cloth = new THREE.Color(CLOTH[i % CLOTH.length]);
      const lower = cloth.clone().lerp(new THREE.Color(0x14233b), 0.55);
      const skin = new THREE.Color(SKIN[i % SKIN.length]);
      colorCharacter(this.batch, i, {
        skin,
        hair: new THREE.Color([0x191725, 0x3b2722, 0x6b4431, 0xd7c0a5, 0x8d352a][i % 5]),
        top: cloth,
        lower,
        accent: new THREE.Color(CLOTH[(i + 3) % CLOTH.length]),
        shoes: new THREE.Color([0x101522, 0xeee8dc, 0x422d4c][i % 3]),
      });
    }
    finishCharacterColors(this.batch);
  }

  setDensity(value) {
    this.density = THREE.MathUtils.clamp(value | 0, 0, this.capacity);
    setCharacterCount(this.batch, this.density);
  }

  setColliders(colliders) { this.colliders = colliders || []; }

  routePosition(person, index, angle, distance, target) {
    if (person.hub) {
      target.set(Math.cos(angle) * person.radius, 0, Math.sin(angle) * person.radius);
    } else {
      const line = RADIALS[person.lineIndex];
      const dirX = Math.cos(line.angle), dirZ = -Math.sin(line.angle);
      const lat = person.side * (5.4 + (index % 4) * 0.2);
      target.set(dirX * distance - dirZ * lat, 0, dirZ * distance + dirX * lat);
    }
    return target;
  }

  personBlocksRoute(person, index, candidate, padding = 0.12) {
    for (let otherIndex = 0; otherIndex < this.density; otherIndex++) {
      if (otherIndex === index) continue;
      const other = this.people[otherIndex];
      const minDistance = person.collisionRadius + other.collisionRadius + padding;
      const dx = candidate.x - other.position.x;
      const dz = candidate.z - other.position.z;
      if (dx * dx + dz * dz < minDistance * minDistance) return true;
    }
    return false;
  }

  routeIsOpen(person, index, candidate) {
    return !circleHitsAABB(candidate.x, candidate.z, person.collisionRadius, this.colliders)
      && !this.personBlocksRoute(person, index, candidate);
  }

  findOpenRoute(person, index, candidate) {
    const baseAngle = person.angle;
    const baseDistance = person.d;
    for (let attempt = 0; attempt < 28; attempt++) {
      const ring = Math.floor(attempt / 2) + 1;
      const direction = attempt % 2 ? -1 : 1;
      const angle = baseAngle + direction * ring * 0.16;
      const distance = THREE.MathUtils.clamp(baseDistance + direction * ring * 2.8, 31, BOULEVARD.carEndD - 7);
      this.routePosition(person, index, angle, distance, candidate);
      if (this.routeIsOpen(person, index, candidate)) {
        if (person.hub) person.angle = angle;
        else person.d = distance;
        return true;
      }
    }
    return false;
  }

  update(t, dt) {
    this.time = t;
    const { candidate } = this.scratch;
    for (let i = 0; i < this.density; i++) {
      const p = this.people[i];
      let heading;
      if (p.hub) {
        let nextAngle = p.angle + dt * p.speed / p.radius * p.routeDir;
        this.routePosition(p, i, nextAngle, p.d, candidate);
        const staticBlocked = circleHitsAABB(candidate.x, candidate.z, p.collisionRadius, this.colliders);
        const personBlocked = this.personBlocksRoute(p, i, candidate);
        if (staticBlocked) {
          p.routeDir *= -1;
          if (!this.findOpenRoute(p, i, candidate)) candidate.copy(p.position);
        } else if (personBlocked) {
          p.routeDir *= -1;
          nextAngle = p.angle + dt * p.speed / p.radius * p.routeDir;
          this.routePosition(p, i, nextAngle, p.d, candidate);
          if (this.routeIsOpen(p, i, candidate)) p.angle = nextAngle;
          else candidate.copy(p.position);
        } else p.angle = nextAngle;
        p.position.copy(candidate);
        heading = p.angle + (p.routeDir > 0 ? -Math.PI / 2 : Math.PI / 2);
      } else {
        let nextD = p.d + dt * p.speed * p.routeDir;
        if (nextD > BOULEVARD.carEndD - 7) { nextD = BOULEVARD.carEndD - 7; p.routeDir = -1; }
        if (nextD < 31) { nextD = 31; p.routeDir = 1; }
        this.routePosition(p, i, p.angle, nextD, candidate);
        const staticBlocked = circleHitsAABB(candidate.x, candidate.z, p.collisionRadius, this.colliders);
        const personBlocked = this.personBlocksRoute(p, i, candidate);
        if (staticBlocked) {
          p.routeDir *= -1;
          if (!this.findOpenRoute(p, i, candidate)) candidate.copy(p.position);
        } else if (personBlocked) {
          p.routeDir *= -1;
          nextD = p.d + dt * p.speed * p.routeDir;
          this.routePosition(p, i, p.angle, nextD, candidate);
          if (this.routeIsOpen(p, i, candidate)) p.d = nextD;
          else candidate.copy(p.position);
        } else p.d = nextD;
        p.position.copy(candidate);
        const line = RADIALS[p.lineIndex];
        const dirX = Math.cos(line.angle), dirZ = -Math.sin(line.angle);
        heading = Math.atan2(dirX * p.routeDir, dirZ * p.routeDir);
      }
      const ground = heightAt(p.position.x, p.position.z);
      p.position.y = ground;
      poseCharacter(this.batch, i, {
        x: p.position.x, y: ground, z: p.position.z, heading, h: p.height,
        cycle: t * (5.2 + p.speed) + p.phase, walking: true, style: i,
      }, this.scratch);
    }
    updateCharacterMatrices(this.batch);
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
    this.colliderBoxes = this.group.userData.colliderBoxes || [];
    this.crowd = new AmbientCrowd(scene, { lowPower });
    this.people = [];
    this.syncPeople();
  }

  syncPeople() {
    this.people.length = 0;
    for (let i = 0; i < this.crowd.density; i++) this.people.push(this.crowd.people[i].position);
  }

  setDensity(value) {
    this.crowd.setDensity(value);
    this.syncPeople();
  }

  setColliders(colliders) { this.crowd.setColliders(colliders); }

  update(t, dt) {
    this.crowd.update(t, dt);
    for (const item of this.animated) item.userData.update?.(t, dt);
  }
}

export function buildDistrictLife(rng, { accent, secondary, nearEdge, code = 'metro', lowPower = false }) {
  const g = new THREE.Group();
  g.name = 'district-street-life';
  g.userData.colliderBoxes = [];
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
    g.userData.colliderBoxes.push({
      localX: x, localZ: z, hw: 0.92, hd: 0.62, source: `${code}-vendor-cart`,
    });
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
    g.userData.colliderBoxes.push({
      localX: x, localZ: z, hw: 1.12, hd: 0.68, source: `${code}-cafe-table`,
    });
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
  const patrons = createCharacterBatch(g, patronCount, 'district-patron', false);
  const patronScratch = {
    dummy: new THREE.Object3D(), axis: new THREE.Vector3(0, 1, 0), root: new THREE.Vector3(),
    forward: new THREE.Vector3(), right: new THREE.Vector3(), start: new THREE.Vector3(),
    middle: new THREE.Vector3(), end: new THREE.Vector3(), temp: new THREE.Vector3(),
    delta: new THREE.Vector3(), delta2: new THREE.Vector3(), scale: new THREE.Vector3(),
    yaw: new THREE.Quaternion(),
  };
  patronSlots.forEach((x, index) => {
    const z = nearEdge + 3.1 + (index % 2) * 0.55;
    const h = 0.92 + (index % 3) * 0.04;
    g.userData.colliderBoxes.push({
      localX: x, localZ: z, hw: 0.34, hd: 0.34, source: `${code}-patron`,
    });
    const cloth = new THREE.Color(CLOTH[(index + Math.floor(rng() * CLOTH.length)) % CLOTH.length]);
    const skin = new THREE.Color(SKIN[(index + 2) % SKIN.length]);
    colorCharacter(patrons, index, {
      skin,
      hair: new THREE.Color([0x191725, 0x3b2722, 0x6b4431, 0xd7c0a5][(index + 1) % 4]),
      top: cloth,
      lower: cloth.clone().lerp(new THREE.Color(0x1a2940), 0.58),
      accent: new THREE.Color(index % 2 ? accentHex : secondaryHex),
      shoes: new THREE.Color(index % 3 === 0 ? 0xe7e1d5 : 0x111828),
    });
    poseCharacter(patrons, index, {
      x, y: 0, z, heading: index % 2 ? -0.5 : 0.5, h,
      cycle: index * 1.7, walking: false, style: index + 2,
    }, patronScratch);
  });
  finishCharacterColors(patrons);
  updateCharacterMatrices(patrons);
  g.userData.venueCode = code;
  return g;
}
