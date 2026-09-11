import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Race, type DriveInput} from '../src/game/race';
import {ADVENTURES, VEHICLES, flightHeight, hazardState, type Vehicle} from '../src/game/adventure';
import {ALL_TRACKS, COURSES} from '../src/game/course';
const idle={throttle:0,steer:0,drift:false,useItem:false};
function place(race:Race,p:number){const r=race.racers[0],at=race.track.pointAt(p);r.body.position.set(at.x,at.y+1,at.z);r.progress=p;r.previous=p;r.gate=Math.floor(p*16);r.yaw=race.track.yawAt(p);return r;}
test('all four courses transform on the marked corridor; steering and climb/dive affect flight',()=>{
 for(const id of ALL_TRACKS){
  const make=()=>{const race=new Race('normal','Pilot','#fff',COURSES[id]);race.started=true;const p=ADVENTURES[id].flight[0]+.025;const r=place(race,p);r.speed=28;race.step(1/60,idle);r.body.position.y=flightHeight(race.track,p);r.body.velocity.y=0;return race;};
  const up=make(),down=make();
  for(let i=0;i<25;i++){up.step(1/60,{...idle,throttle:1,steer:.2,pitch:1});down.step(1/60,{...idle,throttle:1,steer:-.2,pitch:-1});}
  assert.equal(up.racers[0].form,'plane');assert.ok(up.racers[0].body.position.y>down.racers[0].body.position.y);
  assert.notEqual(up.racers[0].yaw,down.racers[0].yaw);up.dispose();down.dispose();
 }
});
test('turbo has three separately usable charges; new offensive and defensive items work',()=>{
 const race=new Race('normal','Test','#fff');const r=race.racers[0],other=race.racers[1];r.item='turbo';r.charges=3;
 race.useItem(r);assert.equal(r.charges,2);assert.equal(r.item,'turbo');race.useItem(r);race.useItem(r);assert.equal(r.item,null);
 other.body.position.copy(r.body.position);other.shield=6;r.item='shockwave';race.useItem(r);assert.equal(other.shield,0);assert.equal(other.stun,0);
 other.immunity=0;r.item='shockwave';race.useItem(r);assert.ok(other.stun>0);
 r.item='rush';race.useItem(r);race.hit(r);assert.equal(r.stun,0);assert.equal(r.rush,5);
 r.item='magnet';race.useItem(r);assert.equal(r.magnet,8);
 r.item='decoy';race.useItem(r);assert.equal(race.projectiles.at(-1)?.type,'decoy');race.dispose();
});
test('beach inlet deploys floats and timed hazards advertise an avoidable danger',()=>{
 const race=new Race('normal','Test','#fff',COURSES.beach);race.started=true;const r=place(race,.7);race.step(1/60,idle);assert.equal(r.form,'hover');
 assert.ok(hazardState(COURSES.neon,0,8*.45).warning);assert.ok(!hazardState(COURSES.neon,0,8*.45).active);assert.ok(hazardState(COURSES.neon,0,8*.6).active);race.dispose();
});
for(const id of ALL_TRACKS)for(const vehicle of Object.keys(VEHICLES) as Vehicle[])test(`${id} / ${vehicle}: full race, flight, touchdown and final standings`,()=>{
 const race=new Race('normal','Pilot','#fff',COURSES[id],vehicle);race.started=true;let flight=false,landed=false;
 for(let i=0;i<60*300&&!race.complete;i++){
  // Same steering intent available to a human; simulation owns vehicle/flight handling.
  const r=race.racers[0],p=((r.progress%1)+1)%1,target=race.track.pointAt(p+Math.max(7,r.speed*.32)/race.track.courseLength,-.5);
  const error=Math.atan2(Math.sin(Math.atan2(target.x-r.body.position.x,target.z-r.body.position.z)-r.yaw),Math.cos(Math.atan2(target.x-r.body.position.x,target.z-r.body.position.z)-r.yaw));
  const input:DriveInput={throttle:r.speed>30?-.5:1,steer:THREE.MathUtils.clamp(error*2.8,-1,1),drift:false,useItem:!!r.item&&r.itemAge>2,pitch:0};
  race.step(1/60,input);race.events.length=0;flight ||= r.form==='plane';landed ||= flight&&r.form==='ground';
 }
 assert.ok(flight&&landed,'transformation and touchdown occurred');assert.ok(race.complete);assert.notEqual(race.racers[0].finish,null);assert.ok(race.racers.filter(r=>r.finish!==null).length>=7,'at least seven finish within the existing 40-second field cutoff');race.dispose();
});
test('the item button works in flight and turbo charges do not auto-spend on the following tick',()=>{
 const race=new Race('normal','Pilot','#fff',COURSES.beach);race.started=true;const r=place(race,.4);r.item='lift';
 race.step(1/60,{...idle,throttle:1,useItem:true});assert.equal(r.form,'plane');assert.equal(r.item,null);assert.ok(r.boost>0);assert.ok(r.flightOffset>0);
 r.item='turbo';r.charges=3;r.itemAge=5;race.step(1/60,{...idle,useItem:true});assert.equal(r.charges,2);assert.ok(r.itemAge<.1);race.dispose();
});
