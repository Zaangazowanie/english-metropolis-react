// Batched boulevard traffic. Five silhouette fleets keep every vehicle distinct
// without turning each car into a separate draw-call tree.
//
// Each fleet is ONE InstancedMesh: body, glass, chrome, wheels and lights are
// merged into a single geometry whose vertices carry a role — body vertices
// take the per-instance paint colour, fixed parts keep their vertex colour, and
// light vertices skip lighting and glow. That is 5 draw calls and one shader
// program for the whole fleet (it used to be 30 meshes over 6 materials).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonRamp } from './materials.js';
import { LINES } from './zones.js';
import { BOULEVARD } from './transit-layout.js';

const BODY_COLORS = [
  0xff755f, 0x4deeea, 0xf5f2ff, 0x5cbcff, 0xff4fa3, 0xffb45f,
  0x36e1c1, 0x8b7dff, 0xd7df55, 0xe7674a, 0x72a4a7, 0xc7a3d8,
  0x315f8d, 0xf2d36b, 0x4f9b72, 0xa84665, 0xd9c8b4, 0x6786c5,
];
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitWheel = new THREE.CylinderGeometry(0.29, 0.29, 0.2, 10);
const ROLE_BODY = 0, ROLE_FIXED = 1, ROLE_LIGHT = 2;
const CHROME = 0xcfd9e6, GLASS = 0x16344d, DARK = 0x090f1d, HEAD = 0xcafff7, TAIL = 0xff4f74;

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

// tag every vertex of a part with a colour and a role, then merge the lot
function tag(geometry, colorHex, role) {
  const n = geometry.attributes.position.count;
  const c = new THREE.Color(colorHex);
  const col = new Float32Array(n * 3), roles = new Float32Array(n);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; roles[i] = role; }
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.setAttribute('aRole', new THREE.BufferAttribute(roles, 1));
  geometry.deleteAttribute('uv');
  return geometry;
}
function mergeTagged(parts) {
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
  const parts = [
    tag(boxAt([spec.width, 0.44, spec.length], [0, 0.58, 0]), 0xffffff, ROLE_BODY),
    tag(boxAt([spec.width - 0.1, 0.2, hoodLength], [0, 0.83, -halfLength + hoodLength / 2]), 0xffffff, ROLE_BODY),
    tag(boxAt([spec.width - 0.12, spec.van ? 0.52 : 0.18, spec.van ? 1.15 : hoodLength * 0.72],
      [0, spec.van ? 1.03 : 0.79, halfLength - (spec.van ? 0.58 : hoodLength * 0.36)]), 0xffffff, ROLE_BODY),
    // cabin glass + roof
    tag(boxAt([spec.width - 0.32, spec.cabinH, spec.cabin], [0, 1.08 + (spec.cabinH - 0.54) * 0.5, spec.cabinZ]), GLASS, ROLE_FIXED),
    tag(boxAt([spec.width - 0.3, 0.08, spec.cabin + 0.06], [0, 1.37 + (spec.cabinH - 0.54), spec.cabinZ]), 0xffffff, ROLE_BODY),
    // pillars keep the glass box from reading as a solid block
    ...[-1, 1].flatMap((x) => [-1, 1].map((z) => tag(boxAt([0.07, spec.cabinH, 0.07],
      [x * (spec.width / 2 - 0.19), 1.08 + (spec.cabinH - 0.54) * 0.5, spec.cabinZ + z * (spec.cabin / 2 - 0.04)]), 0xffffff, ROLE_BODY))),
    // chrome bumpers + sills
    tag(boxAt([spec.width + 0.04, 0.09, 0.12], [0, 0.48, -halfLength]), CHROME, ROLE_FIXED),
    tag(boxAt([spec.width + 0.04, 0.09, 0.12], [0, 0.48, halfLength]), CHROME, ROLE_FIXED),
    tag(boxAt([0.07, 0.1, Math.max(2.8, spec.length - 0.5)], [-halfWidth - 0.03, 0.7, 0]), CHROME, ROLE_FIXED),
    tag(boxAt([0.07, 0.1, Math.max(2.8, spec.length - 0.5)], [halfWidth + 0.03, 0.7, 0]), CHROME, ROLE_FIXED),
    // underbody + wheels
    tag(boxAt([spec.width - 0.28, 0.22, spec.length - 0.7], [0, 0.31, 0]), DARK, ROLE_FIXED),
    ...[-1, 1].flatMap((x) => [-spec.wheelbase, spec.wheelbase].map((z) => tag(geometryAt(
      unitWheel, [x * halfWidth, 0.34, z], [0, 0, Math.PI / 2], [1, 1, 1],
    ), DARK, ROLE_FIXED))),
    ...[-1, 1].flatMap((x) => [-spec.wheelbase, spec.wheelbase].map((z) => tag(geometryAt(
      new THREE.CylinderGeometry(0.13, 0.13, 0.22, 8), [x * halfWidth, 0.34, z], [0, 0, Math.PI / 2], [1, 1, 1],
    ), CHROME, ROLE_FIXED))),
    // lights
    ...[-0.58, 0.58].map((x) => tag(boxAt([0.3, 0.16, 0.06], [x * spec.width / 1.88, 0.69, -halfLength - 0.03]), HEAD, ROLE_LIGHT)),
    ...[-0.58, 0.58].map((x) => tag(boxAt([0.28, 0.15, 0.06], [x * spec.width / 1.88, 0.69, halfLength + 0.03]), TAIL, ROLE_LIGHT)),
  ];
  if (spec.roofSign) {
    parts.push(tag(boxAt([0.68, 0.22, 0.28], [0, 1.66, 0.08]), 0xffd45a, ROLE_LIGHT));
  }
  return mergeTagged(parts);
}

// One toon material for every fleet: paint via instanceColor on body vertices,
// vertex colour elsewhere, unlit glow on light vertices.
function fleetMaterial() {
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonRamp() });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLightGain = { value: 1.7 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRole;\nvarying float vRole;')
      .replace('#include <color_vertex>', /* glsl */`
        vRole = aRole;
        vColor = color;                       // vec3: no vertex alpha on this material
        #ifdef USE_INSTANCING_COLOR
          if (aRole < 0.5) vColor *= instanceColor.rgb;
        #endif
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRole;\nuniform float uLightGain;')
      .replace('#include <opaque_fragment>', /* glsl */`
        if (vRole > 1.5) outgoingLight = vColor * uLightGain;
        #include <opaque_fragment>
      `);
  };
  mat.customProgramCacheKey = () => 'em-traffic-v1';
  return mat;
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
        const variant = (slot * 2 + lineIndex) % VEHICLE_SPECS.length;
        this.vehicles.push({
          dir, perp, lane, direction, lineIndex, variant,
          spec: VEHICLE_SPECS[variant],
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
    this.material = fleetMaterial();
    this.fleets = vehicleGeometry.map((geometry, variant) => {
      const mesh = new THREE.InstancedMesh(geometry, this.material, capacity);
      mesh.name = `${VEHICLE_SPECS[variant].name}-fleet`;
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = !lowPower;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      return { mesh, count: 0 };
    });
    this.meshes = this.fleets.map((fleet) => fleet.mesh);
    this.activeCount = capacity;
    this.matrixDummy = new THREE.Object3D();
    this.updateMatrices();
    this.scene.add(this.root);
  }

  setDensity(count) {
    this.activeCount = THREE.MathUtils.clamp(Math.floor(count), 0, this.vehicles.length);
    this.updateMatrices();
  }

  // Cars brake for the player; the player also cannot stand inside one — a 2D
  // oriented-box test pushes them out along the shallow axis (walkthrough-23).
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

      // push the player out of the car's footprint
      const along = playerD - vehicle.d;
      const lateral = playerLane - vehicle.lane;
      const halfL = vehicle.spec.length * vehicle.scaleZ / 2 + 0.42;
      const halfW = vehicle.spec.width * vehicle.scaleX / 2 + 0.42;
      if (Math.abs(along) < halfL && Math.abs(lateral) < halfW) {
        const pushAlong = (halfL - Math.abs(along)) * Math.sign(along || 1);
        const pushLat = (halfW - Math.abs(lateral)) * Math.sign(lateral || 1);
        if (Math.abs(pushLat) <= Math.abs(pushAlong)) {
          playerPos.x += vehicle.perp.x * pushLat; playerPos.z += vehicle.perp.y * pushLat;
        } else {
          playerPos.x += vehicle.dir.x * pushAlong; playerPos.z += vehicle.dir.y * pushAlong;
        }
      }
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
      fleet.mesh.setMatrixAt(fleetIndex, this.matrixDummy.matrix);
      fleet.mesh.setColorAt(fleetIndex, vehicle.color);
    }
    this.fleets.forEach((fleet) => {
      fleet.mesh.count = fleet.count;
      fleet.mesh.instanceMatrix.needsUpdate = true;
      if (fleet.mesh.instanceColor) fleet.mesh.instanceColor.needsUpdate = true;
    });
  }
}
