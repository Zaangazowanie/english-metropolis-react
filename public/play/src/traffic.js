// Batched boulevard traffic. Six meshes render every car, regardless of count.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LINES } from './zones.js';
import { BOULEVARD } from './transit-layout.js';

const BODY_COLORS = [0xff755f, 0x4deeea, 0xf5f2ff, 0x5cbcff, 0xff4fa3, 0xffb45f, 0x36e1c1];
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitWheel = new THREE.CylinderGeometry(0.29, 0.29, 0.2, 10);

function geometryAt(geometry, position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );
  return geometry.clone().applyMatrix4(matrix);
}

function boxAt(scale, position) {
  return geometryAt(unitBox, position, [0, 0, 0], scale);
}

function mergeParts(parts) {
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  merged.computeBoundingSphere();
  return merged;
}

const carGeometry = {
  body: mergeParts([
    boxAt([1.88, 0.44, 4.05], [0, 0.58, 0]),
    boxAt([1.76, 0.24, 1.18], [0, 0.84, -1.33]),
    boxAt([1.78, 0.18, 0.72], [0, 0.78, 1.55]),
  ]),
  glass: mergeParts([
    boxAt([1.54, 0.54, 1.82], [0, 1.08, 0.12]),
    boxAt([1.58, 0.1, 1.88], [0, 1.39, 0.12]),
  ]),
  chrome: mergeParts([
    boxAt([1.92, 0.09, 0.12], [0, 0.48, -2.02]),
    boxAt([1.92, 0.09, 0.12], [0, 0.48, 2.02]),
    boxAt([0.08, 0.11, 3.55], [-0.95, 0.7, 0]),
    boxAt([0.08, 0.11, 3.55], [0.95, 0.7, 0]),
  ]),
  underbody: mergeParts([
    boxAt([1.62, 0.22, 3.3], [0, 0.31, 0]),
    ...[-1, 1].flatMap((x) => [-1.3, 1.3].map((z) => geometryAt(
      unitWheel, [x * 0.92, 0.34, z], [0, 0, Math.PI / 2], [1, 1, 1],
    ))),
  ]),
  headlights: mergeParts([-0.58, 0.58].map((x) => boxAt([0.34, 0.16, 0.06], [x, 0.69, -2.06]))),
  tailLights: mergeParts([-0.58, 0.58].map((x) => boxAt([0.3, 0.15, 0.06], [x, 0.69, 2.06]))),
};

export class Traffic {
  constructor(scene, { lowPower = false } = {}) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'boulevard-traffic';
    this.vehicles = [];
    const perLine = lowPower ? 3 : 6;
    const lines = Object.values(LINES);

    for (let slot = 0; slot < perLine; slot++) {
      lines.forEach((line, lineIndex) => {
        const dir = new THREE.Vector2(Math.cos(line.angle), -Math.sin(line.angle));
        const perp = new THREE.Vector2(-dir.y, dir.x);
        const direction = slot % 2 === 0 ? 1 : -1;
        const lane = direction > 0 ? BOULEVARD.carLanes[0] : BOULEVARD.carLanes[1];
        const span = BOULEVARD.carEndD - BOULEVARD.carStartD;
        const phase = (slot + lineIndex / lines.length) / perLine;
        this.vehicles.push({
          dir, perp, lane, direction, lineIndex,
          d: BOULEVARD.carStartD + phase * span,
          cruiseSpeed: 7.8 + ((slot * 7 + lineIndex * 3) % 9) * 0.42,
          currentSpeed: 0,
          yaw: line.angle - Math.PI / 2 + (direction < 0 ? Math.PI : 0),
        });
      });
    }

    const capacity = this.vehicles.length;
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.54, roughness: 0.32 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x102340, emissive: 0x194d66, emissiveIntensity: 0.7,
      metalness: 0.66, roughness: 0.18,
    });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xaabbd2, metalness: 0.88, roughness: 0.2 });
    const darkMat = new THREE.MeshToonMaterial({ color: 0x090f1d });
    const headMat = new THREE.MeshBasicMaterial({ color: 0xcafff7, toneMapped: false });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff4f74, toneMapped: false });
    this.meshes = [
      new THREE.InstancedMesh(carGeometry.body, bodyMat, capacity),
      new THREE.InstancedMesh(carGeometry.glass, glassMat, capacity),
      new THREE.InstancedMesh(carGeometry.chrome, chromeMat, capacity),
      new THREE.InstancedMesh(carGeometry.underbody, darkMat, capacity),
      new THREE.InstancedMesh(carGeometry.headlights, headMat, capacity),
      new THREE.InstancedMesh(carGeometry.tailLights, tailMat, capacity),
    ];
    this.meshes.forEach((mesh) => {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.root.add(mesh);
    });
    this.meshes[0].castShadow = !lowPower;
    this.meshes[0].receiveShadow = true;
    this.vehicles.forEach((_, index) => {
      this.meshes[0].setColorAt(index, new THREE.Color(BODY_COLORS[index % BODY_COLORS.length]));
    });
    if (this.meshes[0].instanceColor) this.meshes[0].instanceColor.needsUpdate = true;
    this.activeCount = capacity;
    this.matrixDummy = new THREE.Object3D();
    this.updateMatrices();
    this.scene.add(this.root);
  }

  setDensity(count) {
    this.activeCount = THREE.MathUtils.clamp(Math.floor(count), 0, this.vehicles.length);
    this.meshes.forEach((mesh) => { mesh.count = this.activeCount; });
  }

  update(dt, playerPos) {
    const positions = this.vehicles.map((vehicle) => vehicle.d);
    const routeSpan = BOULEVARD.carEndD - BOULEVARD.carStartD;
    for (let index = 0; index < this.activeCount; index++) {
      const vehicle = this.vehicles[index];
      const playerD = playerPos.x * vehicle.dir.x + playerPos.z * vehicle.dir.y;
      const playerLane = playerPos.x * vehicle.perp.x + playerPos.z * vehicle.perp.y;
      const gap = (playerD - vehicle.d) * vehicle.direction;
      const laneRisk = Math.abs(playerLane - vehicle.lane) < 1.35 && gap > -2.3 && gap < 12;
      const playerSafety = laneRisk ? THREE.MathUtils.clamp((gap - 2.8) / 7, 0, 1) : 1;
      let leadGap = routeSpan;
      for (let otherIndex = 0; otherIndex < this.activeCount; otherIndex++) {
        if (otherIndex === index) continue;
        const other = this.vehicles[otherIndex];
        if (other.lineIndex !== vehicle.lineIndex
          || other.lane !== vehicle.lane
          || other.direction !== vehicle.direction) continue;
        let otherGap = (positions[otherIndex] - positions[index]) * vehicle.direction;
        if (otherGap <= 0) otherGap += routeSpan;
        leadGap = Math.min(leadGap, otherGap);
      }
      const trafficSafety = THREE.MathUtils.clamp((leadGap - 5.2) / 10, 0, 1);
      const safety = Math.min(playerSafety, trafficSafety);
      vehicle.currentSpeed = safety < 0.04
        ? 0
        : THREE.MathUtils.damp(vehicle.currentSpeed, vehicle.cruiseSpeed * safety, 4.5, dt);
      vehicle.d += vehicle.direction * vehicle.currentSpeed * dt;
      if (vehicle.d > BOULEVARD.carEndD) vehicle.d = BOULEVARD.carStartD;
      if (vehicle.d < BOULEVARD.carStartD) vehicle.d = BOULEVARD.carEndD;
    }
    this.updateMatrices();
  }

  updateMatrices() {
    for (let index = 0; index < this.activeCount; index++) {
      const vehicle = this.vehicles[index];
      this.matrixDummy.position.set(
        vehicle.dir.x * vehicle.d + vehicle.perp.x * vehicle.lane,
        0,
        vehicle.dir.y * vehicle.d + vehicle.perp.y * vehicle.lane,
      );
      this.matrixDummy.rotation.set(0, vehicle.yaw, 0);
      this.matrixDummy.scale.set(1, 1, 1);
      this.matrixDummy.updateMatrix();
      this.meshes.forEach((mesh) => mesh.setMatrixAt(index, this.matrixDummy.matrix));
    }
    this.meshes.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; });
  }
}
