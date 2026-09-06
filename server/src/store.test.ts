import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLORS, TRACK, type Player } from '@apex/shared';
import { MemoryStore } from './store.js';

test('leaderboard sorts the top ten and eviction removes the corresponding ghost', () => {
  const store = new MemoryStore();
  const player: Player = { id: 'racer', name: 'Test racer', color: COLORS[0], position: [0, 0, -36], rotation: [0, 0, 0], speed: 0, lap: 1, progress: 0 };
  const slowest = store.save(player, TRACK.id, 50_000, [{ t: 0, position: [0, 0, -36], yaw: 0 }, { t: 50_000, position: [0, 0, -36], yaw: 0 }]);
  for (let i = 1000; i > 0; i--) store.save(player, TRACK.id, 10_000 + i, []);
  assert.equal(store.leaderboard(TRACK.id).length, 10);
  assert.equal(store.leaderboard(TRACK.id)[0].durationMs, 10_001);
  assert.equal(store.leaderboard(TRACK.id)[9].durationMs, 10_010);
  assert.equal(store.ghost(slowest.id), undefined);
  assert.deepEqual(store.leaderboard('unknown'), []);
});
