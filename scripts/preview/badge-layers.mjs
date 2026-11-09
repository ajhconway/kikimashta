/** Review interchangeable illustrated badge layers without touching learning state. */
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = process.cwd();
await mkdir(join(root, 'node_modules/.cache'), { recursive: true });
const scratch = await mkdtemp(join(root, 'node_modules/.cache/badge-layers-'));
const compile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
} }).outputText;
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

try {
  const registrySource = await readFile(join(root, 'src/core/badge-art.ts'), 'utf8');
  await writeFile(join(scratch, 'badge-art.mjs'), compile(registrySource));
  const componentSource = await readFile(join(root, 'src/components/PackBadgeMedal.tsx'), 'utf8');
  const component = compile(componentSource).replace(/(['"])\.\.\/core\/badge-art\1/g, "'./badge-art.mjs'");
  await writeFile(join(scratch, 'medal.mjs'), component);
  const { PackBadgeMedal } = await import(pathToFileURL(join(scratch, 'medal.mjs')).href);
  const { badgeArtwork } = await import(pathToFileURL(join(scratch, 'badge-art.mjs')).href);
  const ranks = Object.keys(badgeArtwork);
  const levels = [1, 2, 3, 4, 5, 10];
  const allIds = new Set();
  let imageCount = 0;
  let variantCount = 0;

  function renderMedal(badge, prefix) {
    const markup = renderToStaticMarkup(createElement(PackBadgeMedal, { badge }), { identifierPrefix: prefix });
    const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
    for (const id of ids) {
      if (allIds.has(id)) throw new Error('Duplicate SVG reference: ' + id);
      allIds.add(id);
    }
    for (const [, reference] of markup.matchAll(/(?:href="#|url\(#)([^"\s)]+)/g)) {
      if (!ids.has(reference)) throw new Error('Unresolved SVG reference: ' + reference);
    }
    if (!markup.includes('class="badge-background"')) throw new Error('Missing illustrated base.');
    imageCount++;
    return markup;
  }

  const templates = [];
  for (const family of ['wk', 'travel']) for (const format of ['picture', 'writing']) for (const packLevel of levels) {
    const key = `${family}-${format}-${packLevel}`;
    const pack = {
      id: family === 'wk' ? `ja-wanikani-${packLevel}-${format}` : `es-419-travel-${packLevel}-${format}`,
      title: `${family === 'wk' ? 'WaniKani' : 'Travel'} level ${packLevel} · ${format === 'picture' ? 'Pictures' : 'Writing'}`,
      sourceLevel: packLevel, language: family === 'wk' ? 'ja-JP' : 'es-419',
      exercise: format === 'picture' ? 'audio-picture' : 'audio-text', itemIds: [],
    };
    const cards = ranks.map(rank => {
      const badge = { pack, level: { label: rank, minimumMs: 0, timerMs: null }, cardCount: 0 };
      const prefix = `badge-layer-${key}-${rank}-`;
      const large = renderMedal(badge, prefix + 'large-');
      const thumbnails = ['white', 'pink', 'lavender'].map(background => `<span class="badge-swatch swatch-${background}">${renderMedal(badge, prefix + background + '-')}</span>`).join('');
      return `<article class="badge-review-card" data-rank="${escape(rank)}"><h2>${escape(rank)}</h2><div class="badge-layer-large">${large}</div><div class="badge-layer-small" aria-label="56 pixel previews on white, pink and lavender">${thumbnails}</div></article>`;
    }).join('');
    templates.push(`<template id="case-${key}" data-family="${family}" data-format="${format}" data-level="${packLevel}">${cards}</template>`);
    variantCount++;
  }
  if (variantCount !== 24 || imageCount !== ranks.length * 24 * 4) throw new Error('Incomplete badge review matrix.');
  const css = await readFile(join(root, 'src/components/PackBadges.css'), 'utf8');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Interchangeable badge layers</title><style>${css}
:root{--badge-ink:#4c087c;--purple-dark:#4c20ad}*{box-sizing:border-box}body{margin:0;padding:28px 18px;background:#f5eafa;color:#4c087c;font:16px/1.5 ui-rounded,'Arial Rounded MT Bold','Trebuchet MS',system-ui,sans-serif}main{max-width:1220px;margin:auto}h1{margin:0;line-height:1.15;font-size:clamp(28px,4vw,40px)}.intro{max-width:900px;margin:12px 0 24px}.layer-controls{display:flex;flex-wrap:wrap;gap:16px;padding:18px 20px;background:#fff7e9;border:2px solid #d9c4ee;border-radius:24px}.layer-controls label{display:grid;gap:6px;font-weight:800;font-size:14px}.layer-controls select{min-height:44px;padding:8px 36px 8px 12px;font:inherit;color:#4c087c;background:white;border:2px solid #ad88d4;border-radius:14px}.layer-controls select:focus-visible{outline:3px solid #6b38d6;outline-offset:3px}.selection{font-size:14px;margin:16px 4px}.layer-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(245px,100%),1fr));gap:20px}.badge-review-card{padding:18px;background:#fff8ed;border-radius:26px;text-align:center;min-width:0}.badge-review-card h2{margin:0 0 8px;font-size:22px}.badge-layer-large{width:100%;max-width:230px;aspect-ratio:1;margin:0 auto 14px}.badge-layer-large .pack-badge-medal{width:100%;height:100%}.badge-layer-small{display:flex;justify-content:center;gap:7px;flex-wrap:wrap}.badge-swatch{display:block;width:68px;height:68px;padding:6px;border-radius:14px}.badge-swatch .pack-badge-medal{width:56px;height:56px}.swatch-white{background:white}.swatch-pink{background:#ffb6d2}.swatch-lavender{background:#d9c1f4}.footnote{font-size:13px;max-width:900px;margin-top:24px}a{color:inherit}
</style><main><h1>Interchangeable badge layers</h1><p class="intro">Switch the pack emblem, ribbon format and pack level independently. All eight mastery ranks use their real shared artwork and overlay component. This review does not save answers or change learning progress.</p><form class="layer-controls" aria-label="Badge layer options"><label>Pack family<select id="badge-family" name="family"><option value="wk">WaniKani · WK</option><option value="travel">Travel · suitcase</option></select></label><label>Answer format<select id="badge-format" name="format"><option value="picture">Picture</option><option value="writing">Writing</option></select></label><label>Pack level<select id="badge-level" name="level">${levels.map(level => `<option value="${level}">${level}</option>`).join('')}</select></label></form><p id="badge-selection" class="selection" role="status" aria-live="polite"></p><div id="badge-matrix" class="layer-grid" aria-label="Eight mastery badge previews"></div><p class="footnote">Large illustrations and 56-pixel previews on three backgrounds. New and Learning are included for design inspection; Home awards still begin at Improving. <a href="../generated/batch-02/review.html">Approved illustrated prototypes</a></p>${templates.join('')}</main><script>
const form = document.querySelector('.layer-controls');
const matrix = document.getElementById('badge-matrix');
const selection = document.getElementById('badge-selection');
function showSelection() {
  const family = form.elements.family.value;
  const format = form.elements.format.value;
  const level = form.elements.level.value;
  const template = document.getElementById('case-' + family + '-' + format + '-' + level);
  if (!template) return;
  matrix.replaceChildren(template.content.cloneNode(true));
  selection.textContent = (family === 'wk' ? 'WK' : 'Suitcase') + ' · ' + (format === 'picture' ? 'Picture' : 'Writing') + ' · Level ' + level;
}
form.addEventListener('submit', event => event.preventDefault());
form.addEventListener('change', showSelection);
showSelection();
</script></html>`;
  const output = resolve(root, 'artifacts/pack-badge-designs/layers');
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'index.html'), html);
  console.log(`Rendered artifacts/pack-badge-designs/layers/index.html: ${variantCount} variants, ${ranks.length} ranks, ${imageCount} uniquely referenced SVGs.`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
