// capabilities/registry.js
import fs from 'fs'
import path from 'path'
import { paths } from '../paths.js'

const CAPABILITIES_DIR = paths.srcCapabilities || path.join(paths.src, 'capabilities')
let cachedSchemas = null
let cachedAt = 0

export function listCapabilityDirs() {
  if (!fs.existsSync(CAPABILITIES_DIR)) return []
  return fs.readdirSync(CAPABILITIES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name)
}
export function loadSchema(capName) {
  const schemaPath = path.join(CAPABILITIES_DIR, capName, 'schema.json')
  if (!fs.existsSync(schemaPath)) return null
  try { return JSON.parse(fs.readFileSync(schemaPath, 'utf-8')) }
  catch (e) { console.error('[capabilities] loadSchema failed:', e.message); return null }
}
export function loadAllSchemas(force = false) {
  if (!force && cachedSchemas && Date.now() - cachedAt < 30000) return cachedSchemas
  const dirs = listCapabilityDirs()
  cachedSchemas = dirs.map(d => ({ name: d, schema: loadSchema(d) })).filter(s => s.schema)
  cachedAt = Date.now()
  return cachedSchemas
}
export function getToolSchemas() { return loadAllSchemas().map(s => s.schema) }
export function findCapability(name) { return loadAllSchemas().find(s => s.name === name) || null }
