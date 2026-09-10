import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { COURSES, CUP_TRACKS } from '../src/game/course';
import { Race, type Standing } from '../src/game/race';
import { addRound, scoreRound, cupStandings } from '../src/game/championship';
import { loadRecords, loadGhost, saveRace } from '../src/game/storage';
function drive(race: Race) {
  const r=race.racers[0], t=race.track, p=((r.progress%1)+1)%1;
  const target=t.pointAt(p+Math.max(7,r.speed*.32)/t.courseLength,-.5);
  const heading=Math.atan2(target.x-r.body.position.x,target.z-r.body.position.z);
  const error=Math.atan2(Math.sin(heading-r.yaw),Math.cos(heading-r.yaw));
  const bend=Math.abs(Math.atan2(Math.sin(t.yawAt(p+18/t.courseLength)-t.yawAt(p)),Math.cos(t.yawAt(p+18/t.courseLength)-t.yawAt(p))));
  const speed=t.jumps.some(j=>p>j-.025&&p<j+.03)?24:Math.max(14,34+t.pace-bend*t.cornering);
  return { throttle:r.speed>speed+2?-.6:1, steer:THREE.MathUtils.clamp(error*2.8,-1,1), drift:false, useItem:!!r.item && r.itemAge>2 && (r.item!=='turbo'||bend<.25) };
}
for (const id of CUP_TRACKS) test(`${id}: valid item placements and all eight racers finish the layout`, () => {
  const track=COURSES[id]; assert.ok(track.pointAt(0).distanceTo(track.pointAt(1))<.001);
  for(const item of track.itemLocations) assert.ok(track.roadSupport(item.position,item.position.y-.2,item.position.y+.2));
  const race=new Race('normal','Tour driver','#ff7700',track); race.started=true;
  for(let i=0;i<60*240 && !race.complete;i++) { race.step(1/60,drive(race)); race.events.length=0; }
  console.log(id,race.racers.map(r=>`${r.name}: ${r.finish?.toFixed(1) ?? 'DNF'} (${r.gate})`));
  assert.ok(race.racers.every(r=>r.finish!==null), 'every racer completes three laps');
  assert.ok(race.complete); assert.ok(race.racers.every(r=>r.lapTimes.length===3)); race.dispose();
});
const standings: Standing[] = Array.from({length:8},(_,id)=>({id,name:`Racer ${id}`,color:'#fff',lap:3,finish:100+id,progress:3}));
test('championship scores three rounds once, gives DNF zero and breaks ties consistently',()=>{
  const first=scoreRound('cloudburst',standings); assert.equal(first.standings[0].points,15);
  let rounds=addRound([],first); assert.equal(addRound(rounds,first),rounds);
  assert.equal(addRound(rounds,scoreRound('foundry',standings)),rounds);
  rounds=addRound(rounds,scoreRound('neon',[...standings].reverse()));
  rounds=addRound(rounds,scoreRound('foundry',standings.map(r=>r.id===7?{...r,finish:null}:r)));
  assert.equal(rounds.length,3); assert.equal(cupStandings(rounds)[0].id,0);
  assert.equal(cupStandings(rounds).find(r=>r.id===7)!.points,16);
  const tied=cupStandings([first,scoreRound('neon',[...standings].reverse())]);
  assert.equal(tied[0].id,7,'equal points and wins resolved by final-round position');
});
test('records and ghosts stay isolated by course, preserving old Cloudburst saves',()=>{
  const data=new Map<string,string>(); const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)}});
  try {
    const race=new Race('easy','Test','#fff'); const snapshot={...race.snapshot(),position:1,laps:[30,30,40],standings};
    const ghost=[{t:0,x:0,y:4,z:0,yaw:0},{t:100,x:10,y:4,z:0,yaw:0}];
    saveRace('Neon best','easy',snapshot,ghost,'neon');
    assert.equal(loadRecords('cloudburst').length,0); assert.equal(loadGhost('foundry').length,0);
    assert.equal(loadRecords('neon')[0].name,'Neon best'); assert.deepEqual(loadGhost('neon'),ghost);
    saveRace('Foundry best','easy',snapshot,ghost.map(f=>({...f,x:55})),'foundry');
    assert.equal(loadGhost('neon')[0].x,0); assert.equal(loadGhost('foundry')[0].x,55);
    data.set('apex.cloudburst.records.v1',JSON.stringify([{id:'legacy',name:'Old racer',time:99,position:1,difficulty:'easy',laps:[33,33,33]}]));
    assert.equal(loadRecords('cloudburst')[0].courseId,'cloudburst'); assert.equal(loadRecords('neon')[0].time,100);
    data.set('apex.neon.ghost.v1','invalid'); assert.deepEqual(loadGhost('neon'),[]);
    race.dispose();
  } finally { if(original) Object.defineProperty(globalThis,'localStorage',original); else Reflect.deleteProperty(globalThis,'localStorage'); }
});
