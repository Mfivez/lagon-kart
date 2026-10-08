import assert from 'node:assert/strict';
import type { Locator, Page } from 'playwright';

/** Follow the visible menu navigation before acting on a home control.
 * Returning the original locator preserves fill/tap/nth/selectOption semantics.
 * Controls outside the home menu (for example graphics during a race) are unchanged.
 */
export async function homeControl(page: Page, selector: string): Promise<Locator> {
  const control = page.locator(selector);
  await control.first().waitFor({ state: 'attached' });
  const view = await control.first().evaluate(node => node.closest<HTMLElement>('.home-view')?.id.replace('home-view-', '') ?? '');
  if (view && await page.locator('#home-panel').isVisible()) {
    const tab = page.locator(`#home-tab-${view}`);
    if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
  }
  return control;
}

export async function openTrackCatalog(page: Page): Promise<void> {
  if (!await page.locator('#track-picker').isVisible()) await (await homeControl(page, '#choose-track-button')).click();
  await page.locator('#track-picker').waitFor({ state: 'visible' });
}

/** Read the actual paginated UI, including its total, rather than counting one page. */
export async function readOfficialTrackCatalog(page: Page): Promise<string[]> {
  await openTrackCatalog(page);
  await page.locator('#track-picker-search').fill('');
  await page.locator('#track-picker-source').selectOption('official');
  const total = Number.parseInt(await page.locator('#track-picker-page small').innerText(), 10);
  const ids: string[] = [];
  for (let index = 0; index <= total; index++) {
    ids.push(...await page.locator('#track-picker-cards [data-track]').evaluateAll(cards => cards.map(card => (card as HTMLElement).dataset.track!)));
    if (await page.locator('#track-picker-next').isDisabled()) break;
    await page.locator('#track-picker-next').click();
  }
  assert.equal(ids.length, total, 'Catalogue total matches the complete paginated list');
  assert.equal(new Set(ids).size, total, 'Catalogue pages do not duplicate circuits');
  await page.locator('#track-picker-close').click();
  return ids;
}

/** Preview and explicitly commit a selection, just as a player does. */
export async function selectHomeTrack(page: Page, id: string, name: string): Promise<void> {
  await openTrackCatalog(page);
  await page.locator('#track-picker-source').selectOption('all');
  await page.locator('#track-picker-search').fill(name);
  const choice = page.locator(`#track-picker-cards [data-track="${id}"]`);
  // Equal names are legal: advance until the requested identity is visible.
  while (!await choice.count() && !await page.locator('#track-picker-next').isDisabled()) await page.locator('#track-picker-next').click();
  await choice.click();
  assert.equal(await choice.getAttribute('aria-pressed'), 'true');
  await page.locator('#track-picker-confirm').click();
  await page.locator('#track-picker').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => localStorage.getItem('lagon-track')), id);
  assert.equal(await page.locator('#track-name').textContent(), name);
}

export async function refreshHomeTracks(page: Page): Promise<void> {
  await openTrackCatalog(page);
  const loaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/tracks' && response.request().method() === 'GET');
  await page.locator('#track-refresh-button').click();
  assert.equal((await loaded).status(), 200);
  await page.waitForFunction(() => !(document.getElementById('track-refresh-button') as HTMLButtonElement).disabled);
}
