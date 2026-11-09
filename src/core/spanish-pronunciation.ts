/** Pinned eSpeak es-419 output, canonicalized under the selected yeísmo policy.
 * es_rules maps medial ll to j:; --ipa=1 emits that as adjacent j_j.
 * Merge only that doubled allophone into consonantal ʝ, retaining single glides.
 * This is a phonemic comparison proxy, not an acoustic or regional model.
 */
export function spanishPhonemeUnits(ipa: string): string[] {
  const result: string[] = [];
  const words = ipa.normalize('NFC').trim().split(/\s+/u);
  for (const [index, word] of words.entries()) {
    if (index) result.push('|');
    for (let unit of word.split('_')) {
      while (unit.startsWith('ˈ') || unit.startsWith('ˌ')) {
        if (unit[0] === 'ˈ') result.push('ˈ');
        unit = unit.slice(1);
      }
      if (unit) result.push(unit);
    }
  }
  if (!result.length || result.every(unit => unit === 'ˈ' || unit === '|')) throw new Error('Empty Spanish phoneme output.');
  const canonical: string[] = [];
  for (let i = 0; i < result.length; i++) {
    if (result[i] === 'j' && result[i + 1] === 'j') { canonical.push('ʝ'); i++; }
    else canonical.push(result[i]!);
  }
  return canonical;
}

export function spanishPronunciationKey(ipa: string): string {
  return spanishPhonemeUnits(ipa).join('\u001f');
}
