// perception/screen.js - 小幕截图捕莱
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

const CAPTURE_DIR = path.join(os.tmpdir(), 'bailongma-captures')

function ensureDir() {
  if (!fs.existsSync(CAPTURE_DIR)) fs.mkdirSync(CAPTURE_DIR, { recursive: true })
}

export async function captureScreen(options = {}) {
  ensureDir()
  const filename = options.filename || `screen-${Date.now()}.png`
  const filepath = path.join(CAPTURE_DIR, filename)
  try {
    if (process.platform === 'win32') {
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$bitmap = New-Object System.Drawing.Bitmap $screen.Bounds.Width, $screen.Bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($screen.Bounds.X, $screen.Bounds.Y, 0, 0, $bitmap.Size)
$bitmap.Save('${filepath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
`
      execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`, { timeout: 10000 })
    } else if (process.platform === 'darwin') {
      execSync(`screencapture -x "${filepath}"`, { timeout: 10000 })
    } else {
      execSync(`import -window root "${filepath}"`, { timeout: 10000 })
    }
    return { ok: true, path: filepath, size: fs.statSync(filepath).size }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export function getLatestCapture() {
  ensureDir()
  const files = fs.readdirSync(CAPTURE_DIR)
    .filter(f => f.endsWith('.png'))
    .map(f => ({ name: f, path: path.join(CAPTURE_DIR, f), mtime: fs.statSync(path.join(CAPTURE_DIR, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime)
  return files[0] || null
}
