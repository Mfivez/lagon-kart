import { RaceMusic } from './music';

/** Original synthesized effects plus the user's MP3 music, all served locally. */
export class GameAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private engine?: OscillatorNode;
  private engineGain?: GainNode;
  private music?: RaceMusic;
  private volume = Number(localStorage.getItem('lagon-volume') ?? '35') / 100;
  private lastItem = '';
  private lastBoost = false;
  private lastCount = -1;
  private musicTrack = 'lagon';
  private musicActive = false;
  private musicLap = 0;

  get level() { return Math.round(this.volume * 100); }
  get musicStatus() { return this.music?.diagnostics ?? { running: false, title: 'Lap 1', track: this.musicTrack,
    lap: this.musicLap, selected: 'lap1', url: '/audio/lap-1-v1.mp3', wanted: this.musicActive,
    status: 'idle', currentTime: 0, duration: null, readyState: 0, paused: true, volume: this.volume,
    mixGain: 1.5, elementCount: 0, activeElements: 0, playCount: 0, loadCount: 0, error: null, mediaError: null }; }

  activate() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume * 0.18;
      this.master.connect(this.context.destination);
      this.music = new RaceMusic(this.context, this.master);
      this.engine = this.context.createOscillator();
      this.engine.type = 'triangle';
      this.engineGain = this.context.createGain();
      this.engineGain.gain.value = 0;
      this.engine.connect(this.engineGain).connect(this.master);
      this.engine.start();
    }
    this.music?.activate();
    void this.context.resume().catch(() => { /* A subsequent user gesture may enable browser audio. */ });
  }

  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(100, value)) / 100;
    localStorage.setItem('lagon-volume', String(this.level));
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.volume * 0.18, this.context.currentTime, 0.1);
    this.music?.update(this.musicTrack, this.musicActive, this.volume, this.musicLap);
  }

  bounce() {
    this.tone(523, 0.08);
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
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }

  update(speed: number, active: boolean, item: string, boost: boolean, countdown: number, trackId = 'lagon', musicActive = active, lap = 0) {
    this.musicTrack = trackId; this.musicActive = musicActive; this.musicLap = lap;
    this.music?.update(trackId, musicActive, this.volume, lap);
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
