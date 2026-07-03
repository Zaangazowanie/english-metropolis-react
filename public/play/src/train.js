// Metro trams: one per line, gliding the boulevard, easing into every station,
// pausing, and ping-ponging end to end. Engine + two cars in the line's colour
// with warm lit windows — the city's heartbeat.
import * as THREE from 'three';
import { toonMat } from './materials.js';
import { LINES } from './zones.js';

const SPEED = 11, CAR_LEN = 7.4, GAP = 0.9, DWELL = 2.4, LANE = 3.3;

function buildCar(colorHex, isEngine) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.3, 7), toonMat(colorHex));
  body.position.y = 1.55;
  body.castShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.25, 7.05), toonMat(0xf2e3c4));
  roof.position.y = 2.8;
  const windows = new THREE.Mesh(
    new THREE.BoxGeometry(2.36, 0.75, 6.2),
    new THREE.MeshBasicMaterial({ color: 0xffd98a })          // warm lit interior
  );
  windows.position.y = 1.95;
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 6.6), toonMat(0x4a3826));
  skirt.position.y = 0.35;
  g.add(body, roof, windows, skirt);
  if (isEngine) {
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.2, 4), toonMat(colorHex));
    nose.rotation.x = Math.PI / 2;
    nose.rotation.y = Math.PI / 4;
    nose.position.set(0, 1.5, 4.05);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff3c0 }));
    lamp.position.set(0, 1.6, 4.6);
    g.add(nose, lamp);
  }
  return g;
}

export class Trains {
  constructor(scene, zoneMgr, audio) {
    this.scene = scene;
    this.audio = audio;
    this.trains = [];
    for (const [key, L] of Object.entries(LINES)) {
      const dir = new THREE.Vector2(Math.cos(L.angle), -Math.sin(L.angle));
      const perp = new THREE.Vector2(-dir.y, dir.x);
      // station distances along this line (plus both termini)
      const stops = [...new Set(zoneMgr.zones
        .filter((z) => z.lineKey === key)
        .map((z) => Math.round(z.stopPos.x * dir.x + z.stopPos.y * dir.y)))].sort((a, b) => a - b);
      const minD = 14, maxD = (stops[stops.length - 1] || 380) + 26;

      const group = new THREE.Group();
      const cars = [buildCar(L.color, true), buildCar(L.color, false), buildCar(L.color, false)];
      for (const c of cars) group.add(c);
      this.scene.add(group);

      this.trains.push({
        key, dir, perp, stops, minD, maxD, group, cars,
        d: minD + Math.random() * (maxD - minD),
        fwd: Math.random() < 0.5 ? 1 : -1,
        wait: 0, lastStop: null, whooshCd: 0,
      });
    }
  }

  update(dt, playerPos) {
    for (const t of this.trains) {
      if (t.wait > 0) { t.wait -= dt; }
      else {
        // ease into stations: speed scales with distance to the nearest stop ahead
        let nearDist = Infinity, nearStop = null;
        for (const s of t.stops) {
          const ds = Math.abs(s - t.d);
          if (ds < nearDist) { nearDist = ds; nearStop = s; }
        }
        const speed = SPEED * THREE.MathUtils.clamp(nearDist / 22, 0.14, 1);
        t.d += t.fwd * speed * dt;
        if (nearDist < 0.5 && t.lastStop !== nearStop) { t.wait = DWELL; t.lastStop = nearStop; }
        if (t.d > t.maxD) { t.d = t.maxD; t.fwd = -1; t.lastStop = null; }
        if (t.d < t.minD) { t.d = t.minD; t.fwd = 1; t.lastStop = null; }
      }

      // lay the cars out along the line (lane offset keeps the road usable)
      const heading = Math.atan2(t.dir.x, t.dir.y) + (t.fwd > 0 ? 0 : Math.PI);
      for (let i = 0; i < t.cars.length; i++) {
        const cd = t.d - t.fwd * i * (CAR_LEN + GAP);
        const x = t.dir.x * cd + t.perp.x * LANE;
        const z = t.dir.y * cd + t.perp.y * LANE;
        t.cars[i].position.set(x, 0, z);
        t.cars[i].rotation.y = heading;
      }

      // whoosh when it slides past the player
      t.whooshCd -= dt;
      if (t.whooshCd <= 0 && t.wait <= 0) {
        const head = t.cars[0].position;
        const dx = head.x - playerPos.x, dz = head.z - playerPos.z;
        if (dx * dx + dz * dz < 260) {
          this.audio?.play('ping', { rate: 0.42, volume: 0.4 });
          t.whooshCd = 4;
        }
      }
    }
  }
}
