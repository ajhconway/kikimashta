import type { Page } from '@playwright/test';
import type { PracticeAttempt } from '../src/types';

export async function savedAttempts(page: Page, language = 'ja-JP', databaseName = 'kikimashta-v0') {
  return page.evaluate(async ({ language, databaseName }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const attempts = await new Promise<PracticeAttempt[]>((resolve, reject) => {
        const request = db.transaction('attempts').objectStore('attempts').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return attempts.filter(attempt => attempt.language === language);
    } finally { db.close(); }
  }, { language, databaseName });
}
