// Detailed three-car Metro trams, batched by material so the richer geometry
// stays inexpensive. One train runs each line.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { neonMat, toonMat } from './materials.js';
import { LINES } from './zones.js';
import { BOULEVARD } from './transit-layout.js';

const SPEED = 11;
const CAR_LEN = 7.4;
const GAP = 0.78;
const DWELL = 2.4;
const CAR_STEP = CAR_LEN + GAP;
const TRAIN_CENTER_OFFSET = 7.9;
const TRAIN_HALF_LENGTH = 12.2;

const glassMat = new THREE.MeshStandardMaterial({
  color: 0x16345c,
  emissive: 0x3acbd0,
  emissiveIntensity: 0.38,
  metalness: 0.52,
  roughness: 0.2,
});
const darkMat = toonMat(0x10172b);
const trimMat = new THREE.MeshStandardMaterial({ color: 0xb8c7df, metalness: 0.82, roughness: 0.24 });
const interiorMat = neonMat(0xa9fff4, 0.86);

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCylinder6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const unitCylinder12 = new THREE.CylinderGeometry(1, 1, 1, 12);
const unitSphere = new THREE.SphereGeometry(1, 18, 12);

function geometryAt(geometry, position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );
  return geometry.clone().applyMatrix4(matrix);
}

function boxAt(size, position, rotation) {
  return geometryAt(unitBox, position, rotation, size);
}

function sphereAt(scale, position) {
  return geometryAt(unitSphere, position, [0, 0, 0], scale);
}

function barBetween(start, end, radius) {
  const delta = new THREE.Vector3().subVectors(end, start);
  const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const rotation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.clone().normalize(),
  );
  const matrix = new THREE.Matrix4().compose(
    midpoint,
    rotation,
    new THREE.Vector3(radius, delta.length(), radius),
  );
  return unitCylinder6.clone().applyMatrix4(matrix);
}

function makeBatch(geometries, material, { castShadow = false, receiveShadow = false } = {}) {
  const geometry = mergeGeometries(geometries, false);
  geometries.forEach((item) => item.dispose());
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

function buildTrain(colorHex) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    metalness: 0.38,
    roughness: 0.42,
  });
  const lineMat = neonMat(colorHex);
  const body = [];
  const trim = [];
  const dark = [];
  const line = [];
  const glass = [];
  const lights = [];
  const doorData = [];

  for (let carIndex = 0; carIndex < 3; carIndex += 1) {
    const carZ = -carIndex * CAR_STEP;
    const isEngine = carIndex === 0;

    dark.push(boxAt([2.28, 0.52, 6.72], [0, 0.62, carZ]));
    body.push(boxAt([2.46, 1.18, 6.86], [0, 1.22, carZ]));
    trim.push(boxAt([2.34, 0.92, 6.62], [0, 2.18, carZ]));

    // The cylinder axis is rotated onto local Z; local Z is compressed to form
    // a shallow aerodynamic roof instead of a sideways barrel.
    trim.push(geometryAt(
      unitCylinder12,
      [0, 2.66, carZ],
      [Math.PI / 2, 0, 0],
      [1.17, 6.68, 0.32],
    ));

    for (const side of [-1, 1]) {
      line.push(boxAt([0.035, 0.12, 6.72], [side * 1.245, 1.56, carZ]));

      for (const paneZ of [-2.55, 0, 2.55]) {
        glass.push(boxAt([0.04, 0.62, 0.94], [side * 1.19, 2.14, carZ + paneZ]));
        for (const edge of [-0.51, 0.51]) {
          dark.push(boxAt([0.06, 0.72, 0.08], [side * 1.215, 2.14, carZ + paneZ + edge]));
        }
      }

      for (const doorZ of [-1.25, 1.25]) {
        for (const slide of [-1, 1]) {
          doorData.push({
            x: side * 1.205,
            y: 1.72,
            z: carZ + doorZ + slide * 0.4,
            slide,
          });
        }
        line.push(boxAt([0.16, 0.08, 1.72], [side * 1.22, 0.92, carZ + doorZ]));
      }
    }

    for (const bogieZ of [-2.15, 2.15]) {
      dark.push(boxAt([1.56, 0.22, 1.14], [0, 0.34, carZ + bogieZ]));
      for (const x of [-1.06, 1.06]) {
        dark.push(geometryAt(
          unitCylinder12,
          [x, 0.34, carZ + bogieZ],
          [0, 0, Math.PI / 2],
          [0.31, 0.18, 0.31],
        ));
      }
    }

    for (const acZ of [-1.65, 0.25]) {
      dark.push(boxAt([1.2, 0.22, 1.15], [0, 3.0, carZ + acZ]));
    }

    if (isEngine) {
      dark.push(
        barBetween(new THREE.Vector3(-0.52, 3.08, carZ + 1.35), new THREE.Vector3(0, 3.82, carZ + 1.35), 0.035),
        barBetween(new THREE.Vector3(0.52, 3.08, carZ + 1.35), new THREE.Vector3(0, 3.82, carZ + 1.35), 0.035),
        barBetween(new THREE.Vector3(0, 3.82, carZ + 1.35), new THREE.Vector3(0, 4.08, carZ + 0.8), 0.035),
      );
      body.push(sphereAt([1.18, 1.02, 0.62], [0, 1.7, carZ + 3.3]));
      glass.push(sphereAt([0.9, 0.52, 0.25], [0, 2.16, carZ + 3.82]));
      line.push(boxAt([1.48, 0.2, 0.04], [0, 2.72, carZ + 3.84]));
      for (const x of [-0.63, 0.63]) {
        lights.push(sphereAt([0.13, 0.13, 0.13], [x, 1.15, carZ + 3.9]));
      }
    }
  }

  // Bellows visually join the cars while keeping the articulation readable.
  for (let gapIndex = 0; gapIndex < 2; gapIndex += 1) {
    const z = -(gapIndex + 0.5) * CAR_STEP;
    dark.push(geometryAt(unitCylinder12, [0, 1.55, z], [Math.PI / 2, 0, 0], [0.94, 0.82, 0.94]));
  }

  // Finish the rear of the last carriage instead of leaving a flat box end.
  const rearZ = -2 * CAR_STEP;
  body.push(sphereAt([1.18, 1.02, 0.62], [0, 1.7, rearZ - 3.3]));
  glass.push(sphereAt([0.9, 0.52, 0.25], [0, 2.16, rearZ - 3.82]));
  for (const x of [-0.63, 0.63]) {
    line.push(sphereAt([0.1, 0.1, 0.1], [x, 1.12, rearZ - 3.9]));
  }

  group.add(
    makeBatch(body, bodyMat, { castShadow: true, receiveShadow: true }),
    makeBatch(trim, trimMat, { castShadow: true }),
    makeBatch(dark, darkMat, { castShadow: true }),
    makeBatch(line, lineMat),
    makeBatch(glass, glassMat),
    makeBatch(lights, interiorMat),
  );

  const doors = new THREE.InstancedMesh(unitBox, glassMat, doorData.length);
  doors.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const doorMatrix = new THREE.Matrix4();
  const doorPosition = new THREE.Vector3();
  const doorScale = new THREE.Vector3(0.045, 1.36, 0.78);
  const doorRotation = new THREE.Quaternion();
  let previousDoorAmount = -1;
  group.userData.setDoors = (amount) => {
    if (Math.abs(amount - previousDoorAmount) < 0.0001) return;
    previousDoorAmount = amount;
    doorData.forEach((door, index) => {
      doorPosition.set(door.x, door.y, door.z + door.slide * amount * 0.34);
      doorMatrix.compose(doorPosition, doorRotation, doorScale);
      doors.setMatrixAt(index, doorMatrix);
    });
    doors.instanceMatrix.needsUpdate = true;
  };
  group.userData.setDoors(0);
  group.add(doors);
  return group;
}

export class Trains {
  constructor(scene, zoneMgr, audio) {
    this.scene = scene;
    this.audio = audio;
    this.trains = [];
    let lineIndex = 0;
    for (const [key, line] of Object.entries(LINES)) {
      const dir = new THREE.Vector2(Math.cos(line.angle), -Math.sin(line.angle));
      const perp = new THREE.Vector2(-dir.y, dir.x);
      const stops = [...new Set(zoneMgr.zones
        .filter((zone) => zone.lineKey === key)
        .map((zone) => Math.round(zone.stopPos.x * dir.x + zone.stopPos.y * dir.y)))].sort((a, b) => a - b);
      const minD = 28;
      const lastStop = stops[stops.length - 1] || 380;
      const maxD = Math.min(lastStop + 26, BOULEVARD.endD - TRAIN_HALF_LENGTH);
      const visual = buildTrain(line.color);
      visual.position.z = TRAIN_CENTER_OFFSET;
      const group = new THREE.Group();
      group.name = `tram-${key}`;
      group.add(visual);
      group.userData.setDoors = (amount) => visual.userData.setDoors?.(amount);
      this.scene.add(group);
      const firstStop = stops[0] || minD;

      this.trains.push({
        key,
        color: line.color,
        dir,
        perp,
        stops,
        minD,
        maxD,
        group,
        // Minimap compatibility: it only needs the lead object's world position
        // and line-colored first material, both exposed by the batched group.
        cars: [group],
        d: firstStop,
        fwd: 1,
        wait: DWELL + lineIndex * 0.55,
        doorOpen: 1,
        lastStop: firstStop,
        currentSpeed: 0,
        whooshCd: 0,
      });
      lineIndex++;
    }
  }

  update(dt, playerPos, pedestrians = [], teachers = []) {
    const people = [playerPos];
    for (const person of pedestrians) people.push(person.wrap?.position || person);
    for (const person of teachers) people.push(person.obj?.position || person);
    for (const train of this.trains) {
      if (train.wait > 0) {
        train.wait -= dt;
      } else {
        let nearDist = Infinity;
        let nearStop = null;
        for (const stop of train.stops) {
          const distance = Math.abs(stop - train.d);
          if (distance < nearDist) {
            nearDist = distance;
            nearStop = stop;
          }
        }
        const cruiseSpeed = SPEED * THREE.MathUtils.clamp(nearDist / 22, 0.14, 1);
        const frontD = train.d + train.fwd * TRAIN_HALF_LENGTH;
        let safety = 1;
        for (const person of people) {
          if (!person) continue;
          const lateral = person.x * train.perp.x + person.z * train.perp.y;
          if (Math.abs(lateral - BOULEVARD.tramLaneX) > 1.75) continue;
          const personD = person.x * train.dir.x + person.z * train.dir.y;
          const gap = (personD - frontD) * train.fwd;
          if (gap > -(TRAIN_HALF_LENGTH * 2 + 1.2) && gap < 16) {
            safety = Math.min(safety, THREE.MathUtils.clamp((gap - 3.2) / 9, 0, 1));
          }
        }
        const targetSpeed = cruiseSpeed * safety;
        train.currentSpeed = safety < 0.04
          ? 0
          : THREE.MathUtils.damp(train.currentSpeed, targetSpeed, 5.5, dt);
        train.d += train.fwd * train.currentSpeed * dt;
        if (nearDist < 0.5 && train.lastStop !== nearStop) {
          train.wait = DWELL;
          train.lastStop = nearStop;
        }
        if (train.d > train.maxD) {
          train.d = train.maxD;
          train.fwd = -1;
          train.lastStop = null;
          train.wait = DWELL;
          train.currentSpeed = 0;
        }
        if (train.d < train.minD) {
          train.d = train.minD;
          train.fwd = 1;
          train.lastStop = null;
          train.wait = DWELL;
          train.currentSpeed = 0;
        }
      }

      const targetDoors = train.wait > 0.35 ? 1 : 0;
      train.doorOpen = THREE.MathUtils.damp(train.doorOpen, targetDoors, 7, dt);
      train.group.userData.setDoors?.(train.doorOpen);

      train.group.position.set(
        train.dir.x * train.d + train.perp.x * BOULEVARD.tramLaneX,
        0,
        train.dir.y * train.d + train.perp.y * BOULEVARD.tramLaneX,
      );
      train.group.rotation.y = Math.atan2(train.dir.x, train.dir.y) + (train.fwd > 0 ? 0 : Math.PI);

      train.whooshCd -= dt;
      if (train.whooshCd <= 0 && train.wait <= 0) {
        const dx = train.group.position.x - playerPos.x;
        const dz = train.group.position.z - playerPos.z;
        if (dx * dx + dz * dz < 260) {
          this.audio?.play('ping', { rate: 0.42, volume: 0.4 });
          train.whooshCd = 4;
        }
      }
    }
  }
}
