import { useCallback, useEffect, useRef } from 'react';

export interface KartInput {
  throttle: number; steer: number; drift: boolean;
  reset: boolean; camera: boolean; useItem: boolean; pause: boolean;
}
const handled = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space', 'KeyR', 'KeyC', 'KeyE', 'ShiftLeft', 'ShiftRight', 'Escape', 'KeyP']);
const empty = (): KartInput => ({ throttle: 0, steer: 0, drift: false, reset: false, camera: false, useItem: false, pause: false });

// The hook owns input intent; the fixed-step race simulation owns drift charge,
// turbo duration and item consumption so bots and the player share the rules.
export function useKartControls() {
  const keys = useRef(new Set<string>());
  const input = useRef<KartInput>(empty());
  const setPressed = useCallback((code: string, pressed: boolean) => {
    if (pressed) keys.current.add(code); else keys.current.delete(code);
    const has = (...codes: string[]) => codes.some(key => keys.current.has(key));
    input.current.throttle = Number(has('KeyW', 'ArrowUp')) - Number(has('KeyS', 'ArrowDown'));
    input.current.steer = Number(has('KeyA', 'ArrowLeft')) - Number(has('KeyD', 'ArrowRight'));
    input.current.drift = has('Space');
    if (pressed && code === 'KeyR') input.current.reset = true;
    if (pressed && code === 'KeyC') input.current.camera = true;
    if (pressed && ['KeyE', 'ShiftLeft', 'ShiftRight'].includes(code)) input.current.useItem = true;
    if (pressed && ['Escape', 'KeyP'].includes(code)) input.current.pause = true;
  }, []);
  const releaseAll = useCallback(() => { keys.current.clear(); Object.assign(input.current, empty()); }, []);
  useEffect(() => {
    const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
    const down = (event: KeyboardEvent) => {
      if (isTyping(event.target) || document.querySelector('dialog[open]') || !handled.has(event.code) || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault(); if (!event.repeat) setPressed(event.code, true);
    };
    const up = (event: KeyboardEvent) => { if (handled.has(event.code)) setPressed(event.code, false); };
    const visibility = () => { if (document.hidden) releaseAll(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', releaseAll); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', releaseAll); document.removeEventListener('visibilitychange', visibility); releaseAll(); };
  }, [setPressed, releaseAll]);
  return { input, setPressed, releaseAll };
}
