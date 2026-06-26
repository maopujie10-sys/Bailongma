// capabilities/evolution/executor.js — 自我进化工具执行器
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

function tj(p) { return JSON.stringify(p, null, 2) }
function getProjDir() { return 'D:ProjectsAI项目BaiLongma-main' }

function gitBackup(projDir, desc) {
  try {
    execSync('git add -A', { cwd: projDir, timeout: 10000 })
    execSync(`git commit -m "evolution: ${desc}"`, { cwd: projDir, timeout: 10000 })
    return { backedUp: true }
  } catch (e) { return { backedUp: false, error: e.message } }
}

async function list_source(params) {
  const projDir = getProjDir()
  const targetDir = params.subdir ? path.join(projDir, 'src', params.subdir) : path.join(projDir, 'src')
  if (!fs.existsSync(targetDir)) return tj({ ok: false, error: 'dir not found' })
  const files = []
  function walk(dir, d) { if (d > 5) return; try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, e.name); const rel = path.relative(projDir, full).replace(/\/g, '/'); if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') walk(full, d + 1); else if (e.isFile() && /.(js|mjs|py|json|md)$/.test(e.name)) try { files.push({ path: rel, size: fs.statSync(full).size }) } catch {} } } catch {} }
  walk(targetDir, 0); files.sort((a, b) => a.path.localeCompare(b.path))
  return tj({ ok: true, count: files.length, files })
}

async function read_source(params) {
  const projDir = getProjDir()
  const fp = path.resolve(projDir, params.file)
  if (!fs.existsSync(fp)) return tj({ ok: false, error: 'file not found' })
  const lines = fs.readFileSync(fp, 'utf-8').split('
')
  const offset = Math.max(0, (params.offset || 1) - 1)
  const limit = Math.min(params.limit || 2000, 2000)
  const slice = lines.slice(offset, offset + limit)
  return tj({ ok: true, file: params.file, totalLines: lines.length, offset: offset + 1,
    content: slice.map((l, i) => `${String(offset + i + 1).padStart(4, ' ')}| ${l}`).join('
') })
}

async function write_source(params) {
  const projDir = getProjDir()
  const fp = path.resolve(projDir, params.file)
  if (!fs.existsSync(fp) && params.action !== 'append') return tj({ ok: false, error: 'file not found' })
  const backup = gitBackup(projDir, `pre: ${params.description}`)
  try {
    const content = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf-8') : ''
    const lines = content.split('
')
    let nc = ''
    switch (params.action) {
      case 'replace':
        if (!params.old_string || !content.includes(params.old_string)) return tj({ ok: false, error: 'old_string not found' })
        nc = content.replace(params.old_string, params.new_string || ''); break
      case 'insert_after': {
        const idx = (params.line || 1) - 1
        if (idx < 0 || idx >= lines.length) return tj({ ok: false, error: 'line out of range' })
        lines.splice(idx + 1, 0, params.new_string || ''); nc = lines.join('
'); break }
      case 'insert_before': {
        const idx = (params.line || 1) - 1
        if (idx < 0 || idx > lines.length) return tj({ ok: false, error: 'line out of range' })
        lines.splice(idx, 0, params.new_string || ''); nc = lines.join('
'); break }
      case 'append':
        nc = content + (content.endsWith('
') ? '' : '
') + (params.new_string || '') + '
'; break
      case 'delete_lines':
        if (!params.old_string || !content.includes(params.old_string)) return tj({ ok: false, error: 'old_string not found' })
        nc = content.replace(params.old_string, ''); break
      default: return tj({ ok: false, error: `unknown action: ${params.action}` })
    }
    fs.writeFileSync(fp, nc, 'utf-8')
    try { execSync('git add -A', { cwd: projDir, timeout: 10000 }); execSync(`git commit -m "evolution: ${params.description}"`, { cwd: projDir, timeout: 10000 }) } catch {}
    return tj({ ok: true, file: params.file, action: params.action, backup, hint: 'Next: self_build -> self_upgrade. On failure: self_rollback.' })
  } catch (e) { return tj({ ok: false, error: `write failed: ${e.message}` }) }
}

async function self_build() {
  const projDir = getProjDir()
  const distPath = path.join(projDir, 'dist-build')
  if (fs.existsSync(distPath)) try { fs.rmSync(distPath, { recursive: true, force: true }) } catch {}
  try {
    const result = execSync('npm run build:win', { cwd: projDir, encoding: 'utf-8', timeout: 600000, stdio: ['pipe', 'pipe', 'pipe'] })
    const unpacked = path.join(distPath, 'win-unpacked')
    return tj({ ok: fs.existsSync(unpacked), unpacked: fs.existsSync(unpacked) ? unpacked : null,
      output: (result || '').slice(-1000), hint: fs.existsSync(unpacked) ? 'Build OK. Call self_upgrade.' : 'Check output.' })
  } catch (e) { return tj({ ok: false, error: e.message, stderr: (e.stderr || '').slice(-2000), stdout: (e.stdout || '').slice(-2000), hint: 'Build FAILED. Call self_rollback.' }) }
}

async function self_upgrade() {
  const projDir = getProjDir()
  const src = path.join(projDir, 'dist-build', 'win-unpacked')
  if (!fs.existsSync(src)) return tj({ ok: false, error: 'dist-build/win-unpacked not found, run self_build first' })
  try {
    const dest = path.dirname(process.execPath)
    function cpDir(s, d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); for (const e of fs.readdirSync(s, { withFileTypes: true })) { const ss = path.join(s, e.name); const dd = path.join(d, e.name); if (e.isDirectory()) cpDir(ss, dd); else fs.copyFileSync(ss, dd) } }
    cpDir(src, dest)
    try { const { app } = await import('electron'); app.relaunch(); app.exit(0) } catch { process.exit(42) }
    return tj({ ok: true, hint: 'Restarting...' })
  } catch (e) { return tj({ ok: false, error: `upgrade failed: ${e.message}` }) }
}

async function self_rollback() {
  try {
    const projDir = getProjDir()
    const log = execSync('git log --oneline -3 --grep="evolution:"', { cwd: projDir, encoding: 'utf-8', timeout: 10000 }).trim()
    execSync('git reset --hard HEAD~1', { cwd: projDir, timeout: 10000 })
    return tj({ ok: true, hint: 'Rolled back. Re-run self_build + self_upgrade.', reverted: log })
  } catch (e) { return tj({ ok: false, error: `rollback failed: ${e.message}` }) }
}

const handlers = { write_source, self_build, self_upgrade, self_rollback, list_source, read_source }
export async function execute(params, context = {}) {
  const capName = context?.capName || context?.toolName
  if (!capName) return tj({ ok: false, error: 'no tool name' })
  const handler = handlers[capName]
  if (!handler) return tj({ ok: false, error: `unknown: ${capName}` })
  return await handler(params)
}
