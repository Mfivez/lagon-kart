import type { PlayerProfile } from '../shared/progression';
import { CareerUI } from './career-ui';

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
type Actions = {
  allowed(): boolean;
  busy(value: boolean): void;
  prepareGuest(): Promise<unknown>;
  changed(profile?: PlayerProfile): void;
  error(message: string): void;
};

/** Account credentials stay in the submitted form and are never persisted. */
export class AccountUI {
  private readonly dialog = document.createElement('dialog');
  private submitting = false;
  private mode: 'register' | 'login' = 'register';
  constructor(private readonly career: CareerUI, private readonly host: HTMLElement, private readonly actions: Actions) {
    this.dialog.id = 'account-dialog'; this.dialog.className = 'garage-dialog account-dialog';
    this.dialog.setAttribute('aria-labelledby', 'account-title'); document.body.append(this.dialog);
    this.host.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-account]') : null;
      if (!button || this.submitting || !this.actions.allowed()) return;
      if (button.dataset.account === 'logout') void this.logout();
      else this.open(button.dataset.account === 'login' ? 'login' : 'register');
    });
    this.dialog.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
      if (!button || this.submitting) return;
      if (button.id === 'account-close') this.dialog.close();
      if (button.id === 'account-switch') this.open(this.mode === 'register' ? 'login' : 'register');
    });
    this.dialog.addEventListener('submit', event => { event.preventDefault(); void this.submit(); });
    this.dialog.addEventListener('cancel', event => { if (this.submitting) event.preventDefault(); });
    this.dialog.addEventListener('close', () => this.clearPasswords());
    this.update();
  }
  update(profile = this.career.currentProfile) {
    this.host.innerHTML = profile?.username
      ? `<div class="account-summary"><strong>Compte · ${escape(profile.username)}${profile.canModerateTracks ? ' · Admin' : ''}</strong><span>${profile.xp} XP sauvegardés · niveau ${profile.careerLevel}</span>${profile.canModerateTracks ? '<span>Modération des circuits dans l’éditeur.</span>' : ''}</div><button type="button" class="account-link" data-account="logout">Se déconnecter</button>`
      : `<div class="account-summary"><strong>Pilote invité</strong><span>Créez un compte pour retrouver vos courses sur un autre appareil.</span></div><div class="account-buttons"><button type="button" class="secondary" data-account="register">Sauvegarder mon pilote</button><button type="button" class="account-link" data-account="login">Se connecter</button></div>`;
  }
  private clearPasswords() { this.dialog.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(input => { input.value = ''; }); }
  private open(mode: 'register' | 'login') {
    this.mode = mode;
    const registering = mode === 'register';
    this.dialog.innerHTML = `<div class="garage-heading"><div><small>VOTRE PILOTE, PARTOUT</small><h2 id="account-title">${registering ? 'Sauvegarder mon pilote' : 'Retrouver mon pilote'}</h2></div><button type="button" id="account-close" class="secondary" aria-label="Fermer le compte">✕</button></div>
      <p class="garage-hint">${registering ? 'Votre progression actuelle sera attachée à ce compte. Un nom d’utilisateur et un mot de passe suffisent.' : 'Connectez-vous avec le compte créé sur ce serveur pour retrouver vos XP, vos coupes et votre classement.'}</p>
      <form id="account-form">
        <label for="account-username">Nom d’utilisateur</label><input id="account-username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="24" required aria-describedby="account-username-help" />
        <small id="account-username-help">3 à 24 lettres, chiffres, points, tirets ou _.</small>
        <label for="account-password">Mot de passe</label><input id="account-password" name="password" type="password" autocomplete="${registering ? 'new-password' : 'current-password'}" minlength="6" maxlength="128" required aria-describedby="account-password-help" />
        <small id="account-password-help">${registering ? 'Au moins 6 caractères. Gardez-le pour vos prochaines connexions.' : 'Le mot de passe choisi à la création du compte.'}</small>
        ${registering ? '<label for="account-confirm">Confirmer le mot de passe</label><input id="account-confirm" name="confirmation" type="password" autocomplete="new-password" minlength="6" maxlength="128" required />' : ''}
        <p id="account-error" class="account-error" role="alert"></p>
        <button type="submit" id="account-submit" class="primary wide">${registering ? 'Créer mon compte' : 'Se connecter'}</button>
      </form><button type="button" id="account-switch" class="account-link">${registering ? 'Déjà un compte ? Se connecter' : 'Pas encore de compte ? Créer un compte'}</button>`;
    if (!this.dialog.open) this.dialog.showModal();
    this.dialog.querySelector<HTMLInputElement>('#account-username')!.focus({ preventScroll: true });
  }
  private setSubmitting(value: boolean) {
    this.submitting = value; this.actions.busy(value);
    this.dialog.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button').forEach(control => { control.disabled = value; });
    this.host.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = value; });
  }
  private async submit() {
    if (this.submitting || !this.actions.allowed()) return;
    const form = this.dialog.querySelector<HTMLFormElement>('form')!;
    if (!form.reportValidity()) return;
    const username = this.dialog.querySelector<HTMLInputElement>('#account-username')!.value.trim();
    const password = this.dialog.querySelector<HTMLInputElement>('#account-password')!.value;
    const error = this.dialog.querySelector<HTMLElement>('#account-error')!;
    error.textContent = '';
    if (this.mode === 'register' && this.dialog.querySelector<HTMLInputElement>('#account-confirm')!.value !== password) {
      error.textContent = 'Les deux mots de passe sont différents.'; return;
    }
    this.setSubmitting(true);
    try {
      // Materialise the anonymous profile before attaching it, so an existing
      // guest keeps the same server identity, records and unlocks.
      if (this.mode === 'register') await this.actions.prepareGuest();
      const profile = await this.career.account(this.mode, username, password);
      this.actions.changed(profile); this.update(profile); this.dialog.close();
    } catch (reason) { error.textContent = reason instanceof Error ? reason.message : 'Connexion impossible. Réessayez.'; }
    finally { this.clearPasswords(); this.setSubmitting(false); }
  }
  private async logout() {
    this.setSubmitting(true);
    try { await this.career.logout(); this.actions.changed(); this.update(); }
    catch (reason) { this.actions.error(reason instanceof Error ? reason.message : 'Déconnexion impossible. Réessayez.'); }
    finally { this.setSubmitting(false); }
  }
}
