export const TRACK = {
  id: 'evergreen-circuit', name: 'Evergreen Circuit', radiusX: 56, radiusZ: 36,
  halfWidth: 7, checkpoints: 8, laps: 3, maxSpeed: 32, boostSpeed: 44,
  maxLapMs: 300_000, minLapMs: 5_000,
} as const;
export const COLORS = ['#e87942', '#367b63', '#638ad4', '#c584ba', '#e4bb4c'] as const;
export const TAU = Math.PI * 2;
export type Vec3 = [number, number, number];
export function trackPoint(progress: number, offset = 0): Vec3 {
  const angle = progress * TAU - Math.PI / 2;
  return [(TRACK.radiusX + offset) * Math.cos(angle), 0, (TRACK.radiusZ + offset) * Math.sin(angle)];
}
export function trackProgress(x: number, z: number): number {
  return ((Math.atan2(z / TRACK.radiusZ, x / TRACK.radiusX) + Math.PI / 2) / TAU + 1) % 1;
}
export function trackYaw(progress: number): number {
  const angle = progress * TAU - Math.PI / 2;
  return Math.atan2(-TRACK.radiusX * Math.sin(angle), TRACK.radiusZ * Math.cos(angle));
}
export function onTrack(x: number, z: number, margin = 0): boolean {
  const outer = (x / (TRACK.radiusX + TRACK.halfWidth + margin)) ** 2 + (z / (TRACK.radiusZ + TRACK.halfWidth + margin)) ** 2;
  const inner = (x / (TRACK.radiusX - TRACK.halfWidth - margin)) ** 2 + (z / (TRACK.radiusZ - TRACK.halfWidth - margin)) ** 2;
  return outer <= 1 && inner >= 1;
}
export function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  return `${Math.floor(ms / 60_000).toString().padStart(2, '0')}:${Math.floor(ms / 1000 % 60).toString().padStart(2, '0')}.${Math.floor(ms % 1000).toString().padStart(3, '0')}`;
}
export interface CheckpointStamp { index: number; timeMs: number }
export interface GhostFrame { t: number; position: Vec3; yaw: number }
export interface LapSubmission {
  runId: string; trackId: string; lap: number; durationMs: number;
  checkpoints: CheckpointStamp[]; ghost: GhostFrame[];
}
export interface LapRecord {
  id: string; playerId: string; name: string; color: string; trackId: string;
  durationMs: number; createdAt: string; hasGhost: boolean;
}
export interface Player {
  id: string; name: string; color: string; position: Vec3; rotation: Vec3;
  speed: number; lap: number; progress: number;
}
export interface RoomSnapshot { code: string; players: Player[] }
export type Ack<T> = (result: { ok: true; data: T } | { ok: false; error: string }) => void;
export interface JoinRequest { name: string; color: string; room: string; mode: 'solo' | 'public' | 'private' }
export interface ClientEvents {
  'room:join': (request: JoinRequest, ack: Ack<{ token: string; room: RoomSnapshot }>) => void;
  'race:start': (ack: Ack<{ runId: string }>) => void;
  'race:cancel': () => void;
  'kart:update': (state: Pick<Player, 'position' | 'rotation' | 'speed' | 'lap' | 'progress'>) => void;
}
export interface ServerEvents {
  'room:state': (room: RoomSnapshot) => void;
  'leaderboard:update': (records: LapRecord[]) => void;
}
