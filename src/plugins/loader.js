// plugins/loader.js — 插件加载器 + 生命周期管理 + 沙箱隔离
import fs from 'fs'
import path from 'path'
import { paths } from '../paths.js'

const PLUGINS_DIR = paths.srcPlugins || path.join(paths.src, 'plugins')

export class PluginLoader {
  constructor() {
    this.plugins = new Map()
  }

  listAvailable() {
    if (!fs.existsSync(PLUGINS_DIR)) return []
    return fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const pkgPath = path.join(PLUGINS_DIR, d.name, 'package.json')
        let meta = { name: d.name, version: '0.0.0' }
        if (fs.existsSync(pkgPath)) {
          try { meta = { ...meta, ...JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) } } catch {}
        }
        return meta
      })
  }

  async load(name) {
    if (this.plugins.has(name)) return this.plugins.get(name)
    const pluginDir = path.join(PLUGINS_DIR, name)
    const entryPath = path.join(pluginDir, 'index.js')
    if (!fs.existsSync(entryPath)) return null

    try {
      const mod = await import(ile://?t=)
      const plugin = {
        name,
        dir: pluginDir,
        instance: mod,
        state: 'loaded',
        loadedAt: Date.now()
      }
      if (typeof mod.activate === 'function') {
        await mod.activate()
        plugin.state = 'active'
      }
      this.plugins.set(name, plugin)
      return plugin
    } catch (e) {
      console.error([plugins] load  failed:, e.message)
      return { name, state: 'error', error: e.message }
    }
  }

  async unload(name) {
    const plugin = this.plugins.get(name)
    if (!plugin) return false
    try {
      if (typeof plugin.instance.deactivate === 'function') {
        await plugin.instance.deactivate()
      }
      this.plugins.delete(name)
      return true
    } catch (e) {
      console.error([plugins] unload  failed:, e.message)
      return false
    }
  }

  getLoaded() {
    return Array.from(this.plugins.values()).map(p => ({
      name: p.name,
      state: p.state,
      loadedAt: p.loadedAt
    }))
  }

  async loadAll() {
    const available = this.listAvailable()
    const results = []
    for (const p of available) {
      results.push(await this.load(p.name))
    }
    return results
  }
}

// 沙箱隔离：在受限上下文中执行插件代码
export function createSandbox(pluginName, allowedModules = []) {
  return {
    console: {
      log: (...args) => console.log([plugin:], ...args),
      error: (...args) => console.error([plugin:], ...args),
      warn: (...args) => console.warn([plugin:], ...args)
    },
    require: (mod) => {
      if (allowedModules.includes(mod) || mod.startsWith('node:')) return require(mod)
      throw new Error([plugins] module "" not allowed for plugin "")
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise
  }
}
