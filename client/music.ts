/** The user's supplied MP3s, served locally; no synthesis, remote audio or third-party service. */
export const MUSIC_FILES = {
  lap1: { title: 'Lap 1', url: '/audio/lap-1-v1.mp3' },
  lap2: { title: 'Lap 2', url: '/audio/lap-2-v1.mp3' },
} as const;
export type MusicSelection = keyof typeof MUSIC_FILES;
export const MUSIC_MIX_GAIN = 1.5; // With the existing 0.18 master gain: at most 0.27 at full volume.
type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'blocked' | 'error';
interface Player {
  selection: MusicSelection;
  element: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  desired: boolean;
  generation: number;
  status: PlaybackStatus;
  error: string | null;
  pauseTimer?: ReturnType<typeof setTimeout>;
  errorListener: () => void;
}

/** Reuses at most two native streaming players, whose playback clock is independent of render FPS. */
export class RaceMusic {
  private readonly players = new Map<MusicSelection, Player>();
  private track = 'lagon';
  private lap = 0;
  private selected: MusicSelection = 'lap1';
  private wanted = false;
  private volume = 1;
  private playCount = 0;
  private loadCount = 0;
  private disposed = false;
  private readonly visibility = () => this.reconcile();
  constructor(private readonly context: AudioContext, private readonly destination: AudioNode) {
    document.addEventListener('visibilitychange', this.visibility);
    context.addEventListener('statechange', this.visibility);
  }
  get diagnostics() {
    const player = this.players.get(this.selected);
    const element = player?.element;
    return { title: MUSIC_FILES[this.selected].title, track: this.track, lap: this.lap, selected: this.selected,
      url: MUSIC_FILES[this.selected].url, wanted: this.wanted,
      running: !!player?.desired && player.status === 'playing' && !element!.paused,
      status: player?.status ?? 'idle', currentTime: element?.currentTime ?? 0,
      duration: element && Number.isFinite(element.duration) ? element.duration : null,
      readyState: element?.readyState ?? 0, paused: element?.paused ?? true,
      volume: this.volume, mixGain: MUSIC_MIX_GAIN, elementCount: this.players.size,
      activeElements: [...this.players.values()].filter(value => !value.element.paused).length,
      playCount: this.playCount, loadCount: this.loadCount, error: player?.error ?? null,
      mediaError: element?.error?.code ?? null };
  }
  /** Called from the existing user-gesture handlers; only autoplay denial is retryable. */
  activate() {
    const player = this.players.get(this.selected);
    if (player?.status === 'blocked') { player.status = 'paused'; player.error = null; }
    this.reconcile();
  }
  update(track: string, active: boolean, volume = 1, lap = 0) {
    if (this.disposed) return;
    const nextLap = Number.isFinite(lap) ? Math.max(0, Math.floor(lap)) : 0;
    const nextSelection: MusicSelection = nextLap >= 1 ? 'lap2' : 'lap1';
    if (track !== this.track || nextSelection !== this.selected) {
      // Pause the old player before starting another: never two audible songs at once.
      for (const player of this.players.values()) this.halt(player, true, true);
      this.track = track; this.selected = nextSelection;
    }
    if (!active && this.wanted) for (const player of this.players.values()) this.halt(player, true);
    this.lap = nextLap; this.wanted = active;
    this.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0;
    this.reconcile();
  }
  private createPlayer(selection: MusicSelection): Player {
    const element = document.createElement('audio');
    element.preload = 'auto'; element.loop = true;
    // This element is retained for the page lifetime; its src is never reset between laps or races.
    element.src = MUSIC_FILES[selection].url;
    const source = this.context.createMediaElementSource(element);
    const gain = this.context.createGain(); gain.gain.value = 0;
    source.connect(gain).connect(this.destination);
    const player: Player = { selection, element, source, gain, desired: false, generation: 0,
      status: 'idle', error: null, errorListener: () => {} };
    player.errorListener = () => {
      this.halt(player, false, true); player.status = 'error';
      player.error = 'Impossible de lire ' + MUSIC_FILES[selection].url + ' (code ' + (element.error?.code ?? 'inconnu') + ')';
    };
    element.addEventListener('error', player.errorListener);
    this.players.set(selection, player); this.loadCount++;
    return player;
  }
  private reconcile() {
    if (this.disposed) return;
    const allowed = this.wanted && this.volume > 0 && !document.hidden && this.context.state === 'running';
    let player = this.players.get(this.selected);
    if (!allowed) {
      if (player?.desired) this.halt(player, false, document.hidden || this.context.state !== 'running');
      return;
    }
    player ??= this.createPlayer(this.selected);
    if (player.desired || player.status === 'error' || player.status === 'blocked') return;
    this.start(player);
  }
  private start(player: Player) {
    if (player.pauseTimer !== undefined) { clearTimeout(player.pauseTimer); player.pauseTimer = undefined; }
    player.desired = true; player.status = 'loading'; player.error = null;
    const generation = ++player.generation; this.playCount++;
    const now = this.context.currentTime;
    player.gain.gain.cancelScheduledValues(now); player.gain.gain.setValueAtTime(0, now);
    void player.element.play().then(() => {
      if (generation !== player.generation || this.disposed) return;
      if (!player.desired) { player.element.pause(); return; }
      player.status = 'playing';
      const time = this.context.currentTime;
      player.gain.gain.cancelScheduledValues(time); player.gain.gain.setValueAtTime(0, time);
      player.gain.gain.linearRampToValueAtTime(MUSIC_MIX_GAIN, time + .18);
    }).catch((error: unknown) => {
      if (generation !== player.generation || this.disposed) return;
      player.desired = false; player.element.pause();
      const name = error instanceof DOMException || error instanceof Error ? error.name : '';
      player.status = name === 'NotAllowedError' ? 'blocked' : name === 'AbortError' ? 'paused' : 'error';
      player.error = name === 'AbortError' ? null : error instanceof Error ? error.message : String(error);
    });
  }
  private halt(player: Player, reset = false, immediate = false) {
    const wasDesired = player.desired;
    player.desired = false; player.generation++;
    if (player.pauseTimer !== undefined) { clearTimeout(player.pauseTimer); player.pauseTimer = undefined; }
    const now = this.context.currentTime;
    player.gain.gain.cancelScheduledValues(now); player.gain.gain.setTargetAtTime(0, now, .025);
    const pause = () => {
      player.element.pause(); player.pauseTimer = undefined;
      player.gain.gain.setValueAtTime(0, this.context.currentTime);
      if (reset) { try { player.element.currentTime = 0; } catch { /* Metadata may not be available yet. */ } }
      if (player.status !== 'error' && player.status !== 'blocked') player.status = 'paused';
    };
    if (immediate || !wasDesired || player.element.paused || this.context.state !== 'running') pause();
    else player.pauseTimer = setTimeout(pause, 140);
  }
  dispose() {
    this.disposed = true; this.wanted = false;
    document.removeEventListener('visibilitychange', this.visibility);
    this.context.removeEventListener('statechange', this.visibility);
    for (const player of this.players.values()) {
      this.halt(player, true, true); player.element.removeEventListener('error', player.errorListener);
      player.element.removeAttribute('src'); player.element.load();
      player.source.disconnect(); player.gain.disconnect();
    }
    this.players.clear();
  }
}
