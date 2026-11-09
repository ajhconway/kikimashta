/** Six real-tone recordings exercise the complete pack alias and delivery matrix without provider calls. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { contextualTextDigest } from './contextual-audio-plan.mjs'
import { generateContextualAudition } from './generate-contextual-audition.mjs'
import { generateCards } from './generate-elevenlabs-cards.mjs'
import { buildPack1AudioReview } from './build-contextual-pack1-audio-review.mjs'
import { prepareContextualPack1Media } from './prepare-contextual-pack1-media.mjs'
import { projectRoot } from './validate-contextual.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const ffmpeg = process.env.FFMPEG || 'ffmpeg'

export async function pack1MediaFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'kikimashta-pack1-media-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const put = async (path, value) => {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n')
  }
  const prompt = (text, reading, meaning) => ({ text, reading, meaning, grammarTags: ['copula'], supportingVocabularyIds: [] })
  const vocabulary = [['cat', '猫', 'ねこ', 'cat'], ['dog', '犬', 'いぬ', 'dog'], ['bird', '鳥', 'とり', 'bird'], ['fish', '魚', 'さかな', 'fish']]
    .map(([id, text, reading, meaning]) => ({ id: 'ja-' + id, text, reading, meaning, language: 'ja-JP', image: { src: 'images/' + id + '.png', alt: meaning } }))
  const bank = { schemaVersion: 1, id: 'ja-contextual-wanikani-1-draft-v1', language: 'ja-JP', grammarProfile: 'genki-1',
    grammarReference: 'https://bookclub2.japantimes.co.jp/download/files/genki3/genki-3rd_syllabus_E.pdf',
    grammarPoints: [{ id: 'copula', label: 'Noun predicates', genkiLesson: 1 }], supportingVocabulary: [],
    // Preserve the bounded pack shape but only three unique Japanese utterances:
    // six small external-boundary fixtures cover every alias and public path.
    contexts: Array.from({ length: 116 }, (_, index) => {
      const id = `ja-ctx-wk1-fixture-${index + 1}`
      return { id, revision: 1, stage: index % 2 ? 'contrastive' : 'simple', targetItemId: 'ja-cat',
        targetOccurrence: { surface: '猫', reading: 'ねこ' },
        sentence: prompt('猫は犬と机の上にいます。', 'ねこはいぬとつくえのうえにいます。',
          index === 1 ? 'A cat and a dog are on the desk.' : 'The cat is on the desk with the dog.'),
        questions: ['target', 'detail'].map(kind => ({ id: `${id}-${kind}`, revision: 1, kind,
          prompt: kind === 'target'
            ? prompt('犬と机の上にいるのは何ですか。', 'いぬとつくえのうえにいるのはなんですか。', index === 1 ? 'Which animal is on the desk with the dog?' : 'What is on the desk with the dog?')
            : prompt('猫は何と机の上にいますか。', 'ねこはなにとつくえのうえにいますか。', 'What is on the desk with the cat?'),
          formats: ['text'], options: vocabulary.map(word => ({ id: word.id, vocabularyItemId: word.id, ...prompt(word.text, word.reading, word.meaning) })),
          correctOptionId: kind === 'target' ? 'ja-cat' : 'ja-dog', explanation: 'The cat and dog are on the desk together.' })),
        recordings: [], review: { text: 'pending', audio: 'not-generated' }, reviewNotes: 'Isolated media fixture.' }
    }) }
  const bankBytes = Buffer.from(JSON.stringify(bank, null, 2) + '\n')
  const approval = { ...JSON.parse(readFileSync(join(projectRoot, 'content/contextual/pack-1/text-approval.json'))),
    sourceFileSha256: hash(bankBytes), textSha256: contextualTextDigest(bank) }
  await put('content/contextual/ja-wanikani-1-draft.json', bankBytes)
  await put('content/contextual/pack-1/text-approval.json', approval)
  await put('content/catalog/ja.json', { language: 'ja-JP', items: vocabulary })
  await put('content/catalog/review-overrides.json', {})
  await put('content/contextual/answer-vocabulary.json', { schemaVersion: 1, language: 'ja-JP', items: [] })
  await put('content/elevenlabs-voices.json', readFileSync(join(projectRoot, 'content/elevenlabs-voices.json')))
  const tone = join(root, 'tone.mp3')
  execFileSync(ffmpeg, ['-hide_banner', '-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i',
    'sine=frequency=440:sample_rate=44100:duration=0.5', '-af', 'volume=0.5', '-c:a', 'libmp3lame', '-b:a', '128k', tone])
  const audio = await readFile(tone)
  const input = 'artifacts/generated-originals/pack1-fixture'
  let paidBoundaryCalls = 0
  await generateContextualAudition({ root, batch: 'pack1', output: input, apiKey: 'fixture-secret',
    generate: args => generateCards({ ...args, log: () => {},
      balance: async () => ({ usedCredits: 0, remainingCredits: 100000, creditLimit: 100000 }),
      speak: async () => { paidBoundaryCalls++; return { audio } } }) })
  assert.equal(paidBoundaryCalls, 6)
  const delivery = 'artifacts/generated-originals/pack1-normalized'
  execFileSync('python3', [fileURLToPath(new URL('./normalize-elevenlabs.py', import.meta.url)),
    '--input', join(root, input), '--output', join(root, delivery), '--workers', '2', '--ffmpeg', ffmpeg], { timeout: 60000 })
  const review = 'artifacts/contextual-audio-review/pack1-fixture'
  await buildPack1AudioReview({ root, input, delivery, output: review, ffmpeg })
  return { root, put, bank, bankBytes, review, delivery,
    provenancePath: join(root, review, 'review-provenance.json'), stage: () => prepareContextualPack1Media({ root, review, delivery }) }
}

