import * as THREE from 'three';

export const COURSE_NAME = 'Cloudburst Causeway';
export const ROAD_WIDTH = 15;
export const CHECKPOINTS = 16;
export const TOTAL_LAPS = 3;
// A hand-shaped loop: harbor straight, ascending switchbacks, sky bridge,
// observatory hairpin, canyon descent and a sweeping seaside return.
const points = [
  [0, 3, -65], [45, 3, -65], [78, 6, -48], [95, 12, -12],
  [72, 19, 15], [39, 22, 0], [18, 25, 29], [46, 27, 55],
  [83, 23, 72], [76, 15, 108], [30, 9, 119], [-6, 7, 88],
  [-35, 12, 110], [-76, 18, 95], [-100, 15, 51], [-74, 9, 19],
  [-105, 5, -12], [-84, 3, -53], [-43, 3, -65],
].map(p => new THREE.Vector3(...p as [number, number, number]));
export const course = new THREE.CatmullRomCurve3(points, true, 'centripetal');
export const courseLength = course.getLength();
const samples = course.getSpacedPoints(720);
export const shortcutStart = 0.49, shortcutEnd = 0.60;
export const shortcut = new THREE.CatmullRomCurve3([
  course.getPointAt(shortcutStart), new THREE.Vector3(16, 10.5, 116),
  new THREE.Vector3(-8, 11, 112), course.getPointAt(shortcutEnd),
]);
const shortSamples = shortcut.getSpacedPoints(90);
export const wrap = (p: number) => ((p % 1) + 1) % 1;
export function pointAt(p: number, lane = 0) {
  const point = course.getPointAt(wrap(p));
  const tangent = course.getTangentAt(wrap(p));
  return point.add(new THREE.Vector3(tangent.z, 0, -tangent.x).normalize().multiplyScalar(lane));
}
export function yawAt(p: number) { const t = course.getTangentAt(wrap(p)); return Math.atan2(t.x, t.z); }
export interface RoadPoint { progress: number; point: THREE.Vector3; distance: number; shortcut: boolean; tangent: THREE.Vector3 }
function projectRoad(position: THREE.Vector3, allowShortcut: boolean, heights?: [number, number]): RoadPoint | null {
  let best = Infinity, index = 0, fraction = 0, short = false;
  const inspect = (list: THREE.Vector3[], alternate: boolean) => {
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i], b = list[i + 1], dx = b.x - a.x, dz = b.z - a.z;
      const f = Math.max(0, Math.min(1, ((position.x - a.x) * dx + (position.z - a.z) * dz) / (dx * dx + dz * dz)));
      const distance = (position.x - a.x - dx * f) ** 2 + (position.z - a.z - dz * f) ** 2;
      const height = a.y + (b.y - a.y) * f;
      if (heights && (height < heights[0] || height > heights[1] || distance > (alternate ? 3.5 : ROAD_WIDTH / 2) ** 2)) continue;
      if (distance < best) { best = distance; index = i; fraction = f; short = alternate; }
    }
  };
  inspect(samples, false); if (allowShortcut) inspect(shortSamples, true);
  if (!Number.isFinite(best)) return null;
  const list = short ? shortSamples : samples;
  const p = (index + fraction) / (list.length - 1);
  return { progress: short ? shortcutStart + p * (shortcutEnd - shortcutStart) : wrap(p), point: list[index].clone().lerp(list[index + 1], fraction), distance: Math.sqrt(best), shortcut: short, tangent: list[index + 1].clone().sub(list[index]).normalize() };
}
// Support requires both a road beneath the kart and a compatible surface height.
export function roadSupport(position: THREE.Vector3, minHeight: number, maxHeight: number) {
  return projectRoad(position, true, [minHeight, maxHeight]);
}
export function nearestRoad(position: THREE.Vector3, allowShortcut = true): RoadPoint {
  return projectRoad(position, allowShortcut)!;
}
export const itemLocations = [0.07, 0.23, 0.39, 0.64, 0.79, 0.92].flatMap(p => [-4, 0, 4].map(lane => ({ progress: p, position: pointAt(p, lane) })));
export const boostLocations = [0.19, 0.34, 0.73, 0.88];
export const district = (p: number) => p < .18 ? 'SUNSET HARBOR' : p < .43 ? 'SKYBRIDGE SUMMIT' : p < .64 ? 'OBSERVATORY BEND' : p < .84 ? 'CRYSTAL CANYON' : 'PALM COAST';
