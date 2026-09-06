import { randomUUID } from 'node:crypto';
import type { GhostFrame, LapRecord, Player } from '@apex/shared';

export class MemoryStore {
  private records: LapRecord[] = [];
  private ghosts = new Map<string, GhostFrame[]>();
  save(player: Player, trackId: string, durationMs: number, ghost: GhostFrame[]): LapRecord {
    const record: LapRecord = { id: randomUUID(), playerId: player.id, name: player.name, color: player.color, trackId, durationMs, createdAt: new Date().toISOString(), hasGhost: ghost.length > 1 };
    this.records.push(record);
    if (record.hasGhost) this.ghosts.set(record.id, ghost);
    // Keep memory bounded: retain the best 1000 laps, with their ghost data.
    this.records.sort((a, b) => a.durationMs - b.durationMs || a.createdAt.localeCompare(b.createdAt));
    for (const removed of this.records.splice(1000)) this.ghosts.delete(removed.id);
    return record;
  }
  leaderboard(trackId: string): LapRecord[] {
    return this.records.filter(record => record.trackId === trackId).slice(0, 10);
  }
  ghost(id: string): GhostFrame[] | undefined { return this.ghosts.get(id); }
}
