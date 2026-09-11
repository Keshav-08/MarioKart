import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Race, type DriveInput } from '../src/game/race';
import { COURSES } from '../src/game/course';
const idle: DriveInput = { throttle:0, steer:0, drift:false, useItem:false };
function setup(speed = 30) {
  const race = new Race('normal','Handling test','#fff',COURSES.neon); race.started=true;
  const r=race.racers[0], at=race.track.pointAt(.025);
  r.body.position.set(at.x,at.y+1,at.z);r.yaw=race.track.yawAt(.025);r.previous=.025;r.progress=.025;r.gate=0;
  r.body.velocity.set(Math.sin(r.yaw)*speed,0,Math.cos(r.yaw)*speed);r.speed=speed;
  return {race,r};
}
test('steering ramps in, recenters quickly, and reverses without a full-lock snap',()=>{
  const {race,r}=setup();race.step(1/60,{...idle,steer:1});
  assert.ok(r.steering>0 && r.steering<.25);
  for(let i=0;i<8;i++)race.step(1/60,{...idle,steer:1});
  assert.ok(r.steering>.75);
  const before=r.steering;race.step(1/60,{...idle,steer:-1});
  assert.ok(r.steering<before && r.steering>0);
  for(let i=0;i<12;i++)race.step(1/60,idle);
  assert.ok(Math.abs(r.steering)<.03);race.dispose();
});
test('boost-speed corrections turn less aggressively than moderate-speed corrections',()=>{
  function turn(speed:number){const {race,r}=setup(speed);r.boost=3;const start=r.yaw;
    for(let i=0;i<12;i++)race.step(1/60,{...idle,throttle:1,steer:.4});
    const delta=Math.abs(r.yaw-start);assert.equal(r.motion,'grounded');race.dispose();return delta;
  }
  assert.ok(turn(50)<turn(20)*.92);
});
test('boost power ramps up, coasts on throttle release, and expires without a speed cliff',()=>{
  const {race,r}=setup(30);r.boost=3;
  race.step(1/60,{...idle,throttle:1});assert.ok(r.boostPower>0 && r.boostPower<5);
  const speed=r.speed;race.step(1/60,idle);assert.ok(r.speed<speed);
  r.body.velocity.set(Math.sin(r.yaw)*50,0,Math.cos(r.yaw)*50);r.boost=.001;
  race.step(1/60,{...idle,throttle:1});assert.ok(r.speed>48,'expiration preserves momentum');
  const before=r.speed;race.step(1/60,{...idle,throttle:-1});assert.ok(r.speed<before);race.dispose();
});
test('air control eases down while preserving momentum, gravity and optional air braking',()=>{
  const {race,r}=setup();r.motion='airborne';r.airTime=0;r.body.position.y+=10;r.departureHeight=r.body.position.y;r.steering=1;
  const oldY=r.body.position.y, oldAuthority=r.turnAuthority;
  race.step(1/60,{...idle,steer:1});assert.ok(r.turnAuthority>oldAuthority*.9);
  assert.ok(Math.abs(r.speed-30)<.01);assert.ok(r.body.position.y<oldY);
  for(let i=0;i<20;i++)race.step(1/60,{...idle,steer:1});
  assert.ok(r.turnAuthority<1.3 && r.turnAuthority>.75);
  const speed=r.speed;race.step(1/60,{...idle,throttle:-1});assert.ok(r.speed<speed);
  race.recover(r);assert.equal(r.steering,0);assert.equal(r.boostPower,0);race.dispose();
});
