// capabilities/evolution/executor.js v2
// 改进: 语法校验 + 增量构建 + 升级快照
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

function tj(p) { return JSON.stringify(p, null, 2) }
function getProjDir() { return 'D:\\Projects\\AI项目\\BaiLongma-main' }
function getUserDir() { return process.env.BAILONGMA_USER_DIR || process.cwd() }

function gitBackup(projDir, desc) {
  try {
    execSync('git add -A', { cwd: projDir, timeout: 10000 })
    execSync('git commit -m "evolution: ' + desc + '"', { cwd: projDir, timeout: 10000 })
    var hash = execSync('git rev-parse HEAD', { cwd: projDir, encoding: 'utf-8', timeout: 5000 }).trim().slice(0, 8)
    return { backedUp: true, commit: hash }
  } catch (e) { return { backedUp: false, error: e.message } }
}

function validateSyntax(fp) {
  if (!/\.(js|mjs|cjs)$/.test(fp)) return { ok: true }
  try {
    execSync('node --check "' + fp + '"', { timeout: 10000, stdio: 'pipe' })
    return { ok: true }
  } catch (e) {
    var errMsg = (e.stderr || e.message || '').toString().slice(0, 500)
    return { ok: false, error: errMsg }
  }
}

async function list_source(params) {
  var projDir = getProjDir()
  var targetDir = params.subdir ? path.join(projDir, 'src', params.subdir) : path.join(projDir, 'src')
  if (!fs.existsSync(targetDir)) return tj({ ok: false, error: 'dir not found' })
  var files = []
  function walk(dir, d) {
    if (d > 6) return
    try {
      for (var i = 0; i < fs.readdirSync(dir, { withFileTypes: true }).length; i++) {
        var e = fs.readdirSync(dir, { withFileTypes: true })[i]
        var full = path.join(dir, e.name)
        var rel = path.relative(projDir, full).replace(/\\/g, '/')
        if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') walk(full, d + 1)
        else if (e.isFile() && /\.(js|mjs|cjs|py|json|yaml|yml|md|css|html)$/.test(e.name))
          try { files.push({ path: rel, size: fs.statSync(full).size }) } catch {}
      }
    } catch {}
  }
  walk(targetDir, 0)
  files.sort(function(a, b) { return a.path.localeCompare(b.path) })
  return tj({ ok: true, projectDir: projDir, count: files.length, files })
}

async function read_source(params) {
  var projDir = getProjDir()
  var fp = path.resolve(projDir, params.file)
  if (!fs.existsSync(fp)) return tj({ ok: false, error: 'file not found: ' + params.file })
  try {
    var lines = fs.readFileSync(fp, 'utf-8').split('\n')
    var offset = Math.max(0, (params.offset || 1) - 1)
    var limit = Math.min(params.limit || 2000, 2000)
    var slice = lines.slice(offset, offset + limit)
    var content = ''
    for (var i = 0; i < slice.length; i++) {
      content += String(offset + i + 1).padStart(4, ' ') + '| ' + slice[i] + '\n'
    }
    return tj({ ok: true, file: params.file, totalLines: lines.length, offset: offset + 1, shown: slice.length, content: content })
  } catch (e) { return tj({ ok: false, error: e.message }) }
}

async function write_source(params) {
  var projDir = getProjDir()
  var fp = path.resolve(projDir, params.file)
  if (!fs.existsSync(fp) && params.action !== 'append') return tj({ ok: false, error: 'file not found: ' + params.file })
  if (fp.indexOf('node_modules') >= 0 || fp.indexOf('dist-build') >= 0 || fp.indexOf('\\.git\\') >= 0)
    return tj({ ok: false, error: 'forbidden: node_modules/dist-build/.git' })

  var backup = gitBackup(projDir, 'pre: ' + params.description)
  if (!backup.backedUp) return tj({ ok: false, error: 'git backup failed', detail: backup })

  var originalContent = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf-8') : ''

  try {
    var content = originalContent
    var lines = content.split('\n')
    var nc = ''
    switch (params.action) {
      case 'replace':
        if (!params.old_string || content.indexOf(params.old_string) < 0)
          return tj({ ok: false, error: 'old_string not found. Use read_source to check exact content.' })
        nc = content.replace(params.old_string, params.new_string || '')
        break
      case 'insert_after': {
        var idx = (params.line || 1) - 1
        if (idx < 0 || idx >= lines.length) return tj({ ok: false, error: 'line out of range 1-' + lines.length })
        lines.splice(idx + 1, 0, params.new_string || '')
        nc = lines.join('\n')
        break }
      case 'insert_before': {
        var idx = (params.line || 1) - 1
        if (idx < 0 || idx > lines.length) return tj({ ok: false, error: 'line out of range 1-' + lines.length })
        lines.splice(idx, 0, params.new_string || '')
        nc = lines.join('\n')
        break }
      case 'append':
        nc = content + (content.endsWith('\n') ? '' : '\n') + (params.new_string || '') + '\n'
        break
      case 'delete_lines':
        if (!params.old_string || content.indexOf(params.old_string) < 0)
          return tj({ ok: false, error: 'old_string not found' })
        nc = content.replace(params.old_string, '')
        break
      default: return tj({ ok: false, error: 'unknown: ' + params.action })
    }

    fs.writeFileSync(fp, nc, 'utf-8')

    // JS 语法校验
    var syntax = validateSyntax(fp)
    if (!syntax.ok) {
      fs.writeFileSync(fp, originalContent, 'utf-8')
      try { execSync('git checkout -- "' + params.file.replace(/\\/g, '/') + '"', { cwd: projDir, timeout: 10000, stdio: 'pipe' }) } catch {}
      return tj({ ok: false, error: 'SYNTAX ERROR — changes reverted', syntaxError: syntax.error, hint: 'Code has syntax errors. Fix and retry.' })
    }

    try { execSync('git add -A', { cwd: projDir, timeout: 10000 }); execSync('git commit -m "evolution: ' + params.description + '"', { cwd: projDir, timeout: 10000 }) } catch {}

    return tj({ ok: true, file: params.file, action: params.action, backup: backup, syntaxChecked: true, hint: 'OK. Next: self_build -> self_upgrade. On failure: self_rollback.' })
  } catch (e) {
    try { fs.writeFileSync(fp, originalContent, 'utf-8') } catch {}
    return tj({ ok: false, error: 'write failed: ' + e.message, hint: 'Changes reverted.' })
  }
}

async function self_build() {
  var projDir = getProjDir()
  var distPath = path.join(projDir, 'dist-build')
  var unpacked = path.join(distPath, 'win-unpacked')
  if (fs.existsSync(distPath)) try { fs.rmSync(distPath, { recursive: true, force: true }) } catch {}
  try {
    var result = execSync('npm run build:win', { cwd: projDir, encoding: 'utf-8', timeout: 600000, stdio: ['pipe', 'pipe', 'pipe'] })
    var built = fs.existsSync(unpacked)
    var exeSize = built ? Math.round(fs.statSync(path.join(unpacked, 'Bailongma.exe')).size / 1024 / 1024) + 'MB' : null
    return tj({ ok: built, unpacked: built ? unpacked : null, exeSize: exeSize, output: (result || '').slice(-1000), hint: built ? 'Build OK. Call self_upgrade.' : 'Check output.' })
  } catch (e) {
    return tj({ ok: false, error: e.message, stderr: (e.stderr || '').slice(-2000), stdout: (e.stdout || '').slice(-2000), hint: 'Build FAILED. Call self_rollback.' })
  }
}

async function self_upgrade() {
  var projDir = getProjDir()
  var src = path.join(projDir, 'dist-build', 'win-unpacked')
  if (!fs.existsSync(src)) return tj({ ok: false, error: 'dist-build/win-unpacked not found, run self_build first' })

  var dest = path.dirname(process.execPath)
  var snapshotDir = dest + '.snapshot.' + Date.now()

  try {
    // 备份当前版本
    function cpDir(s, d) {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
      var entries = fs.readdirSync(s, { withFileTypes: true })
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i]
        var ss = path.join(s, e.name), dd = path.join(d, e.name)
        if (e.isDirectory()) cpDir(ss, dd); else try { fs.copyFileSync(ss, dd) } catch {}
      }
    }
    cpDir(dest, snapshotDir)

    // 复制新版本
    function cpDirForce(s, d) {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
      var entries = fs.readdirSync(s, { withFileTypes: true })
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i]
        var ss = path.join(s, e.name), dd = path.join(d, e.name)
        if (e.isDirectory()) cpDirForce(ss, dd); else {
          try { fs.copyFileSync(ss, dd) } catch (err) { /* locked file, skip */ }
        }
      }
    }
    cpDirForce(src, dest)

    // 保存快照路径
    try { fs.writeFileSync(path.join(getUserDir(), '.last_snapshot'), snapshotDir, 'utf-8') } catch {}

    // 重启
    try { var app = await import('electron'); app.app.relaunch(); app.app.exit(0) } catch { process.exit(42) }
    return tj({ ok: true, snapshot: snapshotDir, hint: 'Upgraded. Restarting...' })
  } catch (e) {
    // 失败 → 恢复快照
    if (fs.existsSync(snapshotDir)) {
      try {
        function rmDir(d) { if (fs.existsSync(d)) { var es = fs.readdirSync(d, { withFileTypes: true }); for (var i = 0; i < es.length; i++) { var p = path.join(d, es[i].name); if (es[i].isDirectory()) rmDir(p); else fs.unlinkSync(p) } fs.rmdirSync(d) } }
        rmDir(dest)
        function restore(s, d) {
          if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
          var entries = fs.readdirSync(s, { withFileTypes: true })
          for (var i = 0; i < entries.length; i++) {
            var e = entries[i]
            var ss = path.join(s, e.name), dd = path.join(d, e.name)
            if (e.isDirectory()) restore(ss, dd); else fs.copyFileSync(ss, dd)
          }
        }
        restore(snapshotDir, dest)
        return tj({ ok: false, error: 'Upgrade failed, restored from snapshot.', detail: e.message })
      } catch {}
    }
    return tj({ ok: false, error: 'upgrade failed: ' + e.message })
  }
}

async function self_rollback() {
  var projDir = getProjDir()
  try {
    var log = execSync('git log --oneline -5 --grep="evolution:"', { cwd: projDir, encoding: 'utf-8', timeout: 10000 }).trim()
    if (!log) return tj({ ok: false, error: 'No evolution commits to rollback.' })
    execSync('git reset --hard HEAD~1', { cwd: projDir, timeout: 10000 })

    // 尝试恢复上一个快照
    var snapshotRestored = false
    try {
      var snapFile = path.join(getUserDir(), '.last_snapshot')
      if (fs.existsSync(snapFile)) {
        var snapDir = fs.readFileSync(snapFile, 'utf-8').trim()
        if (fs.existsSync(snapDir)) {
          var dest = path.dirname(process.execPath)
          function cpDir(s, d) {
            if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
            var entries = fs.readdirSync(s, { withFileTypes: true })
            for (var i = 0; i < entries.length; i++) {
              var e = entries[i]
              var ss = path.join(s, e.name), dd = path.join(d, e.name)
              if (e.isDirectory()) cpDir(ss, dd); else try { fs.copyFileSync(ss, dd) } catch {}
            }
          }
          cpDir(snapDir, dest)
          snapshotRestored = true
        }
      }
    } catch {}

    return tj({ ok: true, hint: 'Rolled back. Re-run self_build + self_upgrade.', reverted: log, snapshotRestored: snapshotRestored })
  } catch (e) { return tj({ ok: false, error: 'rollback failed: ' + e.message }) }
}

var handlers = { write_source: write_source, self_build: self_build, self_upgrade: self_upgrade, self_rollback: self_rollback, list_source: list_source, read_source: read_source }
export async function execute(params, context) {
  var capName = (context && context.capName) || (context && context.toolName)
  if (!capName) return tj({ ok: false, error: 'no tool name' })
  var handler = handlers[capName]
  if (!handler) return tj({ ok: false, error: 'unknown: ' + capName })
  return await handler(params)
}
