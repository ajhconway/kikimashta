/** Exact visible kana ending, not a grammatical or morphological classification. */
export function writtenKanaEnding(text: string): string | undefined {
  const normalized = text.normalize('NFKC').trim();
  if (!/[\p{Script=Han}々]/u.test(normalized)) return undefined;
  return normalized.match(/[\p{Script=Hiragana}]+$/u)?.[0];
}
