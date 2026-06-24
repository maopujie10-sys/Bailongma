// perception/watcher.js - 文件变化watchdog + 窗口切换检测
import fs from 'fs'
import path from 'path'
import { EventEmitter } from 'events'

export class FileWatcher extends EventEmitter {
  constructor(options = {}) {
    super()
    this.watchDirs = options.dirs || []
    this.interval = options.interval || 2000
    this.snapshots = new Map()
    this.timer = null
    this.running = false
  }
  _snapshot(dir) {
    if (!fs.existsSync(dir)) return new Map()
    const entries = fs.readdirSync(dir, { withFileTypes: true, recursive: true })
    const map = new Map()
    for (const e of entries) {
      if (e.isFile()) {
        const full = path.join(e.parentPath || dir, e.name)
        try { map.set(full, fs.statSync(full).mtimeMs) } catch {}
      }
    }
    return map
  }
  _diff(oldMap, newMap) {
    const changes = []
    for (const [file, mtime] of newMap) {
      if (!oldMap.has(file)) changes.push({ type: 'created', file, mtime })
      else if (oldMap.get(file) !== mtime) changes.push({ type: 'modified', file, mtime })
    }
    for (const [file] of oldMap) {
      if (!newMap.has(file)) changes.push({ type: 'deleted', file })
    }
    return changes
  }
  start() {
    if (this.running) return
    this.running = true
    for (const dir of this.watchDirs) {
      this.snapshots.set(dir, this._snapshot(dir))
    }
    this.timer = setInterval(() => {
      for (const dir of this.watchDirs) {
        const oldSnap = this.snapshots.get(dir) || new Map()
        const newSnap = this._snapshot(dir)
        const changes = this._diff(oldSnap, newSnap)
        this.snapshots.set(dir, newSnap)
        if (changes.length > 0) {
          this.emit('change', { dir, changes, timestamp: Date.now() })
        }
      }
    }, this.interval)
  }
  stop() {
    this.running = false
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }
  addDir(dir) {
    if (!this.watchDirs.includes(dir)) {
      this.watchDirs.push(dir)
      if (this.running) this.snapshots.set(dir, this._snapshot(dir))
    }
  }
}

export function getActiveWindow() {
  try {
    if (process.platform === 'win32') {
      const { execSync } = require('child_process')
      const psScript = 'Add-Type -Name WinAPI -Namespace System -MemberDefinition "[DilImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);"; $hwnd = [WinAPI]::GetForegroundWindow(); $sb = New-Object System.Text.StringBuilder(256); [WinAPL]::GetWindowText($hwnd, $sb, 256); $sb.ToString()'
      return execSync(`powershell -NoProfile -Command "${psScript}"`, { timeout: 3000, encoding: 'utf-8' }).trim()
    }
    return ''
  } catch {
    return ''
  }
}
