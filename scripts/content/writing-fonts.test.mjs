import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = path => readFileSync(new URL(path, root))
const json = path => JSON.parse(read(path))
const manifest = json('content/writing-fonts.json')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const characters = new Set([json('content/ja.json'), json('content/catalog/ja.json')].flatMap(bank => bank.items.flatMap(item => Array.from(item.text))))

// Decode the fonts' Unicode BMP cmap independently of their recorded metadata.
// These approved TrueType subsets all contain a platform 3/encoding 1 format 4 map.
function supportedCodepoints(bytes, weight) {
  assert.equal(bytes.readUInt32BE(0), 0x00010000, 'delivery is a TrueType font')
  let cmap
  for (let i = 0; i < bytes.readUInt16BE(4); i++) {
    const record = 12 + i * 16
    const tag = bytes.toString('ascii', record, record + 4)
    if (tag === 'cmap') cmap = bytes.readUInt32BE(record + 8)
    if (tag === 'OS/2') assert.equal(bytes.readUInt16BE(bytes.readUInt32BE(record + 8) + 4), weight, 'font contains the approved authored weight')
  }
  assert.notEqual(cmap, undefined, 'font has a character map')
  let mapping
  for (let i = 0; i < bytes.readUInt16BE(cmap + 2); i++) {
    const record = cmap + 4 + i * 8
    if (bytes.readUInt16BE(record) === 3 && bytes.readUInt16BE(record + 2) === 1) mapping = cmap + bytes.readUInt32BE(record + 4)
  }
  assert.notEqual(mapping, undefined, 'font has the expected Unicode map')
  assert.equal(bytes.readUInt16BE(mapping), 4)
  const count = bytes.readUInt16BE(mapping + 6) / 2
  const ends = mapping + 14
  const starts = ends + count * 2 + 2
  const deltas = starts + count * 2
  const offsets = deltas + count * 2
  const result = []
  for (let segment = 0; segment < count; segment++) {
    const start = bytes.readUInt16BE(starts + segment * 2)
    const end = bytes.readUInt16BE(ends + segment * 2)
    const delta = bytes.readInt16BE(deltas + segment * 2)
    const offset = bytes.readUInt16BE(offsets + segment * 2)
    for (let codepoint = start; codepoint <= end && codepoint < 0xffff; codepoint++) {
      let glyph = offset ? bytes.readUInt16BE(offsets + segment * 2 + offset + (codepoint - start) * 2) : codepoint
      if (!offset || glyph) glyph = (glyph + delta) & 0xffff
      if (glyph) result.push(codepoint)
    }
  }
  return result
}

test('approved print and handwriting fonts retain exact delivery bytes, licenses, and local CSS paths', () => {
  assert.equal(manifest.version, 1)
  assert.deepEqual(manifest.fonts.map(font => font.id), ['noto-sans', 'noto-serif', 'zen-maru', 'klee'])
  const css = read('src/writing-fonts.css').toString()
  const credits = read('public/credits.html').toString()
  for (const font of manifest.fonts) {
    assert.equal(font.weight, font.id === 'zen-maru' ? 500 : 600)
    assert.equal(font.license, 'OFL-1.1')
    assert.match(font.path, /^fonts\/japanese\/[a-z-]+\/font-[a-f0-9]{12}\.ttf$/)
    assert.match(font.licensePath, /^fonts\/japanese\/[a-z-]+\/OFL\.txt$/)
    const bytes = read('public/' + font.path)
    assert.equal(bytes.length, font.bytes)
    assert.equal(hash(bytes), font.sha256)
    const license = read('public/' + font.licensePath)
    assert.equal(hash(license), font.licenseSha256)
    assert.match(license.toString(), /SIL OPEN FONT LICENSE Version 1\.1/)
    assert.equal(new URL(font.sourceUrl).hostname, 'fonts.gstatic.com')
    assert.equal(new URL(font.cssSourceUrl).hostname, 'fonts.googleapis.com')
    assert.ok(css.includes(`url('/${font.path}')`))
    assert.ok(css.includes(`font-family: '${font.family}'`))
    assert.ok(css.includes(`.written-answer[data-font='${font.id}']`))
    assert.ok(credits.includes(`href="${font.licensePath}"`))
  }
  assert.ok(css.includes('font-display: optional;'), 'slow font delivery does not swap faces mid-card')
})

for (const font of manifest.fonts) test(font.name + ' covers authored bank text through its exact declared fallback policy', () => {
  const actual = supportedCodepoints(read('public/' + font.path), font.weight)
  assert.deepEqual(actual, font.supportedCodepoints, 'recorded coverage matches actual glyph mappings')
  const supported = new Set(actual)
  const missing = Array.from(characters, character => character.codePointAt(0)).filter(codepoint => !supported.has(codepoint)).sort((a, b) => a - b)
  assert.deepEqual(missing, font.missingCodepoints, 'every actual omission must be explicitly recorded')
  if (font.id === 'zen-maru') {
    assert.deepEqual(font.missingCodepoints, [65374])
    assert.equal(font.fallbackFontId, 'noto-sans')
    const fallback = manifest.fonts.find(candidate => candidate.id === font.fallbackFontId)
    assert.ok(fallback && fallback.id !== font.id, 'fallback names a distinct approved font')
    const fallbackSupported = new Set(supportedCodepoints(read('public/' + fallback.path), fallback.weight))
    for (const character of characters) assert.ok(supported.has(character.codePointAt(0)) || fallbackSupported.has(character.codePointAt(0)), `${font.name} and its fallback are missing ${character}`)
    const selector = read('src/writing-fonts.css').toString().match(/\.written-answer\[data-font=['"]zen-maru['"]\]\s*\{([^}]+)\}/)?.[1]
    assert.ok(selector, 'rounded writing has its own CSS selector')
    assert.match(selector, /font-weight:\s*500\s*;/)
  } else {
    assert.deepEqual(font.missingCodepoints, [])
    assert.equal(font.fallbackFontId, undefined)
  }
})
