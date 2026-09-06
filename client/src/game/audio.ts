// Procedural Web Audio: no sound downloads, and no playback before a user gesture.
export class RaceAudio {
  private context: AudioContext | null = null;
  private engine: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private master: GainNode | null = null;
  enabled = true;
  async unlock() {
    if (!this.context) {
      this.context = new AudioContext(); this.master = this.context.createGain(); this.master.gain.value = this.enabled ? .18 : 0; this.master.connect(this.context.destination);
      this.engine = this.context.createOscillator(); this.engine.type = 'sawtooth';
      const filter = this.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 480;
      this.engineGain = this.context.createGain(); this.engineGain.gain.value = 0;
      this.engine.connect(filter); filter.connect(this.engineGain); this.engineGain.connect(this.master); this.engine.start();
    }
    await this.context.resume();
  }
  mute(muted: boolean) { this.enabled = !muted; if (this.master && this.context) this.master.gain.setTargetAtTime(muted ? 0 : .18, this.context.currentTime, .05); }
  update(speed: number, drifting: boolean, active: boolean) {
    if (!this.context || !this.engine || !this.engineGain) return;
    this.engine.frequency.setTargetAtTime(42 + speed * 2 + (drifting ? 20 : 0), this.context.currentTime, .1);
    this.engineGain.gain.setTargetAtTime(active ? .1 + speed / 300 : 0, this.context.currentTime, .12);
  }
  play(type: string) {
    if (!this.context || !this.master || !this.enabled) return;
    const notes = type === 'finish' ? [523, 659, 784, 1047] : type === 'lap' ? [659, 880] : type === 'count' ? [440] : type === 'go' ? [880, 1174] : type === 'pickup' ? [784, 1047] : type === 'boost' ? [180, 360, 720] : type === 'hit' ? [110, 70] : [440, 660];
    notes.forEach((frequency, index) => {
      const ctx = this.context!, oscillator = ctx.createOscillator(), gain = ctx.createGain(), at = ctx.currentTime + index * .085;
      oscillator.type = type === 'hit' ? 'sawtooth' : 'triangle'; oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(.001, at); gain.gain.linearRampToValueAtTime(.35, at + .01); gain.gain.exponentialRampToValueAtTime(.001, at + .19);
      oscillator.connect(gain); gain.connect(this.master!); oscillator.start(at); oscillator.stop(at + .2);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  }
  dispose() { this.engine?.stop(); void this.context?.close(); this.context = null; }
}
