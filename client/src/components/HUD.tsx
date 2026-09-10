import { Flag, Gauge, Zap } from 'lucide-react';
import { formatTime } from '@apex/shared';
import { COURSES, type CourseId } from '../game/course';
import { ITEMS } from '../game/race';
import type { Telemetry } from './GameCanvas';
export default function HUD({ telemetry, courseId }: { telemetry: Telemetry | null; courseId: CourseId }) {
  const track = COURSES[courseId], { course, district } = track;
  const mapPoints = course.getSpacedPoints(150).map(p => `${(p.x + 125) * .7},${(p.z + 95) * .7}`).join(' ');
  const racing = telemetry && ['racing', 'finished'].includes(telemetry.phase);
  const item = telemetry?.item ? ITEMS[telemetry.item] : null;
  return <div data-motion={telemetry?.motion} className={`hud prix-hud ${racing ? 'is-racing' : ''}`}>
    <div className="hud-top"><div className="hud-chip"><span className="live-dot" />{racing ? district(telemetry.progress) : track.name.toUpperCase()}</div><div className="hud-chip weather">APEX TOUR · 150 CC</div></div>
    {!racing && telemetry?.phase !== 'countdown' && <div className="preview-label"><span>A NEW HORIZON. A NEW RIVALRY.</span><strong>{track.name}</strong><p>{track.subtitle}</p></div>}
    {racing && <>
      <div className="position-badge"><strong>{telemetry.position}</strong><span>{['', 'ST', 'ND', 'RD'][telemetry.position] || 'TH'}<small>/ 8 RACERS</small></span></div>
      <div className="race-timer"><span><Flag size={13} /> LAP {telemetry.lap} / 3</span><strong>{formatTime(telemetry.lapTime * 1000)}</strong><small>RACE {formatTime(telemetry.time * 1000)}</small></div>
      <div className={`item-slot ${item ? 'loaded' : ''}`} style={{ '--item-color': item?.color ?? '#a8bfdf' } as React.CSSProperties}><span className="item-icon">{item?.icon ?? '?'}</span><div><strong>{item?.name ?? 'GRAB AN ITEM BOX'}</strong><small>{item ? 'E / SHIFT TO USE' : 'Drive through a floating cube'}</small></div></div>
      <div className="race-mini-map"><svg viewBox="0 0 178 166" aria-label="Course minimap"><polyline points={mapPoints} fill="none" stroke="#ffffff40" strokeWidth="7" strokeLinejoin="round" />{[...telemetry.standings].reverse().map(r => { const p = r.id === 0 ? { x: telemetry.x, z: telemetry.z } : course.getPointAt(((r.progress % 1) + 1) % 1); return r.id === 0 ? <g key={r.id} className="player-map-marker" transform={`translate(${(p.x + 125) * .7},${(p.z + 95) * .7}) rotate(${-telemetry.yaw * 180 / Math.PI})`}><path d="M 0 6 L -4 -4 L 4 -4 Z" fill={r.color} stroke="#fff" strokeWidth="1.5" /></g> : <circle key={r.id} cx={(p.x + 125) * .7} cy={(p.z + 95) * .7} r={2.7} fill={r.color} />; })}</svg></div>
      <div className="speedometer"><Gauge size={18} /><strong>{Math.round(telemetry.speed).toString().padStart(3, '0')}</strong><span>KM/H</span></div>
      <div className={`drift-meter ${telemetry.boost > 0 ? 'boosting' : ''}`}><span><Zap size={13} />{telemetry.motion === 'rescuing' ? 'RETURNING TO TRACK' : telemetry.motion === 'falling' ? 'OFF TRACK' : telemetry.motion === 'airborne' ? 'AIRBORNE' : telemetry.boost > 0 ? 'TURBO!' : telemetry.charge >= .4 ? 'RELEASE SPACE → BOOST' : 'SPACE + STEER → DRIFT'}</span><div><i style={{ width: `${telemetry.boost > 0 ? 100 : telemetry.charge * 100}%` }} /></div></div>
      {telemetry.shield > 0 && <div className="shield-status">◉ SHIELDED · {Math.ceil(telemetry.shield)}s</div>}
      {telemetry.message && <div className={`race-message ${telemetry.stun > 0 ? 'hit-message' : ''}`}>{telemetry.message}</div>}
    </>}
    {telemetry?.phase === 'countdown' && <div className="countdown"><span>THE GRID IS SET. MAKE YOUR MOVE.</span><strong key={telemetry.countdown}>{telemetry.countdown}</strong><small>HOLD W / ↑ TO ACCELERATE</small></div>}
    <div className="track-caption"><span><i /> {track.sectors.slice(0, 3).join(' → ')}</span><span>3 LAPS / 8 RACERS</span></div>
  </div>;
}
