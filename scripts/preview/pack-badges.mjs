/** Render a static owner-review sheet from the actual SVG component. No progress is written. */
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = process.cwd();
await mkdir(join(root, 'node_modules/.cache'), { recursive: true });
const scratch = await mkdtemp(join(root, 'node_modules/.cache/badge-designs-'));
try {
  const source = await readFile(join(root, 'src/components/PackBadgeMedal.tsx'), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const modulePath = join(scratch, 'medal.mjs');
  await writeFile(modulePath, output);
  const { PackBadgeMedal } = await import(pathToFileURL(modulePath).href);
  const levels = ['New', 'Learning', 'Improving', 'Familiar', 'Steady', 'Strong', 'Confident', 'Mastered'];
  const css = await readFile(join(root, 'src/components/PackBadges.css'), 'utf8');
  const sections = ['WaniKani', 'Travel'].map(family => `<section><h2>${family}</h2><div class="design-grid">${levels.map(label => {
    const badge = { pack: { id: family === 'WaniKani' ? 'ja-wanikani-1-pictures' : 'es-419-travel-2-writing', sourceLevel: family === 'WaniKani' ? 1 : 2, title: family, exercise: family === 'WaniKani' ? 'audio-picture' : 'audio-text' }, level: { label }, cardCount: 24 };
    return `<figure><div class="pack-badge badge-${label.toLowerCase()}">${renderToStaticMarkup(createElement(PackBadgeMedal, { badge }))}</div><figcaption>${label}</figcaption></figure>`;
  }).join('')}</div></section>`).join('');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pack badge designs</title><style>${css}
:root{--purple-dark:#432174}*{box-sizing:border-box}body{margin:0;padding:30px 18px;background:#f7effb;color:var(--purple-dark);font:16px/1.5 system-ui}main{max-width:1060px;margin:auto}h1{margin:0}p{margin:8px 0 30px}h2{margin-top:30px}.design-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(115px,1fr));gap:18px}figure{margin:0;text-align:center;padding:16px 6px;background:#fff9;border-radius:22px}.design-grid .pack-badge{position:static;width:92px;height:116px;margin:auto;animation:none;transform:none;pointer-events:none}.design-grid .pack-badge::after{display:none}figcaption{font-size:14px;font-weight:750;margin-top:10px}
</style><main><h1>Pack badges</h1><p>Design preview · no progress saved. Home awards begin at Improving; New and Learning are shown here for the full visual progression.</p>${sections}</main></html>`;
  const destination = resolve(root, 'artifacts/pack-badge-designs');
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, 'index.html'), html);
  console.log('Rendered artifacts/pack-badge-designs/index.html');
} finally { await rm(scratch, { recursive: true, force: true }); }
