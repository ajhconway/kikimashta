/** Inspect 8-bit non-interlaced PNG pixels without an image runtime (#72). */
import { crc32, inflateSync } from 'node:zlib'

const signature = '89504e470d0a1a0a'
const paeth = (a, b, c) => {
  const p = a + b - c
  const x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c)
  return x <= y && x <= z ? a : y <= z ? b : c
}

export function inspectPngAlpha(bytes) {
  if (bytes.subarray(0, 8).toString('hex') !== signature) throw new Error('Delivery must be PNG')
  let width, height, channels
  const parts = []
  let sawHeader = false, sawEnd = false, endedData = false
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset)
    if (offset + length + 12 > bytes.length) throw new Error('Truncated PNG')
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    if (!/^[A-Za-z]{4}$/.test(type) || !/^[A-Z]$/.test(type[2])) throw new Error('Invalid PNG chunk type')
    if (/^[A-Z]/.test(type) && !['IHDR', 'IDAT', 'IEND', 'PLTE'].includes(type)) throw new Error('Unsupported critical PNG chunk')
    const chunk = bytes.subarray(offset + 8, offset + 8 + length)
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== bytes.readUInt32BE(offset + 8 + length)) throw new Error('Invalid PNG chunk CRC')
    if (offset === 8 && type !== 'IHDR') throw new Error('PNG must start with IHDR')
    if (type === 'IHDR') {
      if (sawHeader) throw new Error('Duplicate PNG header')
      sawHeader = true
      if (length !== 13) throw new Error('Invalid PNG header')
      width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4)
      channels = chunk[9] === 6 ? 4 : chunk[9] === 4 ? 2 : 0
      if (!width || !height || width * height > 16_777_216 || chunk[8] !== 8 || !channels || chunk[10] || chunk[11] || chunk[12]) throw new Error('PNG requires 8-bit non-interlaced alpha pixels')
    }
    if (type === 'IDAT') {
      if (!sawHeader || endedData) throw new Error('Invalid PNG data order')
      parts.push(chunk)
    } else if (parts.length) endedData = true
    offset += length + 12
    if (type === 'IEND') {
      if (length || offset !== bytes.length) throw new Error('Invalid PNG end')
      sawEnd = true
      break
    }
  }
  if (!sawEnd) throw new Error('Missing PNG IEND')
  if (!channels || !parts.length) throw new Error('Missing PNG pixels')
  const stride = width * channels
  const raw = inflateSync(Buffer.concat(parts), { maxOutputLength: (stride + 1) * height })
  if (raw.length !== (stride + 1) * height) throw new Error('Invalid PNG pixel length')
  let previous = Buffer.alloc(stride)
  let transparentPixels = 0, opaquePixels = 0, opaqueWhitePixels = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    if (filter > 4) throw new Error('Invalid PNG row filter')
    const row = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)))
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? row[x - channels] : 0
      const up = previous[x], corner = x >= channels ? previous[x - channels] : 0
      row[x] = (row[x] + (filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, corner) : 0)) & 255
    }
    for (let x = 0; x < stride; x += channels) {
      const alpha = row[x + channels - 1]
      if (alpha <= 1) transparentPixels++
      if (alpha >= 250) {
        opaquePixels++
        if (row[x] > 245 && (channels === 2 || (row[x + 1] > 245 && row[x + 2] > 245))) opaqueWhitePixels++
      }
    }
    previous = row
  }
  return { width, height, transparentPixels, opaquePixels, opaqueWhitePixels }
}
