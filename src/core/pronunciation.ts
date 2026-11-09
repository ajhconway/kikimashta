const smallKana = new Set(['ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ゃ', 'ゅ', 'ょ', 'ゎ']);

/** Orthographic mora proxy (#200), preserving length, gemination and voicing. */
export function japaneseMoras(reading: string): string[] | undefined {
  const normalized = reading.normalize('NFKC').replace(/[ァ-ヴ]/gu,
    kana => String.fromCharCode(kana.charCodeAt(0) - 0x60));
  if (!normalized || !/^[ぁ-ゔー]+$/u.test(normalized)) return undefined;

  const moras: string[] = [];
  for (const kana of normalized) {
    if (smallKana.has(kana)) {
      const previous = moras.at(-1);
      // A small vowel/glide belongs to one preceding full-sized kana. Small っ
      // remains its own unit; detached or stacked small kana are unsupported.
      if (!previous || previous === 'っ' || previous === 'ん' || previous === 'ー' || previous.length > 1) return undefined;
      moras[moras.length - 1] = previous + kana;
    } else {
      if (kana === 'ー' && !moras.length) return undefined;
      moras.push(kana);
    }
  }
  return moras;
}

/** Canonical kana spelling, not a phonemic or pitch-accent transcription. */
export function japanesePronunciationKey(reading: string): string | undefined {
  return japaneseMoras(reading)?.join('');
}

/** Normalized Levenshtein similarity of kana mora sequences. */
export function pronunciationSimilarity(left: string, right: string): number | undefined {
  const a = japaneseMoras(left);
  const b = japaneseMoras(right);
  if (!a || !b) return undefined;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        current[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return 1 - previous[b.length]! / Math.max(a.length, b.length);
}
