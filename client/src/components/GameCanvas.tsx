// @refresh reset
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useKartControls } from '../hooks/useKartControls';
import { createKart, disposeObject } from '../game/scene';
import { buildRaceScene } from '../game/raceScene';
import { Race, type Difficulty, type RaceSnapshot } from '../game/race';
import { RaceAudio } from '../game/audio';
import { COURSES, type CourseId } from '../game/course';

export interface GhostFrame { t: number; x: number; y: number; z: number; yaw: number }
export interface Telemetry extends RaceSnapshot { phase: 'preview' | 'countdown' | 'racing' | 'finished'; countdown: number; message: string; paused: boolean }
interface Props {
  courseId: CourseId; color: string; name: string; difficulty: Difficulty; raceKey: number; running: boolean; paused: boolean;
  audio: RaceAudio; ghost: GhostFrame[]; onTelemetry: (state: Telemetry) => void;
  onFinish: (snapshot: RaceSnapshot, ghost: GhostFrame[]) => void; onReset: () => void; onPause: () => void;
}
export default function GameCanvas(props: Props) {
  const host = useRef<HTMLDivElement>(null), latest = useRef(props); latest.current = props;
  const { input, setPressed } = useKartControls();
  const [error, setError] = useState('');
  useEffect(() => {
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
    catch { setError('This game needs WebGL. Enable graphics acceleration and reload to race.'); return; }
    setError('');
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
    host.current!.appendChild(renderer.domElement);
    const track = COURSES[props.courseId], { nearestRoad } = track;
    const scene = new THREE.Scene(), scenery = buildRaceScene(scene, track);
    const race = new Race(props.difficulty, props.name, props.color, track);
    const camera = new THREE.PerspectiveCamera(53, 1, .1, 1000);
    const karts = race.racers.map(racer => { const kart = createKart(racer.color); kart.scale.setScalar(1.2); scene.add(kart); return kart; });
    const shields = race.racers.map(() => {
      const shield = new THREE.Mesh(new THREE.SphereGeometry(2.05, 16, 12), new THREE.MeshStandardMaterial({ color: '#95f5ff', emissive: '#58badb', emissiveIntensity: .6, transparent: true, opacity: .28, roughness: .15, depthWrite: false, wireframe: true }));
      scene.add(shield); return shield;
    });
    const ghostKart = createKart('#c5efff', true); ghostKart.scale.setScalar(1.2); scene.add(ghostKart);
    const projectileMeshes = new Map<number, THREE.Mesh>();
    const particleGeometry = new THREE.SphereGeometry(.2, 4, 3);
    const particleMesh = new THREE.InstancedMesh(particleGeometry, new THREE.MeshBasicMaterial({ color: '#ffffff' }), 220); particleMesh.frustumCulled = false; scene.add(particleMesh);
    const particles = Array.from({ length: 220 }, () => ({ position: new THREE.Vector3(), velocity: new THREE.Vector3(), age: 0, life: 0, color: new THREE.Color() }));
    let particleCursor = 0;
    const emit = (position: THREE.Vector3, color: string, count: number, force = 3) => {
      for (let i = 0; i < count; i++) {
        const particle = particles[particleCursor++ % particles.length]; particle.position.copy(position);
        particle.velocity.set((Math.random() - .5) * force, 1 + Math.random() * force, (Math.random() - .5) * force);
        particle.age = 0; particle.life = .4 + Math.random() * .6; particle.color.set(color);
      }
    };
    let last = performance.now(), accumulator = 0, frame = 0, hudAt = 0, countdown = props.running ? 3.5 : -1;
    let overview = !props.running, finishedNotified = false, oldCount = 4, message = '', messageUntil = 0, shake = 0;
    let ghostIndex = 0, lastGhost = -1, pendingItem = false;
    const recording: GhostFrame[] = [];
    const cameraTarget = new THREE.Vector3(), look = new THREE.Vector3(0, 6, 24), lookTarget = new THREE.Vector3(), dummy = new THREE.Object3D();
    const player = race.racers[0];
    camera.position.set(145, 165, 205); camera.lookAt(look);
    if (props.running) { camera.position.set(player.body.position.x - Math.sin(player.yaw) * 12, player.body.position.y + 7, player.body.position.z - Math.cos(player.yaw) * 12); look.copy(new THREE.Vector3(player.body.position.x, player.body.position.y + 1, player.body.position.z)); }
    const resize = () => {
      const width = host.current!.clientWidth, height = host.current!.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize); observer.observe(host.current!); resize();
    const contextLost = (event: Event) => { event.preventDefault(); setError('Graphics were interrupted. Return to the paddock and start again.'); };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const now = performance.now(), dt = Math.max(0, Math.min((now - last) / 1000, .08)); last = now;
      if (input.current.reset) { input.current.reset = false; latest.current.onReset(); return; }
      if (input.current.pause) { input.current.pause = false; if (props.running && !player.finish) latest.current.onPause(); }
      if (input.current.camera) { input.current.camera = false; overview = !overview; }
      const paused = latest.current.paused || document.hidden;
      if (!paused && props.running) {
        if (countdown > 0) {
          countdown = Math.max(0, countdown - dt);
          const count = Math.ceil(countdown);
          if (count !== oldCount && count <= 3) { props.audio.play(count ? 'count' : 'go'); oldCount = count; }
          if (!countdown) { race.started = true; message = 'GO!'; messageUntil = race.time + 1.3; }
        } else {
          accumulator += dt;
          pendingItem ||= input.current.useItem; input.current.useItem = false;
          while (accumulator >= 1 / 60) {
            race.step(1 / 60, { throttle: input.current.throttle, steer: input.current.steer, drift: input.current.drift, useItem: pendingItem }); pendingItem = false; accumulator -= 1 / 60;
          }
        }
      } else { accumulator = 0; pendingItem = false; input.current.useItem = false; }
      if (race.started && player.finish === null && race.time - lastGhost >= .1) {
        const p = player.body.position; recording.push({ t: race.time, x: p.x, y: p.y, z: p.z, yaw: player.yaw }); lastGhost = race.time;
      }
      for (const event of race.events.splice(0)) {
        emit(event.position, event.color, event.type === 'finish' ? 80 : event.type === 'hit' ? 25 : 10, event.type === 'finish' ? 12 : 4);
        const close = event.position.distanceTo(new THREE.Vector3(player.body.position.x, player.body.position.y, player.body.position.z)) < 8;
        if (close) props.audio.play(event.type);
        if (event.text) { message = event.text; messageUntil = race.time + 1.8; }
        if (event.type === 'hit' && close) shake = .6;
      }
      if (player.finish !== null && !finishedNotified) {
        finishedNotified = true; recording.push({ t: player.finish, x: player.body.position.x, y: player.body.position.y, z: player.body.position.z, yaw: player.yaw });
        latest.current.onFinish(race.snapshot(), recording); props.audio.play('finish');
      }
      race.racers.forEach((racer, i) => {
        const kart = karts[i], p = racer.body.position;
        kart.position.set(p.x, p.y - 1, p.z); kart.rotation.y = racer.yaw + (racer.stun > 0 ? Math.sin(racer.stun * 18) * 1.4 : 0);
        kart.traverse(part => { if (part.userData.wheel && !paused) part.rotateY(racer.speed * dt / .36); });
        const road = nearestRoad(kart.position);
        const pitch = racer.motion === 'grounded' ? Math.asin(THREE.MathUtils.clamp(-road.tangent.y, -.3, .3)) : racer.motion === 'rescuing' ? 0 : -Math.atan2(racer.body.velocity.y, Math.max(15, racer.speed));
        kart.rotation.order = 'YXZ'; kart.rotation.x += (THREE.MathUtils.clamp(pitch, -.55, .55) - kart.rotation.x) * (1 - Math.exp(-8 * dt));
        kart.rotation.z = racer.drifting ? Math.sin(race.time * 20) * .03 : 0;
        shields[i].position.set(p.x, p.y + .4, p.z); shields[i].visible = racer.shield > 0 || racer.motion === 'rescuing'; shields[i].rotation.y += dt;
        if (!paused && racer.boost > 0) emit(new THREE.Vector3(p.x - Math.sin(racer.yaw) * 1.7, p.y, p.z - Math.cos(racer.yaw) * 1.7), '#ffd080', 2);
        if (!paused && racer.drifting) for (const side of [-1, 1]) emit(new THREE.Vector3(p.x + Math.cos(racer.yaw) * side, p.y - .5, p.z - Math.sin(racer.yaw) * side), racer.drift > .65 ? '#ffbc73' : '#8feeff', 1);
      });
      if (!paused) scenery.update(dt);
      scenery.boxes.forEach((box, i) => { box.visible = race.boxes[i].cooldown <= 0; box.rotation.y = now / 850 + i; box.rotation.z = .2; box.position.y = race.boxes[i].position.y + 2 + Math.sin(now / 500 + i) * .35; });
      scenery.balloons.forEach((balloon, i) => { balloon.rotation.z = Math.sin(now / 2500 + i) * .045; });
      const activeIds = new Set(race.projectiles.map(p => p.id));
      for (const [id, m] of projectileMeshes) if (!activeIds.has(id)) { scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); projectileMeshes.delete(id); }
      for (const projectile of race.projectiles) {
        let m = projectileMeshes.get(projectile.id);
        if (!m) { m = new THREE.Mesh(projectile.type === 'trap' ? new THREE.SphereGeometry(1.7, 12, 6) : new THREE.ConeGeometry(.6, 2.5, 8), new THREE.MeshStandardMaterial({ color: projectile.type === 'trap' ? '#c084e3' : '#ff967c', emissive: projectile.type === 'trap' ? '#7c409a' : '#ff5436', emissiveIntensity: .5 })); scene.add(m); projectileMeshes.set(projectile.id, m); }
        m.position.copy(projectile.position);
        if (projectile.type === 'trap') { m.position.y -= .7; m.scale.y = .2; }
        else { m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), projectile.velocity.clone().normalize()); if (!paused) emit(projectile.position, '#ffd080', 1); }
      }
      particles.forEach((p, i) => {
        if (!paused) { p.age += dt; p.position.addScaledVector(p.velocity, dt); p.velocity.y -= dt * 6; }
        dummy.position.copy(p.position); dummy.scale.setScalar(p.age < p.life ? (1 - p.age / p.life) * 1.6 : 0); dummy.updateMatrix(); particleMesh.setMatrixAt(i, dummy.matrix); particleMesh.setColorAt(i, p.color);
      });
      particleMesh.instanceMatrix.needsUpdate = true; if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;
      const ghost = latest.current.ghost;
      ghostKart.visible = race.started && ghost.length > 1 && race.time <= ghost.at(-1)!.t && player.finish === null;
      if (ghostKart.visible) {
        while (ghostIndex < ghost.length - 2 && ghost[ghostIndex + 1].t < race.time) ghostIndex++;
        const a = ghost[ghostIndex], b = ghost[ghostIndex + 1], f = THREE.MathUtils.clamp((race.time - a.t) / Math.max(.001, b.t - a.t), 0, 1);
        ghostKart.position.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f - 1, a.z + (b.z - a.z) * f);
        ghostKart.rotation.y = a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * f;
      }
      if (overview) {
        const ratio = Math.max(1, 1.35 / camera.aspect); cameraTarget.set(145 * ratio, 175 * ratio, 205 * ratio); lookTarget.set(0, 5, 25);
        (scene.fog as THREE.Fog).near = 220 * ratio; (scene.fog as THREE.Fog).far = 600 * ratio;
      } else {
        const p = player.body.position, distance = 10.5 + player.speed * .085;
        cameraTarget.set(p.x - Math.sin(player.yaw) * distance, player.motion === 'falling' ? Math.max(p.y + 6.3, player.departureHeight - 3) : p.y + 6.3, p.z - Math.cos(player.yaw) * distance);
        lookTarget.set(p.x + Math.sin(player.yaw) * 7, p.y + 1.2, p.z + Math.cos(player.yaw) * 7);
        (scene.fog as THREE.Fog).near = 170; (scene.fog as THREE.Fog).far = 480;
      }
      shake = Math.max(0, shake - dt); if (shake > 0 && !paused) cameraTarget.add(new THREE.Vector3(Math.sin(now * .13), Math.cos(now * .09), 0).multiplyScalar(shake));
      camera.position.lerp(cameraTarget, 1 - Math.exp(-6 * dt)); look.lerp(lookTarget, 1 - Math.exp(-10 * dt)); camera.lookAt(look);
      const fov = player.boost > 0 ? 65 : 53; camera.fov += (fov - camera.fov) * (1 - Math.exp(-4 * dt)); camera.updateProjectionMatrix();
      props.audio.update(player.speed, player.drifting, race.started && !paused && player.finish === null && player.motion !== 'rescuing');
      renderer.render(scene, camera);
      if (now - hudAt > 75) {
        latest.current.onTelemetry({ ...race.snapshot(), phase: !props.running ? 'preview' : countdown > 0 ? 'countdown' : player.finish !== null ? 'finished' : 'racing', countdown: Math.min(3, Math.ceil(countdown)), message: race.time < messageUntil ? message : '', paused }); hudAt = now;
      }
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); props.audio.update(0, false, false); race.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      disposeObject(scene);
      scene.traverse(o => { if (o instanceof THREE.LineSegments || o instanceof THREE.Points) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
      scenery.background.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [props.courseId, props.color, props.difficulty, props.raceKey, props.running, input]);
  return <>
    <div className="game-canvas" ref={host} role="img" aria-label={`${COURSES[props.courseId].name} 3D kart race`} />
    {error && <div className="graphics-error" role="alert">{error}</div>}
    {props.running && <div className="touch-controls">{[['ArrowLeft', '←'], ['ArrowRight', '→'], ['Space', 'DRIFT'], ['KeyE', 'ITEM'], ['ArrowDown', 'BRAKE'], ['ArrowUp', 'GO']].map(([code, label]) => <button key={code} aria-label={`Drive ${label}`} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); setPressed(code, true); }} onPointerUp={() => setPressed(code, false)} onPointerCancel={() => setPressed(code, false)} onLostPointerCapture={() => setPressed(code, false)}>{label}</button>)}</div>}
  </>;
}
