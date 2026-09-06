import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as CANNON from 'cannon-es';
import { TRACK, trackPoint, trackYaw } from '@apex/shared';

function box(parent: THREE.Object3D, size: [number, number, number], position: [number, number, number], color: string | number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
  mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
export function createKart(color: string, ghost = false): THREE.Group {
  const kart = new THREE.Group();
  box(kart, [1.55, 0.32, 2.4], [0, 0.55, 0], color);
  box(kart, [1.35, 0.34, 0.7], [0, 0.75, 0.8], color);
  box(kart, [0.64, 0.17, 0.86], [0, 0.95, 0.88], '#faf5df');
  box(kart, [1.9, 0.17, 0.22], [0, 0.45, 1.34], '#333936');
  box(kart, [1.85, 0.15, 0.5], [0, 1.02, -1.06], color);
  box(kart, [0.7, 0.85, 0.55], [0, 1.01, -0.4], '#303b38');
  box(kart, [0.62, 0.62, 0.45], [0, 1.2, -0.05], '#f2eee1');
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.41, 12, 10), new THREE.MeshStandardMaterial({ color }));
  helmet.position.set(0, 1.83, -0.13); helmet.castShadow = true; kart.add(helmet);
  box(kart, [0.62, 0.18, 0.24], [0, 1.84, 0.18], '#263c3a');
  for (const x of [-0.88, 0.88]) for (const z of [-0.83, 0.82]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.32, 12), new THREE.MeshStandardMaterial({ color: '#242b28', roughness: 0.95 }));
    wheel.userData.wheel = true; wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.36, z); wheel.castShadow = true; kart.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 8), new THREE.MeshStandardMaterial({ color: '#bec7bd', metalness: 0.5 }));
    hub.userData.wheel = true; hub.rotation.z = Math.PI / 2; hub.position.copy(wheel.position); kart.add(hub);
  }
  if (ghost) kart.traverse(object => { if (object instanceof THREE.Mesh) { const material = object.material as THREE.MeshStandardMaterial; material.transparent = true; material.opacity = 0.3; material.depthWrite = false; object.castShadow = false; } });
  return kart;
}

function ribbon(scene: THREE.Scene, inner: number, outer: number, y: number, color: string) {
  const vertices: number[] = []; const indices: number[] = [];
  for (let i = 0; i <= 192; i++) {
    for (const offset of [inner, outer]) { const p = trackPoint(i / 192, offset); vertices.push(p[0], y, p[2]); }
    if (i < 192) { const k = i * 2; indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 1 }));
  mesh.receiveShadow = true; scene.add(mesh);
}

export function buildTrack(scene: THREE.Scene, world: CANNON.World) {
  scene.background = new THREE.Color('#dce8d4');
  scene.fog = new THREE.Fog('#dce8d4', 150, 310);
  const ambient = new THREE.HemisphereLight('#fff5dd', '#5e735c', 2.5); scene.add(ambient);
  const sun = new THREE.DirectionalLight('#fff1d2', 3.2); sun.position.set(-45, 85, 35); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -100, right: 100, top: 85, bottom: -85, near: 1, far: 220 });
  sun.shadow.normalBias = 0.04; scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(650, 650), new THREE.MeshStandardMaterial({ color: '#9ebc7f', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true; scene.add(ground);
  const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() }); floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0); world.addBody(floor);
  ribbon(scene, -8.4, 8.4, 0.01, '#c2c3ab');
  ribbon(scene, -7.1, 7.1, 0.035, '#65706b');
  ribbon(scene, -6.8, -6.65, 0.046, '#f3eed8');
  ribbon(scene, 6.65, 6.8, 0.046, '#f3eed8');
  for (let i = 0; i < 160; i++) {
    for (const side of [-1, 1]) {
      const p = trackPoint(i / 160, side * 7.5);
      const next = trackPoint((i + 1) / 160, side * 7.5);
      const length = Math.hypot(next[0] - p[0], next[2] - p[2]);
      const curb = box(scene, [0.9, 0.18, length + 0.08], [p[0], 0.08, p[2]], i % 2 ? '#f3f0de' : '#c97253');
      curb.rotation.y = Math.atan2(next[0] - p[0], next[2] - p[2]);
      const wallP = trackPoint(i / 160, side * 8.25);
      const wallNext = trackPoint((i + 1) / 160, side * 8.25);
      const wallLength = Math.hypot(wallNext[0] - wallP[0], wallNext[2] - wallP[2]);
      const yaw = Math.atan2(wallNext[0] - wallP[0], wallNext[2] - wallP[2]);
      const midpoint: [number, number, number] = [(wallP[0] + wallNext[0]) / 2, 0.44, (wallP[2] + wallNext[2]) / 2];
      const wall = box(scene, [0.5, 0.88, wallLength + 0.14], midpoint, i % 6 < 3 ? '#e4e6d7' : '#487560'); wall.rotation.y = yaw;
      const collider = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(0.25, 0.6, (wallLength + 0.14) / 2)), position: new CANNON.Vec3(...midpoint) });
      collider.quaternion.setFromEuler(0, yaw, 0); world.addBody(collider);
    }
    if (i % 4 === 0) { const p = trackPoint(i / 160); const stripe = box(scene, [0.15, 0.012, 1.4], [p[0], 0.054, p[2]], '#a6ada3'); stripe.rotation.y = trackYaw(i / 160); }
  }
  // A checkerboard spans the track at progress 0; travel is in the +X direction.
  for (let row = 0; row < 4; row++) for (let col = 0; col < 18; col++) box(scene, [0.65, 0.015, 0.76], [row * 0.65 - 1, 0.065, -36 - 6.45 + col * 0.76], (row + col) % 2 ? '#f8f5e5' : '#303c35');
  for (const z of [-45.5, -26.5]) box(scene, [0.4, 7, 0.4], [0, 3.5, z], '#e9ecdd');
  box(scene, [0.55, 1.6, 19.5], [0, 6.4, -36], '#295d48');
  const label = document.createElement('canvas'); label.width = 1024; label.height = 128;
  const context = label.getContext('2d')!; context.fillStyle = '#295d48'; context.fillRect(0, 0, 1024, 128); context.fillStyle = '#f3efdb'; context.font = 'bold 64px sans-serif'; context.textAlign = 'center'; context.fillText('A P E X   K A R T   C L U B', 512, 88);
  const bannerTexture = new THREE.CanvasTexture(label);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(18.5, 2.3), new THREE.MeshBasicMaterial({ map: bannerTexture, side: THREE.DoubleSide }));
  banner.position.set(-0.29, 6.4, -36); banner.rotation.y = -Math.PI / 2; scene.add(banner);

  // Deterministic low-poly planting: the circuit needs no downloaded assets.
  let seed = 42; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 170; i++) {
    const x = (random() - 0.5) * 230, z = (random() - 0.5) * 180;
    const radius = Math.hypot(x / 56, z / 36);
    if (radius > 0.58 && radius < 1.48 || Math.abs(x) < 17 && Math.abs(z) < 13 || x > -25 && x < 20 && z < -39 && z > -63) continue;
    const height = 3.8 + random() * 5.5;
    box(scene, [0.5, height * 0.45, 0.5], [x, height * 0.22, z], '#826e50');
    for (let tier = 0; tier < 3; tier++) {
      const crown = new THREE.Mesh(new THREE.ConeGeometry(height * (0.31 - tier * 0.05), height * 0.56, 6), new THREE.MeshStandardMaterial({ color: ['#4d7950', '#5d8855', '#709759'][Math.floor(random() * 3)], roughness: 1 }));
      crown.position.set(x, height * (0.45 + tier * 0.18), z); crown.castShadow = true; scene.add(crown);
    }
  }
  const pond = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ color: '#78aeb0', roughness: 0.25, metalness: 0.15 }));
  pond.rotation.x = -Math.PI / 2; pond.scale.set(16, 9, 1); pond.position.set(0, 0.012, 1); scene.add(pond);
  for (let i = 0; i < 8; i++) {
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + random() * 1.6, 0), new THREE.MeshStandardMaterial({ color: '#a5ac92' }));
    stone.position.set(Math.cos(i * 0.8) * 17, 0.4, 1 + Math.sin(i * 0.8) * 10); stone.scale.y = 0.5; stone.castShadow = true; scene.add(stone);
  }
  box(scene, [21, 0.15, 9], [-14, 0.05, -54], '#b7bca6');
  box(scene, [17, 3.2, 5], [-14, 1.6, -56], '#e6dec7');
  box(scene, [19, 0.4, 7], [-14, 3.4, -56], '#567460');
  for (let i = 0; i < 5; i++) box(scene, [2.5, 2.1, 0.1], [-20 + i * 3.2, 1.2, -53.45], '#456257');
  for (let i = 0; i < 4; i++) { box(scene, [15, 0.4, 1.6], [26, 0.5 + i * 0.6, -52 - i * 1.6], '#c7bb9b'); }
  for (let i = 0; i < 8; i++) {
    const p = trackPoint(i / 8, 11.5);
    box(scene, [0.17, 4, 0.17], [p[0], 2, p[2]], '#f1eedc');
    const flag = box(scene, [0.05, 1.6, 0.9], [p[0], 3.1, p[2] + 0.4], i % 2 ? '#e6b350' : '#de8653'); flag.rotation.y = -0.25;
  }
  batchScenery(scene);
}

// Static scenery shares a few materials. Merge it once rather than issuing
// hundreds of separate draw calls every frame, especially on integrated GPUs.
function batchScenery(scene: THREE.Scene) {
  scene.updateMatrixWorld(true);
  const batches = new Map<string, { meshes: THREE.Mesh[]; material: THREE.MeshStandardMaterial }>();
  for (const object of [...scene.children]) {
    if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial) || object.material.map) continue;
    const material = object.material;
    const key = [material.color.getHexString(), material.roughness, material.metalness, material.side, object.castShadow, object.receiveShadow].join(':');
    if (!batches.has(key)) batches.set(key, { meshes: [], material: material.clone() });
    batches.get(key)!.meshes.push(object);
  }
  for (const { meshes, material } of batches.values()) {
    const geometries = meshes.map(mesh => mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
    const merged = mergeGeometries(geometries);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) { material.dispose(); continue; }
    const batch = new THREE.Mesh(merged, material);
    batch.castShadow = meshes[0].castShadow; batch.receiveShadow = meshes[0].receiveShadow;
    for (const mesh of meshes) { scene.remove(mesh); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
    scene.add(batch);
  }
}

export function disposeObject(root: THREE.Object3D) {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
  });
}
