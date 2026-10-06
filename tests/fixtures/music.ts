import { GameAudio } from '../../client/audio';

// Observe the real browser media elements without production mutation hooks.
// Wrappers preserve native play/load/pause behavior and promises.
const media = new Set<HTMLMediaElement>();
const calls = { play: 0, pause: 0, load: 0, peakActive: 0 };
const measure = () => { calls.peakActive = Math.max(calls.peakActive, [...media].filter(element => !element.paused).length); };
function observe(element: HTMLMediaElement) {
  if (media.has(element)) return;
  media.add(element); element.addEventListener('play', measure); element.addEventListener('pause', measure);
}
const nativePlay = HTMLMediaElement.prototype.play;
const nativePause = HTMLMediaElement.prototype.pause;
const nativeLoad = HTMLMediaElement.prototype.load;
HTMLMediaElement.prototype.play = function () { observe(this); calls.play++; const result = nativePlay.call(this);
  void result.then(measure, () => {}); return result; };
HTMLMediaElement.prototype.pause = function () { observe(this); calls.pause++; nativePause.call(this); measure(); };
HTMLMediaElement.prototype.load = function () { observe(this); calls.load++; nativeLoad.call(this); };

localStorage.setItem('lagon-volume', '75');
const audio = new GameAudio();
const track = document.getElementById('track') as HTMLSelectElement;
const lap = document.getElementById('lap') as HTMLSelectElement;
const volume = document.getElementById('volume') as HTMLInputElement;
let active = false;
function update() { audio.update(0, false, '', false, -1, track.value, active, Number(lap.value)); }
document.getElementById('start')!.addEventListener('click', () => { audio.activate(); active = true; audio.setVolume(Number(volume.value)); update(); });
document.getElementById('stop')!.addEventListener('click', () => { active = false; update(); });
track.addEventListener('change', update); lap.addEventListener('change', update);
volume.addEventListener('input', () => { audio.activate(); audio.setVolume(Number(volume.value)); });
setInterval(() => { document.getElementById('status')!.textContent = JSON.stringify(audio.musicStatus, null, 2); }, 200);

const api = {
  status: () => audio.musicStatus,
  native() {
    measure();
    return { calls: { ...calls }, elements: [...media].map((element, id) => ({ id, url: element.currentSrc || element.src,
      paused: element.paused, currentTime: element.currentTime, duration: element.duration,
      readyState: element.readyState, loop: element.loop, ended: element.ended, error: element.error?.code ?? null })) };
  },
  set(id: string, playing: boolean, level = 75, lapIndex = 0) {
    track.value = id; lap.value = String(lapIndex); volume.value = String(level); active = playing;
    audio.setVolume(level); update();
  },
  frames(count: number) { for (let frame = 0; frame < count; frame++) update(); },
  hidden(hidden: boolean) {
    // Fixture-only event: no claim of physical phone lock/background validation.
    Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  },
  seekNearEnd() {
    const element = [...media].find(candidate => !candidate.paused);
    if (!element || !Number.isFinite(element.duration)) throw new Error('No decoded, playing media element');
    element.currentTime = Math.max(0, element.duration - .15);
    return { duration: element.duration, position: element.currentTime };
  },
  async decode(url: string) {
    const response = await fetch(url + '?validation=decode');
    if (!response.ok) throw new Error('MP3 decode fixture HTTP ' + response.status);
    const bytes = await response.arrayBuffer();
    const context = new AudioContext();
    try {
      const buffer = await context.decodeAudioData(bytes.slice(0));
      let peak = 0; let sum = 0; let nonFinite = 0; let samples = 0;
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        for (const sample of buffer.getChannelData(channel)) {
          peak = Math.max(peak, Math.abs(sample)); sum += sample * sample; samples++;
          if (!Number.isFinite(sample)) nonFinite++;
        }
      }
      return { url, bytes: bytes.byteLength, seconds: buffer.duration, sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels, samples, peak, rms: Math.sqrt(sum / samples), nonFinite };
    } finally { await context.close(); }
  },
};
(window as unknown as { __musicTest: typeof api }).__musicTest = api;
