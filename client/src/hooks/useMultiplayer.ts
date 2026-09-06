import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { COLORS, type ClientEvents, type ServerEvents, type JoinRequest, type LapRecord, type LapSubmission, type Player, type RoomSnapshot, type Ack } from '@apex/shared';

export const defaultProfile: JoinRequest = { name: 'Racer 01', color: COLORS[0], mode: 'solo', room: '' };
export function useMultiplayer() {
  const socket = useRef<Socket<ServerEvents, ClientEvents> | null>(null);
  const profile = useRef(defaultProfile);
  const token = useRef('');
  const peers = useRef<Player[]>([]);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<RoomSnapshot>({ code: '', players: [] });
  const [leaderboard, setLeaderboard] = useState<LapRecord[]>([]);
  const [error, setError] = useState('');
  const join = useCallback(async (request: JoinRequest): Promise<void> => {
    if (!socket.current?.connected) throw new Error('Server is unavailable. Check that the server is running.');
    return new Promise((resolve, reject) => {
      socket.current!.timeout(5000).emit('room:join', request, (timeout: Error | null, result: Parameters<Ack<{ token: string; room: RoomSnapshot }>>[0]) => {
        if (timeout) { reject(new Error('Room request timed out.')); return; }
        if (!result.ok) { reject(new Error(result.error)); return; }
        profile.current = request;
        token.current = result.data.token;
        setRoom(result.data.room);
        setConnected(true);
        setError('');
        resolve();
      });
    });
  }, []);
  useEffect(() => {
    const client: Socket<ServerEvents, ClientEvents> = io({ autoConnect: false });
    socket.current = client;
    client.on('connect', () => { void join(profile.current).catch((e: Error) => setError(e.message)); });
    client.on('disconnect', () => { setConnected(false); token.current = ''; peers.current = []; setRoom({ code: '', players: [] }); });
    client.on('connect_error', () => { setConnected(false); setError('Server offline. Start both apps with npm run dev.'); });
    client.on('room:state', snapshot => { setRoom(snapshot); peers.current = snapshot.players.filter(p => p.id !== client.id); });
    client.on('leaderboard:update', setLeaderboard);
    client.connect();
    const controller = new AbortController();
    fetch('/api/leaderboard', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Leaderboard is unavailable.');
      setLeaderboard(await response.json() as LapRecord[]);
    }).catch(() => { /* The socket will supply the leaderboard on connection. */ });
    return () => { controller.abort(); client.disconnect(); socket.current = null; };
  }, [join]);
  const startRace = useCallback((): Promise<string> => new Promise((resolve, reject) => {
    if (!socket.current?.connected) { reject(new Error('Connect to the server to start a race.')); return; }
    socket.current.timeout(5000).emit('race:start', (timeout: Error | null, result: Parameters<Ack<{ runId: string }>>[0]) => {
      if (timeout) reject(new Error('Race request timed out.'));
      else if (!result.ok) reject(new Error(result.error));
      else resolve(result.data.runId);
    });
  }), []);
  const cancelRace = useCallback(() => { socket.current?.emit('race:cancel'); }, []);
  const sendState = useCallback((state: Pick<Player, 'position' | 'rotation' | 'speed' | 'lap' | 'progress'>) => {
    if (socket.current?.connected) socket.current.volatile.emit('kart:update', state);
  }, []);
  const submitLap = useCallback(async (lap: LapSubmission) => {
    const response = await fetch('/api/times', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.current}` }, body: JSON.stringify(lap), signal: AbortSignal.timeout(10_000) });
    const body = await response.json() as LapRecord & { error?: string };
    if (!response.ok) throw new Error(body.error ?? 'Could not save lap.');
    return body;
  }, []);
  return { connected, room, leaderboard, error, peers, join, startRace, cancelRace, sendState, submitLap };
}
