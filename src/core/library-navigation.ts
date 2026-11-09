/** Preserve old inspection bookmarks after moving authored content into the library. */
export function contextualLibraryRedirect(href: string, language: string, basePath = '/'): string | null {
  const source = new URL(href);
  if (source.searchParams.get('review') !== 'contextual') return null;
  const target = new URL(basePath + 'vocabulary/', source.origin);
  target.searchParams.set('view', 'contextual');
  target.searchParams.set('language', language);
  return target.href;
}
