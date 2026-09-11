import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Race } from '../src/game/race';
import { ALL_TRACKS, COURSES, CHECKPOINTS } from '../src/game/course';
const idle={throttle:0,steer:0,drift:false,useItem:false};
for (const id of ALL_TRACKS.filter(id=>id!=='beach')) test(`${id}: landing beyond a checkpoint window still completes the final lap`,{todo:"Pre-existing diagnostic: lap-completion changes deferred at user request"},()=>{
 const track=COURSES[id], race=new Race('normal','Test','#fff',track);race.started=true;race.time=100;
 const r=race.racers[0];r.gate=3*CHECKPOINTS-1;r.lapTimes=[30,30];r.lapBegin=60;
 r.progress=2.995;r.previous=.995;r.motion='airborne';
 const at=track.pointAt(.065);r.body.position.set(at.x,at.y+1.001,at.z);r.body.velocity.set(0,-1,0);
 race.step(1/60,idle);
 assert.equal(r.lapTimes.length,3);assert.notEqual(r.finish,null);race.dispose();
});
