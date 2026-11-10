/** Activate reviewed image selections without changing vocabulary or practice eligibility (#72). */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { inspectPngAlpha } from './png-alpha.mjs'
import { reviewedImage } from './reviewed-image.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const read = (root, path) => JSON.parse(readFileSync(join(root, path), 'utf8'))
const write = (root, path, data) => writeFileSync(join(root, path), JSON.stringify(data, null, 2) + '\n')
const defaultEncoder = (source, target, { format }) => execFileSync('sips', ['-s', 'format', format, ...(format === 'jpeg' ? ['-s', 'formatOptions', '85'] : []), '-Z', '640', source, '--out', target], { stdio: 'pipe' })
const reviewedSets = {
  'visual-reference-213': { directory: 'artifacts/visual-reference-art-213', count: 22, statement: "Let's ship this artwork set." },
  'picture-229': { directory: 'artifacts/picture-art-229', count: 31, statement: "Ok, let's ship this updated artwork.", opaqueId: 'ja-v-cbda72b9dd04',
    // SHA-256 of JSON.stringify(sorted accepted IDs), independent of the mutable plan partition.
    selectionIdsSha256: '924e14881f03e105874f477e9e8d015f0f014dd3b1b020c06f053e24126a0a2c',
    mediaSelectionSha256: '35769faf43c01ad7a3ae8681887be4f40fd37ae9700cc5c7e931ce08a2f4431f',
    suitabilityReviewSha256: 'cc051840c23297a4f5d3c86983fdf642e1334657daf03b94a750d6da76c0d136',
    sourceRevision: '7942fddd9f08eab3f8a4d6b5b2c9d2b80ec72030' },
  'scene-233': { directory: 'artifacts/scene-art-233', manifest: 'release-manifest.json', count: 44, statement: "Great, let's ship these. Auto-merge.",
    selectionIdsSha256: '80e01ae49a6a39123cec52e87606ac93566787b7522418bff1654878a391f1dc',
    mediaSelectionSha256: '77535d089a4fe6f23b07801e0d4bc2fd4b06c36258a16f80c362736b050c447e',
    suitabilityReviewSha256: 'cc051840c23297a4f5d3c86983fdf642e1334657daf03b94a750d6da76c0d136',
    sourceRevision: 'd0d940a1031ce58ae085c179e76e00bbe7f565a3',
    relatedId: 'ja-v-ba0c8a160c33', relatedSha256: 'fc2c2914e58d6c6a9224d2de8965fd19687d41233b5a5247788bf5b0870e8e98' },
}

const selectionOf = ({ id, path, sha256, selectedVersion }) => ({ id, path, sha256, selectedVersion })
const orderedSelections = assets => assets.map(selectionOf).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

function validatePictureScope(root, manifest, directory) {
  const expected = reviewedSets['picture-229']
  const plan = read(root, `${directory}/plan.json`)
  const originalBytes = readFileSync(join(root, directory, 'sources/suitability-review.json'))
  const original = JSON.parse(originalBytes)
  const selected = new Map(plan.items?.map(item => [item.id, item]))
  const picture = new Map(original.items?.filter(item => item.category === 'picture').map(item => [item.id, item]))
  const excluded = new Set(plan.excludedUpdatedIds)
  if (plan.issue !== 229 || plan.category !== 'picture' || plan.expectedAssetCount !== 31 ||
      plan.pictureCardCount !== 92 || picture.size !== 92 || selected.size !== 31 || plan.items.length !== 31 ||
      hash(Buffer.from(JSON.stringify([...selected.keys()].sort()))) !== expected.selectionIdsSha256 ||
      excluded.size !== 61 || plan.excludedUpdatedIds.length !== 61 ||
      plan.sourceRevision !== expected.sourceRevision || manifest.sourceRevision !== expected.sourceRevision ||
      plan.suitabilityReviewSha256 !== expected.suitabilityReviewSha256 || hash(originalBytes) !== expected.suitabilityReviewSha256 ||
      [...excluded].some(id => !picture.has(id) || selected.has(id)) ||
      [...selected].some(([id, item]) => !isDeepStrictEqual(item, picture.get(id))) ||
      [...picture.keys()].some(id => !excluded.has(id) && !selected.has(id)) ||
      manifest.assets.some(asset => !selected.has(asset.id))) {
    throw new Error('Picture artwork must match the frozen 31-card selection and source review')
  }
}

function validateSceneScope(root, manifest, directory) {
  const expected = reviewedSets['scene-233']
  const plan = read(root, `${directory}/plan.json`)
  const primary = read(root, `${directory}/manifest.json`)
  const originalBytes = readFileSync(join(root, directory, 'sources/suitability-review.json'))
  const original = JSON.parse(originalBytes)
  const selected = new Map(plan.items?.map(item => [item.review?.id, item.review]))
  const category = new Map(original.items?.filter(item => item.category === 'staged-picture').map(item => [item.id, item]))
  const excluded = new Set(plan.excludedUpdatedIds)
  const excludedRecords = new Map(plan.excludedUpdated?.map(item => [item.review?.id, item.review]))
  const combinedIds = [...selected.keys(), expected.relatedId].sort()
  if (plan.issue !== 233 || plan.category !== 'staged-picture' || plan.expectedAssetCount !== 43 ||
      plan.totalCategoryCount !== 67 || category.size !== 67 || selected.size !== 43 || plan.items.length !== 43 ||
      hash(Buffer.from(JSON.stringify(combinedIds))) !== expected.selectionIdsSha256 ||
      excluded.size !== 24 || plan.excludedUpdatedIds.length !== 24 || plan.excludedUpdatedCount !== 24 ||
      excludedRecords.size !== 24 || plan.excludedUpdated.length !== 24 ||
      plan.sourceRevision !== expected.sourceRevision || manifest.sourceRevision !== expected.sourceRevision || primary.sourceRevision !== expected.sourceRevision ||
      plan.suitabilityReviewSha256 !== expected.suitabilityReviewSha256 || hash(originalBytes) !== expected.suitabilityReviewSha256 ||
      [...excluded].some(id => !category.has(id) || selected.has(id) || !isDeepStrictEqual(excludedRecords.get(id), category.get(id))) ||
      [...selected].some(([id, review]) => !isDeepStrictEqual(review, category.get(id))) ||
      [...category.keys()].some(id => !excluded.has(id) && !selected.has(id)) ||
      primary.issue !== 233 || primary.status !== 'approved' || primary.expectedAssetCount !== 43 || primary.assets.length !== 43 ||
      new Set(primary.assets.map(asset => asset.id)).size !== 43 || primary.assets.some(asset => !selected.has(asset.id))) {
    throw new Error('Scene artwork must match the frozen 43-card selection and source review')
  }
  const related = primary.relatedFamilyCandidates
  const night = related?.[0]
  if (!Array.isArray(related) || related.length !== 1 || night.id !== expected.relatedId || night.sha256 !== expected.relatedSha256 ||
      night.path !== `${directory}/${expected.relatedId}-family-v1.png` || (night.selectedVersion ?? night.version) !== 1 || night.status !== 'approved') {
    throw new Error('Scene release must include exactly the approved related Night image')
  }
  const combined = [...primary.assets, { ...night, selectedVersion: night.selectedVersion ?? night.version }]
  if (!isDeepStrictEqual(orderedSelections(manifest.assets), orderedSelections(combined))) throw new Error('Scene release selections differ from the primary artwork and related Night')
  for (const asset of primary.assets) {
    const review = selected.get(asset.id)
    if (asset.status !== 'approved' || asset.text !== review.japanese || asset.reading !== review.reading || asset.meaning !== review.catalogMeaning || asset.level !== review.level) {
      throw new Error(`Scene artwork identity differs from the frozen review: ${asset.id}`)
    }
  }
  if (hash(Buffer.from(JSON.stringify(orderedSelections(manifest.assets)))) !== expected.mediaSelectionSha256) throw new Error('Selections do not match the owner-approved scene media')
}

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
  if (!Array.isArray(batches) || !batches.length || new Set(batches).size !== batches.length || batches.some(batch => !/^batch-\d{2}$/.test(batch) && !Object.hasOwn(reviewedSets, batch))) throw new Error('Select unique batch-NN names, visual-reference-213, picture-229 or scene-233')
  const catalog = read(root, 'content/catalog/ja.json')
  const starter = read(root, 'content/ja.json')
  const activation = read(root, 'content/card-regeneration/activation.json')
  const visualPaths = ['levels-1-2.json', 'levels-3-4.json', 'level-5.json'].map(file => `content/visuals/${file}`)
  const visuals = visualPaths.map(path => ({ path, records: read(root, path) }))
  const allItems = [...catalog.items, ...starter.items]
  const seen = new Set()
  // Preflight every selection before changing any mapping or delivery.
  const plan = batches.flatMap(batch => {
    const reviewedSet = reviewedSets[batch]
    const directory = reviewedSet ? reviewedSet.directory : `artifacts/card-regeneration/${batch}`
    const manifestPath = `${directory}/${reviewedSet?.manifest ?? 'manifest.json'}`
    const manifest = read(root, manifestPath)
    if (manifest.status !== 'approved') throw new Error(`Batch is not approved: ${batch}`)
    if (reviewedSet && (manifest.expectedAssetCount !== reviewedSet.count || manifest.assets.length !== reviewedSet.count)) throw new Error(`Expected the complete ${reviewedSet.count}-image ${batch} set`)
    if (batch === 'picture-229') {
      validatePictureScope(root, manifest, directory)
      const selections = manifest.assets.map(({ id, path, sha256, selectedVersion }) => ({ id, path, sha256, selectedVersion }))
        .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      if (hash(Buffer.from(JSON.stringify(selections))) !== reviewedSet.mediaSelectionSha256) throw new Error('Selections do not match the owner-approved picture media')
    }
    if (batch === 'scene-233') validateSceneScope(root, manifest, directory)
    if (reviewedSet) {
      const release = manifest.releaseApproval
      if (!release || release.ownerStatement !== reviewedSet.statement ||
          release.scope !== 'Activate the complete selected artwork set; preserve vocabulary eligibility and progress.' ||
          typeof release.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(release.date) ||
          !Array.isArray(release.selections) || release.selections.length !== reviewedSet.count ||
          new Set(release.selections.map(selection => selection.id)).size !== reviewedSet.count ||
          release.selections.some(selection => !manifest.assets.some(asset =>
            asset.id === selection.id && asset.path === selection.path && asset.sha256 === selection.sha256 && asset.selectedVersion === selection.selectedVersion))) {
        throw new Error('Missing or stale complete-set release approval')
      }
    }
    return manifest.assets.map(asset => {
      if (seen.has(asset.id) || !allItems.some(item => item.id === asset.id) || asset.status !== 'approved') throw new Error(`Unapproved, duplicate or unknown image: ${asset.id}`)
      seen.add(asset.id)
      if (!/^ja-[a-z0-9-]+$/.test(asset.id) || typeof asset.path !== 'string' || !asset.path.startsWith(`${directory}/`) || !/^[a-zA-Z0-9_./-]+\.png$/.test(asset.path) || asset.path.split('/').includes('..')) throw new Error(`Unsafe artwork identity: ${asset.id}`)
      if (reviewedSet) {
        const approval = asset.approval
        const selected = asset.versions?.filter(version => version.version === asset.selectedVersion)
        if (!approval || approval.scope !== 'artwork only' || !approval.ownerStatement?.trim() || !approval.date?.trim() ||
            approval.sha256 !== asset.sha256 || approval.selectedVersion !== asset.selectedVersion ||
            !Number.isSafeInteger(asset.selectedVersion) || asset.selectedVersion < 1 || selected?.length !== 1 ||
            selected[0].path !== asset.path || selected[0].sha256 !== asset.sha256 ||
            asset.transparentBackground !== (asset.id !== reviewedSet.opaqueId)) throw new Error(`Missing or stale artwork approval: ${asset.id}`)
      }
      const resolved = reviewedImage({ root, reviewPath: asset.path, sha256: asset.sha256, size: asset.bytes, message: `Source hash mismatch: ${asset.id}` })
      const source = resolved.bytes
      if (source.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || hash(source) !== asset.sha256) throw new Error(`Source hash mismatch: ${asset.id}`)
      if (catalog.items.some(item => item.id === asset.id) && !visuals.some(file => file.records.some(visual => visual.id === asset.id))) throw new Error(`Missing visual metadata: ${asset.id}`)
      const description = asset.imageDescription ?? asset.visualReview
      if (typeof description !== 'string' || !description.trim()) throw new Error(`Missing visual description: ${asset.id}`)
      const format = asset.transparentBackground === true ? 'png' : 'jpeg'
      const sourceAlpha = format === 'png' ? inspectPngAlpha(source) : undefined
      if (sourceAlpha && (!sourceAlpha.transparentPixels || !sourceAlpha.opaquePixels)) throw new Error(`Source must have transparent outer pixels and opaque subject details: ${asset.id}`)
      return { asset, resolvedSource: resolved.path, manifestPath, description, format, sourceAlpha, path: `public/images/approved/${asset.id}-${asset.sha256.slice(0, 12)}.${format === 'png' ? 'png' : 'jpg'}` }
    })
  })
  const deliveries = plan.map(({ asset, resolvedSource, manifestPath, description, path, format, sourceAlpha }) => {
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
        encode(join(root, resolvedSource), staged, { format })
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
