/** Reproducible text/card review only: no paid calls, approval or activation (#253). */
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { loadShortLevel1, root } from './short-level1.mjs'

const { bank, report } = loadShortLevel1({ checkMedia: true })
const output = resolve(root, 'artifacts/short-context-level1-253')
const media = resolve(root, 'demos/short-context-250/public/draft-images')
mkdirSync(output, { recursive: true }); mkdirSync(media, { recursive: true })
// New draft images are byte-identical approved reuses. Demo images keep their
// original paths and pending/approved provenance; never copy per question.
for (const card of bank.cards.filter(c => c.kind === 'image' && c.source.kind !== 'demo-250')) {
  copyFileSync(resolve(root, card.image.path), resolve(media, basename(card.image.path)))
}
writeFileSync(resolve(output, 'reuse.json'), JSON.stringify(report, null, 2) + '\n')
writeFileSync(resolve(root, 'demos/short-context-250/public/level1-reuse.json'), JSON.stringify(report, null, 2) + '\n')
writeFileSync(resolve(root, 'demos/short-context-250/public/level1-bank.json'), JSON.stringify(bank, null, 2) + '\n')
const wordName = id => bank.words.find(w => w.id === id).text
const cards = new Map(bank.cards.map(c => [c.id, c]))
const text = ['# Two short contexts per level-1 word', '', `${report.words} words · ${report.prompts} prompts · ${report.sharedCards} shared card concepts · ${report.answerSlots} answer slots.`, '',
  'Draft review: 56 existing images and 13 explicitly planned shared images. Existing image approval states are preserved. No new audio or artwork generation, production activation or progress changes.', '',
  'The goal is to hear each target in a simple sentence or question. Direct picture matching is enough. Every card appears at least twice; shared cards keep the same identity and source bytes across words and correct/distractor roles.', '']
for (const word of bank.words) {
  text.push(`## ${word.text}（${word.reading}）`, '', word.meaning, '')
  for (const p of bank.prompts.filter(p => p.targetItemId === word.id)) {
    text.push(`### ${p.variant}`, '', p.sentence.text, p.sentence.reading, p.sentence.meaning, '')
    if (p.question) text.push(p.question.text, p.question.reading, p.question.meaning, '')
    text.push(`Shared set: \`${p.answerSetId}\``, '', ...p.cardIds.map(id => `- ${id === p.correctCardId ? '**Correct:** ' : ''}${cards.get(id).label} (\`${id}\`)${cards.get(id).kind === 'planned-image' ? ' — artwork needed' : ''}`), '')
    if (p.reviewNote) text.push(`Review note: ${p.reviewNote}`, '')
  }
}
text.push('## Shared card usage', '', '| Card | Appearances | Correct | Distractor | Words |', '| --- | ---: | ---: | ---: | --- |',
  ...report.inventory.map(u => `| ${u.id} | ${u.appearances} | ${u.correct} | ${u.distractor} | ${u.targetItemIds.map(wordName).join('、')} |`), '')
writeFileSync(resolve(output, 'questions.md'), text.join('\n'))
console.log(JSON.stringify({ ...report, inventory: undefined }, null, 2))
