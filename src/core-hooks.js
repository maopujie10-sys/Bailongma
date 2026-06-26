// core-hooks.js v2 — sandboxed VM hooks
import fs from 'fs'
import path from 'path'
import vm from 'vm'

const HOOK_POINTS = ['onStartup','onTick','onMessage','onBeforeLLM','onAfterLLM','onToolCall','onAfterToolCall','onShutdown']
let hooks = {}
for (const p of HOOK_POINTS) hooks[p] = []
let loaded = false

function loadFromFile() {
  try {
    const userDir = process.env.BAILONGMA_USER_DIR || ''
    if (!userDir) return
    const hf = path.join(userDir, 'core-hooks.json')
    if (!fs.existsSync(hf)) {
      try { fs.writeFileSync(hf, JSON.stringify(hooks, null, 2)) } catch {}
      return
    }
    const data = JSON.parse(fs.readFileSync(hf, 'utf-8'))
    for (const k of HOOK_POINTS) {
      if (Array.isArray(data[k])) hooks[k] = data[k].filter(h => typeof h === 'string' || typeof h === 'function' || (h && h.code))
    }
    const active = Object.entries(hooks).filter(([,v]) => v.length > 0)
    if (active.length > 0) console.log('[core-hooks] ' + active.map(([k,v]) => k + ':' + v.length).join(' '))
  } catch (e) { console.warn('[core-hooks] load:', e.message) }
}

export function loadCoreHooks() { if (!loaded) { loaded = true; loadFromFile() } }
export function registerHook(hookPoint, fn) { if (HOOK_POINTS.includes(hookPoint)) hooks[hookPoint].push(fn) }

function runOne(hook, args) {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve({ err: 'timeout' }), 5000)
    try {
      const code = typeof hook === 'string' ? hook : (hook && hook.code ? hook.code : null)
      if (!code) { clearTimeout(t); resolve({ err: 'invalid hook' }); return }
      const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} }, require: undefined, process: undefined, setTimeout: undefined, setInterval: undefined })
      try {
        const fn = new vm.Script('(' + code + ')').runInContext(ctx)
        Promise.resolve(fn(args[0], args[1]))
          .then(r => { clearTimeout(t); resolve({ result: r }) })
          .catch(e => { clearTimeout(t); resolve({ err: e.message }) })
      } catch (e) { clearTimeout(t); resolve({ err: e.message }) }
    } catch (e) { clearTimeout(t); resolve({ err: e.message }) }
  })
}

export async function triggerHooks(hookPoint, ...args) {
  if (!hooks[hookPoint] || hooks[hookPoint].length === 0) return args[0]
  for (const hook of hooks[hookPoint]) {
    const { result, err } = await runOne(hook, args)
    if (err) console.warn('[core-hooks] ' + hookPoint + ':', err)
    else if (result !== undefined) args[0] = result
  }
  return args[0]
}

export function getHookStatus() {
  const r = {}
  for (const k of HOOK_POINTS) r[k] = hooks[k].length
  return r
}
