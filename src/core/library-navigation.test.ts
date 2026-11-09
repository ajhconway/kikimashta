import { expect, it } from 'vitest';
import { contextualLibraryRedirect } from './library-navigation';
it('moves legacy contextual inspection bookmarks to the library while preserving deployment base and language', () => {
  expect(contextualLibraryRedirect('https://example.test/app/?review=contextual', 'ja-JP', '/app/'))
    .toBe('https://example.test/app/vocabulary/?view=contextual&language=ja-JP');
  expect(contextualLibraryRedirect('https://example.test/?review=contextual', 'es-419'))
    .toBe('https://example.test/vocabulary/?view=contextual&language=es-419');
});
it('keeps ordinary practice and unrelated review links on the app', () => {
  for (const query of ['', '?review=other', '?demo=contextual'])
    expect(contextualLibraryRedirect('https://example.test/' + query, 'ja-JP')).toBeNull();
});
