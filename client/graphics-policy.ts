export type GraphicsMode = 'auto' | 'smooth' | 'detailed';
export type GraphicsQuality = 'standard' | 'light';
export const GRAPHICS_STORAGE_KEY = 'lagon-graphics-quality';
export const graphicsMode = (value: unknown): GraphicsMode => value === 'smooth' || value === 'detailed' ? value : 'auto';

/** Visual preferences never change physics, input cadence or server snapshots. */
export class GraphicsPolicy {
  mode: GraphicsMode = 'auto';
  private downgraded = false;
  private slowSamples = 0;
  get quality(): GraphicsQuality { return this.mode === 'smooth' || this.mode === 'auto' && this.downgraded ? 'light' : 'standard'; }
  setMode(mode: GraphicsMode) { this.mode = graphicsMode(mode); this.downgraded = false; this.slowSamples = 0; }
  observeFps(fps: number, racing: boolean): boolean {
    if (this.mode !== 'auto' || !racing || !Number.isFinite(fps)) { this.slowSamples = 0; return false; }
    this.slowSamples = fps < 20 ? this.slowSamples + 1 : 0;
    if (this.slowSamples < 3 || this.downgraded) return false;
    this.downgraded = true; return true;
  }
  pixelRatio(deviceRatio: number): number {
    return Math.min(Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1, this.quality === 'light' ? .8 : 1.6);
  }
}

export interface RenderContext { hidden?: boolean; opaqueDialog?: boolean }
/** Call before any scene work; the caller's Colyseus/input loop remains live. */
export class RenderPacer {
  private lastFrame = -Infinity;
  private lastRacing = false;
  private suspended = false;
  readonly menuFps = 15;
  invalidate() { this.lastFrame = -Infinity; }
  shouldRender(now: number, racing: boolean, context: RenderContext): boolean {
    if (context.hidden || context.opaqueDialog) { this.suspended = true; return false; }
    if (this.suspended || racing !== this.lastRacing) { this.invalidate(); this.suspended = false; }
    this.lastRacing = racing;
    if (!racing && now - this.lastFrame < 1000 / this.menuFps - .1) return false;
    this.lastFrame = now; return true;
  }
}
