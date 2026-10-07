/** Touch input stays separate from keyboard keys: lifting one finger must never
 * release a key or a second finger which is still holding the same action. */
export type TouchAction = 'steer' | 'accelerate' | 'brake' | 'drift' | 'item' | 'reset';
export type TouchSample = { steer: number; forward: boolean; backward: boolean; drift: boolean; use: boolean; reset: boolean };
export class TouchDriveState {
  readonly pointers = new Map<number, TouchAction>();
  active = false;
  suspended = false;
  autoAccelerate = true;
  private steering = 0;
  private throttle = 0;
  private usePressed = false;
  private resetPressed = false;
  private has(action: TouchAction) { return [...this.pointers.values()].includes(action); }
  press(id: number, action: TouchAction) {
    if (!this.active || this.pointers.has(id) || (action === 'steer' && this.has('steer'))) return false;
    this.suspended = false;
    const alreadyHeld = this.has(action);
    this.pointers.set(id, action);
    if (!alreadyHeld && action === 'item') this.usePressed = true;
    if (!alreadyHeld && action === 'reset') this.resetPressed = true;
    return true;
  }
  move(id: number, horizontal: number, vertical = 0) {
    if (this.pointers.get(id) !== 'steer') return;
    const value = Number.isFinite(horizontal) ? Math.max(-1, Math.min(1, horizontal)) : 0;
    // A small dead zone prevents thumb tremor; the remainder is continuous.
    this.steering = Math.abs(value) < 0.1 ? 0 : Math.sign(value) * (Math.abs(value) - 0.1) / 0.9;
    // Throttle is digital, like the keyboard. Its wider dead zone lets a thumb
    // steer horizontally without accidentally braking while AUTO is enabled.
    const longitudinal = Number.isFinite(vertical) ? Math.max(-1, Math.min(1, vertical)) : 0;
    this.throttle = Math.abs(longitudinal) <= 0.18 ? 0 : Math.sign(longitudinal);
  }
  release(id: number) {
    if (this.pointers.get(id) === 'steer') { this.steering = 0; this.throttle = 0; }
    this.pointers.delete(id);
  }
  clear(suspend = false) {
    this.pointers.clear(); this.steering = 0; this.throttle = 0; this.usePressed = false; this.resetPressed = false;
    this.suspended = suspend;
  }
  sample(racing: boolean): TouchSample {
    const enabled = this.active && !this.suspended;
    const backward = enabled && (this.has('brake') || this.throttle < 0);
    const sample = { steer: enabled ? this.steering : 0,
      forward: enabled && !backward && (this.throttle > 0 || this.has('accelerate') || (racing && this.autoAccelerate)),
      backward, drift: enabled && this.has('drift'),
      use: enabled && racing && this.usePressed, reset: enabled && racing && this.resetPressed };
    // Countdown taps must not fire an item/reset when the race starts.
    this.usePressed = false; this.resetPressed = false;
    return sample;
  }
}

export const mobileControlsMarkup = `
  <section class="touch-controls hidden" id="touch-controls" aria-label="Commandes tactiles de course">
    <div class="touch-settings">
      <button class="touch-auto" id="touch-auto" type="button" aria-pressed="true" aria-label="Accélération automatique">AUTO <span>ON</span></button>
      <button class="touch-resume hidden" id="touch-resume" type="button">Reprendre</button>
      <button class="touch-reset" data-touch="reset" type="button" aria-label="Replacer le kart sur la piste">↺ <span>REPLACER</span></button>
    </div>
    <div class="touch-steering"><span class="touch-caption">↑ AVANCE · ↓ FREIN / RECUL</span><button id="touch-steer" data-touch="steer" type="button" aria-label="Joystick : haut pour accélérer, bas pour freiner et reculer, gauche et droite pour tourner"><span class="touch-steer-arrows" aria-hidden="true"><span class="touch-steer-up">↑</span><span class="touch-steer-left">←</span><span class="touch-steer-right">→</span><span class="touch-steer-down">↓</span></span><span class="touch-knob" aria-hidden="true">✥</span></button></div>
    <div class="touch-actions">
      <button class="touch-drift" data-touch="drift" type="button" aria-label="Maintenir pour déraper"><b aria-hidden="true">⌁</b><span>DRIFT</span></button>
      <button class="touch-item" data-touch="item" id="touch-item" type="button" aria-label="Utiliser l’objet"><b id="touch-item-icon" aria-hidden="true">?</b><span>OBJET</span></button>
      <button class="touch-brake" data-touch="brake" type="button" aria-label="Freiner, puis reculer en maintenant"><b aria-hidden="true">Ⅱ</b><span>FREIN / RECUL</span></button>
      <button class="touch-gas" data-touch="accelerate" type="button" aria-label="Accélérer, maintenir à la dernière seconde pour le départ turbo"><b aria-hidden="true">↑</b><span>ACCÉLÉRER</span></button>
    </div>
  </section>`;

export class MobileControls {
  readonly state = new TouchDriveState();
  available = false;
  private driving = false;
  private pointerElements = new Map<number, HTMLElement>();
  private readonly root = document.getElementById('touch-controls')!;
  private readonly steer = document.getElementById('touch-steer')!;
  private readonly auto = document.getElementById('touch-auto')!;
  private readonly resume = document.getElementById('touch-resume')!;
  constructor(private readonly activateAudio: () => void) {
    try { this.state.autoAccelerate = localStorage.getItem('lagon-touch-auto') !== 'false'; } catch { /* Storage may be unavailable in private browsing. */ }
    this.updatePreference();
    const media = matchMedia('(any-pointer: coarse)');
    const detect = () => {
      this.available = media.matches || navigator.maxTouchPoints > 0;
      document.body.classList.toggle('touch-device', this.available);
      this.setDriving(this.driving);
    };
    media.addEventListener('change', detect); detect();
    this.auto.addEventListener('click', () => {
      this.state.autoAccelerate = !this.state.autoAccelerate;
      try { localStorage.setItem('lagon-touch-auto', String(this.state.autoAccelerate)); } catch { /* Optional preference. */ }
      this.updatePreference(); this.activateAudio();
    });
    this.resume.addEventListener('click', () => { this.state.suspended = false; this.paint(); this.activateAudio(); });
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-touch]')) {
      button.addEventListener('contextmenu', event => event.preventDefault());
      button.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        if (!this.state.press(event.pointerId, button.dataset.touch as TouchAction)) return;
        button.setPointerCapture(event.pointerId); this.pointerElements.set(event.pointerId, button);
        this.updateSteer(event); this.paint(); this.activateAudio();
      });
      button.addEventListener('pointermove', event => { this.updateSteer(event); this.paint(); });
      button.addEventListener('pointerup', event => this.release(event.pointerId));
      // OS gestures and capture loss cancel every held action, including auto
      // throttle, until the player deliberately touches a control again.
      button.addEventListener('pointercancel', () => this.clear(true));
      button.addEventListener('lostpointercapture', event => {
        if (this.pointerElements.has(event.pointerId)) this.clear(true);
      });
    }
    window.addEventListener('blur', () => this.clear(true));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(true); });
    window.addEventListener('orientationchange', () => this.clear(true));
    screen.orientation?.addEventListener('change', () => this.clear(true));
    // Also catches browsers which only signal an orientation flip via resize.
    let landscape = innerWidth > innerHeight;
    window.addEventListener('resize', () => { const next = innerWidth > innerHeight; if (next !== landscape) this.clear(true); landscape = next; });
  }
  private updatePreference() {
    this.auto.setAttribute('aria-pressed', String(this.state.autoAccelerate));
    this.auto.querySelector('span')!.textContent = this.state.autoAccelerate ? 'ON' : 'OFF';
    this.root.classList.toggle('auto-accelerate', this.state.autoAccelerate);
  }
  private updateSteer(event: PointerEvent) {
    if (this.state.pointers.get(event.pointerId) !== 'steer') return;
    const rect = this.steer.getBoundingClientRect();
    // Positive steer is left in the chase camera, as for ArrowLeft.
    const dx = event.clientX - rect.left - rect.width / 2;
    const dy = event.clientY - rect.top - rect.height / 2;
    this.state.move(event.pointerId, -dx / (rect.width * 0.36), -dy / (rect.height * 0.36));
    // Keep the visible thumb inside its circular pad, including diagonal drags
    // beyond the pad while pointer capture keeps the control held.
    const visualScale = Math.max(1, Math.hypot(dx / (rect.width * 0.3), dy / (rect.height * 0.3)));
    this.steer.style.setProperty('--thumb-x', `${dx / visualScale}px`);
    this.steer.style.setProperty('--thumb-y', `${dy / visualScale}px`);
  }
  private release(id: number) {
    const button = this.pointerElements.get(id);
    this.pointerElements.delete(id); this.state.release(id);
    if (button?.hasPointerCapture(id)) button.releasePointerCapture(id);
    this.paint();
  }
  private paint() {
    for (const button of this.root.querySelectorAll<HTMLElement>('[data-touch]')) {
      button.classList.toggle('is-held', [...this.state.pointers.values()].includes(button.dataset.touch as TouchAction));
    }
    if (![...this.state.pointers.values()].includes('steer')) {
      this.steer.style.setProperty('--thumb-x', '0px');
      this.steer.style.setProperty('--thumb-y', '0px');
    }
    this.resume.classList.toggle('hidden', !this.state.suspended || !this.state.active);
  }
  setDriving(driving: boolean) {
    this.driving = driving;
    const active = driving && this.available;
    if (this.state.active !== active) { this.clear(); this.state.active = active; }
    this.root.classList.toggle('hidden', !active);
  }
  clear(suspend = false) {
    const held = [...this.pointerElements]; this.pointerElements.clear(); this.state.clear(suspend);
    for (const [id, button] of held) if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
    this.paint();
  }
  sample(racing: boolean) { return this.state.sample(racing); }
  setItem(icon: string, name: string, color: string, available: boolean) {
    const button = document.getElementById('touch-item')!;
    document.getElementById('touch-item-icon')!.textContent = icon;
    button.style.setProperty('--item-color', color);
    button.classList.toggle('has-item', available);
    button.setAttribute('aria-label', available ? `Utiliser : ${name}` : 'Aucun objet, attrapez un cube sur la piste');
  }
}
