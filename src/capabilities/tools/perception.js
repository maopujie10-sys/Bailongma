import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PERCEPTION_DIR = path.resolve(__dirname, '../../perception')

function runPython(script, args = []) {
  return new Promise((resolve, reject) => {
    const python = spawn('python', [path.join(PERCEPTION_DIR, script), ...args], {
      cwd: PERCEPTION_DIR,
      timeout: 30000
    })
    let stdout = ''
    let stderr = ''
    python.stdout.on('data', d => stdout += d.toString())
    python.stderr.on('data', d => stderr += d.toString())
    python.on('close', code => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(stderr || stdout || exit ))
    })
    python.on('error', reject)
  })
}

export async function execScreenCapture(_args) {
  try {
    const result = await runPython('vision_perception.py', ['--screenshot'])
    return { ok: true, result: JSON.parse(result) }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export async function execVisualPerceive(_args) {
  try {
    const result = await runPython('vision_perception.py', ['--perceive'])
    return { ok: true, result: JSON.parse(result) }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export async function execEventPerceive(_args) {
  try {
    const result = await runPython('event_perception.py', ['--perceive-all'])
    return { ok: true, result: JSON.parse(result) }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export async function execGetActiveWindow(_args) {
  try {
    const result = await runPython('event_perception.py', ['--window'])
    return { ok: true, result: JSON.parse(result) }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export async function execGetClipboard(_args) {
  try {
    const result = await runPython('event_perception.py', ['--clipboard'])
    return { ok: true, result: JSON.parse(result) }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
