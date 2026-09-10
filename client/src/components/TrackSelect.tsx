import { COURSES, CUP_TRACKS, type CourseId } from '../game/course';
export default function TrackSelect({ selected, onSelect }: { selected: CourseId; onSelect: (id: CourseId) => void }) {
  return <section className="track-selection" aria-label="Choose your track"><div className="selection-heading"><span className="eyebrow">THE APEX TOUR</span><h2>Pick your playground.</h2><p>Three worlds. Three very different racing lines.</p></div><div className="track-cards">
    {CUP_TRACKS.map((id, index) => { const track = COURSES[id]; const points = track.course.getSpacedPoints(130).map(p => `${(p.x+140)*.8},${(p.z+100)*.55}`).join(' ');
      return <button key={id} aria-label={`Select ${track.name}`} aria-pressed={selected === id} onClick={() => onSelect(id)} className={`track-card ${id} ${selected === id ? 'selected' : ''}`} style={{'--track-color':track.color} as React.CSSProperties}>
        <svg viewBox="0 0 230 145" role="img" aria-label={`${track.name} layout preview`}><defs><linearGradient id={`sky-${id}`} x2="0" y2="1"><stop stopColor={id==='neon'?'#10132f':id==='foundry'?'#284b62':'#9dafde'}/><stop offset="1" stopColor={id==='neon'?'#74396a':id==='foundry'?'#7dafb3':'#edc1b5'}/></linearGradient></defs><rect width="230" height="145" fill={`url(#sky-${id})`}/>{Array.from({length:12},(_,i)=><rect key={i} x={i*22} y={100-(i%4)*13} width="15" height="80" fill={id==='neon'?'#171d3e':'#55777b'} opacity=".4"/>)}<polyline points={points} fill="none" stroke="#121d33" strokeWidth="10" strokeLinejoin="round"/><polyline points={points} fill="none" stroke={track.color} strokeWidth="4" strokeLinejoin="round"/><circle cx="112" cy={(track.pointAt(0).z+100)*.55} r="4" fill="#fff4c4"/></svg>
        <div><span className="eyebrow">0{index+1} / {selected === id?'SELECTED':'EXPLORE'}</span><h3>{track.name}</h3><p>{track.subtitle}</p><footer><span>{track.difficulty}</span><span>{Math.round(track.courseLength)} m</span></footer></div>
      </button>;
    })}</div></section>;
}
