import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { Server } from 'socket.io';
import { z } from 'zod';
import { COLORS, TRACK, trackPoint, trackYaw, type ClientEvents, type ServerEvents, type Player, type RoomSnapshot } from '@apex/shared';
import { lapSchema, validateLap, vectorSchema } from './validation.js';
import { MemoryStore } from './store.js';

interface Run { id: string; startedAt: number; nextLap: number; submittedMs: number }
interface Session { token: string; room: string; player: Player; run?: Run; lastUpdate: number; lastJoin: number }
const joinSchema = z.object({ name: z.string().trim().min(1).max(20), color: z.enum(COLORS), room: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{0,8}$/), mode: z.enum(['solo', 'public', 'private']) });
const stateSchema = z.object({ position: vectorSchema, rotation: z.tuple([z.number().finite().min(-1000).max(1000), z.number().finite().min(-1000).max(1000), z.number().finite().min(-1000).max(1000)]), speed: z.number().finite().min(0).max(200), lap: z.number().int().min(1).max(TRACK.laps), progress: z.number().finite().min(0).max(1) });

export function createGameServer({ now = () => performance.now() }: { now?: () => number } = {}) {
  const app = express();
  const http = createServer(app);
  const origins = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',');
  const io = new Server<ClientEvents, ServerEvents>(http, { cors: { origin: origins }, maxHttpBufferSize: 32_768 });
  const store = new MemoryStore();
  const sessions = new Map<string, Session>();
  const tokens = new Map<string, Session>();
  const roomModes = new Map<string, 'solo' | 'public' | 'private'>();
  const dirtyRooms = new Set<string>();
  app.disable('x-powered-by');
  app.use(cors({ origin: origins }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));

  const snapshot = (code: string): RoomSnapshot => ({ code, players: [...sessions.values()].filter(s => s.room === code).map(s => s.player) });
  const publishRoom = (code: string) => {
    const room = snapshot(code);
    if (!room.players.length) roomModes.delete(code);
    io.to(code).emit('room:state', room);
  };
  app.get('/api/health', (_req, res) => { res.json({ ok: true }); });
  app.get('/api/leaderboard', (req, res) => {
    const trackId = req.query.trackId ?? TRACK.id;
    if (trackId !== TRACK.id) { res.status(400).json({ error: 'Unknown track.' }); return; }
    res.json(store.leaderboard(TRACK.id));
  });
  app.get('/api/ghosts/:id', (req, res) => {
    const ghost = store.ghost(req.params.id);
    if (!ghost) { res.status(404).json({ error: 'Ghost not found.' }); return; }
    res.json(ghost);
  });
  app.post('/api/times', (req, res) => {
    const token = req.get('authorization')?.replace(/^Bearer /, '');
    const session = token ? tokens.get(token) : undefined;
    if (!session) { res.status(401).json({ error: 'Join a room before submitting a lap.' }); return; }
    const parsed = lapSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid lap payload.', details: parsed.error.flatten() }); return; }
    const lap = parsed.data;
    const run = session.run;
    if (!run || run.id !== lap.runId || run.nextLap !== lap.lap) { res.status(409).json({ error: 'Race expired, lap out of order, or lap already submitted.' }); return; }
    const error = validateLap(lap, now() - run.startedAt, run.submittedMs);
    if (error) { res.status(422).json({ error }); return; }
    const record = store.save(session.player, TRACK.id, lap.durationMs, lap.ghost);
    run.nextLap++;
    run.submittedMs += lap.durationMs;
    io.emit('leaderboard:update', store.leaderboard(TRACK.id));
    res.status(201).json(record);
  });

  io.on('connection', socket => {
    socket.on('room:join', (request, ack) => {
      if (typeof ack !== 'function') return;
      const parsed = joinSchema.safeParse(request);
      if (!parsed.success) { ack({ ok: false, error: 'Use a name (1–20 characters) and an alphanumeric room code (up to 8 characters).' }); return; }
      const old = sessions.get(socket.id);
      if (old && Date.now() - old.lastJoin < 500) { ack({ ok: false, error: 'Please wait a moment before changing rooms.' }); return; }
      const { name, color, mode } = parsed.data;
      let code = parsed.data.room;
      if (mode === 'solo') code = '';
      if (mode === 'public') code = old && roomModes.get(old.room) === 'public' ? old.room : [...roomModes.keys()].find(key => roomModes.get(key) === 'public' && snapshot(key).players.length < 8) ?? '';
      if (mode === 'private' && !code && old && roomModes.get(old.room) === 'private') code = old.room;
      if (!code) { do { code = randomBytes(3).toString('hex').toUpperCase(); } while (roomModes.has(code)); }
      if (roomModes.get(code) === 'solo' && old?.room !== code) { ack({ ok: false, error: 'This is a solo session.' }); return; }
      if (snapshot(code).players.filter(p => p.id !== socket.id).length >= 8) { ack({ ok: false, error: 'That room is full (8 racers maximum).' }); return; }
      if (old) { socket.leave(old.room); tokens.delete(old.token); sessions.delete(socket.id); publishRoom(old.room); }
      const session: Session = { token: randomUUID(), room: code, lastUpdate: 0, lastJoin: Date.now(), player: { id: socket.id, name, color, position: trackPoint(0), rotation: [0, trackYaw(0), 0], speed: 0, lap: 1, progress: 0 } };
      sessions.set(socket.id, session);
      tokens.set(session.token, session);
      if (!roomModes.has(code)) roomModes.set(code, mode);
      socket.join(code);
      ack({ ok: true, data: { token: session.token, room: snapshot(code) } });
      publishRoom(code);
      socket.emit('leaderboard:update', store.leaderboard(TRACK.id));
    });
    socket.on('race:start', ack => {
      if (typeof ack !== 'function') return;
      const session = sessions.get(socket.id);
      if (!session) { ack({ ok: false, error: 'Join a room first.' }); return; }
      if (session.run && now() - session.run.startedAt < 1000) { ack({ ok: false, error: 'Please wait before restarting.' }); return; }
      session.run = { id: randomUUID(), startedAt: now(), nextLap: 1, submittedMs: 0 };
      ack({ ok: true, data: { runId: session.run.id } });
    });
    socket.on('race:cancel', () => { const session = sessions.get(socket.id); if (session) session.run = undefined; });
    socket.on('kart:update', payload => {
      const session = sessions.get(socket.id);
      if (!session || Date.now() - session.lastUpdate < 40) return;
      const state = stateSchema.safeParse(payload);
      if (!state.success) return;
      Object.assign(session.player, state.data);
      session.lastUpdate = Date.now();
      dirtyRooms.add(session.room);
    });
    socket.on('disconnect', () => {
      const session = sessions.get(socket.id);
      if (!session) return;
      tokens.delete(session.token);
      sessions.delete(socket.id);
      publishRoom(session.room);
    });
  });

  const ticker = setInterval(() => { for (const code of dirtyRooms) publishRoom(code); dirtyRooms.clear(); }, 50);
  ticker.unref();
  http.on('close', () => clearInterval(ticker));
  const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('/{*path}', (req, res, next) => {
      if (req.path.startsWith('/api/')) { next(); return; }
      res.sendFile(resolve(clientDist, 'index.html'));
    });
  }
  app.use((_req, res) => { res.status(404).json({ error: 'Not found.' }); });
  app.use((error: { status?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = error.status ?? 500;
    if (status >= 500) console.error(error);
    res.status(status).json({ error: status >= 500 ? 'Internal server error.' : 'Invalid or oversized request body.' });
  });
  return { app, http, io, store };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { http, io } = createGameServer();
  const port = Number(process.env.PORT ?? 3001);
  http.listen(port, '0.0.0.0', () => console.log(`Apex server running on http://localhost:${port}`));
  const close = () => { io.close(); http.close(); };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}
