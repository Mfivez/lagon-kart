import './home-menu.css';
import { installMenuViewport } from './menu-viewport';

type HomeView = 'play' | 'pilot' | 'online' | 'options';
type HomeMenuOptions = {
  name: string;
  invitedCode: string;
  color: string;
  colors: readonly string[];
  rankedMarkup: string;
  onlineMarkup: string;
};
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

/** Only the selected circuit lives on the home screen; the catalogue has its own dialog. */
export function homeMenuMarkup(options: HomeMenuOptions): string {
  return `<section id="home-panel" class="home-hub" aria-label="Accueil">
    <header class="home-hub-heading">
      <div><p class="home-kicker">LE PROCHAIN DÉPART EST À VOUS</p><h1>Prêt à rouler ?</h1></div>
      <button class="home-presence-summary" type="button" data-home-open="online" aria-label="Voir les joueurs en ligne">
        <span><i aria-hidden="true"></i><strong data-home-online-summary>Connexion…</strong></span>
        <small data-home-ranked-summary>Liste des pilotes</small>
      </button>
    </header>
    <nav class="home-navigation" role="tablist" aria-label="Menu principal">
      <button id="home-tab-play" type="button" role="tab" aria-controls="home-view-play" aria-selected="true" data-home-view="play"><span aria-hidden="true">⚑</span> Jouer</button>
      <button id="home-tab-pilot" type="button" role="tab" aria-controls="home-view-pilot" aria-selected="false" tabindex="-1" data-home-view="pilot"><span aria-hidden="true">◉</span> Pilote</button>
      <button id="home-tab-online" type="button" role="tab" aria-controls="home-view-online" aria-selected="false" tabindex="-1" data-home-view="online"><span aria-hidden="true">●</span> En ligne</button>
      <button id="home-tab-options" type="button" role="tab" aria-controls="home-view-options" aria-selected="false" tabindex="-1" data-home-view="options"><span aria-hidden="true">☷</span> Options</button>
    </nav>
    <div class="home-hub-body">
      <section id="home-view-play" class="home-view home-play-view" role="tabpanel" tabindex="0" aria-labelledby="home-tab-play">
        <div class="quick-pilot home-pilot-line">
          <label class="name-field"><span aria-hidden="true">◉</span><input id="name-input" maxlength="18" autocomplete="nickname" placeholder="Votre pseudo" value="${escapeHtml(options.name)}" aria-label="Pseudo" /></label>
          <button id="garage-button" class="secondary" type="button" title="Choisir mon pilote, mon kart et ses pièces">Mon kart <span aria-hidden="true">⚙</span></button>
        </div>
        <article id="island-card" class="home-selected-track" aria-labelledby="track-name">
          <div class="home-track-heading"><span class="home-track-label">CIRCUIT CHOISI</span><span id="track-number" aria-hidden="true">01</span></div>
          <div id="home-track-outline" class="home-track-outline" aria-hidden="true"></div>
          <div class="home-track-copy"><h2 id="track-name">Île des Alizés</h2><div class="track-tags" id="track-tags"></div><p id="track-description"></p></div>
          <button id="choose-track-button" class="secondary" type="button">Changer <span class="home-track-button-detail">de circuit</span><span aria-hidden="true">→</span></button>
        </article>
        ${options.rankedMarkup}
        <div class="home-primary-actions" aria-label="Jouer avec des amis ou en solo">
          <button class="primary create-button" id="create-button" type="button">Créer un salon <span aria-hidden="true">↗</span></button>
          <button class="secondary practice-button" id="practice-button" type="button">Entraînement <span aria-hidden="true">⚑</span></button>
        </div>
        <div class="join-row"><input id="code-input" aria-label="Code du salon" maxlength="24" placeholder="Code du salon" value="${escapeHtml(options.invitedCode)}" autocomplete="off" spellcheck="false" /><button id="join-button" class="secondary" type="button">Rejoindre <span aria-hidden="true">→</span></button></div>
        <p class="home-play-note">Un salon pour jouer ensemble, une course ou un tournoi.</p>
      </section>
      <section id="home-view-pilot" class="home-view home-detail-view" role="tabpanel" tabindex="0" aria-labelledby="home-tab-pilot" hidden>
        <div class="home-section-title"><p class="home-kicker">VOTRE PROFIL</p><h2>Un pilote à votre image.</h2><p>Gardez votre progression et choisissez votre couleur.</p></div>
        <section id="home-profile-options" class="home-profile-options" aria-label="Mon compte et ma couleur">
          <div class="color-row"><span>Couleur du kart</span><div class="swatches" id="swatches">${options.colors.map((color, index) => `<button type="button" class="swatch ${color === options.color ? 'selected' : ''}" style="--swatch:${escapeHtml(color)}" data-color="${escapeHtml(color)}" aria-label="Couleur ${index + 1}" aria-pressed="${color === options.color}"></button>`).join('')}</div></div>
          <div id="account-card" class="account-card" aria-label="Sauvegarde du pilote"></div>
        </section>
      </section>
      <section id="home-view-online" class="home-view home-detail-view" role="tabpanel" tabindex="0" aria-labelledby="home-tab-online" hidden>
        <div class="home-section-title"><p class="home-kicker">ON SE RETROUVE SUR LA GRILLE</p><h2>Les pilotes du moment.</h2><p>Retrouvez qui joue et qui cherche une course classée.</p></div>
        ${options.onlineMarkup}
      </section>
      <section id="home-view-options" class="home-view home-detail-view" role="tabpanel" tabindex="0" aria-labelledby="home-tab-options" hidden>
        <div class="home-section-title"><p class="home-kicker">À VOTRE RYTHME</p><h2>Explorer et régler.</h2></div>
        <div class="home-explore-actions">
          <button id="career-button" class="secondary" type="button"><span><strong>Ma carrière</strong><small>Championnats, classement et replays</small></span><span aria-hidden="true">→</span></button>
          <button id="track-editor-button" class="secondary" type="button"><span><strong>Créer un circuit</strong><small>Dessinez, testez et partagez vos pistes</small></span><span aria-hidden="true">✎</span></button>
        </div>
        <section class="home-settings" aria-label="Réglages du jeu"><h3>Votre confort de jeu</h3><div id="home-settings-controls" class="home-settings-controls"></div><label class="ghost-option"><input id="ghost-toggle" type="checkbox"><span>Fantôme du meilleur temps en entraînement</span></label></section>
      </section>
    </div>

  </section>`;
}

/** One active view, one scrolling region for secondary content, and persistent navigation. */
export class HomeMenu {
  private visible = false;
  private view: HomeView = 'play';
  private readonly tabs: HTMLButtonElement[];
  private readonly movedControls: { node: HTMLElement; anchor: Comment }[] = [];

  constructor(private readonly root: HTMLElement) {
    installMenuViewport();
    this.tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-home-view]')];
    root.addEventListener('click', event => {
      const target = (event.target as Element).closest<HTMLElement>('[data-home-view], [data-home-open]');
      const view = target?.dataset.homeView ?? target?.dataset.homeOpen;
      if (this.isView(view)) this.open(view, !!target?.dataset.homeOpen);
    });
    root.querySelector('.home-navigation')!.addEventListener('keydown', event => {
      const key = (event as KeyboardEvent).key;
      const index = this.tabs.findIndex(tab => tab === document.activeElement);
      if (index < 0 || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return;
      event.preventDefault();
      const next = key === 'Home' ? 0 : key === 'End' ? this.tabs.length - 1 : (index + (key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1) + this.tabs.length) % this.tabs.length;
      this.open(this.tabs[next]!.dataset.homeView as HomeView, true);
    });
    root.querySelectorAll<HTMLElement>('.home-view').forEach(pane => { pane.inert = pane.hidden; });
    // Move the actual controls, preserving their event handlers and unique IDs.
    for (const node of document.querySelectorAll<HTMLElement>('.bottom-bar .graphics-setting, .bottom-bar .volume, .bottom-bar .credits-link')) {
      const anchor = document.createComment('home settings return point');
      node.before(anchor); this.movedControls.push({ node, anchor });
    }
    this.setVisible(true);
  }

  open(view: HomeView, focus = false) {
    this.view = view; this.root.dataset.view = view;
    this.tabs.forEach(tab => {
      const selected = tab.dataset.homeView === view;
      tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
      const pane = document.getElementById(tab.getAttribute('aria-controls')!)!;
      pane.hidden = !selected; pane.inert = !selected;
      if (selected && focus) tab.focus();
    });
    this.root.querySelector('.home-hub-body')!.scrollTop = 0;
  }

  setVisible(visible: boolean) {
    if (visible === this.visible) return;
    this.visible = visible; document.body.classList.toggle('home-menu-visible', visible);
    const settings = this.root.querySelector('#home-settings-controls')!;
    for (const { node, anchor } of this.movedControls) {
      if (visible) settings.append(node); else anchor.after(node);
    }
    if (visible) this.open('play');
  }

  setPresence(snapshot: { connected: number; searchingRanked: number } | null) {
    this.root.querySelector('[data-home-online-summary]')!.textContent = snapshot ? `${snapshot.connected} connecté${snapshot.connected === 1 ? '' : 's'}` : 'Liste indisponible';
    this.root.querySelector('[data-home-ranked-summary]')!.textContent = snapshot ? `${snapshot.searchingRanked} en recherche` : 'Nouvel essai automatique';
    const button = this.root.querySelector('.home-presence-summary')!;
    button.setAttribute('aria-label', snapshot ? `Voir les joueurs en ligne : ${snapshot.connected} connecté${snapshot.connected === 1 ? '' : 's'}, ${snapshot.searchingRanked} en recherche classée` : 'Liste des joueurs indisponible, nouvel essai automatique');
    button.classList.toggle('is-unavailable', !snapshot);
  }

  destroy() { this.setVisible(false); }
  get currentView(): HomeView { return this.view; }
  private isView(view?: string): view is HomeView { return !!view && ['play', 'pilot', 'online', 'options'].includes(view); }
}
