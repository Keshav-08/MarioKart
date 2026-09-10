import { CUP_TRACKS, type CourseId } from './course';
import type { Standing } from './race';
export const POINTS = [15,12,10,8,6,4,2,1];
export interface RoundResult { courseId: CourseId; standings: (Standing & { points: number; place: number })[] }
export function scoreRound(courseId: CourseId, standings: Standing[]): RoundResult {
  return { courseId, standings: standings.map((r, i) => ({ ...r, place: i + 1, points: r.finish === null ? 0 : POINTS[i] })) };
}
export function addRound(rounds: RoundResult[], round: RoundResult) {
  if (CUP_TRACKS[rounds.length] !== round.courseId) return rounds;
  return [...rounds, round];
}
export function cupStandings(rounds: RoundResult[]) {
  const racers = new Map<number, { id: number; name: string; color: string; points: number; wins: number; lastPlace: number }>();
  for (const round of rounds) for (const r of round.standings) {
    const total = racers.get(r.id) ?? { id:r.id, name:r.name, color:r.color, points:0, wins:0, lastPlace:8 };
    total.points += r.points; total.wins += r.finish !== null && r.place === 1 ? 1 : 0; total.lastPlace = r.place; racers.set(r.id,total);
  }
  return [...racers.values()].sort((a,b) => b.points-a.points || b.wins-a.wins || a.lastPlace-b.lastPlace || a.id-b.id);
}
