import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { beachHeight } from './beach';
import type { RaceCourse } from './course';
export function buildBeachScene(scene: THREE.Scene, track: RaceCourse) {
  const sky=document.createElement('canvas');sky.width=4;sky.height=256;
  const ctx=sky.getContext('2d')!, gradient=ctx.createLinearGradient(0,0,0,256);
  gradient.addColorStop(0,'#75cbed');gradient.addColorStop(.65,'#ffcead');gradient.addColorStop(1,'#fff0be');ctx.fillStyle=gradient;ctx.fillRect(0,0,4,256);
  const background=new THREE.CanvasTexture(sky);background.colorSpace=THREE.SRGBColorSpace;scene.background=background;scene.fog=new THREE.Fog('#f7ddbd',230,650);
  scene.add(new THREE.HemisphereLight('#fff4d5','#8cbfc1',2.4));
  const sun=new THREE.DirectionalLight('#ffe2ac',2.5);sun.position.set(-70,130,-80);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-170,right:170,top:170,bottom:-170,near:1,far:400});sun.shadow.normalBias=.1;scene.add(sun);
  const mats=new Map<string,THREE.MeshStandardMaterial>();
  function object(geo:THREE.BufferGeometry,color:string,x:number,y:number,z:number) {
    if(!mats.has(color))mats.set(color,new THREE.MeshStandardMaterial({color,roughness:.85}));
    const m=new THREE.Mesh(geo,mats.get(color)!);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;
  }
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:string)=>object(new THREE.BoxGeometry(w,h,d),color,x,y,z);
  function label(text:string,at:THREE.Vector3,yaw:number,width=16) {
    const c=document.createElement('canvas');c.width=1024;c.height=128;const g=c.getContext('2d')!;
    g.fillStyle='#196f87';g.fillRect(0,0,1024,128);g.fillStyle='#fff0bc';g.font='bold 68px sans-serif';g.textAlign='center';g.fillText(text,512,88);
    const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(width,2),new THREE.MeshBasicMaterial({map,side:THREE.DoubleSide}));m.position.copy(at);m.rotation.y=yaw;scene.add(m);
  }
  const water=object(new THREE.PlaneGeometry(1600,1600),'#45bacb',0,0,20);water.rotation.x=-Math.PI/2;water.castShadow=false;
  const geo=new THREE.PlaneGeometry(320,320,150,150);geo.rotateX(-Math.PI/2);geo.translate(0,0,20);
  const pos=geo.attributes.position,colors:number[]=[];
  for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i),h=beachHeight(x,z);pos.setY(i,h);const c=new THREE.Color(h<.3?'#d5c697':h>6?'#f6d9a0':'#f2ce8c');c.multiplyScalar(1+.025*Math.sin(x*.7+z*.5));colors.push(c.r,c.g,c.b);}
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();const terrain=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));terrain.receiveShadow=true;scene.add(terrain);
  // Sparse flags mark a racing corridor; there are no walls or invisible edge forces.
  for(let i=0;i<88;i++)for(const side of [-1,1]) {
    const p=track.pointAt(i/88,side*(track.width/2+1.5));
    box(p.x,p.y+1.1,p.z,.12,2.2,.12,'#fff3d1');const flag=box(p.x+.6,p.y+1.8,p.z,1.3,.7,.05,i%2?'#f48a78':'#51b7bc');flag.rotation.y=track.yawAt(i/88);
  }
  for(let i=0;i<16;i++) {
    const at=track.pointAt(i/16),yaw=track.yawAt(i/16);
    for(const side of [-1,1]){const edge=track.pointAt(i/16,side*(track.width/2+2));box(edge.x,edge.y+3.3,edge.z,.55,6.6,.55,'#e89c64');}
    const beam=box(at.x,at.y+6.3,at.z,track.width+5,.5,.65,'#ffcf76');beam.rotation.y=yaw;
    label(i===0?'SUNSET SANDS':`CHECKPOINT ${i}`,at.clone().add(new THREE.Vector3(0,6.3,0)),yaw+Math.PI,17);
  }
  // Low wooden boardwalk follows the beach surface without fencing off the sand.
  for(let i=0;i<100;i++){
    const p=i/100*.12,at=track.pointAt(p),plank=box(at.x,at.y+.04,at.z,17,.08,.7,i%2?'#bd956e':'#d5ac7d');plank.rotation.y=track.yawAt(p);
  }
  for(const p of track.boostLocations){const at=track.pointAt(p),pad=box(at.x,at.y+.09,at.z,9,.14,5,'#ffb54d');pad.rotation.y=track.yawAt(p);label(track.jumps.includes(p)?'JUMP ↑':'BOOST ↑',track.pointAt(p,-17).add(new THREE.Vector3(0,3,0)),track.yawAt(p)+Math.PI,10);}
  for(let i=0;i<38;i++){
    const a=i*2.399,r= i%3===0?38:118,x=Math.cos(a)*r,z=20+Math.sin(a)*r,y=beachHeight(x,z);
    if(y<1 || track.nearestRoad(new THREE.Vector3(x,y,z)).distance<16)continue;
    object(new THREE.CylinderGeometry(.35,.75,9,7),'#ac805c',x,y+4.5,z);
    for(let j=0;j<5;j++){const ang=j*Math.PI*2/5,leaf=object(new THREE.ConeGeometry(1.8,7,4),'#56aa83',x+Math.cos(ang)*2,y+9,z+Math.sin(ang)*2);leaf.rotation.z=1.1;leaf.rotation.y=ang;}
  }
  for(let i=0;i<8;i++){
    const x=-55+i*15,z=-93,y=beachHeight(x,z);box(x,y+2,z,9,4,8,['#ef997c','#88c7c3','#d5afd5'][i%3]);
    const roof=object(new THREE.ConeGeometry(7,3,4),'#f4d792',x,y+5,z);roof.rotation.y=Math.PI/4;label(['SURF CLUB','COCONUTS','SUNSET SNACKS'][i%3],new THREE.Vector3(x,y+3,z+4.1),0,8);
    box(x,y+1,z+4.05,2,2,.15,'#427f95');
  }
  for(let i=0;i<14;i++){
    const x=-55+(i%7)*16,z=40+Math.floor(i/7)*22,y=beachHeight(x,z);
    if(track.nearestRoad(new THREE.Vector3(x,y,z)).distance<17)continue;
    box(x,y+1.6,z,.12,3.2,.12,'#fff2cd');object(new THREE.ConeGeometry(3.7,1.3,8),i%2?'#ff997a':'#76cbd2',x,y+3.5,z);
    box(x+2,y+.15,z+3,2,.2,4,'#f5e5b7');
  }
  // Batch the static palms, flags, huts and planks; leave surf and item boxes animated.
  scene.updateMatrixWorld(true);
  const batches=new Map<string,THREE.Mesh[]>();
  for(const node of [...scene.children]) if(node instanceof THREE.Mesh && node.material instanceof THREE.MeshStandardMaterial) {
    const key=node.material.uuid+node.castShadow;
    if(!batches.has(key))batches.set(key,[]);batches.get(key)!.push(node);
  }
  for(const list of batches.values()) {
    if(list.length<2)continue;
    const pieces=list.map(m=>m.geometry.clone().applyMatrix4(m.matrixWorld)), merged=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());
    if(!merged)continue;
    const mesh=new THREE.Mesh(merged,list[0].material);mesh.castShadow=list[0].castShadow;mesh.receiveShadow=true;
    list.forEach(m=>{scene.remove(m);m.geometry.dispose();});scene.add(mesh);
  }
  const foam:THREE.Mesh[]=[];
  for(let i=0;i<90;i++){const a=i/90*Math.PI*2,r=125.2;const f=object(new THREE.SphereGeometry(1,6,4),'#d8f7eb',Math.cos(a)*r,.08,20+Math.sin(a)*r);f.scale.set(2.1,.06,.6);f.rotation.y=-a;f.castShadow=false;foam.push(f);}
  const boxes=track.itemLocations.map(({position})=>{
    const g=new THREE.Group();g.position.copy(position).y+=2;const m=new THREE.Mesh(new THREE.BoxGeometry(1.7,1.7,1.7),new THREE.MeshStandardMaterial({color:'#a6e6ed',emissive:'#338aa6',emissiveIntensity:.6,roughness:.3}));g.add(m);scene.add(g);
    const c=document.createElement('canvas');c.width=128;c.height=128;const ctx=c.getContext('2d')!;ctx.fillStyle='#306e98';ctx.fillRect(0,0,128,128);ctx.fillStyle='#fff0b9';ctx.font='bold 100px sans-serif';ctx.textAlign='center';ctx.fillText('?',64,102);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;m.material.map=tex;
    return g;
  });
  let time=0;
  return {background,boxes,balloons:[] as THREE.Group[],update:(dt:number)=>{time+=dt;foam.forEach((f,i)=>{f.position.y=.08+Math.sin(time*1.5+i*.3)*.04;f.scale.z=.5+Math.sin(time+i*.2)*.15;});}};
}
