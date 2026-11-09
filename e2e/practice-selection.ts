import type { Page } from './fixtures';

/** Word interaction fixtures use a fixed scope; accepted direct-entry content has its own journey. */
export async function selectWordPractice(page: Page, packIds = [
  'ja-wanikani-1-pictures', 'ja-wanikani-2-pictures', 'ja-wanikani-2-writing',
  'ja-wanikani-3-pictures', 'ja-wanikani-3-writing',
]) {
  await page.addInitScript(packIds => {
    const key = 'kikimashta-card-packs-v1';
    // Preserve later user choices and reload/persistence assertions.
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(packIds));
  }, packIds);
}
