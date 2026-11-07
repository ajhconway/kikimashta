import test from 'node:test'
import { inspectPngAlpha } from './png-alpha.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'

const root = new URL('../../', import.meta.url)
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'))
const activation = read('content/card-regeneration/activation.json')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const banks = [read('content/ja.json'), read('content/catalog/ja.json')]
const library = read('public/vocabulary/library-data.json').cards

test('all 135 active illustrations resolve to the approved selection in the app and library', () => {
  assert.equal(activation.assets.length, 135)
  assert.equal(new Set(activation.assets.map(asset => asset.id)).size, 135)
  for (const asset of activation.assets) {
    const manifest = read(asset.manifestPath)
    const selected = manifest.assets.find(item => item.id === asset.id)
    assert.equal(manifest.status, 'approved')
    assert.equal(selected.status, 'approved')
    assert.equal(asset.sourcePath, selected.path)
    assert.equal(hash(readFileSync(new URL(asset.sourcePath, root))), selected.sha256)
    const delivery = readFileSync(new URL(asset.path, root))
    assert.equal(hash(delivery), asset.sha256)
    assert.equal(delivery.length, asset.bytes)
    if (selected.transparentBackground) {
      assert.equal(asset.format, 'png')
      const pixels = inspectPngAlpha(delivery)
      assert.equal(pixels.width, 640)
      assert.equal(pixels.height, 640)
      assert.ok(pixels.transparentPixels > 0)
      assert.ok(pixels.opaquePixels > 0)
      const sourcePixels = inspectPngAlpha(readFileSync(new URL(asset.sourcePath, root)))
      const scale = pixels.width * pixels.height / (sourcePixels.width * sourcePixels.height)
      if (sourcePixels.opaqueWhitePixels * scale >= Math.max(1, sourcePixels.opaquePixels * scale / 1000)) assert.ok(pixels.opaqueWhitePixels > 0)
    } else assert.equal(delivery.subarray(0, 2).toString('hex'), 'ffd8', 'Historical opaque delivery must retain JPEG bytes')
    const items = banks.flatMap(bank => bank.items).filter(item => item.id === asset.id)
    assert.ok(items.length)
    for (const item of items) assert.equal(`public/${item.image.src}`, asset.path)
    const card = library.find(item => item.id === asset.id)
    if (card) {
      assert.equal(card.image.src, `../${asset.path.slice('public/'.length)}`)
      assert.equal(card.image.alt, items[0].image.alt)
      assert.equal(card.concept, items[0].image.alt)
    }
    if (selected.followUp) assert.equal(asset.followUp, selected.followUp)
  }
})

test('legacy SVG regeneration preserves active raster files and their visual descriptions', t => {
  const target = mkdtempSync(join(tmpdir(), 'kikimashta-approved-artwork-'))
  t.after(() => rmSync(target, { recursive: true, force: true }))
  for (const path of ['scripts/content', 'content/catalog', 'content/visuals']) {
    cpSync(new URL(path, root), join(target, path), { recursive: true })
  }
  for (const asset of activation.assets) {
    mkdirSync(dirname(join(target, asset.path)), { recursive: true })
    cpSync(new URL(asset.path, root), join(target, asset.path))
  }
  for (const script of ['illustrate-levels-1-2.mjs', 'illustrate-levels-3-4.mjs', 'illustrate-level-5.mjs']) {
    execFileSync(process.execPath, [join(target, 'scripts/content', script)], { cwd: target })
  }
  for (const asset of activation.assets) assert.equal(hash(readFileSync(join(target, asset.path))), asset.sha256)
  for (const file of ['levels-1-2.json', 'levels-3-4.json', 'level-5.json']) {
    const after = JSON.parse(readFileSync(join(target, 'content/visuals', file), 'utf8'))
    for (const before of read(`content/visuals/${file}`)) {
      if (activation.assets.some(asset => asset.id === before.id)) assert.deepEqual(after.find(item => item.id === before.id), before)
    }
  }
})
