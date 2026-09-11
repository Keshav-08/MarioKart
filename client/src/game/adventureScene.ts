import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ADVENTURES, flightHeight, hazardState } from './adventure';
import type { RaceCourse } from './course';

export function buildAdventureScene(scene:THREE.Scene, track:RaceCourse) {
  const spec=ADVENTURES[track.id], group=new THREE.Group();scene.add(group);
  const materials=new Map<string,THREE.MeshStandardMaterial>();
  const mat=(color:string)=>{if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.8}));return materials.get(color)!;};
  function box(at:THREE.Vector3,size:[number,number,number],color:string,yaw=0){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),mat(color));m.position.copy(at);m.rotation.y=yaw;m.castShadow=true;m.receiveShadow=true;group.add(m);return m;}
  function sign(p:number,text:string,color='#164e63',height=6) {
    const c=document.createElement('canvas');c.width=1024;c.height=128;const ctx=c.getContext('2d')!;ctx.fillStyle=color;ctx.fillRect(0,0,1024,128);ctx.fillStyle='#fff5c4';ctx.font='bold 54px sans-serif';ctx.textAlign='center';ctx.fillText(text,512,85);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(19,2.4),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));m.position.copy(track.pointAt(p)).y+=height;m.rotation.y=track.yawAt(p)+Math.PI;group.add(m);
  }
  sign(spec.flight[0],'WINGS OUT  •  Q ↑  F ↓','#176e86');
  sign(spec.flight[1]+.012,'LANDING ZONE','#176e86');
  // Every scored aerial checkpoint has a visible ring on the flight corridor.
  for(let i=0;i<=32;i++){
    const p=spec.flight[0]+(spec.flight[1]-spec.flight[0])*i/32;
    if(i%4!==0)continue;
    const at=track.pointAt(p);at.y=flightHeight(track,p);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(9,.25,6,36),new THREE.MeshBasicMaterial({color:'#85eff4'}));ring.position.copy(at);ring.rotation.y=track.yawAt(p);group.add(ring);
  }
  for(let gate=Math.ceil(spec.flight[0]*16);gate<=Math.floor(spec.flight[1]*16);gate++){
    const p=gate/16,at=track.pointAt(p);at.y=flightHeight(track,p);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(9.5,.5,6,36),new THREE.MeshBasicMaterial({color:'#ffda65'}));ring.position.copy(at);ring.rotation.y=track.yawAt(p);group.add(ring);
  }
  // A continuous tunnel shell follows the actual drivable surface, with open ends.
  const vertices:number[]=[], indices:number[]=[],segments=48,sides=14;
  for(let i=0;i<=segments;i++){
    const p=spec.tunnel[0]+(spec.tunnel[1]-spec.tunnel[0])*i/segments,at=track.pointAt(p),yaw=track.yawAt(p);
    for(let j=0;j<=sides;j++){
      const a=j/sides*Math.PI,offset=Math.cos(a)*(track.width/2+3),y=Math.sin(a)*12;
      vertices.push(at.x+Math.cos(yaw)*offset,at.y+y,at.z-Math.sin(yaw)*offset);
      if(i<segments&&j<sides){const k=i*(sides+1)+j,n=k+sides+1;indices.push(k,n,k+1,k+1,n,n+1);}
    }
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();
  const color=track.id==='beach'?'#8c8b7c':track.id==='neon'?'#303454':track.id==='foundry'?'#694e40':'#716f9a';
  const tunnel=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,roughness:1}));tunnel.castShadow=true;tunnel.receiveShadow=true;group.add(tunnel);
  sign(spec.tunnel[0],spec.tunnelName,track.id==='neon'?'#822875':'#39525a',9);
  for(let i=0;i<12;i++){
    const p=spec.tunnel[0]+(spec.tunnel[1]-spec.tunnel[0])*i/12;
    for(const side of [-1,1]){
      const at=track.pointAt(p,side*(track.width/2+1));at.y+=2;
      const crystal=new THREE.Mesh(new THREE.ConeGeometry(.8,4,5),new THREE.MeshStandardMaterial({color:track.id==='neon'?'#fa79da':'#7cdbd8',emissive:track.id==='neon'?'#fa79da':'#7cdbd8',emissiveIntensity:.8}));crystal.position.copy(at);group.add(crystal);
    }
  }
  if(track.id==='beach') {
    sign(.145,'CAVE FORK  ←     →','#39525a',7);
    for(let i=0;i<6;i++) {const p=.13+i*.01,at=track.pointAt(p);at.y+=2;box(at,[1.7,4,3],'#807e6b',track.yawAt(p));}
    sign(.25,'ANCIENT PALM RUINS','#476d59');
    for(let i=0;i<7;i++)for(const side of [-1,1]){
      const p=.235+i*.012,at=track.pointAt(p,side*15);at.y+=4;
      box(at,[2,8,2],'#beaf8b',track.yawAt(p));
      if(i%2===0)box(at.clone().add(new THREE.Vector3(0,4,0)),[6,1.4,4],'#c9bc9a',track.yawAt(p));
    }
    // Rock pinnacles flank the flight path and make altitude and scale readable.
    for(let i=0;i<10;i++) for(const side of [-1,1]){
      const p=spec.flight[0]+i/10*(spec.flight[1]-spec.flight[0]),at=track.pointAt(p,side*23),h=12+Math.sin(i*1.7)**2*24;
      const rock=new THREE.Mesh(new THREE.ConeGeometry(8,h,5),mat('#b39c81'));rock.position.copy(at).y+=h/2-2;group.add(rock);
    }
  }
  if(spec.hover){
    sign(spec.hover[0],'HOVERCRAFT • TIDAL INLET','#167d92');
    const points:number[]=[],triangles:number[]=[];
    for(let i=0;i<=40;i++)for(const side of [-1,1]){const p=spec.hover[0]+i/40*(spec.hover[1]-spec.hover[0]),at=track.pointAt(p,side*track.width*.5);at.y+=.12;points.push(at.x,at.y,at.z);if(i<40&&side===-1){const k=i*2;triangles.push(k,k+1,k+2,k+1,k+3,k+2);}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setIndex(triangles);g.computeVertexNormals();const water=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:'#45bdc8',metalness:.3,roughness:.2,transparent:true,opacity:.85,side:THREE.DoubleSide}));group.add(water);
  }
  if(track.id!=='beach') for(let i=0;i<9;i++)for(const side of [-1,1]) {
    const p=spec.flight[0]+i/9*(spec.flight[1]-spec.flight[0]),at=track.pointAt(p,side*24);
    const height=flightHeight(track,p)-at.y-4;
    if(track.id==='neon') {
      box(at.clone().add(new THREE.Vector3(0,height/2,0)),[12,Math.max(8,height),15],i%2?'#303555':'#414464',track.yawAt(p));
      box(at.clone().add(new THREE.Vector3(0,Math.max(8,height)+1,0)),[13,.2,16],'#e875cf',track.yawAt(p));
    } else if(track.id==='cloudburst') {
      const cloud=new THREE.Mesh(new THREE.SphereGeometry(6,8,6),new THREE.MeshStandardMaterial({color:'#d7e1ef',transparent:true,opacity:.55,depthWrite:false}));cloud.position.copy(at).y=flightHeight(track,p)+3;cloud.scale.set(2,1,1.3);group.add(cloud);
    } else {
      box(at.clone().add(new THREE.Vector3(0,15,0)),[5,30,5],'#886e63',track.yawAt(p));
      const hoop=new THREE.Mesh(new THREE.TorusGeometry(8,1.1,8,20),mat('#96a7a6'));hoop.position.copy(at).y+=32;hoop.rotation.y=track.yawAt(p);group.add(hoop);
    }
  }
  // Static scenery shares draw calls; animated hazards below remain independent.
  group.updateMatrixWorld(true);
  for(const material of materials.values()) {
    const meshes=group.children.filter((m):m is THREE.Mesh=>m instanceof THREE.Mesh&&m.material===material);
    if(meshes.length<2)continue;
    const pieces=meshes.map(m=>m.geometry.clone().applyMatrix4(m.matrixWorld));const merged=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());
    if(!merged)continue;
    meshes.forEach(m=>{m.removeFromParent();m.geometry.dispose();});const m=new THREE.Mesh(merged,material);m.castShadow=true;m.receiveShadow=true;group.add(m);
  }
  const hazards=spec.hazards.map(h=>{
    const g=new THREE.Group(),at=track.pointAt(h.p);g.position.copy(at);g.rotation.y=track.yawAt(h.p);group.add(g);
    const color=h.kind==='truck'?'#f4b94b':h.kind==='steam'?'#ff9175':'#9fe3e8';
    const shape=new THREE.Mesh(h.kind==='truck'?new THREE.BoxGeometry(3,2.5,5):new THREE.ConeGeometry(2.8,5,8),new THREE.MeshStandardMaterial({color,transparent:h.kind!=='truck',opacity:.8}));shape.position.y=1.5;shape.castShadow=true;g.add(shape);
    const warning=new THREE.Mesh(new THREE.RingGeometry(3,3.5,24),new THREE.MeshBasicMaterial({color:'#ffce54',side:THREE.DoubleSide}));warning.rotation.x=-Math.PI/2;warning.position.y=.14;g.add(warning);
    sign(h.p-.012,h.kind==='truck'?'CROSS TRAFFIC':h.kind==='steam'?'STEAM VENTS':h.kind==='gust'?'CROSSWIND':'SURF CROSSING','#815934',7);
    return {g,shape,warning};
  });
  return {update(time:number,lap:number){hazards.forEach(({g,shape,warning},i)=>{const state=hazardState(track,i,time,lap),at=track.pointAt(spec.hazards[i].p,state.lane);g.position.copy(at);shape.visible=state.active;warning.visible=state.active||state.warning;warning.material.color.set(state.active?'#ff7966':'#ffce54');});}};
}
