import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contextualSummary } from '../../src/content/contextual.ts'
import { loadContextualPilot, projectRoot } from './validate-contextual.mjs'

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
const escapeMarkdown = value => escapeHtml(value).replace(/[\\`*_[\]|]/g, '\\$&').replace(/\r?\n/g, ' ')
const mediaUrl = src => `../../public/${src.split('/').map(encodeURIComponent).join('/')}`
const rawMediaUrl = src => `https://raw.githubusercontent.com/ajhconway/kikimashta/codex/contextual-pilot-119/public/${src.split('/').map(encodeURIComponent).join('/')}`

export function renderContextualReview(bank, vocabulary) {
  const summary = contextualSummary(bank)
  const byId = new Map(vocabulary.map(item => [item.id, item]))
  const grammar = new Map(bank.grammarPoints.map(point => [point.id, point]))
  const support = new Map(bank.supportingVocabulary.map(word => [word.id, word]))
  const metadata = prompt => {
    const grammarText = prompt.grammarTags.map(id => {
      const point = grammar.get(id)
      return `${point.label} (Genki I ${point.genkiLesson})`
    }).join('; ') || 'None beyond the answer word'
    const words = prompt.supportingVocabularyIds.map(id => {
      const word = support.get(id)
      return `${word.text} (${word.reading}: ${word.meaning})`
    }).join('; ') || 'No additional supporting vocabulary'
    return `<details class="metadata"><summary>Grammar and supporting words</summary><p>${escapeHtml(grammarText)}</p><p>${escapeHtml(words)}</p></details>`
  }
  const promptHtml = prompt => `<p class="japanese" lang="ja">${escapeHtml(prompt.text)}</p><p class="reading" lang="ja">${escapeHtml(prompt.reading)}</p><p>${escapeHtml(prompt.meaning)}</p>${metadata(prompt)}`
  const contexts = bank.contexts.map((context, index) => {
    const target = byId.get(context.targetItemId)
    const questions = context.questions.map(question => {
      const options = question.options.map(option => {
        const correct = option.id === question.correctOptionId
        const picture = question.formats.includes('picture') ? byId.get(option.imageItemId) : undefined
        return `<li class="option${correct ? ' correct' : ''}">${picture ? `<img src="${escapeHtml(mediaUrl(picture.image.src))}" alt="${escapeHtml(picture.image.alt)}" loading="lazy">` : ''}<p class="japanese" lang="ja">${escapeHtml(option.text)}</p><p lang="ja">${escapeHtml(option.reading)}</p><p>${escapeHtml(option.meaning)}</p><p class="badge">${correct ? 'Authored correct answer' : 'Distractor'}</p>${metadata(option)}</li>`
      }).join('')
      return `<section class="question"><h3>${question.kind === 'target' ? 'Answer is the target' : 'Answer is another sentence detail'}</h3><p class="identifier">${escapeHtml(question.id)} · revision ${question.revision} · ${escapeHtml(question.formats.join(' + '))}</p>${promptHtml(question.prompt)}<ul class="options">${options}</ul><p><strong>Answer explanation:</strong> ${escapeHtml(question.explanation)}</p></section>`
    }).join('')
    return `<article id="${escapeHtml(context.id)}"><h2>${index + 1}. <span lang="ja">${escapeHtml(target.text)}</span> — ${escapeHtml(target.meaning)}</h2><p class="identifier">${escapeHtml(context.id)} · revision ${context.revision} · target ${escapeHtml(target.id)}</p><p class="badge">Text: ${escapeHtml(context.review.text)} · Audio: ${escapeHtml(context.review.audio)}</p>${promptHtml(context.sentence)}<p><strong>Target occurrence:</strong> <span lang="ja">${escapeHtml(context.targetOccurrence.surface)} (${escapeHtml(context.targetOccurrence.reading)})</span></p><p><strong>Review notes:</strong> ${escapeHtml(context.reviewNotes)}</p>${questions}</article>`
  }).join('\n')
  const navigation = bank.contexts.map((context, index) => `<a href="#${escapeHtml(context.id)}">${index + 1}. <span lang="ja">${escapeHtml(byId.get(context.targetItemId).text)}</span></a>`).join(' ')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Contextual quiz pilot — text review</title>
<style>
:root{color-scheme:light;font-family:system-ui,sans-serif;line-height:1.5;color:#292337;background:#f3eff7}body{margin:0 auto;max-width:1100px;padding:24px}header,article{background:#fff;border:1px solid #d8cfe1;border-radius:16px;padding:24px;margin-bottom:24px}h1,h2,h3{line-height:1.3}nav{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}nav a{color:#5d337a}.japanese{font-size:1.45rem;line-height:1.7;margin:12px 0}.reading{color:#5d5366}.identifier{font-size:.8rem;overflow-wrap:anywhere;color:#665b70}.badge{display:inline-block;font-size:.85rem;font-weight:650;background:#eee8f5;border-radius:6px;padding:4px 8px}.question{border-top:1px solid #ddd3e6;margin-top:24px;padding-top:16px}.options{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));list-style:none;padding:0;gap:12px}.option{border:1px solid #d6ccdf;border-radius:12px;padding:14px;min-width:0}.correct{border:2px solid #52745d;background:#f2f8f2}.option img{display:block;width:100%;height:150px;object-fit:contain;background:#f6f3f8;border-radius:8px}.option p{margin:6px 0}.metadata{font-size:.85rem;color:#554b5e}.metadata p{margin:8px 0}.notice{border-left:4px solid #9773af;padding-left:14px}a:focus-visible,summary:focus-visible{outline:3px solid #80579b;outline-offset:3px}@media(max-width:500px){body{padding:12px}header,article{padding:16px}.options{grid-template-columns:repeat(2,minmax(0,1fr))}.option{padding:10px}.option img{height:115px}.option .japanese{font-size:1.2rem}}
</style></head><body><header><h1>Contextual quiz pilot</h1><p>${summary.targets} target words · ${summary.contexts} sentence contexts · ${summary.questions} questions · ${summary.pictureQuestions} picture-capable · ${summary.textQuestions} written-choice questions</p><p class="notice">Author review. All Japanese, translations, choices and proposed pictures are visible here. Practice readiness is recorded on each context. This page does not generate speech or activate cards.</p><p>Review natural Japanese and readings, beginner-friendly Genki I grammar, one defensible answer, target relevance, plausible distractors, and whether each proposed picture clearly represents its answer. Please identify edits by context or question ID.</p><p>In the learner experience, the sentence and question will be heard first. Text and meaning will be revealed after answering and will stay visible until Continue.</p><p><a href="${escapeHtml(bank.grammarReference)}">Genki I grammar scope reference</a></p><nav aria-label="Sentence contexts">${navigation}</nav></header>${contexts}</body></html>\n`
}

/** Suitable for a GitHub issue comment; generated from the same review bank. */
export function renderContextualMarkdown(bank, vocabulary) {
  const byId = new Map(vocabulary.map(item => [item.id, item]))
  const summary = contextualSummary(bank)
  const lines = [
    `Pilot text review: **${summary.targets} targets, ${summary.contexts} contexts, ${summary.questions} questions**. ${summary.pictureQuestions} support pictures; ${summary.textQuestions} support written choices.`,
    '', `Text approved for ${bank.contexts.filter(context => context.review.text === 'approved').length}/${bank.contexts.length} contexts. This review does not generate speech or activate practice.`,
    '', 'Please review Japanese/readings, translations, Genki I difficulty, answer clarity, distractors and proposed pictures. Refer to the context/question IDs when requesting edits.', '',
  ]
  for (const [index, context] of bank.contexts.entries()) {
    const target = byId.get(context.targetItemId)
    lines.push(`<details><summary>${index + 1}. ${escapeHtml(target.text)} — ${escapeHtml(context.id)}</summary>`, '',
      `**Sentence:** ${escapeMarkdown(context.sentence.text)}`, '',
      `${escapeMarkdown(context.sentence.reading)} — ${escapeMarkdown(context.sentence.meaning)}`, '',
      `**Review note:** ${escapeMarkdown(context.reviewNotes)}`, '')
    for (const question of context.questions) {
      lines.push(`**${escapeMarkdown(question.id)}** · ${question.kind === 'target' ? 'target answer' : 'other detail'} · ${question.formats.join(' + ')}`, '',
        `${escapeMarkdown(question.prompt.text)} — ${escapeMarkdown(question.prompt.meaning)}`, '',
        `Reading: ${escapeMarkdown(question.prompt.reading)}`, '',
        '| Choice | Reading | Meaning | Authored answer | Proposed picture |', '| --- | --- | --- | --- | --- |')
      for (const option of question.options) {
        const picture = question.formats.includes('picture') ? byId.get(option.imageItemId) : undefined
        lines.push(`| ${escapeMarkdown(option.text)} | ${escapeMarkdown(option.reading)} | ${escapeMarkdown(option.meaning)} | ${option.id === question.correctOptionId ? 'Correct' : 'Distractor'} | ${picture ? `<img width="96" alt="${escapeHtml(picture.image.alt)}" src="${escapeHtml(rawMediaUrl(picture.image.src))}">` : '—'} |`)
      }
      lines.push('', `Explanation: ${escapeMarkdown(question.explanation)}`, '')
    }
    lines.push('</details>', '')
  }
  return lines.join('\n')
}

export function buildContextualReview({ root = projectRoot } = {}) {
  const { bank, vocabulary } = loadContextualPilot(root)
  const output = resolve(root, 'artifacts/contextual-pilot/review.html')
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, renderContextualReview(bank, vocabulary))
  return { output, ...contextualSummary(bank) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length === 3 && process.argv[2] === '--github') {
      const { bank, vocabulary } = loadContextualPilot()
      console.log(renderContextualMarkdown(bank, vocabulary))
    } else {
      if (process.argv.length !== 2) throw new Error('Usage: node scripts/content/build-contextual-review.mjs [--github]')
      console.log(JSON.stringify(buildContextualReview(), null, 2))
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
