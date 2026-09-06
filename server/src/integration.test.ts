import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { COLORS, TRACK, trackPoint, trackYaw, type ClientEvents, type ServerEvents, type Ack, type JoinRequest, type RoomSnapshot, type LapRecord } from '@apex/shared';
import { createGameServer } from './index.js';

const waitFor = async (predicate: () => boolean, timeoutMs = 3000) => {
  const started = Date.now();
  while (!predicate()) { if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for socket event.'); await new Promise(resolve => setTimeout(resolve, 20)); }
};
type Client = Socket<ServerEvents, ClientEvents>;
function join(client: Client, request: JoinRequest) {
  return new Promise<Parameters<Ack<{ token: string; room: RoomSnapshot }>>[0]>(resolve => client.emit('room:join', request, resolve));
}
test('REST validation, replay protection, leaderboard/ghost storage and live room isolation', { timeout: 15_000 }, async t => {
  let now = 0;
  const server = createGameServer({ now: () => now });
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
  const clients: Client[] = [];
  t.after(async () => {
    clients.forEach(client => client.disconnect());
    await new Promise<void>(resolve => server.io.close(() => resolve()));
  });
  const createClient = async () => {
    const client: Client = connect(base, { transports: ['websocket'], forceNew: true }); clients.push(client);
    await new Promise<void>((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); }); return client;
  };
  const a = await createClient(), b = await createClient(), outsider = await createClient();
  const joined = await join(a, { name: 'Ada', color: COLORS[0], mode: 'private', room: 'TEST01' });
  assert.equal(joined.ok, true); if (!joined.ok) return;
  const second = await join(b, { name: 'Grace', color: COLORS[1], mode: 'private', room: 'TEST01' });
  assert.equal(second.ok, true); if (!second.ok) return;
  assert.equal(second.data.room.players.length, 2);
  const solo = await join(outsider, { name: 'Solo', color: COLORS[2], mode: 'solo', room: '' });
  assert.equal(solo.ok, true);
  let roomState: RoomSnapshot | undefined;
  let leaked = false;
  b.on('room:state', room => { roomState = room; });
  outsider.on('room:state', room => { if (room.code === 'TEST01') leaked = true; });
  a.emit('kart:update', { position: [1, 0.8, -36], rotation: [0, 1, 0], speed: 10, lap: 1, progress: 0.01 });
  await waitFor(() => roomState?.players.some(p => p.name === 'Ada' && p.position[0] === 1) ?? false);
  assert.equal(leaked, false);
  const health = await fetch(`${base}/api/health`); assert.equal(health.status, 200);
  assert.equal((await fetch(`${base}/api/leaderboard?trackId=unknown`)).status, 400);
  assert.equal((await fetch(`${base}/api/times`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  const started = await new Promise<Parameters<Ack<{ runId: string }>>[0]>(resolve => a.emit('race:start', resolve));
  assert.equal(started.ok, true); if (!started.ok) return;
  const lap = { runId: started.data.runId, trackId: TRACK.id, lap: 1, durationMs: 20_000, checkpoints: Array.from({ length: 8 }, (_, i) => ({ index: i + 1, timeMs: (i + 1) * 2500 })), ghost: Array.from({ length: 201 }, (_, i) => ({ t: i * 100, position: trackPoint(i / 200), yaw: trackYaw(i / 200) })) };
  const post = (body: unknown) => fetch(`${base}/api/times`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${joined.data.token}` }, body: JSON.stringify(body) });
  assert.equal((await post(lap)).status, 422, 'cannot submit before enough real race time has elapsed');
  now = 20_050;
  let liveRecords: LapRecord[] = [];
  outsider.on('leaderboard:update', records => { liveRecords = records; });
  const saved = await post(lap); assert.equal(saved.status, 201);
  const record = await saved.json() as LapRecord;
  await waitFor(() => liveRecords.length === 1);
  assert.equal(liveRecords[0].name, 'Ada');
  assert.equal((await post(lap)).status, 409, 'replayed submission rejected');
  assert.equal((await post({ ...lap, lap: 3 })).status, 409, 'skipped lap rejected');
  assert.equal((await post({ ...lap, lap: 2, checkpoints: [] })).status, 400);
  const leaderboard = await (await fetch(`${base}/api/leaderboard`)).json() as LapRecord[];
  assert.equal(leaderboard.length, 1); assert.equal(leaderboard[0].durationMs, 20_000);
  const ghost = await (await fetch(`${base}/api/ghosts/${record.id}`)).json() as unknown[];
  assert.equal(ghost.length, 201);
  assert.equal((await fetch(`${base}/api/ghosts/missing`)).status, 404);
  now = 40_100; assert.equal((await post({ ...lap, lap: 2 })).status, 201);
  now = 60_100; assert.equal((await post({ ...lap, lap: 3 })).status, 201);
  a.disconnect();
  await waitFor(() => roomState?.players.length === 1);
  assert.equal((await post(lap)).status, 401, 'disconnected session token is revoked');
});

test('matchmaking fills public rooms and enforces eight-player capacity', { timeout: 15_000 }, async t => {
  const server = createGameServer();
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
  const clients: Client[] = [];
  t.after(async () => { clients.forEach(client => client.disconnect()); await new Promise<void>(resolve => server.io.close(() => resolve())); });
  const rooms: string[] = [];
  for (let i = 0; i < 9; i++) {
    const client: Client = connect(base, { transports: ['websocket'], forceNew: true }); clients.push(client);
    await new Promise<void>((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
    const result = await join(client, { name: `Racer ${i}`, color: COLORS[0], room: '', mode: 'public' });
    assert.equal(result.ok, true); if (result.ok) rooms.push(result.data.room.code);
  }
  assert.equal(new Set(rooms.slice(0, 8)).size, 1);
  assert.notEqual(rooms[8], rooms[0]);
  const extra: Client = connect(base, { transports: ['websocket'], forceNew: true }); clients.push(extra);
  await new Promise<void>((resolve, reject) => { extra.once('connect', resolve); extra.once('connect_error', reject); });
  const rejected = await join(extra, { name: 'Overflow', color: COLORS[0], room: rooms[0], mode: 'private' });
  assert.equal(rejected.ok, false); if (!rejected.ok) assert.match(rejected.error, /full/);
  await new Promise(resolve => setTimeout(resolve, 550));
  const rejoined = await join(clients[0], { name: 'Updated racer', color: COLORS[1], room: '', mode: 'public' });
  assert.equal(rejoined.ok, true);
  if (rejoined.ok) { assert.equal(rejoined.data.room.code, rooms[0]); assert.equal(rejoined.data.room.players.length, 8); }
});

test('starting again with an empty private code preserves the existing room', { timeout: 10_000 }, async t => {
  const server = createGameServer();
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const client: Client = connect(`http://127.0.0.1:${(server.http.address() as AddressInfo).port}`, { transports: ['websocket'] });
  t.after(async () => { client.disconnect(); await new Promise<void>(resolve => server.io.close(() => resolve())); });
  await new Promise<void>((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
  const request: JoinRequest = { name: 'Room host', color: COLORS[0], room: '', mode: 'private' };
  const first = await join(client, request);
  await new Promise(resolve => setTimeout(resolve, 550));
  const second = await join(client, request);
  assert.equal(first.ok, true); assert.equal(second.ok, true);
  if (first.ok && second.ok) { assert.equal(first.data.room.code, second.data.room.code); assert.notEqual(first.data.token, second.data.token); }
});
