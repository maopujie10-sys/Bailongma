// capabilities/executor.js
import { loadAllSchemas, findCapability } from './registry.js'
import fs from 'fs'
import path from 'path'
import { paths } from '../paths.js'

const CAPABILITIES_DIR = paths.srcCapabilities || path.join(paths.src, 'capabilities')

export async function executeCapability(capName, params = {}) {
  const cap = findCapability(capName)
  if (!cap) return { ok: false, error: `capability not found: ${capName}` }
  const execPath = path.join(CAPABILITIES_DIR, capName, 'executor.js')
  if (!fs.existsSync(execPath)) return { ok: false, error: `executor not found for ${capName}` }
  try {
    const mod = await import(`file://${execPath}?t=${Date.now()}`)
    if (typeof mod.execute !== 'function') return { ok: false, error: `no execute function for ${capName}` }
    return await mod.execute(params)
  } catch (e) { return { ok: false, error: e.message } }
}
export function listExecutableCapabilities() {
  return loadAllSchemas().filter(s => fs.existsSync(path.join(CAPABILITIES_DIR, s.name, 'executor.js'))).map(s => s.name)
}
