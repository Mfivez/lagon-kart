import type { World } from '../shared/game';
import './race-feedback.css';

export const raceFeedbackMarkup = '<div id="race-feedback" class="race-feedback hidden" role="status" aria-live="polite" aria-atomic="true"></div>';

/** Only server acknowledgements create a message; reconciliation never repeats it. */
export class RaceFeedback {
  private readonly element = document.getElementById('race-feedback')!;
  private context = '';
  private sequence = 0;
  private until = 0;

  update(world: World | null, playerId: string, now: number) {
    const kart = world?.players.find(player => player.id === playerId);
    if (!world || world.phase !== 'racing' || !kart || kart.spectator || kart.finished) {
      this.context = ''; this.until = 0; this.element.classList.add('hidden'); return;
    }
    const key = `${world.trackId}:${world.round}:${playerId}`;
    const feedback = kart.fun;
    if (key !== this.context) {
      this.context = key; this.sequence = feedback?.feedbackSeq ?? 0;
    } else if (feedback && feedback.feedbackSeq > this.sequence) {
      this.sequence = feedback.feedbackSeq;
      const messages = {
        graze: 'Bien rattrapé !',
        combo: 'Enchaînement réussi · turbo bonus !',
        relay: 'Relais d’équipe · turbo partagé !',
        // A weighted draw can still yield any tool; the inventory shows the
        // actual result. Do not promise a recovery item that was not drawn.
        recovery: '',
        '': '',
      };
      const message = messages[feedback.feedbackKind];
      if (message) {
        this.element.textContent = message;
        this.element.dataset.kind = feedback.feedbackKind;
        this.until = now + 2200;
        this.element.getAnimations().forEach(animation => animation.cancel());
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
          this.element.animate([{ opacity: .2, scale: '.94' }, { opacity: 1, scale: '1' }], { duration: 180 });
      }
    }
    this.element.classList.toggle('hidden', now >= this.until);
  }
}
