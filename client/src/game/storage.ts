import type { CourseId } from './course';
import type { Difficulty, RaceSnapshot } from './race';
import type { GhostFrame } from '../components/GameCanvas';
export interface RaceRecord { courseId: CourseId; id: string; name: string; time: number; position: number; difficulty: Difficulty; laps: number[]; date: string }
const keys = (courseId: CourseId) => ({ records: `apex.${courseId}.records.v1`, ghost: `apex.${courseId}.ghost.v1` });
export function loadRecords(courseId: CourseId = 'cloudburst'): RaceRecord[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(keys(courseId).records) ?? '[]');
    if (!Array.isArray(data)) return [];
    return data.filter((r): r is RaceRecord => !!r && (r.courseId === courseId || (courseId === 'cloudburst' && r.courseId === undefined)) && typeof r.id === 'string' && typeof r.name === 'string' && Number.isFinite(r.time) && r.time > 0 && r.time < 3600 && Number.isInteger(r.position) && r.position >= 1 && r.position <= 8 && ['easy', 'normal', 'hard'].includes(r.difficulty) && Array.isArray(r.laps) && r.laps.length === 3 && r.laps.every((n: unknown) => typeof n === 'number' && Number.isFinite(n) && n > 0)).slice(0, 10).map(r => ({ ...r, courseId }));
  } catch { return []; }
}
export function loadGhost(courseId: CourseId = 'cloudburst'): GhostFrame[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(keys(courseId).ghost) ?? '[]');
    if (!Array.isArray(data) || data.length < 2 || data.length > 18000) return [];
    if (!data.every((f, i) => f && ['t', 'x', 'y', 'z', 'yaw'].every(k => typeof f[k] === 'number' && Number.isFinite(f[k])) && f.t >= 0 && (i === 0 || f.t > data[i - 1].t))) return [];
    return data;
  } catch { return []; }
}
export function saveRace(name: string, difficulty: Difficulty, snapshot: RaceSnapshot, ghost: GhostFrame[], courseId: CourseId = 'cloudburst') {
  const time = snapshot.standings.find(r => r.id === 0)!.finish!;
  const previous = loadRecords(courseId);
  const record: RaceRecord = { courseId, id: crypto.randomUUID(), name, difficulty, time, position: snapshot.position, laps: snapshot.laps, date: new Date().toISOString() };
  const records = [...previous, record].sort((a, b) => a.time - b.time).slice(0, 10);
  localStorage.setItem(keys(courseId).records, JSON.stringify(records));
  if (!previous.length || time < previous[0].time) {
    const clean = ghost.filter((f, i) => i === 0 || f.t > ghost[i - 1].t);
    localStorage.setItem(keys(courseId).ghost, JSON.stringify(clean));
  }
  return records;
}
