export function spanishPictureCompatible(a, b) {
  return a.id !== b.id && a.language === b.language && a.image.src !== b.image.src &&
    !a.pictureDistractorExclusions?.includes(b.id) && !b.pictureDistractorExclusions?.includes(a.id);
}

export function firstSpanishTrio(candidates) {
  for (let a = 0; a < candidates.length; a++) for (let b = a + 1; b < candidates.length; b++) {
    if (!spanishPictureCompatible(candidates[a], candidates[b])) continue;
    for (let c = b + 1; c < candidates.length; c++) if (spanishPictureCompatible(candidates[a], candidates[c]) && spanishPictureCompatible(candidates[b], candidates[c])) return [candidates[a], candidates[b], candidates[c]];
  }
  return undefined;
}

export function normalizedEditDistance(a, b) {
  if (!a.length || !b.length) throw new Error('Empty distance input.');
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + Number(a[i - 1] !== b[j - 1]));
    previous = current;
  }
  return previous[b.length] / Math.max(a.length, b.length);
}
