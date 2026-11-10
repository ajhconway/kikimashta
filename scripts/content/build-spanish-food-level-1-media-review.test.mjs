import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, copyFile, cp, mkdtemp, rm, symlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { buildFoodLevel1MediaReview, foodMediaReviewHtml } from './build-spanish-food-level-1-media-review.mjs'
const source = fileURLToPath(new URL('../../', import.meta.url)), FOOD = 'content/spanish-food-1', ART = 'artifacts/spanish-food-1-art', AUDIO = 'artifacts/spanish-food-1-audio-review', MEDIA = 'artifacts/spanish-food-1-media-review'
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const save = async (root, path, value) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n') }
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'food-listening-review-')); t.after(() => rm(root, { recursive: true, force: true }))
  const draft = await json(join(source, FOOD, 'draft.json')), reuse = await json(join(source, FOOD, 'audio-reuse.json')), generated = await json(join(source, AUDIO, 'manifest.json'))
  const paths = new Set(['content/es-419-voices.json', 'content/catalog/ja.json', ...['draft.json', 'generation-approval.json', 'artwork-revisions-v1.json', 'artwork-acceptance.json', 'audio-config.json', 'audio-approval.json', 'audio-reuse.json'].map(f => FOOD + '/' + f)])
  for (const item of draft.items) {
    if (item.artwork.source === 'approved-reuse') { paths.add(item.artwork.path); paths.add(item.artwork.evidence) }
    if (item.existingBank) paths.add(item.existingBank)
  }
  for (const s of reuse.sources) for (const key of ['bank', 'activation', 'acceptance']) paths.add(s[key])
  for (const c of reuse.clips) paths.add(c.path)
  for (const path of paths) { await mkdir(dirname(join(root, path)), { recursive: true }); await copyFile(join(source, path), join(root, path)) }
  for (const folder of [ART, AUDIO]) { await mkdir(dirname(join(root, folder)), { recursive: true }); await cp(join(source, folder), join(root, folder), { recursive: true }) }
  return { root, draft, reuse, generated }
}
const outputs = root => Promise.all([MEDIA + '/manifest.json', MEDIA + '/index.html', FOOD + '/media-review.html'].map(path => readFile(join(root, path))))

test('production Food1 review keeps accepted pictures, shared identities and all voices without modifying outputs', async () => {
  const draft = await json(join(source, FOOD, 'draft.json'))
  const protectedPaths = [ART + '/manifest.json', FOOD + '/artwork-acceptance.json', FOOD + '/draft.json', AUDIO + '/manifest.json']
  const before = await Promise.all(protectedPaths.map(path => readFile(join(source, path))))
  const inspected = await json(join(source, MEDIA, 'manifest.json'))
  assert.deepEqual(inspected.items.map(item => item.id), draft.items.map(item => item.id))
  assert.equal(inspected.images.length, 36)
  assert.equal(inspected.clips.length, 288)
  assert.equal(new Set(inspected.clips.map(clip => clip.id + ':' + clip.voice)).size, 288)
  assert.equal(inspected.clips.filter(clip => clip.source === 'new-generation').length, 96)
  assert.equal(inspected.clips.filter(clip => clip.source === 'accepted-reuse').length, 192)
  assert.equal(inspected.artworkStatus, 'accepted')
  assert.equal(inspected.runtimeActivationAuthorized, false)
  const html = foodMediaReviewHtml(inspected)
  assert.equal((html.match(/<article /g) ?? []).length, 36)
  assert.equal((html.match(/<img /g) ?? []).length, 36)
  assert.equal((html.match(/<audio controls /g) ?? []).length, 288)
  assert.match(html, /Food listening approval is pending/)
  assert.deepEqual(await Promise.all(protectedPaths.map(path => readFile(join(source, path)))), before)
})

test('a corrupt final new recording preserves every previous gallery output', async t => {
  const { root, generated } = await fixture(t)
  for (const path of [MEDIA + '/manifest.json', MEDIA + '/index.html', FOOD + '/media-review.html']) await save(root, path, 'previous output')
  const before = await outputs(root)
  await save(root, AUDIO + '/' + generated.clips.at(-1).file, 'changed final delivery')
  await assert.rejects(buildFoodLevel1MediaReview(root), /New Food recording bytes/)
  assert.deepEqual(await outputs(root), before)
})

test('a late output symlink preserves earlier galleries and its unrelated target', async t => {
  const { root } = await fixture(t)
  for (const path of [MEDIA + '/manifest.json', MEDIA + '/index.html']) await save(root, path, 'previous output')
  await save(root, 'sentinel.html', 'unrelated target')
  await symlink(join(root, 'sentinel.html'), join(root, FOOD, 'media-review.html'))
  await assert.rejects(buildFoodLevel1MediaReview(root), /symlinks/)
  assert.equal(await readFile(join(root, MEDIA, 'manifest.json'), 'utf8'), 'previous output')
  assert.equal(await readFile(join(root, MEDIA, 'index.html'), 'utf8'), 'previous output')
  assert.equal(await readFile(join(root, 'sentinel.html'), 'utf8'), 'unrelated target')
})
