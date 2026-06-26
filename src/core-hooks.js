// core-hooks.js — 核心钩子系统
// 在关键循环点注入扩展逻辑，无需改 index.js
// 钩子定义存储在用户数据目录 core-hooks.json

import fs from 'fs'
import path from 'path'

const hooks = {
  onStartup: [],
  onTick: [],
  onMessage: [],
  onBeforeLLM: [],
  onAfterLLM: [],
  onToolCall: [],
  onAfterToolCall: [],
  onShutdown: [],
}

let loaded = false

export function loadCoreHooks() {
  if (loaded) return
  loaded = true
  try {
    const userDir = process.env.BAILONGMA_USER_DIR || ''
    const hooksFile = path.join(userDir, 'core-hooks.json')
    if (fs.existsSync(hooksFile)) {
      const data = JSON.parse(fs.readFileSync(hooksFile, 'utf-8'))
      for (const key of Object.keys(hooks)) {
        if (Array.isArray(data[key])) hooks[key] = data[key]
      }
      const active = Object.entries(hooks).filter(function(e) { return e[1].length > 0 })
      if (active.length > 0) {
        console.log('[core-hooks] Loaded: ' + active.map(function(e) { return e[0] + ':' + e[1].length }).join(', '))
      }
    }
  } catch (e) {
    console.warn('[core-hooks] Load failed:', e.message)
  }
}

export function registerHook(hookPoint, fn) {
  if (!hooks[hookPoint]) { console.warn('[core-hooks] Unknown hook point:', hookPoint); return }
  hooks[hookPoint].push(fn)
}

export async function triggerHooks(hookPoint) {
  var args = Array.prototype.slice.call(arguments, 1)
  if (!hooks[hookPoint] || hooks[hookPoint].length === 0) return args[0]
  for (var i = 0; i < hooks[hookPoint].length; i++) {
    try {
      var hook = hooks[hookPoint][i]
      if (typeof hook === 'function') {
        var result = await hook.apply(null, args)
        if (result !== undefined) args[0] = result
      } else if (hook && hook.code) {
        var fn = new Function('args', 'state', hook.code)
        var result = await fn(args, args[1])
        if (result !== undefined) args[0] = result
      }
    } catch (e) {
      console.warn('[core-hooks] Error in ' + hookPoint + ':', e.message)
    }
  }
  return args[0]
}

export function getHookStatus() {
  var result = {}
  Object.keys(hooks).forEach(function(k) { result[k] = hooks[k].length })
  return result
}
