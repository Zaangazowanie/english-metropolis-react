// Batched boulevard traffic. Five silhouette fleets keep every vehicle distinct
// without turning each car into a separate draw-call tree.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LINES } from './zones.js';
import { BOULEVARD } from './transit-layout.js';

const BODY_COLORS = [
  0xff755f, 0x4deeea, 0xf5f2ff, 0x5cbcff, 0xff4fa3, 0xffb45f,
  0x36e1c1, 0x8b7dff, 0xd7df55, 0xe7674a, 0x72a4a7, 0xc7a3d8,
  0x315f8d, 0xf2d36b, 0x4f9b72, 0xa84665, 0xd9c8b4, 0x6786c5,
];
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

const VEHICLE_SPECS = [
  { name: 'metro-coupe', width: 1.82, length: 3.72, cabin: 1.35, cabinZ: 0.12, cabinH: 0.42, wheelbase: 1.16 },
  { name: 'city-sedan', width: 1.88, length: 4.22, cabin: 1.82, cabinZ: 0.1, cabinH: 0.54, wheelbase: 1.36 },
  { name: 'night-hatch', width: 1.78, length: 3.65, cabin: 1.72, cabinZ: 0.36, cabinH: 0.58, wheelbase: 1.12 },
  { name: 'neon-taxi', width: 1.9, length: 4.35, cabin: 1.9, cabinZ: 0.06, cabinH: 0.56, wheelbase: 1.42, roofSign: true },
  { name: 'market-van', width: 1.96, length: 4.48, cabin: 2.48, cabinZ: 0.42, cabinH: 0.76, wheelbase: 1.38, van: true },
];

function makeVehicleGeometry(spec) {
  const halfLength = spec.length / 2;
  const halfWidth = spec.width / 2;
  const hoodLength = spec.van ? 0.72 : Math.max(0.76, (spec.length - spec.cabin) * 0.5);
  const bodyParts = [
    boxAt([spec.width, 0.44, spec.length], [0, 0.58, 0]),
    boxAt([spec.width - 0.1, 0.2, hoodLength], [0, 0.83, -halfLength + hoodLength / 2]),
    boxAt([spec.width - 0.12, spec.van ? 0.52 : 0.18, spec.van ? 1.15 : hoodLength * 0.72],
      [0, spec.van ? 1.03 : 0.79, halfLength - (spec.van ? 0.58 : hoodLength * 0.36)]),
  ];
  if (spec.roofSign) bodyParts.push(boxAt([0.68, 0.22, 0.28], [0, 1.66, 0.08]));
  const sideRailLength = Math.max(2.8, spec.length - 0.5);
  return {
    body: mergeParts(bodyParts),
    glass: mergeParts([
      boxAt([spec.width - 0.32, spec.cabinH, spec.cabin], [0, 1.08 + (spec.cabinH - 0.54) * 0.5, spec.cabinZ]),
      boxAt([spec.width - 0.3, 0.08, spec.cabin + 0.06], [0, 1.37 + (spec.cabinH - 0.54), spec.cabinZ]),
    ]),
    chrome: mergeParts([
      boxAt([spec.width + 0.04, 0.09, 0.12], [0, 0.48, -halfLength]),
      boxAt([spec.width + 0.04, 0.09, 0.12], [0, 0.48, halfLength]),
      boxAt([0.07, 0.1, sideRailLength], [-halfWidth - 0.03, 0.7, 0]),
      boxAt([0.07, 0.1, sideRailLength], [halfWidth + 0.03, 0.7, 0]),
    ]),
    underbody: mergeParts([
      boxAt([spec.width - 0.28, 0.22, spec.length - 0.7], [0, 0.31, 0]),
      ...[-1, 1].flatMap((x) => [-spec.wheelbase, spec.wheelbase].map((z) => geometryAt(
        unitWheel, [x * halfWidth, 0.34, z], [0, 0, Math.PI / 2], [1, 1, 1],
      ))),
    ]),
    headlights: mergeParts([-0.58, 0.58].map((x) => boxAt(
      [0.3, 0.16, 0.06], [x * spec.width / 1.88, 0.69, -halfLength - 0.03],
    ))),
    tailLights: mergeParts([-0.58, 0.58].map((x) => boxAt(
      [0.28, 0.15, 0.06], [x * spec.width / 1.88, 0.69, halfLength + 0.03],
    ))),
  };
}

const vehicleGeometry = VEHICLE_SPECS.map(makeVehicleGeometry);

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
        const vehicleIndex = this.vehicles.length;
        this.vehicles.push({
          dir, perp, lane, direction, lineIndex,
          variant: (slot * 2 + lineIndex) % VEHICLE_SPECS.length,
          color: new THREE.Color(BODY_COLORS[vehicleIndex % BODY_COLORS.length]),
          scaleX: 0.94 + ((vehicleIndex * 7) % 9) * 0.012,
          scaleY: 0.95 + ((vehicleIndex * 5) % 7) * 0.014,
          scaleZ: 0.94 + ((vehicleIndex * 11) % 11) * 0.011,
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
    this.fleets = vehicleGeometry.map((geometry, variant) => {
      const meshes = [
        new THREE.InstancedMesh(geometry.body, bodyMat, capacity),
        new THREE.InstancedMesh(geometry.glass, glassMat, capacity),
        new THREE.InstancedMesh(geometry.chrome, chromeMat, capacity),
        new THREE.InstancedMesh(geometry.underbody, darkMat, capacity),
        new THREE.InstancedMesh(geometry.headlights, headMat, capacity),
        new THREE.InstancedMesh(geometry.tailLights, tailMat, capacity),
      ];
      meshes.forEach((mesh, partIndex) => {
        mesh.name = `${VEHICLE_SPECS[variant].name}-${partIndex}`;
        mesh.count = 0;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        this.root.add(mesh);
      });
      meshes[0].castShadow = !lowPower;
      meshes[0].receiveShadow = true;
      return { meshes, count: 0 };
    });
    this.meshes = this.fleets.flatMap((fleet) => fleet.meshes);
    this.activeCount = capacity;
    this.matrixDummy = new THREE.Object3D();
    this.updateMatrices();
    this.scene.add(this.root);
  }

  setDensity(count) {
    this.activeCount = THREE.MathUtils.clamp(Math.floor(count), 0, this.vehicles.length);
    this.updateMatrices();
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
    this.fleets.forEach((fleet) => { fleet.count = 0; });
    for (let index = 0; index < this.activeCount; index++) {
      const vehicle = this.vehicles[index];
      const fleet = this.fleets[vehicle.variant];
      const fleetIndex = fleet.count++;
      this.matrixDummy.position.set(
        vehicle.dir.x * vehicle.d + vehicle.perp.x * vehicle.lane,
        0,
        vehicle.dir.y * vehicle.d + vehicle.perp.y * vehicle.lane,
      );
      this.matrixDummy.rotation.set(0, vehicle.yaw, 0);
      this.matrixDummy.scale.set(vehicle.scaleX, vehicle.scaleY, vehicle.scaleZ);
      this.matrixDummy.updateMatrix();
      fleet.meshes.forEach((mesh) => mesh.setMatrixAt(fleetIndex, this.matrixDummy.matrix));
      fleet.meshes[0].setColorAt(fleetIndex, vehicle.color);
    }
    this.fleets.forEach((fleet) => {
      fleet.meshes.forEach((mesh) => {
        mesh.count = fleet.count;
        mesh.instanceMatrix.needsUpdate = true;
      });
      if (fleet.meshes[0].instanceColor) fleet.meshes[0].instanceColor.needsUpdate = true;
    });
  }
}
