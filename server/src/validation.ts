import { z } from 'zod';
import { onTrack, TRACK, trackPoint, type LapSubmission } from '@apex/shared';

const finite = z.number().finite();
export const vectorSchema = z.tuple([finite.min(-200).max(200), finite.min(-5).max(30), finite.min(-200).max(200)]);
export const lapSchema = z.object({
  runId: z.string().uuid(), trackId: z.literal(TRACK.id), lap: z.number().int().min(1).max(TRACK.laps),
  durationMs: finite.min(TRACK.minLapMs).max(TRACK.maxLapMs),
  checkpoints: z.array(z.object({ index: z.number().int(), timeMs: finite.min(0) })).length(TRACK.checkpoints),
  ghost: z.array(z.object({ t: finite.min(0), position: vectorSchema, yaw: finite.min(-1000).max(1000) })).max(4000).default([]),
});

// These checks reject implausible timing and malformed telemetry. Client physics
// is not authoritative: a determined client can still fabricate plausible laps.
export function validateLap(lap: LapSubmission, elapsedMs: number, submittedMs: number): string | null {
  let previousTime = 0;
  for (let i = 0; i < TRACK.checkpoints; i++) {
    const stamp = lap.checkpoints[i];
    if (stamp.index !== i + 1) return 'Checkpoints must be crossed in order, 1 through 8.';
    if (stamp.timeMs <= previousTime || stamp.timeMs > lap.durationMs) return 'Checkpoint timestamps must increase within the lap.';
    const a = trackPoint(i / TRACK.checkpoints);
    const b = trackPoint((i + 1) / TRACK.checkpoints);
    const minimumDistance = Math.max(1, Math.hypot(b[0] - a[0], b[2] - a[2]) - TRACK.halfWidth * 2);
    if (stamp.timeMs - previousTime < minimumDistance / (TRACK.boostSpeed + 4) * 1000) return 'Checkpoint segment is impossibly fast.';
    previousTime = stamp.timeMs;
  }
  if (Math.abs(previousTime - lap.durationMs) > 2) return 'Finish checkpoint must match the lap duration.';
  const total = submittedMs + lap.durationMs;
  if (total > elapsedMs + 1500 || total < elapsedMs - 15_000) return 'Lap duration does not match the server race clock.';
  if (lap.ghost.length) {
    if (lap.ghost.length < 2 || lap.ghost[0].t !== 0 || Math.abs(lap.ghost.at(-1)!.t - lap.durationMs) > 2) return 'Ghost must cover the entire lap.';
    for (let i = 0; i < lap.ghost.length; i++) {
      const frame = lap.ghost[i];
      if (!onTrack(frame.position[0], frame.position[2], 2) || Math.abs(frame.position[1]) > 3) return 'Ghost left the track.';
      if (frame.t > lap.durationMs) return 'Ghost timestamp is outside this lap.';
      if (i > 0) {
        const prev = lap.ghost[i - 1];
        const dt = (frame.t - prev.t) / 1000;
        if (dt <= 0) return 'Ghost timestamps must increase.';
        const distance = Math.hypot(frame.position[0] - prev.position[0], frame.position[2] - prev.position[2]);
        if (distance > (TRACK.boostSpeed + 4) * dt + 0.5) return 'Ghost exceeds the speed limit.';
      }
    }
  }
  return null;
}
