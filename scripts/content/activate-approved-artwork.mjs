/** Activate reviewed image selections without changing vocabulary or practice eligibility (#72). */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectPngAlpha } from './png-alpha.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const read = (root, path) => JSON.parse(readFileSync(join(root, path), 'utf8'))
const write = (root, path, data) => writeFileSync(join(root, path), JSON.stringify(data, null, 2) + '\n')
const defaultEncoder = (source, target, { format }) => execFileSync('sips', ['-s', 'format', format, ...(format === 'jpeg' ? ['-s', 'formatOptions', '85'] : []), '-Z', '640', source, '--out', target], { stdio: 'pipe' })

function validateDelivery(bytes, asset, format, sourceAlpha) {
  if (format === 'jpeg') {
    if (bytes.subarray(0, 2).toString('hex') !== 'ffd8') throw new Error(`Delivery must be JPEG: ${asset.id}`)
    return
  }
  const alpha = inspectPngAlpha(bytes)
  if (alpha.width > 640 || alpha.height > 640 || !alpha.transparentPixels || !alpha.opaquePixels) throw new Error(`Delivery must preserve PNG transparency: ${asset.id}`)
  // Tiny bright antialias/highlight pixels may disappear when resized. Protect
  // white subject regions, rather than requiring sub-resolution noise to survive.
  const scale = alpha.width * alpha.height / (sourceAlpha.width * sourceAlpha.height)
  const meaningfulWhite = sourceAlpha.opaqueWhitePixels * scale >= Math.max(1, sourceAlpha.opaquePixels * scale / 1000)
  if (meaningfulWhite && !alpha.opaqueWhitePixels) throw new Error(`Delivery lost opaque white subject details: ${asset.id}`)
}

export function activateArtwork({ root, batches, encode = defaultEncoder }) {
  if (!Array.isArray(batches) || !batches.length || new Set(batches).size !== batches.length || batches.some(batch => !/^batch-\d{2}$/.test(batch))) throw new Error('Select unique batch-NN names')
  const catalog = read(root, 'content/catalog/ja.json')
  const starter = read(root, 'content/ja.json')
  const activation = read(root, 'content/card-regeneration/activation.json')
  const visualPaths = ['levels-1-2.json', 'levels-3-4.json', 'level-5.json'].map(file => `content/visuals/${file}`)
  const visuals = visualPaths.map(path => ({ path, records: read(root, path) }))
  const allItems = [...catalog.items, ...starter.items]
  const seen = new Set()
  // Preflight every selection before changing any mapping or delivery.
  const plan = batches.flatMap(batch => {
    const manifestPath = `artifacts/card-regeneration/${batch}/manifest.json`
    const manifest = read(root, manifestPath)
    if (manifest.status !== 'approved') throw new Error(`Batch is not approved: ${batch}`)
    return manifest.assets.flatMap(asset => {
      if (seen.has(asset.id) || !allItems.some(item => item.id === asset.id) || !['approved', 'replace-later', 'removed'].includes(asset.status)) throw new Error(`Unapproved, duplicate or unknown image: ${asset.id}`)
      seen.add(asset.id)
      // Explicit owner dispositions resolve review without publishing these images.
      if (asset.status !== 'approved') return []
      if (!/^ja-[a-z0-9-]+$/.test(asset.id) || typeof asset.path !== 'string' || !asset.path.startsWith(`artifacts/card-regeneration/${batch}/`) || !/^[a-zA-Z0-9_./-]+\.png$/.test(asset.path) || asset.path.split('/').includes('..')) throw new Error(`Unsafe artwork identity: ${asset.id}`)
      const source = readFileSync(join(root, asset.path))
      if (source.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || hash(source) !== asset.sha256) throw new Error(`Source hash mismatch: ${asset.id}`)
      if (catalog.items.some(item => item.id === asset.id) && !visuals.some(file => file.records.some(visual => visual.id === asset.id))) throw new Error(`Missing visual metadata: ${asset.id}`)
      const description = asset.imageDescription ?? asset.visualReview
      if (typeof description !== 'string' || !description.trim()) throw new Error(`Missing visual description: ${asset.id}`)
      const format = asset.transparentBackground === true ? 'png' : 'jpeg'
      const sourceAlpha = format === 'png' ? inspectPngAlpha(source) : undefined
      if (sourceAlpha && (!sourceAlpha.transparentPixels || !sourceAlpha.opaquePixels)) throw new Error(`Source must have transparent outer pixels and opaque subject details: ${asset.id}`)
      return [{ asset, manifestPath, description, format, sourceAlpha, path: `public/images/approved/${asset.id}-${asset.sha256.slice(0, 12)}.${format === 'png' ? 'png' : 'jpg'}` }]
    })
  })
  const deliveries = plan.map(({ asset, manifestPath, description, path, format, sourceAlpha }) => {
    const target = join(root, path)
    const recorded = activation.assets.find(record => record.id === asset.id && record.path === path &&
      record.sourcePath === asset.path && record.sourceSha256 === asset.sha256 && record.manifestPath === manifestPath)
    let bytes = existsSync(target) ? readFileSync(target) : undefined
    // A hash-derived filename identifies the source, not the encoded delivery.
    // Only reuse bytes verified by the previously recorded activation provenance.
    if (!recorded || !bytes || hash(bytes) !== recorded.sha256 || bytes.length !== recorded.bytes) {
      mkdirSync(dirname(target), { recursive: true })
      const temporary = mkdtempSync(join(dirname(target), '.artwork-'))
      try {
        const staged = join(temporary, `delivery.${format === 'png' ? 'png' : 'jpg'}`)
        encode(join(root, asset.path), staged, { format })
        bytes = readFileSync(staged)
        validateDelivery(bytes, asset, format, sourceAlpha)
        renameSync(staged, target)
      } finally {
        rmSync(temporary, { recursive: true, force: true })
      }
    }
    validateDelivery(bytes, asset, format, sourceAlpha)
    return { id: asset.id, sourcePath: asset.path, sourceSha256: asset.sha256, manifestPath, path, sha256: hash(bytes), bytes: bytes.length,
      ...(format === 'png' ? { format: 'png', alpha: 'preserved' } : {}),
      ...(asset.followUp ? { followUp: asset.followUp } : {}), description }
  })
  if (deliveries.some(delivery => delivery.format === 'png')) activation.transparentDelivery = { encoder: 'sips', format: 'png', maxDimension: 640, alpha: 'preserved' }
  for (const delivery of deliveries) {
    for (const item of allItems.filter(item => item.id === delivery.id)) item.image = { ...item.image, src: delivery.path.slice('public/'.length), alt: delivery.description }
    for (const file of visuals) for (const visual of file.records.filter(visual => visual.id === delivery.id)) visual.concept = delivery.description
    const record = { ...delivery }
    delete record.description
    const index = activation.assets.findIndex(asset => asset.id === delivery.id)
    if (index < 0) activation.assets.push(record)
    else activation.assets[index] = record
  }
  write(root, 'content/catalog/ja.json', catalog)
  write(root, 'content/ja.json', starter)
  for (const file of visuals) write(root, file.path, file.records)
  write(root, 'content/card-regeneration/activation.json', activation)
  return deliveries.map(delivery => delivery.id)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const batches = process.argv.slice(2)
  console.log(`Activated ${activateArtwork({ root: fileURLToPath(new URL('../../', import.meta.url)), batches }).length} approved illustrations.`)
}
