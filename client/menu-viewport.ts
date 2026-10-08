let installed = false;

/** Keep menus above an onscreen keyboard without changing the user's zoom level. */
export function installMenuViewport(): void {
  if (installed || !window.visualViewport) return;
  installed = true;
  const viewport = window.visualViewport;
  const page = document.documentElement;
  let frame = 0;
  const update = () => {
    frame = 0;
    // Pinch zoom must keep the ordinary layout and native panning behavior.
    const unzoomed = Math.abs(viewport.scale - 1) < .02;
    const height = unzoomed ? viewport.height : page.clientHeight;
    const top = unzoomed ? viewport.offsetTop : 0;
    const active = document.activeElement;
    const editable = active instanceof HTMLElement && (active.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea') || active.isContentEditable);
    const keyboard = unzoomed && editable && page.clientHeight - height > 100;
    page.style.setProperty('--menu-viewport-height', `${Math.round(height)}px`);
    page.style.setProperty('--menu-viewport-top', `${Math.round(top)}px`);
    page.dataset.menuKeyboard = String(keyboard);
    page.dataset.menuViewportShort = String(height < 280 && unzoomed);
    if (!keyboard || !(active instanceof HTMLElement)) return;
    // Scroll only the menu's content region; never move the race canvas or page.
    const scroller = active.closest<HTMLElement>('.home-hub-body');
    if (!scroller) return;
    requestAnimationFrame(() => {
      if (document.activeElement !== active) return;
      const bounds = scroller.getBoundingClientRect(), field = active.getBoundingClientRect();
      if (field.top < bounds.top + 6) scroller.scrollTop -= bounds.top + 6 - field.top;
      else if (field.bottom > bounds.bottom - 6) scroller.scrollTop += field.bottom - bounds.bottom + 6;
    });
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  viewport.addEventListener('resize', schedule);
  viewport.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  update();
}
