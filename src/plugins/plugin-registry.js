/**
 * Plugin Registry — 第三方插件生态
 * 
 * 设计：
 *   - 插件是独立的 JS 模块，放在 src/plugins/ 下
 *   - 每个插件 export { name, version, init(ctx), hooks }
 *   - hooks 可挂载到：onMessage, onTick, onMemorySave, onToolCall, onStartup
 *   - 插件通过 plugin-registry.js 注册和激活
 * 
 * 与爱马仕 Plugin 系统对齐：
 *   - 爱马仕有完整的 Plugin SDK（plugin-sdk.js）
 *   - 白龙马实现兼容子集，逐步吸收
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let _plugins = new Map()       // name → plugin module
let _activePlugins = new Set() // names of active plugins
let _hooks = {
  onStartup: [],
  onMessage: [],
  onTick: [],
  onMemorySave: [],
  onToolCall: [],
}

/**
 * 注册插件
 */
export function registerPlugin(plugin) {
  if (!plugin.name || !plugin.version) {
    throw new Error('Plugin must have name and version')
  }
  if (_plugins.has(plugin.name)) {
    console.warn(`[PluginRegistry] Plugin ${plugin.name} already registered, replacing`)
  }
  _plugins.set(plugin.name, plugin)
  
  // 注册 hooks
  if (plugin.hooks) {
    for (const [hookName, handler] of Object.entries(plugin.hooks)) {
      if (_hooks[hookName]) {
        _hooks[hookName].push({ plugin: plugin.name, handler })
      }
    }
  }
}

/**
 * 激活插件
 */
export async function activatePlugin(name, ctx = {}) {
  const plugin = _plugins.get(name)
  if (!plugin) throw new Error(`Plugin not found: ${name}`)
  
  if (plugin.init) {
    await plugin.init(ctx)
  }
  _activePlugins.add(name)
  console.log(`[PluginRegistry] Activated: ${name} v${plugin.version}`)
}

/**
 * 停用插件
 */
export function deactivatePlugin(name) {
  _activePlugins.delete(name)
}

/**
 * 从目录自动加载插件
 */
export async function loadPluginsFromDir(dirPath = null) {
  const pluginsDir = dirPath || path.join(__dirname)
  if (!fs.existsSync(pluginsDir)) return
  
  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const pluginPath = path.join(pluginsDir, entry.name, 'index.js')
      if (fs.existsSync(pluginPath)) {
        try {
          const plugin = await import(`file://${pluginPath}`)
          if (plugin.default) {
            registerPlugin(plugin.default)
          }
        } catch (e) {
          console.error(`[PluginRegistry] Failed to load ${entry.name}:`, e.message)
        }
      }
    }
  }
}

/**
 * 触发 hook
 */
export async function triggerHook(hookName, ...args) {
  const handlers = _hooks[hookName] || []
  const results = []
  for (const { plugin, handler } of handlers) {
    if (_activePlugins.has(plugin)) {
      try {
        const r = await handler(...args)
        results.push({ plugin, result: r })
      } catch (e) {
        console.error(`[PluginRegistry] Hook ${hookName} in ${plugin} failed:`, e.message)
      }
    }
  }
  return results
}

/**
 * 列出所有插件
 */
export function listPlugins() {
  return [..._plugins.entries()].map(([name, p]) => ({
    name,
    version: p.version,
    active: _activePlugins.has(name),
    description: p.description || '',
  }))
}

export { _hooks as hooks }
