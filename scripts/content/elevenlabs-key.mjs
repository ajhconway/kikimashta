/** Local generation credentials. Never log returned values or expose them to browser builds. */
import { readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseEnv } from 'node:util'

/** Parse a local env file after the caller has checked its private permissions. */
function loadEnvFile(file) {
  try { return parseEnv(readFileSync(file, 'utf8')) }
  catch { throw new Error('Could not read the local ElevenLabs credentials file.') }
}

export function loadElevenLabsKey({ env = process.env, homeDir = homedir() } = {}) {
  const valid = value => typeof value === 'string' && value.trim().length > 0 && !/\s/u.test(value.trim())
  if (valid(env.ELEVENLABS_API_KEY)) return env.ELEVENLABS_API_KEY.trim()
  const file = join(homeDir, '.config/kikimashta/elevenlabs.env')
  let info
  try { info = statSync(file) }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Set ELEVENLABS_API_KEY in ${file}. Keep the key out of chat, Git and browser code.`, { cause: error })
    throw new Error('Could not inspect the local ElevenLabs credentials file.', { cause: error })
  }
  if (!info.isFile()) throw new Error('The ElevenLabs credentials path must be a regular file.')
  if (process.platform !== 'win32' && (info.mode & 0o077) !== 0) {
    throw new Error(`Restrict the ElevenLabs credentials file before use: chmod 600 "${file}"`)
  }
  const values = loadEnvFile(file)
  if (!valid(values.ELEVENLABS_API_KEY)) throw new Error('The local credentials file needs a nonempty ELEVENLABS_API_KEY value.')
  // Return only the needed secret; do not add file contents to the process environment.
  return values.ELEVENLABS_API_KEY.trim()
}
