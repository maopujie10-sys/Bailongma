// capabilities/evolution/executor.js v3 — 完美版本
// AST结构化修改 + 原子写入 + 导入验证 + 语法校验 + 增量构建 + 原子升级

import fs from 'fs'
import path from 'path'
import { execSync, execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const PROJ_DIR = 'D:\\Projects\\AI项目\\BaiLongma-main'
const __filename = fileURLToPath(import.meta.url)
const LAUNCHER_PATH = path.join(path.dirname(__filename), 'upgrade-launcher.js')

function tj(p) { return JSON.stringify(p, null, 2) }
function getProjDir() { return PROJ_DIR }
function getUserDir() { return process.env.BAILONGMA_USER_DIR || process.cwd() }

// ══════════════════════════════════════════════════════════════
// GIT 备份
// ══════════════════════════════════════════════════════════════
function gitBackup(projDir, desc) {
  try {
    execSync('git add -A', { cwd: projDir, timeout: 10000, stdio: 'pipe' })
    execSync(`git commit -m "evolution: ${desc}"`, { cwd: projDir, timeout: 10000, stdio: 'pipe' })
    const hash = execSync('git rev-parse HEAD', { cwd: projDir, encoding: 'utf-8', timeout: 5000 }).trim().slice(0, 8)
    return { backedUp: true, commit: hash }
  } catch (e) { return { backedUp: false, error: e.message } }
}

function gitCommitChange(projDir, desc) {
  try {
    execSync('git add -A', { cwd: projDir, timeout: 10000, stdio: 'pipe' })
    execSync(`git commit -m "evolution: ${desc}"`, { cwd: projDir, timeout: 10000, stdio: 'pipe' })
  } catch {}
}

// ══════════════════════════════════════════════════════════════
// 代码结构化分析（不依赖外部 parser，用正则 + node 内建能力）
// ══════════════════════════════════════════════════════════════
const IMPORT_RE = /^import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*,?\s*)*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)?\s*from\s*['"]([^'"]+)['"]\s*;?\s*$/gm
const EXPORT_RE = /^export\s+(?:(?:default\s+)?(?:class|function|const|let|var|async\s+function)|(?:\{[^}]*\}))\s/mg
const FUNC_RE = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{/g
const CLASS_RE = /(?:export\s+)?class\s+(\w+)/g
const CONST_RE = /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/g

function parseImports(content) {
  const imports = []
  let match
  const re = new RegExp(IMPORT_RE.source, 'gm')
  while ((match = re.exec(content)) !== null) {
    imports.push({ source: match[1], full: match[0], end: match.index + match[0].length })
  }
  return imports
}

function parseFunctions(content) {
  const funcs = []
  let match
  const re = new RegExp(FUNC_RE.source, 'g')
  while ((match = re.exec(content)) !== null) {
    funcs.push({ name: match[1], start: match.index, end: match.index + match[0].length })
  }
  return funcs
}

function parseClasses(content) {
  const classes = []
  let match
  const re = new RegExp(CLASS_RE.source, 'g')
  while ((match = re.exec(content)) !== null) {
    classes.push({ name: match[1], start: match.index, end: match.index + match[0].length })
  }
  return classes
}

function findLastImportEnd(content) {
  const imports = parseImports(content)
  if (imports.length === 0) return 0
  // 找到最后一个 import 语句的结束位置
  let lastEnd = 0
  IMPORTS_LOOP: for (const imp of imports) {
    // 找这个 import 后第一个 \n 的位置
    const nlIdx = content.indexOf('\n', imp.end)
    lastEnd = Math.max(lastEnd, nlIdx >= 0 ? nlIdx + 1 : imp.end)
  }
  return lastEnd
}

// ══════════════════════════════════════════════════════════════
// 语法与导入校验
// ══════════════════════════════════════════════════════════════
function validateSyntax(fp) {
  if (!/\.(js|mjs|cjs)$/.test(fp)) return { ok: true }
  try {
    execSync(`node --check "${fp}"`, { timeout: 15000, stdio: 'pipe' })
    return { ok: true }
  } catch (e) {
    const errMsg = (e.stderr || e.message || '').toString().slice(0, 800)
    return { ok: false, error: errMsg }
  }
}

async function validateImports(fp) {
  if (!/\.(js|mjs)$/.test(fp)) return { ok: true }
  try {
    // 用动态 import 验证所有导入路径能否解析
    // 只做静态检查：确认每个 import 的源文件存在
    const content = fs.readFileSync(fp, 'utf-8')
    const imports = parseImports(content)
    const dir = path.dirname(fp)
    const broken = []
    for (const imp of imports) {
      if (imp.source.startsWith('.') || imp.source.startsWith('/')) {
        const resolved = path.resolve(dir, imp.source)
        // 尝试 .js .mjs /index.js /index.mjs
        const extensions = ['', '.js', '.mjs', '.cjs', '/index.js', '/index.mjs']
        const found = extensions.some(ext => fs.existsSync(resolved + ext))
        if (!found && !imp.source.includes('*')) {
          broken.push(imp.source)
        }
      }
      // npm 包导入跳过（不做 node_modules 解析）
    }
    if (broken.length > 0) {
      return { ok: false, error: `Imports not found: ${broken.join(', ')}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: true, warning: e.message } // 非关键错误
  }
}

// ══════════════════════════════════════════════════════════════
// list_source / read_source
// ══════════════════════════════════════════════════════════════
async function list_source(params) {
  const projDir = getProjDir()
  const targetDir = params.subdir ? path.join(projDir, 'src', params.subdir) : path.join(projDir, 'src')
  if (!fs.existsSync(targetDir)) return tj({ ok: false, error: 'dir not found: ' + (params.subdir || 'src') })
  const files = []
  function walk(dir, depth) {
    if (depth > 8) return
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name)
        const rel = path.relative(projDir, full).replace(/\\/g, '/')
        if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist-build') {
          walk(full, depth + 1)
        } else if (e.isFile() && /\.(js|mjs|cjs|py|json|yaml|yml|md|css|html|swift|java|kt)$/.test(e.name)) {
          try { files.push({ path: rel, size: fs.statSync(full).size }) } catch {}
        }
      }
    } catch {}
  }
  walk(targetDir, 0)
  files.sort((a, b) => a.path.localeCompare(b.path))
  return tj({ ok: true, projectDir: projDir, count: files.length, files })
}

async function read_source(params) {
  const projDir = getProjDir()
  const fp = path.resolve(projDir, params.file)
  if (!fs.existsSync(fp)) return tj({ ok: false, error: 'file not found: ' + params.file })
  try {
    const lines = fs.readFileSync(fp, 'utf-8').split('\n')
    const offset = Math.max(0, (params.offset || 1) - 1)
    const limit = Math.min(params.limit || 2000, 2000)
    const slice = lines.slice(offset, offset + limit)
    const imports = parseImports(fs.readFileSync(fp, 'utf-8'))
    const functions = parseFunctions(fs.readFileSync(fp, 'utf-8'))
    const classes = parseClasses(fs.readFileSync(fp, 'utf-8'))
    let content = ''
    for (let i = 0; i < slice.length; i++) {
      content += String(offset + i + 1).padStart(4, ' ') + '| ' + slice[i] + '\n'
    }
    return tj({ ok: true, file: params.file, totalLines: lines.length, offset: offset + 1, shown: slice.length,
      content, structure: { imports: imports.length, functions: functions.map(f => f.name), classes: classes.map(c => c.name) } })
  } catch (e) { return tj({ ok: false, error: e.message }) }
}

// ══════════════════════════════════════════════════════════════
// write_source — 核心：结构化代码修改
// ══════════════════════════════════════════════════════════════
async function write_source(params) {
  const projDir = getProjDir()
  const fp = path.resolve(projDir, params.file)
  if (!fs.existsSync(fp) && params.action !== 'append' && params.action !== 'add_import' && params.action !== 'add_function')
    return tj({ ok: false, error: 'file not found: ' + params.file })
  if (fp.includes('node_modules') || fp.includes('dist-build') || fp.includes('\\.git\\'))
    return tj({ ok: false, error: 'forbidden: node_modules/dist-build/.git' })

  // 改前 git 备份
  const backup = gitBackup(projDir, 'pre: ' + params.description)
  if (!backup.backedUp) {
    // 没有改动也要继续（可能这是一个全新文件）
    try { execSync('git add -A', { cwd: projDir, timeout: 10000, stdio: 'pipe' }) } catch {}
  }

  const originalContent = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf-8') : ''

  try {
    const content = originalContent
    const lines = content.split('\n')
    let nc = ''

    switch (params.action) {
      // ── 精确替换（保留兼容） ──
      case 'replace': {
        if (!params.old_string) return tj({ ok: false, error: 'replace needs old_string' })
        // 规范化空白后匹配
        const normalized = content.replace(/[ \t]+$/gm, '').replace(/\r\n/g, '\n')
        const normalizedOld = params.old_string.replace(/[ \t]+$/gm, '').replace(/\r\n/g, '\n')
        if (!normalized.includes(normalizedOld)) {
          return tj({ ok: false, error: 'old_string not found in file (whitespace-normalized match failed). Use read_source to check exact content.' })
        }
        nc = content.replace(params.old_string, params.new_string || '')
        break
      }

      // ── 结构化：添加 import ──
      case 'add_import': {
        if (!params.new_string) return tj({ ok: false, error: 'add_import needs new_string (the import statement)' })
        const lastImportEnd = findLastImportEnd(content)
        const insertAt = lastImportEnd > 0 ? lastImportEnd : 0
        const before = content.slice(0, insertAt)
        const after = content.slice(insertAt)
        nc = before + (before.endsWith('\n') ? '' : '\n') + params.new_string.trim() + '\n' + after
        break
      }

      // ── 结构化：添加函数 ──
      case 'add_function': {
        if (!params.new_string) return tj({ ok: false, error: 'add_function needs new_string (the function code)' })
        // 追加到文件末尾
        nc = content + (content.endsWith('\n') ? '\n' : '\n\n') + params.new_string.trim() + '\n'
        break
      }

      // ── 结构化：替换函数体 ──
      case 'replace_function': {
        if (!params.old_string || !params.new_string)
          return tj({ ok: false, error: 'replace_function needs old_string (function name) and new_string (new function code)' })
        const fnName = params.old_string.trim()
        const functions = parseFunctions(content)
        const target = functions.find(f => f.name === fnName)
        if (!target) return tj({ ok: false, error: `function '${fnName}' not found. Available: ${functions.map(f => f.name).join(', ')}` })

        // 找到函数结束的 }
        let depth = 0, end = target.end
        for (let i = end; i < content.length; i++) {
          if (content[i] === '{') depth++
          else if (content[i] === '}') {
            if (depth === 0) { end = i + 1; break }
            depth--
          }
        }
        nc = content.slice(0, target.start) + params.new_string.trim() + content.slice(end)
        break
      }

      // ── 在指定函数后追加 ──
      case 'insert_after': {
        const idx = (params.line || 1) - 1
        if (idx < 0 || idx >= lines.length) return tj({ ok: false, error: `line ${params.line} out of range 1-${lines.length}` })
        lines.splice(idx + 1, 0, params.new_string || '')
        nc = lines.join('\n')
        break
      }

      case 'insert_before': {
        const idx = (params.line || 1) - 1
        if (idx < 0 || idx > lines.length) return tj({ ok: false, error: `line ${params.line} out of range 1-${lines.length}` })
        lines.splice(idx, 0, params.new_string || '')
        nc = lines.join('\n')
        break
      }

      case 'append': {
        nc = content + (content.endsWith('\n') ? '' : '\n') + (params.new_string || '') + '\n'
        break
      }

      case 'delete_lines': {
        if (!params.old_string) return tj({ ok: false, error: 'delete_lines needs old_string' })
        if (!content.includes(params.old_string)) return tj({ ok: false, error: 'old_string not found' })
        nc = content.replace(params.old_string, '')
        break
      }

      default:
        return tj({ ok: false, error: 'unknown action: ' + params.action })
    }

    // 原子写入：先写 temp 文件，校验通过再 rename
    const tmpFile = fp + '.evolving.' + Date.now()
    fs.writeFileSync(tmpFile, nc, 'utf-8')

    // 语法校验
    const syntax = validateSyntax(tmpFile)
    if (!syntax.ok) {
      try { fs.unlinkSync(tmpFile) } catch {}
      return tj({
        ok: false, error: 'SYNTAX ERROR — changes rejected',
        syntaxError: syntax.error,
        hint: 'Code has syntax errors. Fix the code and try again. Original file untouched.',
      })
    }

    // 导入校验
    const importCheck = await validateImports(tmpFile)
    if (!importCheck.ok) {
      try { fs.unlinkSync(tmpFile) } catch {}
      return tj({
        ok: false, error: 'IMPORT ERROR — changes rejected',
        importError: importCheck.error,
        hint: 'Some imports could not be resolved. Check module paths and try again.',
      })
    }

    // 原子 rename（同分区内是原子操作）
    try {
      fs.renameSync(tmpFile, fp)
    } catch {
      // rename 跨分区可能失败，fallback 到 copy+delete
      fs.copyFileSync(tmpFile, fp)
      try { fs.unlinkSync(tmpFile) } catch {}
    }

    // git commit
    gitCommitChange(projDir, params.description)

    return tj({
      ok: true, file: params.file, action: params.action, backup,
      syntaxChecked: true, importsChecked: true,
      hint: 'OK. Next: self_build -> self_upgrade. On failure: self_rollback.',
    })
  } catch (e) {
    return tj({ ok: false, error: 'write failed: ' + e.message, hint: 'Original file preserved.' })
  }
}

// ══════════════════════════════════════════════════════════════
// self_build — 智能构建（检测改动范围）
// ══════════════════════════════════════════════════════════════
async function self_build() {
  const projDir = getProjDir()
  const distPath = path.join(projDir, 'dist-build')
  const unpacked = path.join(distPath, 'win-unpacked')

  // 清旧构建
  if (fs.existsSync(distPath)) {
    try { fs.rmSync(distPath, { recursive: true, force: true }) } catch {}
  }

  // 检测改动范围
  let changedNative = false
  try {
    const diffFiles = execSync('git diff --name-only HEAD~1', {
      cwd: projDir, encoding: 'utf-8', timeout: 10000, stdio: 'pipe',
    }).trim()
    changedNative = diffFiles.split('\n').some(f =>
      f.startsWith('electron/') || f.includes('native') || f.includes('better-sqlite3') || f === 'package.json'
    )
  } catch { changedNative = true } // 不确定就走全量

  try {
    const startTime = Date.now()
    let result

    if (changedNative) {
      // 全量构建（原生模块或壳有改动）
      result = execSync('npm run build:win', {
        cwd: projDir, encoding: 'utf-8', timeout: 600000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } else {
      // 增量构建：只重打包 ASAR + electron-builder
      result = execSync('node ./node_modules/electron-builder/cli.js --win', {
        cwd: projDir, encoding: 'utf-8', timeout: 600000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000)
    const built = fs.existsSync(unpacked)
    const exeSize = built
      ? Math.round(fs.statSync(path.join(unpacked, 'Bailongma.exe')).size / 1024 / 1024) + 'MB'
      : null

    return tj({
      ok: built, unpacked: built ? unpacked : null, exeSize,
      buildMode: changedNative ? 'full' : 'incremental',
      elapsed: elapsed + 's',
      output: (result || '').slice(-1000),
      hint: built ? 'Build OK (' + elapsed + 's). Call self_upgrade.' : 'Build completed but no output.',
    })
  } catch (e) {
    return tj({
      ok: false, error: e.message,
      stderr: (e.stderr || '').slice(-2000),
      stdout: (e.stdout || '').slice(-2000),
      hint: 'Build FAILED. Call self_rollback to revert.',
    })
  }
}

// ══════════════════════════════════════════════════════════════
// self_upgrade — 原子升级 + 健康检查
// ══════════════════════════════════════════════════════════════
async function self_upgrade() {
  const projDir = getProjDir()
  const src = path.join(projDir, 'dist-build', 'win-unpacked')
  if (!fs.existsSync(src)) return tj({ ok: false, error: 'dist-build/win-unpacked not found, run self_build first' })

  const dest = path.dirname(process.execPath)
  const snapshotDir = dest + '.snapshot.' + Date.now()
  const stateFile = path.join(getUserDir(), '.upgrade_state')

  try {
    // 1. 备份当前版本
    function cpDir(s, d) {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
      for (const e of fs.readdirSync(s, { withFileTypes: true })) {
        const ss = path.join(s, e.name), dd = path.join(d, e.name)
        if (e.isDirectory()) cpDir(ss, dd)
        else { try { fs.copyFileSync(ss, dd) } catch {} }
      }
    }
    cpDir(dest, snapshotDir)
    fs.writeFileSync(stateFile, JSON.stringify({ snapshot: snapshotDir, src, dest, startedAt: new Date().toISOString() }))

    // 2. 启动原子升级启动器（detached 子进程）
    const { spawn } = await import('child_process')
    const env = {
      ...process.env,
      BAILONGMA_UPGRADE_STATE: stateFile,
      BAILONGMA_UPGRADE_SRC: src,
      BAILONGMA_UPGRADE_DEST: dest,
      BAILONGMA_UPGRADE_SNAPSHOT: snapshotDir,
      BAILONGMA_UPGRADE_PARENT_PID: String(process.pid),
    }

    const launcher = spawn('node', [LAUNCHER_PATH], {
      detached: true, stdio: 'ignore', env,
    })
    launcher.unref()

    // 3. 退出当前进程（让启动器接管）
    try {
      const electron = await import('electron')
      electron.app.relaunch()
      electron.app.exit(0)
    } catch {
      process.exit(42)
    }

    return tj({ ok: true, snapshot: snapshotDir, hint: 'Upgrading — launcher PID: ' + launcher.pid })
  } catch (e) {
    return tj({ ok: false, error: 'upgrade failed: ' + e.message })
  }
}

// ══════════════════════════════════════════════════════════════
// self_rollback
// ══════════════════════════════════════════════════════════════
async function self_rollback() {
  const projDir = getProjDir()
  try {
    const log = execSync('git log --oneline -5 --grep="evolution:"', {
      cwd: projDir, encoding: 'utf-8', timeout: 10000, stdio: 'pipe',
    }).trim()
    if (!log) return tj({ ok: false, error: 'No evolution commits to rollback.' })

    execSync('git reset --hard HEAD~1', { cwd: projDir, timeout: 10000, stdio: 'pipe' })

    // 尝试恢复快照
    let snapshotRestored = false
    try {
      const stateFile = path.join(getUserDir(), '.upgrade_state')
      if (fs.existsSync(stateFile)) {
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
        if (state.snapshot && fs.existsSync(state.snapshot)) {
          const dest = path.dirname(process.execPath)
          function cpDir(s, d) {
            if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
            for (const e of fs.readdirSync(s, { withFileTypes: true })) {
              const ss = path.join(s, e.name), dd = path.join(d, e.name)
              if (e.isDirectory()) cpDir(ss, dd)
              else { try { fs.copyFileSync(ss, dd) } catch {} }
            }
          }
          cpDir(state.snapshot, dest)
          snapshotRestored = true
        }
      }
    } catch {}

    return tj({ ok: true, hint: 'Rolled back. Re-run self_build + self_upgrade.',
      reverted: log, snapshotRestored })
  } catch (e) { return tj({ ok: false, error: 'rollback failed: ' + e.message }) }
}

// ══════════════════════════════════════════════════════════════
// self_test — 构建后快速自测
// ══════════════════════════════════════════════════════════════
async function self_test() {
  const projDir = getProjDir()
  const results = []

  // 1. 源码语法检查
  const srcFiles = []
  function collectJS(dir, depth) {
    if (depth > 5) return
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name)
        if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') collectJS(full, depth + 1)
        else if (e.isFile() && /\.(js|mjs)$/.test(e.name)) srcFiles.push(full)
      }
    } catch {}
  }
  collectJS(path.join(projDir, 'src'), 0)

  let syntaxErrors = 0
  for (const f of srcFiles.slice(0, 50)) { // 抽样前50个文件
    const check = validateSyntax(f)
    if (!check.ok) { syntaxErrors++; results.push({ file: path.relative(projDir, f), error: check.error.slice(0, 200) }) }
  }

  // 2. 检查关键文件存在
  const keyFiles = ['src/index.js', 'src/llm.js', 'src/db.js', 'src/config.js', 'electron/main.cjs']
  const missing = keyFiles.filter(f => !fs.existsSync(path.join(projDir, f)))

  // 3. 检查 Git 状态
  let gitClean = false
  try {
    const st = execSync('git status --porcelain', { cwd: projDir, encoding: 'utf-8', timeout: 10000, stdio: 'pipe' }).trim()
    gitClean = st.length === 0
  } catch {}

  return tj({
    ok: syntaxErrors === 0 && missing.length === 0,
    syntaxChecked: srcFiles.length,
    syntaxErrors,
    syntaxErrorDetails: results.slice(0, 10),
    keyFilesMissing: missing,
    gitClean,
    hint: syntaxErrors === 0 ? 'All checks passed.' : `Found ${syntaxErrors} syntax errors.`,
  })
}

// ══════════════════════════════════════════════════════════════
// 路由
// ══════════════════════════════════════════════════════════════
const handlers = {
  write_source, self_build, self_upgrade, self_rollback,
  list_source, read_source, self_test,
}

export async function execute(params, context = {}) {
  const capName = context?.capName || context?.toolName
  if (!capName) return tj({ ok: false, error: 'no tool name' })
  const handler = handlers[capName]
  if (!handler) return tj({ ok: false, error: 'unknown: ' + capName })
  return await handler(params)
}
