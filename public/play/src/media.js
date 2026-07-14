// Authored EnglishMetro media facades: Times Square density with the city's
// existing coral/cyan/chrome language. Canvas textures avoid external assets.
import * as THREE from 'three';

const CAMPAIGNS = [
  { eyebrow: 'ENGLISH METRO', lines: ['SPEAK', 'THE CITY'], sub: 'REAL LESSONS. REAL MOMENTUM.', bg: '#07101f', fg: '#f5f2ff', accent: '#4deeea', alt: '#ff755f' },
  { eyebrow: 'NEXT DEPARTURE', lines: ['FLUENCY', 'EXPRESS'], sub: 'BOARD AT METROPOLIS CENTRAL', bg: '#ff755f', fg: '#07101f', accent: '#f5f2ff', alt: '#4deeea' },
  { eyebrow: 'WORDS IN MOTION', lines: ['LISTEN', 'ANSWER'], sub: 'ENGLISH THAT MOVES WITH YOU', bg: '#102849', fg: '#f5f2ff', accent: '#ff4fa3', alt: '#4deeea' },
  { eyebrow: 'NIGHT SCHOOL 24/7', lines: ['TALK', 'BOLDLY'], sub: 'FORTY-FOUR DIALECT DISTRICTS', bg: '#4deeea', fg: '#07101f', accent: '#ff4fa3', alt: '#f5f2ff' },
  { eyebrow: 'THE CITY IS TALKING', lines: ['CATCH', 'EVERY WORD'], sub: 'LISTENING LOUNGE NOW OPEN', bg: '#07101f', fg: '#f5f2ff', accent: '#ffb45f', alt: '#ff4fa3' },
  { eyebrow: 'ENGLISH AFTER DARK', lines: ['YOUR VOICE', 'GOES FAR'], sub: 'ONE CITY. MANY ENGLISHES.', bg: '#ff4fa3', fg: '#07101f', accent: '#4deeea', alt: '#f5f2ff' },
];

function fitText(context, text, maxWidth, startSize) {
  let size = startSize;
  do {
    context.font = `900 ${size}px Arial, sans-serif`;
    size -= 2;
  } while (context.measureText(text).width > maxWidth && size > 38);
}

function campaignTexture(spec, index) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 900;
  const context = canvas.getContext('2d');
  context.fillStyle = spec.bg;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = spec.accent;
  context.fillRect(0, 0, 640, 34);
  context.fillRect(index % 2 ? 0 : 600, 0, 40, 900);
  context.fillStyle = spec.alt;
  context.fillRect(index % 2 ? 572 : 22, 82, 18, 630);

  context.fillStyle = spec.fg;
  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.font = '700 25px Arial, sans-serif';
  context.fillText(spec.eyebrow, 58, 74);

  spec.lines.forEach((line, lineIndex) => {
    fitText(context, line, 500, line.length > 10 ? 84 : 106);
    context.fillText(line, 56, 176 + lineIndex * 122);
  });

  context.fillStyle = spec.accent;
  context.fillRect(56, 452, 430, 8);
  context.fillStyle = spec.fg;
  context.font = '700 24px Arial, sans-serif';
  context.fillText(spec.sub, 56, 496);

  // A tiny transit diagram makes the advertising native to this world.
  const trackX = index % 2 ? 90 : 500;
  context.fillStyle = spec.alt;
  context.fillRect(trackX, 620, 8, 210);
  for (let stop = 0; stop < 4; stop++) {
    context.fillStyle = stop === index % 4 ? spec.accent : spec.fg;
    context.fillRect(trackX - 13, 630 + stop * 58, 34, 22);
  }
  context.fillStyle = spec.fg;
  context.font = '800 22px Arial, sans-serif';
  context.fillText('EM / 2030', index % 2 ? 145 : 56, 777);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function tickerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#07101f';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#4deeea';
  context.fillRect(0, 0, canvas.width, 10);
  context.fillStyle = '#f5f2ff';
  context.font = '800 43px Arial, sans-serif';
  context.textBaseline = 'middle';
  const message = 'NEXT STOP: FLUENCY   //   SPEAK BOLDLY   //   REAL ENGLISH IN MOTION   //   ';
  context.fillText(message + message, 22, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(1.45, 1);
  return texture;
}

function rooftopTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 320;
  const context = canvas.getContext('2d');
  context.fillStyle = '#f5f2ff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#07101f';
  context.font = '900 105px Arial, sans-serif';
  context.fillText('ENGLISH', 40, 122);
  context.fillStyle = '#ff4fa3';
  context.fillRect(40, 164, 930, 12);
  context.fillStyle = '#07101f';
  context.font = '900 82px Arial, sans-serif';
  context.fillText('METRO  /  LIVE', 40, 275);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function buildMediaFacades(scene, animated, sites, { lowPower = false } = {}) {
  const root = new THREE.Group();
  root.name = 'metropolis-media-district';
  const screenMaterials = CAMPAIGNS.map((campaign, index) => new THREE.MeshBasicMaterial({
    map: campaignTexture(campaign, index),
    toneMapped: false,
  }));
  const tickerMap = tickerTexture();
  const tickerMat = new THREE.MeshBasicMaterial({ map: tickerMap, toneMapped: false });
  const roofMat = new THREE.MeshBasicMaterial({ map: rooftopTexture(), toneMapped: false });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xaabbd2, metalness: 0.9, roughness: 0.18 });
  const frameCount = sites.length * 2 + 3;
  const frames = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), frameMat, frameCount);
  frames.name = 'media-chrome-frames';
  const tickers = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), tickerMat, sites.length);
  tickers.name = 'media-ticker-bands';
  const rooftops = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), roofMat, 3);
  rooftops.name = 'media-rooftop-signs';
  const dummy = new THREE.Object3D();
  const point = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  let frameIndex = 0;

  const placeInstance = (mesh, index, site, lx, ly, lz, sx, sy, sz = 1) => {
    point.set(lx, ly, lz).applyAxisAngle(yAxis, site.yaw);
    dummy.position.set(site.x + point.x, point.y, site.z + point.z);
    dummy.rotation.set(0, site.yaw, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  };

  sites.forEach((site, index) => {
    const screenH = Math.min(site.h * 0.48, index % 2 ? 9.2 : 10.6);
    const screenW = Math.min(site.w * (index % 3 === 1 ? 0.8 : 0.7), index % 3 === 1 ? 8.4 : 7.4);
    const screenY = Math.min(site.h - screenH / 2 - 1.25, site.h * 0.56);
    const facadeZ = site.d / 2;
    const group = new THREE.Group();
    group.position.set(site.x, 0, site.z);
    group.rotation.y = site.yaw;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(screenW, screenH), screenMaterials[index]);
    screen.name = `media-campaign-${index + 1}`;
    screen.position.set(0, screenY, facadeZ + 0.18);
    group.add(screen);
    root.add(group);

    placeInstance(frames, frameIndex++, site, 0, screenY, facadeZ + 0.08, screenW + 0.42, screenH + 0.42, 0.18);
    const tickerW = site.w * 0.88;
    placeInstance(tickers, index, site, 0, 3.15, facadeZ + 0.2, tickerW, 1.12);
    placeInstance(frames, frameIndex++, site, 0, 3.15, facadeZ + 0.09, tickerW + 0.28, 1.4, 0.16);
  });

  [0, 2, 5].forEach((siteIndex, index) => {
    const site = sites[siteIndex];
    const width = Math.min(8.4, site.w * 0.82);
    placeInstance(rooftops, index, site, 0, site.h + 2.0, site.d / 2 + 0.08, width, 2.65);
    placeInstance(frames, frameIndex++, site, 0, site.h + 2.0, site.d / 2 - 0.02, width + 0.34, 2.98, 0.18);
  });

  frames.count = frameIndex;
  frames.instanceMatrix.needsUpdate = true;
  tickers.instanceMatrix.needsUpdate = true;
  rooftops.instanceMatrix.needsUpdate = true;
  root.add(frames, tickers, rooftops);
  root.userData.screenCount = sites.length + tickers.count + rooftops.count;
  scene.add(root);

  const controller = new THREE.Object3D();
  controller.userData.update = (time) => {
    tickerMap.offset.x = -(time * (lowPower ? 0.018 : 0.035)) % 1;
    if (!lowPower) screenMaterials.forEach((material, index) => {
      const level = 0.94 + Math.sin(time * 0.72 + index * 1.7) * 0.055;
      material.color.setRGB(level, level, level);
    });
  };
  animated.push(controller);
  return root;
}
