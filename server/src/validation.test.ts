import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TRACK, trackPoint, trackYaw, type LapSubmission } from '@apex/shared';
import { lapSchema, validateLap } from './validation.js';

function validLap(): LapSubmission {
  return { runId: randomUUID(), trackId: TRACK.id, lap: 1, durationMs: 20_000,
    checkpoints: Array.from({ length: 8 }, (_, i) => ({ index: i + 1, timeMs: (i + 1) * 2500 })),
    ghost: Array.from({ length: 201 }, (_, i) => ({ t: i * 100, position: trackPoint(i / 200), yaw: trackYaw(i / 200) })),
  };
}
test('accepts a plausible complete lap and its ghost', () => {
  const lap = lapSchema.parse(validLap());
  assert.equal(validateLap(lap, 20_100, 0), null);
});
test('requires all eight sequential checkpoints', () => {
  const missing = validLap(); missing.checkpoints.pop();
  assert.equal(lapSchema.safeParse(missing).success, false);
  const swapped = validLap(); [swapped.checkpoints[0], swapped.checkpoints[1]] = [swapped.checkpoints[1], swapped.checkpoints[0]];
  assert.match(validateLap(swapped, 20_000, 0)!, /in order/);
});
test('rejects repeated, decreasing and impossible segment timestamps', () => {
  const repeated = validLap(); repeated.checkpoints[1].timeMs = 2500;
  assert.match(validateLap(repeated, 20_000, 0)!, /increase/);
  const fast = validLap(); fast.checkpoints[0].timeMs = 1;
  assert.match(validateLap(fast, 20_000, 0)!, /impossibly fast/);
  const finish = validLap(); finish.checkpoints[7].timeMs -= 100;
  assert.match(validateLap(finish, 20_000, 0)!, /Finish checkpoint/);
});
test('rejects fabricated or stale durations against the cumulative server clock', () => {
  assert.match(validateLap(validLap(), 1000, 0)!, /server race clock/);
  assert.match(validateLap(validLap(), 40_000, 0)!, /server race clock/);
  assert.equal(validateLap(validLap(), 40_100, 20_000), null);
});
test('rejects malformed numbers, wrong tracks and oversized ghosts', () => {
  for (const durationMs of [NaN, Infinity, -1, 1_000_000]) assert.equal(lapSchema.safeParse({ ...validLap(), durationMs }).success, false);
  assert.equal(lapSchema.safeParse({ ...validLap(), trackId: 'unknown' }).success, false);
  assert.equal(lapSchema.safeParse({ ...validLap(), ghost: Array(4001).fill({ t: 0, position: [0, 0, 0], yaw: 0 }) }).success, false);
});
test('rejects off-track, teleporting and non-monotonic ghosts', () => {
  const offTrack = validLap(); offTrack.ghost[10].position = [0, 0, 0];
  assert.match(validateLap(offTrack, 20_000, 0)!, /left the track/);
  const teleport = validLap(); teleport.ghost[10].position = trackPoint(0.5);
  assert.match(validateLap(teleport, 20_000, 0)!, /speed limit/);
  const duplicate = validLap(); duplicate.ghost[10].t = duplicate.ghost[9].t;
  assert.match(validateLap(duplicate, 20_000, 0)!, /timestamps must increase/);
  const incomplete = validLap(); incomplete.ghost.pop();
  assert.match(validateLap(incomplete, 20_000, 0)!, /entire lap/);
});
