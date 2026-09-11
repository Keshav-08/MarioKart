import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, CircleHelp, Flag, Ghost, Maximize, Pause, Play, RotateCcw, Trophy, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { COLORS, formatTime } from '@apex/shared';
import GameCanvas, { type Telemetry, type GhostFrame } from './components/GameCanvas';
import HUD from './components/HUD';
import { BOT_PROFILES, ITEMS, type Difficulty, type RaceSnapshot } from './game/race';
import { COURSES, CUP_TRACKS, ALL_TRACKS, type CourseId } from './game/course';
import TrackSelect from './components/TrackSelect';
import { addRound, scoreRound, cupStandings, type RoundResult } from './game/championship';
import { RaceAudio } from './game/audio';
import { loadGhost, loadRecords, saveRace } from './game/storage';

export default function App() {
  const [courseId, setCourseId] = useState<CourseId>('cloudburst'), [recordTrackId, setRecordTrackId] = useState<CourseId>('cloudburst');
  const [mode, setMode] = useState<'single' | 'cup'>('single'), [rounds, setRounds] = useState<RoundResult[]>([]);
  const track = COURSES[courseId];
  const [name, setName] = useState('Racer 01'), [color, setColor] = useState<string>(COLORS[0]);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [running, setRunning] = useState(false), [raceKey, setRaceKey] = useState(0), [paused, setPaused] = useState(false);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null), [finished, setFinished] = useState(false);
  const [muted, setMuted] = useState(false), [ghostEnabled, setGhostEnabled] = useState(false);
  const [records, setRecords] = useState(loadRecords), [ghost, setGhost] = useState(loadGhost);
  const [modal, setModal] = useState<'help' | 'records' | null>(null), [notice, setNotice] = useState('');
  const audio = useRef(new RaceAudio()), stage = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const locked = running;
  const totals = cupStandings(rounds), cupComplete = mode === 'cup' && rounds.length === 3;
  const visibleRecords = recordTrackId === courseId ? records : loadRecords(recordTrackId);
  useEffect(() => { setRecords(loadRecords(courseId)); setGhost(loadGhost(courseId)); setGhostEnabled(false); setRecordTrackId(courseId); }, [courseId]);
  useEffect(() => {
    if (mode === 'cup' && running && telemetry?.complete) setRounds(previous => addRound(previous, scoreRound(courseId, telemetry.standings)));
  }, [telemetry, mode, running, courseId]);
  useEffect(() => () => audio.current.dispose(), []);
  useEffect(() => { audio.current.mute(muted); }, [muted]);
  useEffect(() => { if (modal) { if (running && !finished) setPaused(true); dialog.current?.showModal(); } else dialog.current?.close(); }, [modal, running, finished]);
  function reset() { setRunning(false); setFinished(false); setPaused(false); setTelemetry(null); setNotice(''); setGhost(loadGhost(courseId)); setRounds([]); }
  async function begin(nextCourse?: CourseId) {
    const selected = nextCourse ?? (mode === 'cup' ? CUP_TRACKS[0] : courseId);
    try { await audio.current.unlock(); } catch { setNotice('Audio is unavailable. You can still race with sound off.'); }
    if (!nextCourse) setRounds([]);
    setCourseId(selected); setFinished(false); setPaused(false); setTelemetry(null); setRaceKey(key => key + 1); setRunning(true);
    stage.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function finish(snapshot: RaceSnapshot, recording: GhostFrame[]) {
    setFinished(true);
    try { setRecords(saveRace(name.trim() || 'Racer 01', difficulty, snapshot, recording, courseId)); setGhost(loadGhost(courseId)); }
    catch { setNotice('Race complete. Browser storage is full or unavailable, so this result could not be saved.'); }
  }
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await stage.current?.requestFullscreen(); }
    catch { setNotice('Fullscreen is unavailable in this browser.'); }
  }
  const result = telemetry?.standings.find(r => r.id === 0);
  return <div className={`app-shell cloudburst-app ${running ? 'race-active' : ''}`}>
    <header className="site-header">
      <a className="brand" href="/" aria-label="Apex Kart Club home"><span className="brand-mark">A<span /></span><span>apex<span className="brand-sub">KART CLUB</span></span></a>
      <nav aria-label="Main navigation"><button className={!modal ? 'active' : ''} onClick={() => setModal(null)}><Flag size={15} />The paddock</button><button onClick={() => setModal('records')}><Trophy size={15} />My records</button><button onClick={() => setModal('help')}><CircleHelp size={15} />How to play</button></nav>
      <div className="connection-status"><span className="status-dot" />SINGLE PLAYER<span className="version">V.03</span></div>
    </header>
    <main>
      <div className="page-intro"><div><div className="eyebrow"><span className="tiny-checkers" /> THE APEX TOUR / SINGLE PLAYER GRAND PRIX</div><h1>Your next great rivalry<span>.</span></h1><p>Seven rivals. Four playgrounds. Your championship starts here.</p></div><div className="intro-stamp"><span>THE FORECAST?</span><strong>a chance of chaos.</strong><span>☁ &nbsp; ⚡ &nbsp; ☀</span></div></div>
      {!running && <><TrackSelect selected={courseId} onSelect={id => { setCourseId(id); if (id === 'beach') setMode('single'); }} /><div className="race-mode-picker" aria-label="Race mode"><button aria-pressed={mode === 'single'} onClick={() => setMode('single')}>Single race</button><button aria-pressed={mode === 'cup'} onClick={() => setMode('cup')}>Three-race championship</button><p>{mode === 'cup' ? 'Cloudburst → Neon Night Market → Stormwater. 15 / 12 / 10 / 8 / 6 / 4 / 2 / 1 points. DNFs score 0.' : 'Race your selected course. Records and ghosts are saved separately for each track.'}</p></div></>}
      <div className="race-layout">
        <section className="circuit-panel">
          <div className="game-stage" ref={stage}>
            <GameCanvas courseId={courseId} color={color} name={name.trim() || 'Racer 01'} difficulty={difficulty} raceKey={raceKey} running={running} paused={paused} audio={audio.current} ghost={ghostEnabled ? ghost : []} onTelemetry={setTelemetry} onFinish={finish} onReset={reset} onPause={() => setPaused(value => !value)} />
            <HUD telemetry={telemetry} courseId={courseId} />
            <div className="stage-actions"><button onClick={() => setMuted(value => !value)} aria-label={muted ? 'Enable sound' : 'Mute sound'}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>{running && !finished && <button onClick={() => setPaused(value => !value)} aria-label={paused ? 'Resume race' : 'Pause race'}>{paused ? <Play size={17} /> : <Pause size={17} />}</button>}<button onClick={() => void fullscreen()} aria-label="Toggle fullscreen"><Maximize size={17} /></button></div>
            {paused && running && !finished && <div className="pause-overlay"><div><span className="eyebrow">TAKE A BREATHER</span><h2>We’ll hold the grid.</h2><p>The race and all opponents are paused.</p><button className="primary-button" onClick={() => setPaused(false)}>Back to the action <Play size={16} /></button><button className="secondary-button" onClick={reset}>Return to paddock</button></div></div>}
            {finished && telemetry && <div className="results-overlay"><div className="results-card"><span className="results-flag"><Trophy size={28} /></span><span className="eyebrow">{mode === 'cup' ? `APEX TOUR / ROUND ${CUP_TRACKS.indexOf(courseId) + 1}` : 'FINAL RESULT'}</span><h2>{telemetry.position === 1 ? 'Race victory!' : telemetry.position <= 3 ? 'A place on the podium.' : 'One more race?'}</h2><p>You finished {telemetry.position}{['', 'st', 'nd', 'rd'][telemetry.position] || 'th'} of 8 racers.</p><strong>{formatTime((result?.finish ?? 0) * 1000)}</strong><span className="results-best">BEST LAP {formatTime(Math.min(...telemetry.laps) * 1000)}</span><div className="result-laps">{telemetry.laps.map((time, i) => <span key={i}>LAP {i + 1}<b>{formatTime(time * 1000)}</b></span>)}</div>{mode === 'cup' ? <div className="cup-results"><h3>{cupComplete ? `Champion: ${totals[0]?.name}` : 'Championship standings'}</h3>{!telemetry.complete ? <p>Waiting for the field to finish… Points settle when all racers finish or after the 40-second cutoff.</p> : <ol>{totals.map(r => <li key={r.id} className={r.id===0?'is-you':''}><span>{r.name}</span><strong>{r.points} pts</strong></li>)}</ol>}{cupComplete ? <button className="primary-button" onClick={() => void begin()}>Race the cup again</button> : <button className="primary-button" disabled={!telemetry.complete || rounds.length !== CUP_TRACKS.indexOf(courseId)+1} onClick={() => void begin(CUP_TRACKS[rounds.length])}>Next: {COURSES[CUP_TRACKS[Math.min(2,CUP_TRACKS.indexOf(courseId)+1)]].name} <ArrowRight size={16}/></button>}</div> : <button className="primary-button" onClick={() => void begin()}>Race again <RotateCcw size={16} /></button>}<button className="secondary-button" onClick={reset}>Back to the paddock</button></div></div>}
          </div>
          <div className="track-info"><div className="track-number">0{ALL_TRACKS.indexOf(courseId)+1}</div><div><h2>{track.name}<span>{mode === 'cup' ? `APEX TOUR · ${CUP_TRACKS.indexOf(courseId)+1}/3` : track.name.toUpperCase()}</span></h2><p>{track.subtitle}</p></div><div className="track-details"><span><strong>{Math.round(track.courseLength)} m</strong>TRACK LENGTH</span><span><strong>3 laps</strong>8 RACERS</span><span><strong>4 power-ups</strong>MAXIMUM MISCHIEF</span></div></div>
        </section>
        <aside className="setup-panel">
          {running ? <><div className="setup-heading"><span className="eyebrow">{mode === 'cup' ? `APEX TOUR · ${CUP_TRACKS.indexOf(courseId)+1}/3` : track.name.toUpperCase()}</span><h2>{finished ? 'The finish order.' : 'The running order.'}</h2></div><div className="prix-standings">{telemetry?.standings.map((racer, index) => <div className={racer.id === 0 ? 'is-you' : ''} key={racer.id}><b>{index + 1}</b><i style={{ background: racer.color }} /><span>{racer.name}{racer.id === 0 && <small>YOU</small>}</span><em>{racer.finish !== null ? formatTime(racer.finish * 1000) : telemetry.complete ? 'DNF' : `LAP ${racer.lap}`}</em></div>)}</div><div className="race-side-tip"><Zap size={20} /><p>{telemetry?.item ? ITEMS[telemetry.item].description : 'Grab a floating cube to get a power-up. Press E or Shift to use it.'}</p></div><button className="secondary-button" onClick={reset}><RotateCcw size={15} />Return to paddock</button><p className="start-hint">C · camera &nbsp; P / Esc · pause &nbsp; R · reset</p></> : <>
            <div className="setup-heading"><span className="eyebrow">ONE PLAYER. SEVEN PERSONALITIES.</span><h2>Meet your rivals.</h2><span className="heading-number">/ 08</span></div>
            <div className="bot-preview">{BOT_PROFILES.map(bot => <span key={bot.name} title={bot.name} style={{ background: bot.color }}>{bot.name.charAt(0)}</span>)}</div><p className="mode-description">They steer. They overtake. They use items.</p>
            <label className="field-label" htmlFor="racer-name">RACER NAME<span>THAT’S YOU</span></label><div className="name-field"><span className="racer-avatar" style={{ background: color }}>{name.charAt(0) || 'R'}</span><input id="racer-name" value={name} maxLength={20} onChange={event => setName(event.target.value)} autoComplete="off" /></div>
            <div className="field-label color-label">YOUR RACING COLORS</div><div className="color-options">{COLORS.map((option, i) => <button key={option} style={{ '--kart-color': option } as React.CSSProperties} className={option === color ? 'selected' : ''} onClick={() => setColor(option)} aria-label={`Choose ${['tangerine', 'forest', 'blue', 'lilac', 'yellow'][i]} kart`} aria-pressed={option === color}>{option === color && <Check size={18} />}</button>)}</div>
            <div className="field-label color-label">THE COMPETITION<span>PICK YOUR PACE</span></div><div className="difficulty-picker">{(['easy', 'normal', 'hard'] as const).map(level => <button key={level} className={difficulty === level ? 'selected' : ''} onClick={() => setDifficulty(level)} aria-pressed={difficulty === level}>{level === 'easy' ? 'Cruise' : level === 'normal' ? 'Sport' : 'Expert'}</button>)}</div><p className="difficulty-hint">{difficulty === 'easy' ? 'A little room to find your racing line.' : difficulty === 'normal' ? 'Fast rivals. Fair fights. Bring your best.' : 'Aggressive pace. Every corner counts.'}</p>
            <div className="race-settings"><div><span><Flag size={15} />Grand Prix</span><strong>{mode === 'cup' ? '3 races · 8 racers' : '3 laps · 8 racers'}</strong></div><div><span><Ghost size={15} />Personal-best ghost</span><button disabled={!ghost.length} className={`toggle ${ghostEnabled ? 'on' : ''}`} aria-label="Toggle personal best ghost" aria-pressed={ghostEnabled} onClick={() => setGhostEnabled(value => !value)}><i /></button></div><small>{ghost.length ? 'Chase your fastest complete race.' : 'Finish a race to unlock your ghost.'}</small></div>
            <button className="primary-button" onClick={() => void begin()}>{mode === 'cup' ? 'Start the championship' : 'Let’s cause a little chaos'} <ArrowRight size={18} /></button><p className="start-hint">No lobby. No connection required. Just race.</p>
          </>}
        </aside>
      </div>
      {notice && <div className="notice" role="status"><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={15} /></button></div>}
      {!locked && <><div className="powerup-section"><div className="section-heading"><div><Zap size={18} /><h2>A little unfair advantage.</h2></div><span className="eyebrow">COLLECT A CUBE. PRESS E. CHANGE THE RACE.</span></div><div className="powerup-grid">{Object.entries(ITEMS).map(([id, item]) => <article key={id}><span className="powerup-icon" style={{ background: `${item.color}35`, color: item.color }}>{item.icon}</span><div><h3>{item.name}</h3><p>{item.description}</p></div></article>)}</div></div><div className="course-stories">{track.sectors.slice(0,4).map((sector,i)=><article key={sector}><span>0{i+1} / {track.name.toUpperCase()}</span><h3>{sector}</h3><p>{i===0?track.subtitle:i===1?'Read the corner, charge your drift, and protect your exit.':i===2?'Item rows reward a deliberate line through traffic.':'Save a turbo for the final push to the line.'}</p></article>)}</div></>}
      <footer><span className="footer-brand">apex <span>KART CLUB</span></span><span>Small karts. Big personalities.</span><span>SEE YOU ON THE PODIUM <Flag size={12} /></span></footer>
    </main>
    <dialog ref={dialog} onCancel={() => setModal(null)} onClick={event => { if (event.target === event.currentTarget) setModal(null); }} aria-label={modal === 'help' ? 'How to play' : 'Personal race records'}><div className="modal-content"><button className="modal-close" aria-label="Close dialog" onClick={() => setModal(null)}><X size={20} /></button>{modal === 'help' ? <><span className="eyebrow">WELCOME TO {mode === 'cup' ? `APEX TOUR · ${CUP_TRACKS.indexOf(courseId)+1}/3` : track.name.toUpperCase()}</span><h2>Eight racers. One podium.</h2><p>Beat seven bots around three laps of your selected course, or race all three in the Apex Tour championship. They follow the road, overtake, collide, and use the same items you do.</p><div className="help-controls">{[['W / ↑', 'Accelerate'], ['S / ↓', 'Brake, then reverse'], ['A D / ← →', 'Steer'], ['SPACE', 'Hold while turning to charge a drift. Release to mini-turbo.'], ['E / SHIFT', 'Use the item in your inventory'], ['P / ESC', 'Pause or resume the whole race'], ['C', 'Switch chase / overview camera'], ['R', 'Return to paddock; discard the current race']].map(([key, description]) => <div key={key}><kbd>{key}</kbd><span>{description}</span></div>)}</div><p>Floating cubes respawn five seconds after collection. Golden arrow pads boost you. The skybridge pad launches a jump. The rough observatory shortcut is fastest with a turbo.</p><p>Shields block one attack or expire after six seconds. Getting hit briefly spins you; you can still recover and win. Your best races and one full-race ghost are saved in this browser.</p><button className="primary-button" onClick={() => setModal(null)}>Got it. Let’s race. <ArrowRight size={16} /></button></> : <><span className="eyebrow">{COURSES[recordTrackId].name.toUpperCase()} / THIS BROWSER</span><h2>Your fastest flights.</h2><div className="record-track-tabs">{ALL_TRACKS.map(id => <button key={id} aria-pressed={recordTrackId===id} onClick={() => setRecordTrackId(id)}>{COURSES[id].name}</button>)}</div>{!visibleRecords.length ? <p>Finish your first Grand Prix to save a record and unlock your personal-best ghost.</p> : <div className="record-list">{visibleRecords.map((r, i) => <div key={r.id}><b>{String(i + 1).padStart(2, '0')}</b><span>{r.name}<small>{r.difficulty} · FINISHED #{r.position}</small></span><strong>{formatTime(r.time * 1000)}</strong></div>)}</div>}</>}</div></dialog>
  </div>;
}
