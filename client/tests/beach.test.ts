import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Race} from '../src/game/race';
import {COURSES,CUP_TRACKS} from '../src/game/course';
import {beachHeight} from '../src/game/beach';
const idle={throttle:0,steer:0,drift:false,useItem:false};
test('interior sand supports roaming far from the marked route without awarding checkpoints',()=>{
 const t=COURSES.beach,race=new Race('normal','Test','#fff',t);race.started=true;const r=race.racers[0];
 const x=0,z=30,y=beachHeight(x,z);assert.ok(t.nearestRoad(new THREE.Vector3(x,y,z)).distance>25);
 r.body.position.set(x,y+1,z);for(let i=0;i<180;i++)race.step(1/60,idle);
 assert.equal(r.motion,'grounded');assert.equal(r.gate,-1);assert.equal(r.lapTimes.length,0);
 assert.ok(Math.abs(r.body.position.y-y-1)<.1);race.dispose();
});
test('deep water rescues to the earned checkpoint; shallow water remains drivable',()=>{
 const race=new Race('easy','Test','#fff',COURSES.beach);race.started=true;const r=race.racers[0];
 const shallow=new THREE.Vector3(195,beachHeight(195,30),30);assert.ok(COURSES.beach.roadSupport(shallow,shallow.y-.1,shallow.y+.1));
 r.body.position.set(255,1,30);race.step(1/60,idle);assert.equal(r.motion,'rescuing');assert.equal(r.gate,-1);
 for(let i=0;i<90;i++)race.step(1/60,idle);assert.equal(r.motion,'grounded');assert.equal(r.gate,-1);race.dispose();
});
test('cutting to a later part of the beach does not skip sequential physical gates',()=>{
 const race=new Race('easy','Test','#fff',COURSES.beach);race.started=true;const r=race.racers[0];
 const p=COURSES.beach.pointAt(.6);r.body.position.set(p.x,p.y+1,p.z);
 for(let i=0;i<30;i++)race.step(1/60,idle);assert.equal(r.gate,-1);assert.equal(r.lapTimes.length,0);
 assert.deepEqual(CUP_TRACKS,['cloudburst','neon','foundry']);race.dispose();
});
test('a forward jump through the next arch counts, but backwards and outside-width crossings do not',()=>{
 for(const [direction,lane,expected] of [[1,0,0],[-1,0,-1],[1,18,-1]]){
  const race=new Race('easy','Test','#fff',COURSES.beach);race.started=true;const r=race.racers[0],at=COURSES.beach.pointAt(0,lane),yaw=COURSES.beach.yawAt(0);
  r.body.position.set(at.x-Math.sin(yaw)*direction*.2,at.y+3,at.z-Math.cos(yaw)*direction*.2);
  r.motion='airborne';r.departureHeight=r.body.position.y;r.body.velocity.set(Math.sin(yaw)*direction*30,0,Math.cos(yaw)*direction*30);
  race.step(1/60,idle);assert.equal(r.gate,expected);race.dispose();
 }
});
