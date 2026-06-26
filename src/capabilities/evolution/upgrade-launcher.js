// upgrade-launcher.js — 原子升级启动器
// 由 self_upgrade 在退出前以 detached 模式启动
// 负责：等旧进程退出 → 原子替换文件 → 启动新版 → 健康检查 → 失败自动回滚

import fs from 'fs'
import path from 'path'
import { execSync, spawn } from 'child_process'

const STATE_FILE = process.env.BAILONGMA_UPGRADE_STATE
const SOURCE_DIR = process.env.BAILONGMA_UPGRADE_SRC
const TARGET_DIR = process.env.BAILONGMA_UPGRADE_DEST
const SNAPSHOT_DIR = process.env.BAILONGMA_UPGRADE_SNAPSHOT
const EXE_NAME = 'Bailongma.exe'
const HEALTH_TIMEOUT_MS = 30000
const HEALTH_CHECK_INTERVAL_MS = 2000
const EXIT_WAIT_MS = 10000

function log(msg) {
  const ts = new Date().toISOString()
  const line = `[upgrade-launcher ${ts}] ${msg}`
  console.log(line)
  try { fs.appendFileSync(STATE_FILE + '.log', line + '\n') } catch {}
}

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

function isProcessRunning(pid) {
  try { process.kill(pid, 0); return true } catch { return false }
}

// 递归复制目录（跳过锁定的文件）
function copyDir(src, dest, skipLocked = true) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const e of entries) {
    const s = path.join(src, e.name)
    const d = path.join(dest, e.name)
    if (e.isDirectory()) {
      copyDir(s, d, skipLocked)
    } else {
      try { fs.copyFileSync(s, d) } catch (err) {
        if (skipLocked) log('skip locked: ' + e.name)
        else throw err
      }
    }
  }
}

// 递归删除目录
function removeDir(dir) {
  if (!fs.existsSync(dir)) return
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) removeDir(p)
    else { try { fs.unlinkSync(p) } catch {} }
  }
  try { fs.rmdirSync(dir) } catch {}
}

// 用 rename 做原子替换（同分区内 rename 是原子的）
function atomicReplaceDir(newDir, targetDir, backupDir) {
  // 1. 备份当前 → backupDir（如果存在）
  if (fs.existsSync(targetDir)) {
    if (fs.existsSync(backupDir)) removeDir(backupDir)
    try {
      fs.renameSync(targetDir, backupDir)
      log('backup: ' + targetDir + ' → ' + backupDir)
    } catch (e) {
      log('backup via copy: ' + e.message)
      copyDir(targetDir, backupDir, true)
      removeDir(targetDir)
    }
  }

  // 2. 新版本 → targetDir
  try {
    fs.renameSync(newDir, targetDir)
    log('atomic swap: ' + newDir + ' → ' + targetDir)
  } catch (e) {
    log('swap via copy: ' + e.message)
    copyDir(newDir, targetDir, false)
    removeDir(newDir)
  }
}

async function main() {
  if (!SOURCE_DIR || !TARGET_DIR || !SNAPSHOT_DIR) {
    log('ERROR: missing env vars')
    process.exit(1)
  }

  const parentPid = process.env.BAILONGMA_UPGRADE_PARENT_PID
    ? parseInt(process.env.BAILONGMA_UPGRADE_PARENT_PID, 10) : null

  log('start: src=' + SOURCE_DIR + ' dest=' + TARGET_DIR + ' snapshot=' + SNAPSHOT_DIR)

  // 1. 等待旧进程退出
  if (parentPid) {
    log('waiting for old process ' + parentPid + ' to exit...')
    const startWait = Date.now()
    while (isProcessRunning(parentPid) && Date.now() - startWait < EXIT_WAIT_MS) {
      await wait(1000)
    }
    if (isProcessRunning(parentPid)) {
      log('old process still running after timeout, forcing kill')
      try { process.kill(parentPid, 'SIGKILL') } catch {}
      await wait(2000)
    }
    log('old process exited')
  }

  // 2. 创建新版本临时目录
  const stagingDir = TARGET_DIR + '.staging.' + Date.now()
  copyDir(SOURCE_DIR, stagingDir, false)

  // 3. 原子替换
  const oldBackupDir = TARGET_DIR + '.old.' + Date.now()
  const exePath = path.join(stagingDir, EXE_NAME)

  if (!fs.existsSync(exePath)) {
    log('ERROR: ' + exePath + ' not found')
    process.exit(1)
  }

  log('atomic replace: ' + stagingDir + ' → ' + TARGET_DIR)
  atomicReplaceDir(stagingDir, TARGET_DIR, oldBackupDir)

  // 4. 启动新版本
  log('starting new version: ' + path.join(TARGET_DIR, EXE_NAME))
  const child = spawn(path.join(TARGET_DIR, EXE_NAME), [], {
    detached: true,
    stdio: 'ignore',
    cwd: TARGET_DIR,
  })
  child.unref()

  const newPid = child.pid
  log('new process PID: ' + newPid)

  // 5. 健康检查
  log('health check: monitoring for ' + HEALTH_TIMEOUT_MS / 1000 + 's')
  const healthStart = Date.now()
  let healthy = false

  while (Date.now() - healthStart < HEALTH_TIMEOUT_MS) {
    await wait(HEALTH_CHECK_INTERVAL_MS)
    if (!isProcessRunning(newPid)) {
      log('new process died!')
      break
    }
    // 尝试 HTTP 健康检查
    try {
      const http = await import('http')
      await new Promise((resolve, reject) => {
        const req = http.get('http://127.0.0.1:3721/status', (res) => {
          if (res.statusCode === 200) { healthy = true; resolve() }
          else reject(new Error('status ' + res.statusCode))
        })
        req.on('error', reject)
        req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')) })
      })
      if (healthy) break
    } catch {}
  }

  // 6. 结果处理
  if (healthy) {
    log('SUCCESS: new version healthy')
    // 清理旧备份
    try { removeDir(oldBackupDir) } catch {}
    try { if (SNAPSHOT_DIR && fs.existsSync(SNAPSHOT_DIR)) removeDir(SNAPSHOT_DIR) } catch {}
    try { fs.unlinkSync(STATE_FILE) } catch {}
    log('cleanup complete')
  } else {
    log('FAIL: new version not healthy, rolling back')

    // 杀新进程
    try { process.kill(newPid, 'SIGKILL') } catch {}
    await wait(2000)

    // 恢复备份
    if (fs.existsSync(oldBackupDir)) {
      removeDir(TARGET_DIR)
      try { fs.renameSync(oldBackupDir, TARGET_DIR) }
      catch { copyDir(oldBackupDir, TARGET_DIR, true); removeDir(oldBackupDir) }
      log('rollback: restored old version')
    }

    // 恢复快照
    if (SNAPSHOT_DIR && fs.existsSync(SNAPSHOT_DIR)) {
      removeDir(TARGET_DIR)
      copyDir(SNAPSHOT_DIR, TARGET_DIR, true)
      log('rollback: restored snapshot')
    }

    // 启动旧版本
    const oldExe = path.join(TARGET_DIR, EXE_NAME)
    if (fs.existsSync(oldExe)) {
      spawn(oldExe, [], { detached: true, stdio: 'ignore', cwd: TARGET_DIR }).unref()
      log('restarted old version')
    }

    try { fs.writeFileSync(STATE_FILE + '.failed', new Date().toISOString()) } catch {}
    process.exit(1)
  }
}

main().catch(err => {
  log('FATAL: ' + err.message)
  process.exit(1)
})
