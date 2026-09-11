import { ADVENTURES, VEHICLES, flightHeight, hazardState, inSection, type Vehicle } from './adventure';
import { beachHeight, beachDrivable } from './beach';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CHECKPOINTS, TOTAL_LAPS, wrap, COURSES, type RaceCourse } from './course';

export type Item = 'turbo' | 'rocket' | 'shield' | 'trap' | 'rush' | 'shockwave' | 'magnet' | 'lift' | 'decoy';
export type Difficulty = 'easy' | 'normal' | 'hard';
export const ITEMS: Record<Item, { name: string; icon: string; description: string; color: string }> = {
  turbo: { name: 'Triple Turbo', icon: '⚡', description: 'Three separate boosts. Press E once for each charge.', color: '#ffcc51' },
  rocket: { name: 'Comet rocket', icon: '➤', description: 'Homes toward the nearest racer ahead. Shields block it.', color: '#ff765f' },
  shield: { name: 'Bubble shield', icon: '◉', description: 'Blocks attacks and traps for six seconds.', color: '#79e5fa' },
  rush: { name: 'Rocket Rush', icon: '🚀', description: 'Five seconds of armored autopilot. A warning signals the return to manual control.', color: '#ff885e' },
  shockwave: { name: 'Shockwave', icon: '◎', description: 'Stuns nearby opponents and clears incoming projectiles.', color: '#adabff' },
  magnet: { name: 'Pickup Magnet', icon: '⊂', description: 'Attracts item boxes and adds slipstream speed for eight seconds.', color: '#fc7abf' },
  lift: { name: 'Glider Burst', icon: '↑', description: 'Launch a protected hop; in flight, gain speed and altitude.', color: '#81eee2' },
  decoy: { name: 'Decoy Crate', icon: '▧', description: 'Drop a fake pickup behind you. Watch for its pink glow.', color: '#df91e9' },
  trap: { name: 'Jelly slick', icon: '✦', description: 'Drop a slippery surprise behind your kart.', color: '#d9a1ff' },
};
export const BOT_PROFILES = [
  { name: 'Mochi', color: '#eb8bbf' }, { name: 'Blaze', color: '#ff6849' },
  { name: 'Orbit', color: '#7871e8' }, { name: 'Clover', color: '#59b991' },
  { name: 'Ziggy', color: '#edc84d' }, { name: 'Pixel', color: '#55bce3' },
  { name: 'Rumble', color: '#ba917a' },
];
export interface DriveInput { throttle: number; steer: number; drift: boolean; useItem: boolean; pitch?: number }
export type MotionState = 'grounded' | 'airborne' | 'falling' | 'rescuing';
export interface Racer {
  vehicle: Vehicle; form: 'ground' | 'plane' | 'hover'; flightOffset: number; rush: number; magnet: number; charges: number; surfaceSlope: number; gateAge: number;
  id: number; name: string; color: string; body: CANNON.Body; yaw: number;
  progress: number; previous: number; gate: number; lapTimes: number[]; lapBegin: number;
  finish: number | null; item: Item | null; itemAge: number; shield: number; boost: number;
  steering: number; turnAuthority: number; boostPower: number; stun: number; immunity: number; drift: number; drifting: boolean; speed: number;
  motion: MotionState; airTime: number; departureHeight: number; rescueTime: number; rescueFrom: THREE.Vector3; rescueTo: THREE.Vector3;
  stuck: number; lane: number; shortRoute: boolean; padCooldown: number;
}
export interface Projectile { id: number; owner: number; target: number | null; position: THREE.Vector3; velocity: THREE.Vector3; life: number; type: 'rocket' | 'trap' | 'decoy' }
export interface RaceEvent { type: 'pickup' | 'boost' | 'hit' | 'shield' | 'lap' | 'finish' | 'launch' | 'recover'; position: THREE.Vector3; color: string; text?: string }
export interface Standing { id: number; name: string; color: string; lap: number; finish: number | null; progress: number }
export interface RaceSnapshot {
  vehicle: Vehicle; form: Racer['form']; rush: number; magnet: number; charges: number; altitude: number;
  nextCheckpoint: number; motion: MotionState; time: number; speed: number; yaw: number; x: number; z: number; lap: number; lapTime: number; laps: number[]; position: number;
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
  boxes: { progress: number; position: THREE.Vector3; cooldown: number }[];
  events: RaceEvent[] = [];
  time = 0;
  started = false;
  complete = false;
  private serial = 0;
  private seed = 9137;
  constructor(public difficulty: Difficulty, name: string, color: string, public track: RaceCourse = COURSES.cloudburst, vehicle: Vehicle = 'kart') {
    const { pointAt, yawAt, courseLength } = track;
    this.boxes = track.itemLocations.map(location => ({ ...location, cooldown: 0 }));
    this.world.defaultContactMaterial.friction = 0;
    this.world.defaultContactMaterial.restitution = .45;
    const profiles = [{ name, color }, ...BOT_PROFILES];
    profiles.forEach((profile, id) => {
      const row = id === 0 ? 3 : Math.floor((id - 1) / 2);
      const lane = (id % 2 ? -1 : 1) * 2.4;
      const progress = -(row * 4.8 + 5) / courseLength;
      const position = pointAt(progress, lane);
      const selected = id === 0 ? vehicle : (['kart','bike','buggy','truck'] as Vehicle[])[id%4];
      const body = new CANNON.Body({ mass: VEHICLES[selected].mass, shape: new CANNON.Sphere(1.05), position: new CANNON.Vec3(position.x, position.y + 1, position.z), fixedRotation: true, linearDamping: 0 });
      this.world.addBody(body);
      this.racers.push({ vehicle:selected, form:'ground', flightOffset:0, rush:0, magnet:0, charges:0, surfaceSlope:0, gateAge:0, ...profile, id, body, yaw: yawAt(progress), progress, previous: wrap(progress), gate: -1, lapTimes: [], lapBegin: 0, finish: null, item: null, itemAge: 0, shield: 0, boost: 0, steering: 0, turnAuthority: 2.05, boostPower: 0, stun: 0, immunity: 0, drift: 0, drifting: false, speed: 0, motion: 'grounded', airTime: 0, departureHeight: position.y, rescueTime: 0, rescueFrom: position.clone(), rescueTo: position.clone(), stuck: 0, lane, shortRoute: false, padCooldown: 0 });
    });
  }
  private random() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  order() { return [...this.racers].sort((a, b) => a.finish !== null && b.finish !== null ? a.finish - b.finish : a.finish !== null ? -1 : b.finish !== null ? 1 : b.progress - a.progress); }
  award(racer: Racer) {
    const rank = this.order().findIndex(r => r.id === racer.id);
    const bag: Item[] = rank > 3 ? ['rush', 'turbo', 'rocket', 'shockwave', 'magnet', 'lift', 'shield'] : ['turbo', 'rocket', 'shield', 'trap', 'decoy', 'magnet', 'lift'];
    racer.item = bag[Math.floor(this.random() * bag.length)]; racer.itemAge = 0; racer.charges = racer.item === 'turbo' ? 3 : 1;
    this.events.push({ type: 'pickup', position: vector(racer), color: ITEMS[racer.item].color });
  }
  useItem(racer: Racer) {
    if (racer.motion === 'rescuing' || !racer.item || racer.stun > 0 || racer.finish !== null) return;
    const item = racer.item; racer.itemAge=0;
    if (item === 'turbo' && racer.charges > 1) racer.charges--; else { racer.item = null; racer.charges = 0; }
    if (item === 'turbo') { racer.boost = Math.max(racer.boost, 1.5); this.events.push({ type: 'boost', position: vector(racer), color: '#ffd967' }); }
    if (item === 'shield') { racer.shield = 6; this.events.push({ type: 'shield', position: vector(racer), color: '#8eeeff' }); }
    if (item === 'rush') { racer.rush = 5; racer.immunity = 6; racer.stun = 0; this.events.push({type:'boost',position:vector(racer),color:'#ff885e',text:racer.id===0?'ROCKET RUSH • AUTOPILOT':undefined}); }
    if (item === 'magnet') racer.magnet = 8;
    if (item === 'shockwave') {
      for (const other of this.racers) if(other.id!==racer.id && vector(other).distanceTo(vector(racer))<16) this.hit(other);
      this.projectiles=this.projectiles.filter(p=>p.position.distanceTo(vector(racer))>20);
      this.events.push({type:'shield',position:vector(racer),color:'#adabff',text:racer.id===0?'SHOCKWAVE!':undefined});
    }
    if (item === 'lift') { racer.boost=2; racer.immunity=2; if(racer.form==='plane') racer.flightOffset=Math.min(8,racer.flightOffset+4); else {racer.motion='airborne';racer.airTime=0;racer.departureHeight=racer.body.position.y;racer.body.velocity.y=10;} }
    if (item === 'rocket' || item === 'trap' || item === 'decoy') {
      const ahead = this.order().filter(r => r.id !== racer.id && r.progress > racer.progress && r.finish === null).sort((a, b) => a.progress - b.progress)[0];
      const forward = new THREE.Vector3(Math.sin(racer.yaw), 0, Math.cos(racer.yaw));
      this.projectiles.push({ id: this.serial++, owner: racer.id, target: item === 'rocket' ? ahead?.id ?? null : null, position: vector(racer).addScaledVector(forward, item !== 'rocket' ? -3.3 : 2.5), velocity: forward.multiplyScalar(62), life: item !== 'rocket' ? 18 : 6, type: item });
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
    const { pointAt } = this.track;
    if (racer.motion === 'rescuing') return;
    racer.form='ground'; racer.rush=0; racer.flightOffset=0;
    const progress = racer.gate < 0 ? -.003 : racer.gate / CHECKPOINTS + .002;
    racer.rescueFrom.copy(vector(racer)); racer.rescueTo.copy(pointAt(progress, clamp(racer.lane, -3, 3))).y += 1;
    racer.steering = 0; racer.turnAuthority = 2.05; racer.boostPower = 0;
    racer.motion = 'rescuing'; racer.rescueTime = 0; racer.body.collisionFilterMask = 0;
    racer.body.velocity.set(0, 0, 0); racer.boost = 0; racer.drift = 0; racer.drifting = false;
    racer.stuck = 0; racer.stun = 0; racer.shortRoute = false;
    this.events.push({ type: 'recover', position: vector(racer), color: '#acf4ff', text: racer.id === 0 ? 'RESCUE • RETURNING TO TRACK' : undefined });
  }
  private rescueStep(racer: Racer, dt: number) {
    const { yawAt } = this.track;
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
    const { pointAt, yawAt, courseLength, shortcut, shortcutStart, shortcutEnd } = this.track;
    const p = wrap(racer.progress);
    const neighbors = this.racers.filter(r => r.id !== racer.id && r.progress > racer.progress && (r.progress - racer.progress) * courseLength < 13);
    const nearHazard=ADVENTURES[this.track.id].hazards.find((h,i)=>{const ahead=wrap(h.p-p);return ahead<.035 && hazardState(this.track,i,this.time,racer.lapTimes.length).active;});
    const preferred = this.track.id==='beach' && p>.115&&p<.19 ? (racer.id%2?5:-5) : nearHazard ? (hazardState(this.track,ADVENTURES[this.track.id].hazards.indexOf(nearHazard),this.time,racer.lapTimes.length).lane>0?-5:5) : neighbors.length ? (neighbors[0].lane > 0 ? -3.5 : 3.5) : this.track.racingLane(p) + Math.sin(this.time * .35 + racer.id * 2.1) * 1.5 * this.track.laneScale;
    racer.lane += (preferred - racer.lane) * .035;
    if (this.track.hasShortcut && p > shortcutStart - .012 && p < shortcutStart && racer.boost > 0) racer.shortRoute = true;
    if (p > shortcutEnd + .008 || p < shortcutStart - .02) racer.shortRoute = false;
    const target = racer.shortRoute ? shortcut.getPointAt(clamp((p - shortcutStart) / (shortcutEnd - shortcutStart) + .13, 0, 1)) : pointAt(p + Math.max(7, racer.speed * .32) / courseLength, racer.lane);
    const error = angle(Math.atan2(target.x - racer.body.position.x, target.z - racer.body.position.z) - racer.yaw);
    const bend = Math.abs(angle(yawAt(p + 18 / courseLength) - yawAt(p)));
    const level = { easy: 29, normal: 34, hard: 39 }[this.difficulty] + this.track.pace;
    const targetSpeed = this.track.jumps.some(j => p > j - .025 && p < j + .03) ? 24 : Math.max(14, level - bend * this.track.cornering) + (racer.boost > 0 ? 10 * Math.max(0, 1 - bend * 2) : 0);
    const useItem = !!racer.item && racer.itemAge > 1.5 + racer.id * .24 && (racer.item !== 'turbo' || bend < .25) && (racer.item !== 'trap' || this.racers.some(r => r.id !== racer.id && racer.progress > r.progress && racer.progress - r.progress < .05));
    return { throttle: racer.speed > targetSpeed + 2 ? -.45 : 1, steer: clamp(error * 2.8, -1, 1), drift: bend > .34 && Math.abs(error) > .12 && racer.speed > 16, useItem };
  }
  private fly(racer: Racer, controls: DriveInput, dt: number) {
    const road=this.track.nearestRoad(vector(racer),false), p=road.progress;
    const section=ADVENTURES[this.track.id].flight;
    racer.motion='airborne'; racer.airTime=0; racer.drifting=false; racer.drift=0;
    racer.steering += ((racer.stun>0?0:controls.steer)-racer.steering)*(1-Math.exp(-12*dt));
    racer.yaw += racer.steering*1.55*dt;
    racer.flightOffset=clamp(racer.flightOffset+(controls.pitch??0)*10*dt,-8,8);
    // Altitude assist supplies lift; the pilot still banks, climbs, dives and chooses speed.
    const target=flightHeight(this.track,p)+racer.flightOffset*Math.sin(clamp((p-section[0])/(section[1]-section[0]),0,1)*Math.PI);
    const speed=clamp(racer.speed+(controls.throttle<0?-18:12)*dt,20,racer.stun>0?20:racer.boost>0?55:40);
    racer.body.velocity.set(Math.sin(racer.yaw)*speed,clamp((target-racer.body.position.y)*5,-18,18),Math.cos(racer.yaw)*speed);
    racer.speed=speed;
    if(road.distance>this.track.width*2 || p<section[0]-.04) {this.recover(racer);return;}
    if(p>section[1] && road.distance<this.track.width/2 && racer.body.position.y<=road.point.y+2) {
      racer.form='ground';racer.motion='grounded';racer.body.position.y=road.point.y+1;racer.body.velocity.y=0;racer.flightOffset=0;racer.padCooldown=2;
      this.events.push({type:'launch',position:vector(racer),color:'#81eee2',text:racer.id===0?'TOUCHDOWN • BACK TO WHEELS':undefined});
    } else if(p>section[1]+.06) this.recover(racer);
  }
  private flightProgress(racer: Racer, before: THREE.Vector3) {
    const road=this.track.nearestRoad(vector(racer),false);
    let delta=road.progress-racer.previous;if(delta<-.5)delta++;if(delta>.5)delta--;
    if(Math.abs(delta)<.025)racer.progress+=delta;
    racer.previous=road.progress;
    const next=racer.gate+1, gate=this.track.pointAt(next/CHECKPOINTS), yaw=this.track.yawAt(next/CHECKPOINTS);
    const signed=(p:THREE.Vector3)=>(p.x-gate.x)*Math.sin(yaw)+(p.z-gate.z)*Math.cos(yaw);
    const a=signed(before),b=signed(vector(racer));
    const height=flightHeight(this.track,wrap(next/CHECKPOINTS));
    if(a<0 && b>=0 && road.distance<this.track.width/2+2 && Math.abs(racer.body.position.y-height)<10 && racer.finish===null) this.advanceGate(racer);
    for(const box of this.boxes) if(box.cooldown<=0&&!racer.item&&Math.abs(box.progress-road.progress)<.008&&road.distance<6) {this.award(racer);box.cooldown=5;break;}
  }
  private advanceGate(racer: Racer) {
        racer.gate++; racer.gateAge=0;
        if (racer.gate > 0 && racer.gate % CHECKPOINTS === 0) {
          racer.lapTimes.push(this.time - racer.lapBegin); racer.lapBegin = this.time;
          this.events.push({ type: 'lap', position: vector(racer), color: racer.color, text: racer.id === 0 ? racer.lapTimes.length === 2 ? 'FINAL LAP!' : 'LAP 2 / 3' : undefined });
          if (racer.gate === TOTAL_LAPS * CHECKPOINTS) { racer.finish = this.time; this.events.push({ type: 'finish', position: vector(racer), color: racer.color }); }
        }
  }
  step(dt: number, input: DriveInput) {
    const { nearestRoad, roadSupport, ROAD_WIDTH, boostLocations } = this.track;
    if (!this.started || this.complete) return;
    this.time += dt;
    const previousPositions = this.racers.map(vector);
    const wasRescuing = this.racers.map(r => r.motion === 'rescuing');
    for (const box of this.boxes) box.cooldown = Math.max(0, box.cooldown - dt);
    for (const racer of this.racers) {
      if (racer.motion === 'rescuing') { this.rescueStep(racer, dt); continue; }
      for (const key of ['boost', 'shield', 'stun', 'immunity', 'padCooldown', 'magnet'] as const) racer[key] = Math.max(0, racer[key] - dt);
      racer.itemAge += dt; racer.gateAge+=dt;
      if(racer.id!==0 && racer.finish===null && racer.gateAge>12) {racer.gateAge=0;this.recover(racer);continue;}
      const controls = racer.id === 0 && racer.finish === null && racer.rush <= 0 ? input : this.ai(racer);
      const spec = VEHICLES[racer.vehicle], adventure=ADVENTURES[this.track.id], p=wrap(racer.progress);
      if (racer.rush > 0) {
        const old=racer.rush; racer.rush=Math.max(0,racer.rush-dt); racer.boost=1; controls.throttle=1; controls.drift=false;
        if(old>1 && racer.rush<=1 && racer.id===0) this.events.push({type:'boost',position:vector(racer),color:'#ffcc51',text:'MANUAL CONTROL IN 1 SECOND'});
      }
      if(racer.form==='ground' && inSection(p,adventure.flight) && racer.motion==='grounded' && this.track.roadSupport(vector(racer),racer.body.position.y-1.8,racer.body.position.y-.2)) { racer.form='plane'; racer.flightOffset=0; this.events.push({type:'launch',position:vector(racer),color:'#81eee2',text:racer.id===0?'WINGS OUT • Q CLIMB / F DIVE':undefined}); }
      if(controls.useItem) this.useItem(racer);
      if(racer.form==='plane') {
        this.fly(racer,controls,dt); continue;
      }
      racer.form=adventure.hover && inSection(p,adventure.hover)?'hover':'ground';
      if(racer.rush>0) {
        const road=this.track.nearestRoad(vector(racer),false), next=wrap(road.progress+52*dt/this.track.courseLength),target=this.track.pointAt(next);
        racer.motion='grounded';racer.yaw=this.track.yawAt(next);racer.body.position.y=target.y+1;
        racer.body.velocity.set((target.x-racer.body.position.x)/dt,0,(target.z-racer.body.position.z)/dt);racer.speed=52;continue;
      }
      // Smooth intent for keyboard, touch and bots alike; releasing/reversing responds faster.
      const desiredSteer = racer.stun > 0 ? 0 : clamp(controls.steer, -1, 1);
      const steerResponse = desiredSteer === 0 || desiredSteer * racer.steering < 0 ? 18 : 12;
      racer.steering += (desiredSteer - racer.steering) * (1 - Math.exp(-steerResponse * dt));
      const boostTarget = racer.boost > 0 && racer.stun <= 0 && controls.throttle > 0 ? 35 : 0;
      racer.boostPower += (boostTarget - racer.boostPower) * (1 - Math.exp(-6 * dt));
      if (racer.form !== 'hover' && this.track.id === 'beach' && !beachDrivable(racer.body.position.x,racer.body.position.z)) { this.recover(racer); continue; }
      const support = roadSupport(vector(racer), racer.body.position.y - 1.8, racer.body.position.y - .2);
      const road = support ?? nearestRoad(vector(racer));
      if (racer.motion === 'grounded' && !support) {
        racer.motion = 'airborne'; racer.airTime = 0; racer.departureHeight = racer.body.position.y;
        racer.drift = 0; racer.drifting = false;
      }
      if (racer.motion !== 'grounded') {
        racer.airTime += dt; racer.drift = 0; racer.drifting = false;
        // Limited air steering changes heading, but cannot pull the kart back onto the road.
        racer.turnAuthority += (.75 - racer.turnAuthority) * (1 - Math.exp(-dt / .3));
        const airTurn = racer.steering * racer.turnAuthority * dt;
        racer.yaw += airTurn;
        const vx = racer.body.velocity.x, vz = racer.body.velocity.z;
        racer.body.velocity.x = vx * Math.cos(airTurn) + vz * Math.sin(airTurn);
        racer.body.velocity.z = vz * Math.cos(airTurn) - vx * Math.sin(airTurn);
        // Air braking sheds some horizontal speed without cancelling gravity or momentum.
        const airDrag = controls.throttle < 0 ? Math.exp(-.65 * dt) : 1;
        racer.body.velocity.x *= airDrag; racer.body.velocity.z *= airDrag;
        racer.body.velocity.y -= 28 * dt;
        racer.motion = racer.body.velocity.y < 0 && !roadSupport(vector(racer), -Infinity, racer.body.position.y - .98) ? 'falling' : 'airborne';
        if (racer.body.position.y <= (this.track.id === 'beach' ? -3 : 1) || racer.body.position.y < racer.departureHeight - 14 || racer.airTime > 2.5) this.recover(racer);
        continue;
      }
      racer.surfaceSlope = road.tangent.y;
      const offroad = this.track.id !== 'beach' && (road.distance > (road.shortcut ? 3.3 : ROAD_WIDTH / 2) || (road.shortcut && racer.boost <= 0));
      const drifting = controls.drift && Math.abs(controls.steer) > .1 && racer.speed > 9 && racer.stun <= 0;
      if (drifting) racer.drift = Math.min(1, racer.drift + dt / 1.25);
      if (!drifting && racer.drifting) { if (!controls.drift && racer.drift >= .4 && racer.stun <= 0) { racer.boost = Math.max(racer.boost, .7 + racer.drift); this.events.push({ type: 'boost', position: vector(racer), color: '#ffd967' }); } racer.drift = 0; }
      racer.drifting = drifting;
      const forwardSpeed = racer.body.velocity.x * Math.sin(racer.yaw) + racer.body.velocity.z * Math.cos(racer.yaw);
      const highSpeed = clamp((Math.abs(forwardSpeed) - 20) / 35, 0, 1);
      const authority = (drifting ? 2.4 : 2.05) * spec.steering * (1 - highSpeed * (drifting ? .12 : .22));
      racer.turnAuthority += (authority - racer.turnAuthority) * (1 - Math.exp(-10 * dt));
      if (racer.stun <= 0) racer.yaw += racer.steering * racer.turnAuthority * Math.min(1, Math.abs(forwardSpeed) / 9) * Math.sign(forwardSpeed || 1) * dt;
      const fx = Math.sin(racer.yaw), fz = Math.cos(racer.yaw), rx = fz, rz = -fx;
      let speed = racer.body.velocity.x * fx + racer.body.velocity.z * fz;
      const lateral = (racer.body.velocity.x * rx + racer.body.velocity.z * rz) * Math.exp(-(drifting ? 3 : (15 + racer.boostPower / 35 * 3) * spec.grip) * dt);
      const throttle = racer.stun > 0 ? 0 : controls.throttle;
      speed += (throttle * (throttle < 0 && speed > 1 ? 38 : 23 * spec.acceleration) + (throttle > 0 ? racer.boostPower : 0)) * dt;
      const shallows = this.track.id === 'beach' && beachHeight(racer.body.position.x,racer.body.position.z) < .3;
      if (shallows && racer.boost <= 0 && racer.form !== 'hover') speed *= Math.exp(-.6 * dt);
      speed *= Math.exp(-(offroad && racer.boost <= 0 ? 2.4 * spec.rough : throttle ? .12 : 1) * dt);
      if(racer.magnet>0 && this.racers.some(r=>r.id!==racer.id && r.progress>racer.progress && vector(r).distanceTo(vector(racer))<15)) speed += 12*dt;
      const speedLimit = racer.boost > 0 ? 55 : 40;
      // Let boost speed decay rather than instantly chopping velocity when its timer ends.
      if (speed > speedLimit) speed = Math.max(speedLimit, speed - 24 * dt);
      speed = clamp(speed, -10, 55);
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
      if (racer.form === 'plane') { this.flightProgress(racer,previousPositions[racer.id]); continue; }
      if (this.track.id === 'beach' && racer.finish === null && !wasRescuing[racer.id]) {
        const nextGate = racer.gate + 1;
        const gate = this.track.pointAt(nextGate / CHECKPOINTS), yaw = this.track.yawAt(nextGate / CHECKPOINTS);
        const before = previousPositions[racer.id], after = vector(racer);
        const signed = (p: THREE.Vector3) => (p.x-gate.x)*Math.sin(yaw)+(p.z-gate.z)*Math.cos(yaw);
        const a=signed(before), b=signed(after), fraction= a < 0 && b >= 0 ? -a/(b-a) : -1;
        const hit=before.clone().lerp(after, Math.max(0,fraction));
        const crossed=fraction>=0 && Math.abs((hit.x-gate.x)*Math.cos(yaw)-(hit.z-gate.z)*Math.sin(yaw)) <= this.track.width/2+2 && hit.y-gate.y>.25 && hit.y-gate.y<4.5;
        if (crossed) this.advanceGate(racer);
      }
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
      const crossed = this.track.id !== 'beach' && racer.progress >= nextGate / CHECKPOINTS && racer.progress < (nextGate + 1) / CHECKPOINTS;
      if (crossed && racer.finish === null) this.advanceGate(racer);
      if (this.track.id === 'beach') {
        // Roaming does not grant progress: rank stays anchored to the last earned gate.
        racer.progress = racer.gate / CHECKPOINTS + Math.min(1/CHECKPOINTS-.00001,wrap(road.progress-racer.gate/CHECKPOINTS));
      }
      if (racer.finish !== null) continue;
      if(this.track.id==='beach' && wrap(racer.progress)>.13 && wrap(racer.progress)<.18 && road.distance<2.1 && racer.rush<=0) { this.hit(racer); racer.body.velocity.x+=Math.cos(racer.yaw)*(racer.lane>=0?1:-1)*2; racer.body.velocity.z-=Math.sin(racer.yaw)*(racer.lane>=0?1:-1)*2; }
      ADVENTURES[this.track.id].hazards.forEach((hazard,index)=>{
        const state=hazardState(this.track,index,this.time,racer.lapTimes.length), at=this.track.pointAt(hazard.p,state.lane);
        if(state.active && vector(racer).distanceTo(at.add(new THREE.Vector3(0,1,0)))<3.5 && racer.rush<=0) this.hit(racer);
      });
      for (const box of this.boxes) if (box.cooldown <= 0 && !racer.item && vector(racer).distanceTo(box.position.clone().add(new THREE.Vector3(0, 1, 0))) < (racer.magnet>0?13:3.1)) { this.award(racer); box.cooldown = 5; break; }
      if (racer.padCooldown <= 0 && boostLocations.some(p => Math.abs(wrap(racer.progress) - p) < .004) && road.distance < 5) {
        racer.boost = Math.max(racer.boost, 1.4); racer.padCooldown = 2; if (this.track.jumps.some(j => Math.abs(wrap(racer.progress) - j) < .008)) { racer.motion = 'airborne'; racer.airTime = 0; racer.departureHeight = racer.body.position.y; racer.body.velocity.y = 12; }
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
      for (const racer of this.racers) if (racer.id !== projectile.owner && vector(racer).distanceTo(projectile.position) < (projectile.type !== 'rocket' ? 2.5 : 2.1)) { this.hit(racer); projectile.life = 0; break; }
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0);
    if (this.racers.every(r => r.finish !== null) || (this.racers[0].finish !== null && this.time - this.racers[0].finish > 40)) this.complete = true;
  }
  snapshot(): RaceSnapshot {
    const player = this.racers[0], order = this.order();
    return { vehicle:player.vehicle, form:player.form, rush:player.rush, magnet:player.magnet, charges:player.charges, altitude:player.body.position.y, nextCheckpoint: (player.gate + 1) % CHECKPOINTS, motion: player.motion, time: this.time, speed: player.speed * 3.6, yaw: player.yaw, x: player.body.position.x, z: player.body.position.z, lap: Math.min(3, player.lapTimes.length + 1), lapTime: player.finish !== null ? player.lapTimes.at(-1)! : this.time - player.lapBegin, laps: [...player.lapTimes], position: order.findIndex(r => r.id === 0) + 1, item: player.item, charge: player.drift, boost: player.boost, shield: player.shield, stun: player.stun, progress: wrap(player.progress), standings: order.map(r => ({ id: r.id, name: r.name, color: r.color, lap: Math.min(3, r.lapTimes.length + 1), finish: r.finish, progress: r.progress })), finished: player.finish !== null, complete: this.complete };
  }
  dispose() { this.racers.forEach(r => this.world.removeBody(r.body)); this.projectiles = []; }
}
