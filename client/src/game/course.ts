import * as THREE from 'three';
import { beachHeight, beachDrivable, WORLD_SCALE } from './beach';
export type CourseId = 'cloudburst' | 'neon' | 'foundry' | 'beach';
export interface CourseSpec {
  id: CourseId; name: string; subtitle: string; difficulty: string; color: string;
  points: number[][]; width: number; items: number[]; boosts: number[]; jumps: number[];
  pace: number; cornering: number; laneScale: number; racingLine: [number, number][]; sectors: string[];
}
export const CHECKPOINTS = 16, TOTAL_LAPS = 3;
export const wrap = (p: number) => ((p % 1) + 1) % 1;
export const courseSpecs: CourseSpec[] = [
  { id: 'cloudburst', name: 'Cloudburst Causeway', subtitle: 'Harbor streets. Storm flight. Crystal tunnels.', difficulty: 'Balanced · 2 / 5', color: '#a49add', width: 15,
    points: [
  [0, 3, -65], [45, 3, -65], [78, 6, -48], [95, 12, -12],
  [72, 19, 15], [39, 22, 0], [18, 25, 29], [46, 27, 55],
  [83, 23, 72], [76, 15, 108], [30, 9, 119], [-6, 7, 88],
  [-35, 12, 110], [-76, 18, 95], [-100, 15, 51], [-74, 9, 19],
  [-105, 5, -12], [-84, 3, -53], [-43, 3, -65],
], items: [.07,.23,.39,.64,.79,.92], boosts: [.19,.34,.73,.88], jumps: [.34], pace: 0, cornering: 24, laneScale: 1, racingLine: [[0,0],[.2,1],[.27,-1],[.34,0],[.45,1],[.64,-1],[.83,0],[1,0]],
    sectors: ['SUNSET HARBOR','SKYBRIDGE SUMMIT','OBSERVATORY BEND','CRYSTAL CANYON','PALM COAST'] },
  { id: 'neon', name: 'Neon Night Market', subtitle: 'Market traffic. Rooftop flight. Arcade tunnels.', difficulty: 'Technical · 4 / 5', color: '#f069d4', width: 14,
    points: [[0,3,-80],[55,3,-80],[84,3,-60],[84,3,-20],[56,3,4],[23,3,-10],[-5,3,8],[12,3,36],[58,3,37],[85,3,65],[65,3,98],[15,3,100],[-20,3,73],[-57,3,89],[-91,3,62],[-88,3,18],[-56,3,-7],[-81,3,-42],[-62,3,-77],[-25,3,-80]],
    items: [.06,.21,.38,.57,.74,.92], boosts: [.10,.46,.66,.94], jumps: [], pace: -3, cornering: 28, laneScale: .65, racingLine: [[0,0],[.12,1],[.19,-1.3],[.26,.6],[.34,-.8],[.46,0],[.58,1],[.65,-1],[.76,.8],[.88,-1],[1,0]],
    sectors: ['LANTERN MILE','NOODLE ALLEY','MIDNIGHT PLAZA','ARCADE ROW','AFTER HOURS'] },
  { id: 'foundry', name: 'Stormwater Foundry', subtitle: 'Steam vents. Turbine flight. Furnace tunnels.', difficulty: 'Fast · 3 / 5', color: '#58c9d6', width: 17,
    points: [[0,7,-85],[60,7,-85],[102,12,-58],[110,18,-5],[88,20,41],[51,15,71],[65,12,113],[24,9,139],[-29,7,125],[-55,9,85],[-91,14,64],[-116,19,21],[-105,16,-31],[-64,10,-74],[-25,7,-85]],
    items: [.05,.22,.42,.59,.78,.93], boosts: [.10,.30,.52,.83], jumps: [.30], pace: 2, cornering: 24, laneScale: .9, racingLine: [[0,0],[.17,1.4],[.24,-1.2],[.30,0],[.43,1],[.55,-1],[.7,.8],[.84,-1],[1,0]],
    sectors: ['THE DOCKS','TURBINE RUN','SPILLWAY','COOLING CANAL','FURNACE STRAIGHT'] },
  { id:'beach', name:'Sunset Sands', subtitle:'Tide caves. Canyon flight. Hovercraft inlet.', difficulty:'Open beach · 2 / 5',color:'#efa951',width:22,
    points:[[0,3,-65],[53,3,-63],[95,3,-30],[103,3,19],[78,3,58],[50,3,87],[13,3,111],[-36,3,108],[-82,3,81],[-105,3,38],[-96,3,-10],[-65,3,-52],[-25,3,-66]],
    items:[.05,.20,.36,.53,.70,.88],boosts:[.10,.27,.56,.76],jumps:[.27,.76],pace:0,cornering:24,laneScale:1.2,
    racingLine:[[0,0],[.2,1],[.35,-1],[.5,0],[.7,1],[.85,-1],[1,0]],
    sectors:['SUNSET BOARDWALK','PALM COVE','DUNE RUN','TIDAL FLATS','SURF SHACKS'] },
];
function createCourse(spec: CourseSpec) {
  const ROAD_WIDTH = spec.width;
const course = new THREE.CatmullRomCurve3(spec.points.map(p => new THREE.Vector3(p[0]*WORLD_SCALE,p[1],p[2]*WORLD_SCALE)), true, 'centripetal');
const courseLength = course.getLength();
const samples = course.getSpacedPoints(720);
const shortcutStart = .49, shortcutEnd = .60;
const shortcut = new THREE.CatmullRomCurve3([
  course.getPointAt(shortcutStart), new THREE.Vector3(16*WORLD_SCALE, 10.5, 116*WORLD_SCALE),
  new THREE.Vector3(-8*WORLD_SCALE, 11, 112*WORLD_SCALE), course.getPointAt(shortcutEnd),
]);
const shortSamples = shortcut.getSpacedPoints(90);

function pointAt(p: number, lane = 0) {
  const point = course.getPointAt(wrap(p));
  const tangent = course.getTangentAt(wrap(p));
  point.add(new THREE.Vector3(tangent.z, 0, -tangent.x).normalize().multiplyScalar(lane));
  if (spec.id === 'beach') point.y = beachHeight(point.x,point.z);
  return point;
}
function yawAt(p: number) { const t = course.getTangentAt(wrap(p)); return Math.atan2(t.x, t.z); }
interface RoadPoint { progress: number; point: THREE.Vector3; distance: number; shortcut: boolean; tangent: THREE.Vector3 }
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
  inspect(samples, false); if (allowShortcut) inspect(spec.id === 'cloudburst' ? shortSamples : [], true);
  if (!Number.isFinite(best)) return null;
  const list = short ? shortSamples : samples;
  const p = (index + fraction) / (list.length - 1);
  return { progress: short ? shortcutStart + p * (shortcutEnd - shortcutStart) : wrap(p), point: list[index].clone().lerp(list[index + 1], fraction), distance: Math.sqrt(best), shortcut: short, tangent: list[index + 1].clone().sub(list[index]).normalize() };
}
// Support requires both a road beneath the kart and a compatible surface height.
function roadSupport(position: THREE.Vector3, minHeight: number, maxHeight: number) {
  if (spec.id === 'beach') {
    const y = beachHeight(position.x,position.z);
    if (!beachDrivable(position.x,position.z) || y < minHeight || y > maxHeight) return null;
    const road = projectRoad(position,false)!;
    const t = road.tangent, epsilon=.2;
    const slope = (beachHeight(position.x+t.x*epsilon,position.z+t.z*epsilon)-beachHeight(position.x-t.x*epsilon,position.z-t.z*epsilon))/(2*epsilon);
    return {...road, point:new THREE.Vector3(position.x,y,position.z), tangent:new THREE.Vector3(t.x,slope,t.z).normalize()};
  }
  return projectRoad(position, true, [minHeight, maxHeight]);
}
function nearestRoad(position: THREE.Vector3, allowShortcut = true): RoadPoint {
  return projectRoad(position, allowShortcut)!;
}
  const racingLane = (progress: number) => {
    const p = wrap(progress), line = spec.racingLine;
    const index = Math.max(0, line.findIndex((anchor, i) => i < line.length - 1 && p >= anchor[0] && p <= line[i+1][0]));
    const [a,b] = [line[index],line[index+1]];
    return THREE.MathUtils.lerp(a[1], b[1], (p-a[0])/(b[0]-a[0]));
  };
  const itemLocations = spec.items.flatMap(p => [-spec.width * .27, 0, spec.width * .27].map(lane => ({progress: p, position: pointAt(p, lane)})));
  const district = (p: number) => spec.sectors[Math.min(4, Math.floor(wrap(p) * 5))];
  return { ...spec, racingLane, course, courseLength, ROAD_WIDTH, pointAt, yawAt, nearestRoad, roadSupport, itemLocations, boostLocations: spec.boosts, shortcut, shortcutStart, shortcutEnd, hasShortcut: spec.id === 'cloudburst', district };
}
export type RaceCourse = ReturnType<typeof createCourse>;
export const COURSES = Object.fromEntries(courseSpecs.map(spec => [spec.id, createCourse(spec)])) as Record<CourseId, RaceCourse>;
export const ALL_TRACKS: CourseId[] = ['cloudburst','neon','foundry','beach'];
export const CUP_TRACKS: CourseId[] = ['cloudburst','neon','foundry'];
// Compatibility exports for the original course and existing tests.
export const { course, courseLength, ROAD_WIDTH, pointAt, yawAt, nearestRoad, roadSupport, itemLocations, boostLocations, shortcut, shortcutStart, shortcutEnd, district } = COURSES.cloudburst;
export const COURSE_NAME = COURSES.cloudburst.name;
