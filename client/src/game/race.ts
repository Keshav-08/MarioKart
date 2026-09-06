import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { boostLocations, CHECKPOINTS, course, courseLength, itemLocations, nearestRoad, roadSupport, pointAt, ROAD_WIDTH, shortcut, shortcutEnd, shortcutStart, TOTAL_LAPS, wrap, yawAt } from './course';

export type Item = 'turbo' | 'rocket' | 'shield' | 'trap';
export type Difficulty = 'easy' | 'normal' | 'hard';
export const ITEMS: Record<Item, { name: string; icon: string; description: string; color: string }> = {
  turbo: { name: 'Triple-charge turbo', icon: '⚡', description: 'A three-second burst of speed. Cut through the shortcut.', color: '#ffcc51' },
  rocket: { name: 'Comet rocket', icon: '➤', description: 'Homes toward the nearest racer ahead. Shields block it.', color: '#ff765f' },
  shield: { name: 'Bubble shield', icon: '◉', description: 'Blocks attacks and traps for six seconds.', color: '#79e5fa' },
  trap: { name: 'Jelly slick', icon: '✦', description: 'Drop a slippery surprise behind your kart.', color: '#d9a1ff' },
};
export const BOT_PROFILES = [
  { name: 'Mochi', color: '#eb8bbf' }, { name: 'Blaze', color: '#ff6849' },
  { name: 'Orbit', color: '#7871e8' }, { name: 'Clover', color: '#59b991' },
  { name: 'Ziggy', color: '#edc84d' }, { name: 'Pixel', color: '#55bce3' },
  { name: 'Rumble', color: '#ba917a' },
];
export interface DriveInput { throttle: number; steer: number; drift: boolean; useItem: boolean }
export type MotionState = 'grounded' | 'airborne' | 'falling' | 'rescuing';
export interface Racer {
  id: number; name: string; color: string; body: CANNON.Body; yaw: number;
  progress: number; previous: number; gate: number; lapTimes: number[]; lapBegin: number;
  finish: number | null; item: Item | null; itemAge: number; shield: number; boost: number;
  stun: number; immunity: number; drift: number; drifting: boolean; speed: number;
  motion: MotionState; airTime: number; departureHeight: number; rescueTime: number; rescueFrom: THREE.Vector3; rescueTo: THREE.Vector3;
  stuck: number; lane: number; shortRoute: boolean; padCooldown: number;
}
export interface Projectile { id: number; owner: number; target: number | null; position: THREE.Vector3; velocity: THREE.Vector3; life: number; type: 'rocket' | 'trap' }
export interface RaceEvent { type: 'pickup' | 'boost' | 'hit' | 'shield' | 'lap' | 'finish' | 'launch' | 'recover'; position: THREE.Vector3; color: string; text?: string }
export interface Standing { id: number; name: string; color: string; lap: number; finish: number | null; progress: number }
export interface RaceSnapshot {
  motion: MotionState; time: number; speed: number; yaw: number; x: number; z: number; lap: number; lapTime: number; laps: number[]; position: number;
  item: Item | null; charge: number; boost: number; shield: number; stun: number;
  progress: number; standings: Standing[]; finished: boolean; complete: boolean;
}
const angle = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));
const clamp = THREE.MathUtils.clamp;
const vector = (r: Racer) => new THREE.Vector3(r.body.position.x, r.body.position.y, r.body.position.z);

export class Race {
  // Cannon resolves kart contacts; vertical gravity/support is integrated below for arcade handling.
  world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, 0) });
  racers: Racer[] = [];
  projectiles: Projectile[] = [];
  boxes = itemLocations.map(location => ({ ...location, cooldown: 0 }));
  events: RaceEvent[] = [];
  time = 0;
  started = false;
  complete = false;
  private serial = 0;
  private seed = 9137;
  constructor(public difficulty: Difficulty, name: string, color: string) {
    this.world.defaultContactMaterial.friction = 0;
    this.world.defaultContactMaterial.restitution = .45;
    const profiles = [{ name, color }, ...BOT_PROFILES];
    profiles.forEach((profile, id) => {
      const row = id === 0 ? 3 : Math.floor((id - 1) / 2);
      const lane = (id % 2 ? -1 : 1) * 2.4;
      const progress = -(row * 4.8 + 5) / courseLength;
      const position = pointAt(progress, lane);
      const body = new CANNON.Body({ mass: 100, shape: new CANNON.Sphere(1.05), position: new CANNON.Vec3(position.x, position.y + 1, position.z), fixedRotation: true, linearDamping: 0 });
      this.world.addBody(body);
      this.racers.push({ ...profile, id, body, yaw: yawAt(progress), progress, previous: wrap(progress), gate: -1, lapTimes: [], lapBegin: 0, finish: null, item: null, itemAge: 0, shield: 0, boost: 0, stun: 0, immunity: 0, drift: 0, drifting: false, speed: 0, motion: 'grounded', airTime: 0, departureHeight: position.y, rescueTime: 0, rescueFrom: position.clone(), rescueTo: position.clone(), stuck: 0, lane, shortRoute: false, padCooldown: 0 });
    });
  }
  private random() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  order() { return [...this.racers].sort((a, b) => a.finish !== null && b.finish !== null ? a.finish - b.finish : a.finish !== null ? -1 : b.finish !== null ? 1 : b.progress - a.progress); }
  award(racer: Racer) {
    const rank = this.order().findIndex(r => r.id === racer.id);
    const bag: Item[] = rank > 3 ? ['turbo', 'turbo', 'rocket', 'rocket', 'shield'] : ['turbo', 'rocket', 'shield', 'trap', 'trap'];
    racer.item = bag[Math.floor(this.random() * bag.length)]; racer.itemAge = 0;
    this.events.push({ type: 'pickup', position: vector(racer), color: ITEMS[racer.item].color });
  }
  useItem(racer: Racer) {
    if (racer.motion === 'rescuing' || !racer.item || racer.stun > 0 || racer.finish !== null) return;
    const item = racer.item; racer.item = null;
    if (item === 'turbo') { racer.boost = 3; this.events.push({ type: 'boost', position: vector(racer), color: '#ffd967' }); }
    if (item === 'shield') { racer.shield = 6; this.events.push({ type: 'shield', position: vector(racer), color: '#8eeeff' }); }
    if (item === 'rocket' || item === 'trap') {
      const ahead = this.order().filter(r => r.id !== racer.id && r.progress > racer.progress && r.finish === null).sort((a, b) => a.progress - b.progress)[0];
      const forward = new THREE.Vector3(Math.sin(racer.yaw), 0, Math.cos(racer.yaw));
      this.projectiles.push({ id: this.serial++, owner: racer.id, target: item === 'rocket' ? ahead?.id ?? null : null, position: vector(racer).addScaledVector(forward, item === 'trap' ? -3.3 : 2.5), velocity: forward.multiplyScalar(62), life: item === 'trap' ? 18 : 6, type: item });
      this.events.push({ type: 'launch', position: vector(racer), color: ITEMS[item].color });
    }
  }
  hit(racer: Racer) {
    if (racer.motion === 'rescuing' || racer.immunity > 0 || racer.finish !== null) return;
    if (racer.shield > 0) { racer.shield = 0; racer.immunity = 1; this.events.push({ type: 'shield', position: vector(racer), color: '#a2faff', text: 'BLOCKED!' }); return; }
    racer.stun = 1.15; racer.boost = 0; racer.drift = 0; racer.immunity = 2.2;
    racer.body.velocity.x *= .25; racer.body.velocity.z *= .25;
    this.events.push({ type: 'hit', position: vector(racer), color: '#ffa17d', text: racer.id === 0 ? 'HIT! Get back on the throttle' : undefined });
  }
  recover(racer: Racer) {
    if (racer.motion === 'rescuing') return;
    const progress = racer.gate < 0 ? -.003 : racer.gate / CHECKPOINTS + .002;
    racer.rescueFrom.copy(vector(racer)); racer.rescueTo.copy(pointAt(progress, clamp(racer.lane, -3, 3))).y += 1;
    racer.motion = 'rescuing'; racer.rescueTime = 0; racer.body.collisionFilterMask = 0;
    racer.body.velocity.set(0, 0, 0); racer.boost = 0; racer.drift = 0; racer.drifting = false;
    racer.stuck = 0; racer.stun = 0; racer.shortRoute = false;
    this.events.push({ type: 'recover', position: vector(racer), color: '#acf4ff', text: racer.id === 0 ? 'RESCUE • RETURNING TO TRACK' : undefined });
  }
  private rescueStep(racer: Racer, dt: number) {
    racer.rescueTime += dt;
    const returnProgress = racer.gate < 0 ? -.003 : racer.gate / CHECKPOINTS + .002;
    racer.yaw += angle(yawAt(returnProgress) - racer.yaw) * (1 - Math.exp(-6 * dt));
    const t = Math.min(1, racer.rescueTime / 1.4), ease = t * t * (3 - 2 * t);
    const point = racer.rescueFrom.clone().lerp(racer.rescueTo, ease); point.y += Math.sin(t * Math.PI) * 8;
    racer.body.position.set(point.x, point.y, point.z); racer.body.velocity.set(0, 0, 0); racer.speed = 0;
    if (t === 1) {
      const progress = racer.gate < 0 ? -.003 : racer.gate / CHECKPOINTS + .002;
      racer.yaw = yawAt(progress); racer.previous = wrap(progress); racer.progress = progress;
      racer.motion = 'grounded'; racer.airTime = 0; racer.immunity = 2; racer.padCooldown = 1;
      racer.body.collisionFilterMask = -1;
      this.events.push({ type: 'recover', position: point, color: '#acf4ff', text: racer.id === 0 ? 'BACK ON TRACK' : undefined });
    }
  }
  private ai(racer: Racer): DriveInput {
    const p = wrap(racer.progress);
    const neighbors = this.racers.filter(r => r.id !== racer.id && r.progress > racer.progress && (r.progress - racer.progress) * courseLength < 13);
    const preferred = neighbors.length ? (neighbors[0].lane > 0 ? -3.5 : 3.5) : Math.sin(this.time * .35 + racer.id * 2.1) * 2.7;
    racer.lane += (preferred - racer.lane) * .035;
    if (p > shortcutStart - .012 && p < shortcutStart && racer.boost > 0) racer.shortRoute = true;
    if (p > shortcutEnd + .008 || p < shortcutStart - .02) racer.shortRoute = false;
    const target = racer.shortRoute ? shortcut.getPointAt(clamp((p - shortcutStart) / (shortcutEnd - shortcutStart) + .13, 0, 1)) : pointAt(p + Math.max(7, racer.speed * .32) / courseLength, racer.lane);
    const error = angle(Math.atan2(target.x - racer.body.position.x, target.z - racer.body.position.z) - racer.yaw);
    const bend = Math.abs(angle(yawAt(p + 18 / courseLength) - yawAt(p)));
    const level = { easy: 29, normal: 34, hard: 39 }[this.difficulty];
    const targetSpeed = p > .315 && p < .37 ? 24 : Math.max(14, level - bend * 24) + (racer.boost > 0 ? 10 * Math.max(0, 1 - bend * 2) : 0);
    const useItem = !!racer.item && racer.itemAge > 1.5 + racer.id * .24 && (racer.item !== 'turbo' || bend < .25) && (racer.item !== 'trap' || this.racers.some(r => r.id !== racer.id && racer.progress > r.progress && racer.progress - r.progress < .05));
    return { throttle: racer.speed > targetSpeed + 2 ? -.45 : 1, steer: clamp(error * 2.8, -1, 1), drift: bend > .34 && Math.abs(error) > .12 && racer.speed > 16, useItem };
  }
  step(dt: number, input: DriveInput) {
    if (!this.started || this.complete) return;
    this.time += dt;
    for (const box of this.boxes) box.cooldown = Math.max(0, box.cooldown - dt);
    for (const racer of this.racers) {
      if (racer.motion === 'rescuing') { this.rescueStep(racer, dt); continue; }
      for (const key of ['boost', 'shield', 'stun', 'immunity', 'padCooldown'] as const) racer[key] = Math.max(0, racer[key] - dt);
      racer.itemAge += dt;
      const controls = racer.id === 0 && racer.finish === null ? input : this.ai(racer);
      if (controls.useItem) this.useItem(racer);
      const support = roadSupport(vector(racer), racer.body.position.y - 1.8, racer.body.position.y - .2);
      const road = support ?? nearestRoad(vector(racer));
      if (racer.motion === 'grounded' && !support) {
        racer.motion = 'airborne'; racer.airTime = 0; racer.departureHeight = racer.body.position.y;
        racer.drift = 0; racer.drifting = false;
      }
      if (racer.motion !== 'grounded') {
        racer.airTime += dt; racer.drift = 0; racer.drifting = false;
        // Limited air steering changes heading, but cannot pull the kart back onto the road.
        const airTurn = controls.steer * .45 * dt;
        racer.yaw += airTurn;
        const vx = racer.body.velocity.x, vz = racer.body.velocity.z;
        racer.body.velocity.x = vx * Math.cos(airTurn) + vz * Math.sin(airTurn);
        racer.body.velocity.z = vz * Math.cos(airTurn) - vx * Math.sin(airTurn);
        racer.body.velocity.y -= 28 * dt;
        racer.motion = racer.body.velocity.y < 0 && !roadSupport(vector(racer), -Infinity, racer.body.position.y - .98) ? 'falling' : 'airborne';
        if (racer.body.position.y <= 1 || racer.body.position.y < racer.departureHeight - 14 || racer.airTime > 2.5) this.recover(racer);
        continue;
      }
      const offroad = road.distance > (road.shortcut ? 3.3 : ROAD_WIDTH / 2) || (road.shortcut && racer.boost <= 0);
      const drifting = controls.drift && Math.abs(controls.steer) > .1 && racer.speed > 9 && racer.stun <= 0;
      if (drifting) racer.drift = Math.min(1, racer.drift + dt / 1.25);
      if (!drifting && racer.drifting) { if (!controls.drift && racer.drift >= .4 && racer.stun <= 0) { racer.boost = Math.max(racer.boost, .7 + racer.drift); this.events.push({ type: 'boost', position: vector(racer), color: '#ffd967' }); } racer.drift = 0; }
      racer.drifting = drifting;
      const forwardSpeed = racer.body.velocity.x * Math.sin(racer.yaw) + racer.body.velocity.z * Math.cos(racer.yaw);
      if (racer.stun <= 0) racer.yaw += controls.steer * (drifting ? 2.4 : 2.05) * Math.min(1, Math.abs(forwardSpeed) / 9) * Math.sign(forwardSpeed || 1) * dt;
      const fx = Math.sin(racer.yaw), fz = Math.cos(racer.yaw), rx = fz, rz = -fx;
      let speed = racer.body.velocity.x * fx + racer.body.velocity.z * fz;
      const lateral = (racer.body.velocity.x * rx + racer.body.velocity.z * rz) * Math.exp(-(drifting ? 3 : 15) * dt);
      const throttle = racer.stun > 0 ? 0 : controls.throttle;
      speed += (throttle * (throttle < 0 && speed > 1 ? 38 : 23) + (racer.boost > 0 && throttle >= 0 ? 35 : 0)) * dt;
      speed *= Math.exp(-(offroad && racer.boost <= 0 ? 2.4 : throttle ? .12 : 1) * dt);
      speed = clamp(speed, -10, racer.boost > 0 ? 55 : 40);
      const vertical = road.tangent.y / Math.max(.1, Math.hypot(road.tangent.x, road.tangent.z)) *
        (racer.body.velocity.x * road.tangent.x + racer.body.velocity.z * road.tangent.z);
      racer.body.velocity.set(fx * speed + rx * lateral, vertical, fz * speed + rz * lateral);
      racer.body.position.y = road.point.y + 1;
      racer.stuck = racer.speed < 2 && controls.throttle > 0 ? racer.stuck + dt : 0;
      if (racer.stuck > 3.5) this.recover(racer);
    }
    const previousHeights = this.racers.map(r => r.body.position.y - 1);
    this.world.step(dt);
    for (const racer of this.racers) {
      if (racer.motion === 'rescuing') continue;
      const bottom = racer.body.position.y - 1;
      const road = racer.motion === 'grounded'
        ? roadSupport(vector(racer), bottom - .8, bottom + .8)
        : roadSupport(vector(racer), bottom - .02, previousHeights[racer.id] + .02);
      racer.speed = Math.hypot(racer.body.velocity.x, racer.body.velocity.z);
      if (!road) {
        if (racer.motion === 'grounded') { racer.motion = 'airborne'; racer.airTime = 0; racer.departureHeight = racer.body.position.y; racer.drift = 0; racer.drifting = false; }
        continue;
      }
      const wasAirborne = racer.motion !== 'grounded';
      racer.motion = 'grounded'; racer.body.position.y = road.point.y + 1; racer.body.velocity.y = 0;

      let delta = road.progress - racer.previous;
      if (delta < -.5) delta++; if (delta > .5) delta--;
      if (Math.abs(delta) < (wasAirborne ? .16 : .025)) racer.progress += delta;
      racer.previous = road.progress; racer.airTime = 0;
      racer.speed = Math.hypot(racer.body.velocity.x, racer.body.velocity.z);
      const nextGate = racer.gate + 1;
      if (racer.progress >= nextGate / CHECKPOINTS && racer.progress < (nextGate + 1) / CHECKPOINTS && racer.finish === null) {
        racer.gate++;
        if (racer.gate > 0 && racer.gate % CHECKPOINTS === 0) {
          racer.lapTimes.push(this.time - racer.lapBegin); racer.lapBegin = this.time;
          this.events.push({ type: 'lap', position: vector(racer), color: racer.color, text: racer.id === 0 ? racer.lapTimes.length === 2 ? 'FINAL LAP!' : 'LAP 2 / 3' : undefined });
          if (racer.gate === TOTAL_LAPS * CHECKPOINTS) { racer.finish = this.time; this.events.push({ type: 'finish', position: vector(racer), color: racer.color }); }
        }
      }
      if (racer.finish !== null) continue;
      for (const box of this.boxes) if (box.cooldown <= 0 && !racer.item && vector(racer).distanceTo(box.position.clone().add(new THREE.Vector3(0, 1, 0))) < 3.1) { this.award(racer); box.cooldown = 5; break; }
      if (racer.padCooldown <= 0 && boostLocations.some(p => Math.abs(wrap(racer.progress) - p) < .004) && road.distance < 5) {
        racer.boost = Math.max(racer.boost, 1.4); racer.padCooldown = 2; if (Math.abs(wrap(racer.progress) - .34) < .008) { racer.motion = 'airborne'; racer.airTime = 0; racer.departureHeight = racer.body.position.y; racer.body.velocity.y = 12; }
        this.events.push({ type: 'boost', position: vector(racer), color: '#fff07c' });
      }
    }
    for (const projectile of this.projectiles) {
      projectile.life -= dt;
      if (projectile.type === 'rocket') {
        const target = projectile.target === null ? null : this.racers[projectile.target];
        if (target && target.finish === null) {
          const desired = vector(target).sub(projectile.position).normalize().multiplyScalar(62);
          projectile.velocity.lerp(desired, 1 - Math.exp(-5 * dt));
        }
        projectile.position.addScaledVector(projectile.velocity, dt);
        if (!target) projectile.position.y = nearestRoad(projectile.position).point.y + 1.2;
      }
      for (const racer of this.racers) if (racer.id !== projectile.owner && vector(racer).distanceTo(projectile.position) < (projectile.type === 'trap' ? 2.5 : 2.1)) { this.hit(racer); projectile.life = 0; break; }
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0);
    if (this.racers.every(r => r.finish !== null) || (this.racers[0].finish !== null && this.time - this.racers[0].finish > 40)) this.complete = true;
  }
  snapshot(): RaceSnapshot {
    const player = this.racers[0], order = this.order();
    return { motion: player.motion, time: this.time, speed: player.speed * 3.6, yaw: player.yaw, x: player.body.position.x, z: player.body.position.z, lap: Math.min(3, player.lapTimes.length + 1), lapTime: player.finish !== null ? player.lapTimes.at(-1)! : this.time - player.lapBegin, laps: [...player.lapTimes], position: order.findIndex(r => r.id === 0) + 1, item: player.item, charge: player.drift, boost: player.boost, shield: player.shield, stun: player.stun, progress: wrap(player.progress), standings: order.map(r => ({ id: r.id, name: r.name, color: r.color, lap: Math.min(3, r.lapTimes.length + 1), finish: r.finish, progress: r.progress })), finished: player.finish !== null, complete: this.complete };
  }
  dispose() { this.racers.forEach(r => this.world.removeBody(r.body)); this.projectiles = []; }
}
