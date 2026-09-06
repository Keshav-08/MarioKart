import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Race, ITEMS, type DriveInput } from '../src/game/race';
import { courseLength, nearestRoad, roadSupport, pointAt, shortcut, shortcutEnd, shortcutStart, yawAt } from '../src/game/course';
const idle: DriveInput = { throttle: 0, steer: 0, drift: false, useItem: false };
function drive(race: Race): DriveInput {
  const r = race.racers[0], p = ((r.progress % 1) + 1) % 1;
  const target = pointAt(p + Math.max(10, r.speed * .45) / courseLength, -1);
  const heading = Math.atan2(target.x - r.body.position.x, target.z - r.body.position.z);
  const error = Math.atan2(Math.sin(heading - r.yaw), Math.cos(heading - r.yaw));
  const curve = Math.abs(Math.atan2(Math.sin(yawAt(p + 18 / courseLength) - yawAt(p)), Math.cos(yawAt(p + 18 / courseLength) - yawAt(p))));
  return { throttle: r.speed > Math.max(15, 36 - curve * 16) + 2 ? -.45 : 1, steer: THREE.MathUtils.clamp(error * 2.8, -1, 1), drift: false, useItem: !!r.item && r.itemAge > 2 };
}
test('course is elevated, closed, and the shortcut is shorter than the bypass', () => {
  assert.ok(courseLength > 700); assert.ok(pointAt(0).distanceTo(pointAt(1)) < .001);
  assert.ok(pointAt(.3).y > pointAt(0).y + 10);
  assert.ok(shortcut.getLength() < (shortcutEnd - shortcutStart) * courseLength);
  for (const p of [0, .1, .3, .7, .9]) assert.ok(nearestRoad(pointAt(p), false).distance < .01);
});
test('inventory, shields, hits, boosts, traps and recovery have real effects', () => {
  const race = new Race('normal', 'Test', '#ff9900'), p = race.racers[0];
  p.item = 'turbo'; race.useItem(p); assert.equal(p.item, null); assert.equal(p.boost, 3);
  p.item = 'shield'; race.useItem(p); race.hit(p); assert.equal(p.stun, 0); assert.equal(p.shield, 0);
  p.immunity = 0; race.hit(p); assert.ok(p.stun > 0); assert.equal(p.boost, 0);
  p.stun = 0; p.item = 'trap'; race.useItem(p); assert.equal(race.projectiles[0].type, 'trap');
  p.item = 'rocket'; race.useItem(p); assert.equal(race.projectiles[1].type, 'rocket');
  p.body.position.set(2000, 100, 2000); race.recover(p); assert.equal(p.motion, 'rescuing');
  race.started = true; for (let i = 0; i < 84; i++) race.step(1 / 60, idle);
  assert.ok(nearestRoad(new THREE.Vector3(...p.body.position.toArray())).distance < 4);
  assert.equal(p.gate, -1); assert.equal(p.finish, null);
  assert.equal(Object.keys(ITEMS).length, 4); race.dispose();
});
test('standing still cannot complete a lap; item boxes have shared respawn timers', () => {
  const race = new Race('easy', 'Test', '#ff9900'); race.started = true;
  for (let i = 0; i < 180; i++) race.step(1 / 60, idle);
  assert.equal(race.racers[0].lapTimes.length, 0);
  const p = race.racers[0], box = race.boxes[6]; p.item = null; p.body.position.set(box.position.x, box.position.y + 1, box.position.z);
  race.step(1 / 60, idle); assert.ok(p.item); assert.ok(box.cooldown > 4);
  const gate = p.gate; p.body.position.copy(race.racers[1].body.position); race.step(1 / 60, idle); assert.ok(p.gate <= gate + 1);
  race.dispose();
});
test('all eight racers can complete three laps with steering, combat and collisions', { timeout: 120000 }, () => {
  const race = new Race('normal', 'Test driver', '#ff9900'); race.started = true;
  const stats: Record<string, number> = {};
  for (let i = 0; i < 60 * 220 && !race.complete; i++) {
    race.step(1 / 60, drive(race));
    for (const event of race.events.splice(0)) stats[event.type] = (stats[event.type] ?? 0) + 1;
  }
  console.log('Race simulation:', race.racers.map(r => ({ name: r.name, laps: r.lapTimes.length, time: r.finish, progress: r.progress, gate: r.gate })), stats);
  assert.ok(race.racers[0].finish !== null, 'human-controlled steering path completes the race');
  assert.ok(race.racers.every(r => r.finish !== null), 'all seven bots cross the real finish line');
  assert.ok(race.racers.every(r => r.lapTimes.length === 3));
  assert.ok(stats.pickup > 10); assert.ok(stats.launch > 1); assert.ok(stats.hit > 0);
  const order = race.order(); assert.ok(order.every((r, i) => i === 0 || r.finish! >= order[i - 1].finish!));
  race.dispose();
});

test('leaving an elevated edge falls under gravity without lateral magnetism, then rescues safely', () => {
  const race = new Race('easy', 'Test', '#ff9900'); race.started = true;
  const r = race.racers[0], edge = pointAt(.27, 11);
  r.gate = 4; r.progress = .27; r.previous = .27;
  r.body.position.set(edge.x, edge.y + 1, edge.z); r.body.velocity.set(4, 0, 0);
  const initialY = r.body.position.y, gate = r.gate;
  for (let i = 0; i < 20; i++) race.step(1 / 60, idle);
  assert.equal(r.motion, 'falling'); assert.ok(r.body.position.y < initialY - 1);
  assert.ok(Math.abs(r.body.velocity.x - 4) < .01, 'horizontal momentum is preserved');
  assert.equal(r.gate, gate, 'falling cannot earn checkpoints');
  while (r.motion !== 'rescuing' && race.time < 4) race.step(1 / 60, idle);
  assert.equal(r.motion, 'rescuing'); const from = r.body.position.clone();
  race.step(1 / 60, idle); assert.ok(r.body.position.distanceTo(from) < 2, 'rescue starts smoothly');
  for (let i = 0; i < 90; i++) race.step(1 / 60, idle);
  assert.equal(r.motion, 'grounded'); assert.equal(r.gate, gate); assert.ok(r.immunity > 0);
  assert.ok(nearestRoad(new THREE.Vector3(...r.body.position.toArray())).distance < 4);
  race.dispose();
});
test('support rejects roads above or below the kart; a descending kart lands on the deck', () => {
  const position = pointAt(.1);
  assert.equal(roadSupport(position, position.y + 8, position.y + 10), null);
  assert.equal(roadSupport(pointAt(.1, 11), position.y - .1, position.y + .1), null);
  const race = new Race('easy', 'Test', '#ff9900'); race.started = true;
  const r = race.racers[0]; r.body.position.set(position.x, position.y + 6, position.z);
  r.motion = 'falling'; r.departureHeight = r.body.position.y; r.body.velocity.set(0, -3, 0);
  for (let i = 0; i < 45; i++) race.step(1 / 60, idle);
  assert.equal(r.motion, 'grounded'); assert.ok(Math.abs(r.body.position.y - position.y - 1) < .1);
  race.dispose();
});
test('jump pads launch a ballistic hop and land without rescue', () => {
  const race = new Race('easy', 'Test', '#ff9900'); race.started = true;
  const r = race.racers[0], p = .34, at = pointAt(p);
  r.body.position.set(at.x, at.y + 1, at.z); r.progress = p; r.previous = p; r.yaw = yawAt(p);
  race.step(1 / 60, idle); assert.equal(r.motion, 'airborne'); assert.ok(r.body.velocity.y > 0);
  let peak = r.body.position.y;
  for (let i = 0; i < 70; i++) { race.step(1 / 60, idle); peak = Math.max(peak, r.body.position.y); }
  assert.ok(peak > at.y + 3); assert.equal(r.motion, 'grounded');
  assert.equal(race.events.filter(e => e.type === 'recover' && e.text).length, 0);
  race.dispose();
});

test('low track falls trigger rescue at island level instead of passing through the island', () => {
  const race = new Race('easy', 'Test', '#ff9900'); race.started = true;
  const r = race.racers[0], at = pointAt(.03, 11);
  r.body.position.set(at.x, at.y + 1, at.z);
  for (let i = 0; i < 120 && r.motion !== 'rescuing'; i++) race.step(1 / 60, idle);
  assert.equal(r.motion, 'rescuing'); assert.ok(r.body.position.y > .5);
  race.dispose();
});
