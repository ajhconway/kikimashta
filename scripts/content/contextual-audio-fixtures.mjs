/** Small local fixtures shared by the #124 boundary tests; no provider calls. */
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { auditionProfile, contextualTextDigest } from './contextual-audio-plan.mjs'
import { projectRoot } from './validate-contextual.mjs'

export const sha256 = value => createHash('sha256').update(value).digest('hex')

export async function contextualFixture(t, { hostileText = false, stage = 'contrastive' } = {}) {
  const profile = auditionProfile(stage)
  const root = await mkdtemp(join(tmpdir(), 'kikimashta-contextual-audio-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const put = async (path, value) => {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n')
  }
  const word = (id, text, reading, meaning) => ({ id, language: 'ja-JP', text, reading, meaning,
    image: { src: `images/${id}.png`, alt: meaning, source: 'generated' } })
  const vocabulary = [word('ja-cat', '猫', 'ねこ', 'cat'), word('ja-dog', '犬', 'いぬ', 'dog'), word('ja-bird', '鳥', 'とり', 'bird')]
  const prompt = (text, reading, meaning) => ({ text, reading, meaning, grammarTags: ['copula'], supportingVocabularyIds: [] })
  const bank = { schemaVersion: 1, id: profile.bankId, language: 'ja-JP', grammarProfile: 'genki-1',
    grammarReference: 'https://bookclub2.japantimes.co.jp/download/files/genki3/genki-3rd_syllabus_E.pdf',
    grammarPoints: [{ id: 'copula', label: 'Noun predicates', genkiLesson: 1 }], supportingVocabulary: [],
    contexts: profile.contextIds.map((id, index) => ({ id, revision: index + 1, targetItemId: 'ja-cat',
      targetOccurrence: { surface: '猫', reading: 'ねこ' },
      sentence: prompt(`猫は犬と机の上にいます。${hostileText ? '<script>alert("x")</script>' : ''}`, 'ねこはいぬとつくえのうえにいます。', 'The cat is on the desk with the dog.'),
      questions: ['target', 'detail'].map(kind => ({ id: `${id}-${kind}`, revision: index + 1, kind,
        prompt: kind === 'target' ? prompt('犬と机の上にいるのは何ですか。', 'いぬとつくえのうえにいるのはなんですか。', 'What is on the desk with the dog?') :
          prompt('猫は何と机の上にいますか。', 'ねこはなにとつくえのうえにいますか。', 'What is on the desk with the cat?'),
        formats: ['text'], options: vocabulary.map(item => ({ id: item.id, vocabularyItemId: item.id, ...prompt(item.text, item.reading, item.meaning) })),
        correctOptionId: kind === 'target' ? 'ja-cat' : 'ja-dog', explanation: 'The cat and dog are on the desk together.' })),
      recordings: [], review: { text: 'approved', audio: 'not-generated' }, reviewNotes: 'Fixture text approval only.' })) }
  const approval = JSON.parse(await readFile(join(projectRoot, profile.approvalPath), 'utf8'))
  const config = JSON.parse(await readFile(join(projectRoot, 'content/elevenlabs-voices.json'), 'utf8'))
  const saveBank = async ({ approve = true } = {}) => {
    await put(profile.bankPath, bank)
    if (approve) await put(profile.approvalPath, { ...approval, bankId: bank.id,
      language: bank.language, sourceFileSha256: sha256(JSON.stringify(bank)), textSha256: contextualTextDigest(bank) })
  }
  await put('content/catalog/ja.json', { language: 'ja-JP', items: vocabulary })
  await put('content/catalog/review-overrides.json', {})
  await put('content/practice-pool.json', { itemIds: vocabulary.map(item => item.id) })
  await put('content/ja.json', { language: 'ja-JP', items: [] })
  await put('content/elevenlabs-voices.json', config)
  await saveBank()
  return { root, bank, put, saveBank, config, output: join(root, 'artifacts/generated-originals/contextual-audition/fixture') }
}
