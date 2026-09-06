import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boostLocations, course, itemLocations, pointAt, ROAD_WIDTH, shortcut, yawAt } from './course';

const material = (color: string, glow = false) => new THREE.MeshStandardMaterial({ color, roughness: .78, ...(glow ? { emissive: color, emissiveIntensity: .45 } : {}) });
function mesh(scene: THREE.Object3D, geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number, glow = false) {
  const object = new THREE.Mesh(geometry, material(color, glow)); object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true; scene.add(object); return object;
}
function box(scene: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, color: string) { return mesh(scene, new THREE.BoxGeometry(w, h, d), color, x, y, z); }
function sign(scene: THREE.Object3D, words: string, at: THREE.Vector3, yaw: number, width = 15, color = '#203b65') {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 192;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, 1024, 192);
  ctx.fillStyle = '#fff2bc'; ctx.font = '900 76px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(words, 512, 126);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width * .1875), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), side: THREE.DoubleSide }));
  m.position.copy(at); m.rotation.y = yaw; scene.add(m);
}
function road(scene: THREE.Object3D, curve: THREE.Curve<THREE.Vector3>, width: number, color: string, count: number, innerWidth = 0) {
  const vertices: number[] = [], indices: number[] = [];
  const lanes = innerWidth ? [-width / 2, -innerWidth / 2, innerWidth / 2, width / 2] : [-width / 2, width / 2];
  for (let i = 0; i <= count; i++) {
    const p = curve.getPointAt(i / count), t = curve.getTangentAt(i / count);
    const normal = new THREE.Vector3(t.z, 0, -t.x).normalize();
    for (const lane of lanes) { const v = p.clone().addScaledVector(normal, lane); vertices.push(v.x, v.y, v.z); }
    if (i < count) for (let side = 0; side < lanes.length; side += 2) {
      const k = i * lanes.length + side, next = k + lanes.length;
      indices.push(k, k + 1, next, k + 1, next + 1, next);
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: .85, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geometry, mat); m.receiveShadow = true; scene.add(m);
}
function batch(group: THREE.Group) {
  group.updateMatrixWorld(true);
  const groups = new Map<string, THREE.Mesh[]>();
  group.traverse(o => { if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial && !o.material.map) {
    const m = o.material; const key = `${m.color.getHex()}-${m.emissive.getHex()}-${m.side}-${o.castShadow}-${o.receiveShadow}`;
    if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(o);
  } });
  for (const list of groups.values()) {
    const geometries = list.map(m => m.geometry.clone().applyMatrix4(m.matrixWorld));
    const geometry = mergeGeometries(geometries); geometries.forEach(g => g.dispose());
    if (!geometry) continue;
    const combined = new THREE.Mesh(geometry, (list[0].material as THREE.Material).clone());
    combined.castShadow = list[0].castShadow; combined.receiveShadow = list[0].receiveShadow;
    list.forEach(m => { m.removeFromParent(); m.geometry.dispose(); (m.material as THREE.Material).dispose(); }); group.add(combined);
  }
}

export function buildRaceScene(scene: THREE.Scene) {
  const sky = document.createElement('canvas'); sky.width = 4; sky.height = 512;
  const ctx = sky.getContext('2d')!, gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, '#8daeea'); gradient.addColorStop(.48, '#f9b7aa'); gradient.addColorStop(1, '#ffe6b5'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 4, 512);
  const background = new THREE.CanvasTexture(sky); background.colorSpace = THREE.SRGBColorSpace; scene.background = background;
  scene.fog = new THREE.Fog('#f7c7b4', 170, 480);
  scene.add(new THREE.HemisphereLight('#fff1d5', '#6b68a9', 2));
  const sun = new THREE.DirectionalLight('#ffddab', 2.5); sun.position.set(-70, 130, -80); sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 1, far: 400 }); sun.shadow.mapSize.set(2048, 2048); sun.shadow.normalBias = .06; scene.add(sun);
  const staticWorld = new THREE.Group(); scene.add(staticWorld);
  const sea = mesh(staticWorld, new THREE.PlaneGeometry(1600, 1600), '#6bbec8', 0, -22, 0); sea.rotation.x = -Math.PI / 2; sea.castShadow = false;
  mesh(staticWorld, new THREE.CylinderGeometry(133, 92, 33, 13), '#858cb9', -3, -17, 27);
  const island = mesh(staticWorld, new THREE.CylinderGeometry(131, 131, 1, 13), '#80bda8', -3, -.5, 27); island.receiveShadow = true;
  // Shoulders are separate edge strips, so they cannot flicker through the asphalt on bends.
  road(staticWorld, course, ROAD_WIDTH + 1.8, '#e8bdcc', 520, ROAD_WIDTH);
  road(staticWorld, course, ROAD_WIDTH, '#59627e', 520);
  road(staticWorld, shortcut, 7, '#d6a06c', 80);
  for (let i = 0; i < 320; i++) {
    const p = i / 320, center = pointAt(p), next = pointAt((i + 1) / 320), yaw = yawAt(p);
    const len = center.distanceTo(next) + .12;
    for (const side of [-1, 1]) {
      const edge = pointAt(p, side * (ROAD_WIDTH / 2 + .3));
      const curb = box(staticWorld, edge.x, edge.y + .11, edge.z, .65, .22, len, i % 2 ? '#fff1d5' : '#f193a4'); curb.rotation.y = yaw;
      if (p > .45 && p < .62) continue;
      const rail = box(staticWorld, edge.x, edge.y + .6, edge.z, .23, .55, len, p < .43 ? '#73d4cf' : '#ada1e8'); rail.rotation.y = yaw;
    }
    if (i % 5 === 0) {
      const line = box(staticWorld, center.x, center.y + .075, center.z, .15, .02, 2, '#d2c7cf');
      const tangent = course.getTangentAt(p);
      line.rotation.set(-Math.atan2(tangent.y, Math.hypot(tangent.x, tangent.z)), yaw, 0, 'YXZ');
    }
    if (i % 13 === 0 && center.y > 6) {
      for (const lane of [-5, 5]) { const support = pointAt(p, lane); box(staticWorld, support.x, support.y / 2, support.z, 1.5, support.y, 1.5, '#8793b1'); }
    }
  }
  for (const p of boostLocations) {
    const at = pointAt(p), pad = new THREE.Group(); pad.position.copy(at); pad.rotation.y = yawAt(p); staticWorld.add(pad);
    box(pad, 0, .1, 0, 9, .12, 5, '#f2b541');
    for (const z of [-1.3, .6]) for (const side of [-1, 1]) {
      const stripe = box(pad, side * 1.3, .19, z, 3, .05, .5, '#fff4b2'); stripe.rotation.y = side * .5;
    }
  }
  const gate = new THREE.Group(); const start = pointAt(0); gate.position.copy(start); gate.rotation.y = yawAt(0); staticWorld.add(gate);
  for (const x of [-9, 9]) { box(gate, x, 4.5, 0, .8, 9, .8, '#f6d49f'); box(gate, x, .5, 0, 2, 1, 2, '#798bd0'); }
  box(gate, 0, 8.4, 0, 19, 2.2, 1, '#454b87');
  sign(gate, 'CLOUDBURST CUP', new THREE.Vector3(0, 8.4, -.52), Math.PI, 17);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 3; j++) box(gate, i - 7.5, .1, j - 1, 1, .05, 1, (i + j) % 2 ? '#fff3d6' : '#3c4967');
  for (let i = 0; i < 8; i++) {
    const p = pointAt(-(Math.floor(i / 2) * 4.8 + 5) / course.getLength(), i % 2 ? -2.4 : 2.4);
    const grid = box(staticWorld, p.x, p.y + .08, p.z, 2.8, .03, 3.1, '#b9b1b2'); grid.rotation.y = yawAt(0);
  }
  // Harbor village: colorful pitched roofs, balconies, bunting and a lighthouse.
  for (let i = 0; i < 7; i++) {
    const x = -48 + i * 15, z = -88, h = 5 + i % 3;
    box(staticWorld, x, h / 2, z, 9, h, 8, ['#eeaa91', '#f1d18e', '#91c9d4'][i % 3]);
    const roof = mesh(staticWorld, new THREE.ConeGeometry(7.5, 4, 4), '#766ca1', x, h + 1.4, z); roof.rotation.y = Math.PI / 4;
    for (const dx of [-2, 2]) box(staticWorld, x + dx, h * .58, z + 4.05, 1.8, 2, .12, '#537997');
    box(staticWorld, x, h + .2, z + 4.5, 10, .25, 2, '#fff0c6');
  }
  mesh(staticWorld, new THREE.CylinderGeometry(3.5, 5, 25, 12), '#f8dfb2', 91, 12.5, -74);
  for (const y of [8, 18]) mesh(staticWorld, new THREE.CylinderGeometry(4, 4.3, 3, 12), '#ee8e98', 91, y, -74);
  mesh(staticWorld, new THREE.CylinderGeometry(4.3, 4.3, 4, 12), '#8fdadb', 91, 27, -74, true);
  mesh(staticWorld, new THREE.ConeGeometry(6, 4, 12), '#6479ad', 91, 31, -74);
  // Observatory landmark and rings hover above the central hill.
  mesh(staticWorld, new THREE.CylinderGeometry(13, 20, 17, 9), '#94a5bc', 18, 8, 67);
  mesh(staticWorld, new THREE.SphereGeometry(11, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), '#a09fe0', 18, 20, 67);
  mesh(staticWorld, new THREE.CylinderGeometry(11, 11, 4, 20), '#e2c5b0', 18, 18, 67);
  const ring = mesh(staticWorld, new THREE.TorusGeometry(15, .6, 8, 64), '#f8d176', 18, 27, 67, true); ring.rotation.x = .8;
  const telescope = box(staticWorld, 18, 30, 67, 3, 3, 17, '#789bbb'); telescope.rotation.x = -.5; telescope.rotation.y = -.7;
  // Crystal canyon clusters: faceted glowing purple and turquoise formations.
  for (let i = 0; i < 26; i++) {
    const p = .64 + i / 26 * .18, at = pointAt(p, (i % 2 ? -1 : 1) * (12 + i % 4 * 2));
    const crystal = mesh(staticWorld, new THREE.OctahedronGeometry(3 + i % 4), i % 2 ? '#8fdde3' : '#bd9ce9', at.x, at.y + 3, at.z, true); crystal.scale.y = 2; crystal.rotation.z = (i % 3 - 1) * .23;
  }
  for (let i = 0; i < 36; i++) {
    const p = i / 36, at = pointAt(p, (i % 2 ? -1 : 1) * 18);
    if (p > .18 && p < .84) continue;
    const palm = new THREE.Group(); palm.position.set(at.x, Math.max(0, at.y - 1), at.z); staticWorld.add(palm);
    mesh(palm, new THREE.CylinderGeometry(.35, .7, 8, 7), '#b89281', 0, 4, 0);
    for (let leaf = 0; leaf < 5; leaf++) {
      const frond = mesh(palm, new THREE.ConeGeometry(1.6, 6, 4), '#64b09d', Math.cos(leaf * 1.257) * 2, 8, Math.sin(leaf * 1.257) * 2);
      frond.rotation.z = 1.15; frond.rotation.y = leaf * 1.257;
    }
  }
  for (const [p, text] of [[.17, 'SKYBRIDGE ↑'], [.44, 'TURBO SHORTCUT ↗'], [.63, 'CRYSTAL CANYON'], [.86, 'FULL THROTTLE!']] as const) {
    const at = pointAt(p, -10); box(staticWorld, at.x, at.y + 3, at.z, .4, 6, .4, '#61779c'); sign(staticWorld, text, at.add(new THREE.Vector3(0, 6, 0)), yawAt(p) + Math.PI, 13);
  }
  // Arrow boards mark the inside of sharper bends.
  for (const p of [.27, .40, .55, .69, .79]) {
    const at = pointAt(p, -10); sign(staticWorld, '❯ ❯ ❯', at.add(new THREE.Vector3(0, 2.7, 0)), yawAt(p) + Math.PI, 9, '#695c94');
  }
  for (let i = 0; i < 16; i++) {
    const p = pointAt(i / 16, 12); box(staticWorld, p.x, p.y + 3, p.z, .2, 6, .2, '#fff0c6');
    const flag = box(staticWorld, p.x + .9, p.y + 5, p.z, 1.8, 1, .1, i % 2 ? '#ffbb72' : '#c8a0e3'); flag.rotation.y = i;
  }
  batch(staticWorld);
  const itemCanvas = document.createElement('canvas'); itemCanvas.width = 128; itemCanvas.height = 128;
  const itemContext = itemCanvas.getContext('2d')!;
  itemContext.fillStyle = '#6779bd'; itemContext.fillRect(0, 0, 128, 128);
  itemContext.strokeStyle = '#b5efff'; itemContext.lineWidth = 7; itemContext.strokeRect(5, 5, 118, 118);
  itemContext.fillStyle = '#fff3c2'; itemContext.font = '900 100px sans-serif'; itemContext.textAlign = 'center'; itemContext.fillText('?', 64, 101);
  const itemTexture = new THREE.CanvasTexture(itemCanvas); itemTexture.colorSpace = THREE.SRGBColorSpace;
  const boxes = itemLocations.map(({ position }, i) => {
    const group = new THREE.Group(); group.position.copy(position).add(new THREE.Vector3(0, 2, 0));
    const cube = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 1.7), new THREE.MeshStandardMaterial({ map: itemTexture, color: '#ffffff', emissive: '#65cddd', emissiveIntensity: .55, roughness: .2, metalness: .2, transparent: true, opacity: .83 })); group.add(cube);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(cube.geometry), new THREE.LineBasicMaterial({ color: '#fff4c7' })); group.add(edges);
    group.userData.index = i; scene.add(group); return group;
  });
  const balloons: THREE.Group[] = [];
  for (let i = 0; i < 6; i++) {
    const group = new THREE.Group(); group.position.set(-120 + i * 48, 48 + i % 3 * 14, -90 + i % 2 * 210);
    const canopy = mesh(group, new THREE.SphereGeometry(5, 12, 10), ['#f29eb0', '#f1cb84', '#969ee2'][i % 3], 0, 0, 0); canopy.scale.y = 1.2;
    box(group, 0, -8, 0, 2.3, 1.7, 2.3, '#9b7e79');
    for (const x of [-1, 1]) box(group, x, -5.7, 0, .06, 4, .06, '#f7e3bf');
    scene.add(group); balloons.push(group);
  }
  return { boxes, balloons, background };
}
