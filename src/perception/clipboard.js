// perception/clipboard.js - 剪贄杳监听
import { execSync } from 'child_process'
import { EventEmitter } from 'events'

export class ClipboardWatcher extends EventEmitter {
  constructor(options = {}) {
    super()
    this.interval = options.interval || 1000
    this.lastText = ''
    this.timer = null
    this.running = false
  }
  _readClipboard() {
    try {
      if (process.platform === 'win32') {
        const psScript = 'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetText()'
        return execSync(`powershell -NoProfile -Command "${psScript}"`, { timeout: 3000, encoding: 'utf-8' }).trim()
      } else if (process.platform === 'darwin') {
        return execSync('pbpaste', { timeout: 3000, encoding: 'utf-8' }).trim()
      } else {
        return execSync('xclip -selection clipboard -o', { timeout: 3000, encoding: 'utf-8' }).trim()
      }
    } catch {
      return ''
    }
  }
  start() {
    if (this.running) return
    this.running = true
    this.lastText = this._readClipboard()
    this.timer = setInterval(() => {
      const current = this._readClipboard()
      if (current && current !== this.lastText) {
        const prev = this.lastText
        this.lastText = current
        this.emit('change', { text: current, previous: prev, timestamp: Date.now() })
      }
    }, this.interval)
  }
  stop() {
    this.running = false
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }
  getCurrent() {
    return this._readClipboard()
  }
}
