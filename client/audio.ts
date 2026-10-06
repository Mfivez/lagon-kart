/** Original synthesized effects: no remote audio or downloaded samples. */
export class GameAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private engine?: OscillatorNode;
  private engineGain?: GainNode;
  private volume = Number(localStorage.getItem('lagon-volume') ?? '35') / 100;
  private lastItem = '';
  private lastBoost = false;
  private lastCount = -1;

  get level() { return Math.round(this.volume * 100); }

  activate() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume * 0.18;
      this.master.connect(this.context.destination);
      this.engine = this.context.createOscillator();
      this.engine.type = 'triangle';
      this.engineGain = this.context.createGain();
      this.engineGain.gain.value = 0;
      this.engine.connect(this.engineGain).connect(this.master);
      this.engine.start();
    }
    void this.context.resume();
  }

  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(100, value)) / 100;
    localStorage.setItem('lagon-volume', String(this.level));
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.volume * 0.18, this.context.currentTime, 0.1);
  }

  private tone(frequency: number, duration = 0.13, delay = 0) {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const time = this.context.currentTime + delay;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(time);
    oscillator.stop(time + duration);
  }

  update(speed: number, active: boolean, item: string, boost: boolean, countdown: number) {
    if (this.engine && this.engineGain && this.context) {
      this.engine.frequency.setTargetAtTime(55 + Math.abs(speed) * 5, this.context.currentTime, 0.08);
      this.engineGain.gain.setTargetAtTime(active ? 0.1 + Math.abs(speed) / 180 : 0, this.context.currentTime, 0.12);
    }
    if (item && item !== this.lastItem) { this.tone(660); this.tone(880, 0.2, 0.1); }
    if (boost && !this.lastBoost) { this.tone(440, 0.2); this.tone(880, 0.3, 0.12); }
    if (countdown !== this.lastCount && countdown >= 0 && countdown <= 3) this.tone(countdown === 0 ? 1046 : 523, countdown === 0 ? 0.5 : 0.15);
    this.lastItem = item;
    this.lastBoost = boost;
    this.lastCount = countdown;
  }
}
