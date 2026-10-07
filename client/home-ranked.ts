import type { CareerUI, RankedViewState } from './career-ui';
import type { RankedTier } from '../shared/progression';
import './home-ranked.css';

export const homeRankedMarkup = '<section id="home-ranked" class="home-ranked" aria-label="Course classée"></section>';
export const rankLabel = (rank: RankedTier): string => ({ Bronze: 'Bronze', Silver: 'Argent', Gold: 'Or', Platinum: 'Platine', Diamond: 'Diamant', Master: 'Maître' })[rank];
export class HomeRanked {
  private available = true;
  private reason = '';
  private state: RankedViewState;
  private unsubscribe: () => void;
  constructor(private readonly career: CareerUI, private readonly root: HTMLElement) {
    this.state = career.rankedState;
    root.innerHTML = '<div class="home-ranked-rating"><span data-ranked-grade>Chargement…</span><strong data-ranked-mmr></strong><small>CLASSÉ</small></div><button id="home-ranked-action" class="primary wide" type="button">Rechercher une course classée</button><p id="home-ranked-status" role="status" aria-live="polite"></p>';
    root.querySelector('button')!.addEventListener('click', () => { if (career.isSearching) void career.cancelQueue(); else if (this.available) void career.joinQueue(); });
    this.unsubscribe = career.subscribe(state => { this.state = state; this.render(); });
  }
  setAvailable(available: boolean, reason = '') { if (available === this.available && reason === this.reason) return; this.available = available; this.reason = reason; this.render(); }
  destroy() { this.unsubscribe(); }
  private render() {
    const state = this.state, busy = ['loading', 'matched', 'cancelling'].includes(state.state), searching = state.state === 'searching';
    this.root.dataset.grade = state.profile?.rank.toLowerCase() ?? 'none'; this.root.setAttribute('aria-busy', String(state.loading || busy));
    this.root.querySelector('[data-ranked-grade]')!.textContent = state.profile ? rankLabel(state.profile.rank) : state.loading ? 'Chargement…' : 'Votre classement';
    this.root.querySelector('[data-ranked-mmr]')!.textContent = state.profile ? `${state.profile.mmr} MMR` : state.loading ? '' : 'Profil à préparer';
    const button = this.root.querySelector('button')!;
    button.disabled = busy || !searching && !this.available;
    button.textContent = state.state === 'loading' ? 'Préparation…' : state.state === 'matched' ? 'Rencontre trouvée !' : state.state === 'cancelling' ? 'Annulation…' : searching ? 'Annuler la recherche' : state.state === 'error' ? 'Réessayer la recherche' : 'Rechercher une course classée';
    this.root.querySelector('p')!.textContent = state.status || (!this.available ? this.reason : 'Deux courses avec des pilotes de votre niveau.');
  }
}
