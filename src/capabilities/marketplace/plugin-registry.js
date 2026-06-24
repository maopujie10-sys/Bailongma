/**
 * Plugin Marketplace — 插件生态增强
 * 借鉴 Hermes Agent Plugin 系统设计
 * 
 * 核心能力：
 *   1. 插件发现 — 从注册中心/GitHub搜索插件
 *   2. 插件安装 — 下载、验证、安装到本地
 *   3. 插件卸载 — 安全卸载并清理
 *   4. 评分机制 — 用户评分 + 使用统计
 *   5. 依赖管理 — 插件间依赖解析
 */

import fs from 'fs'
import path from 'path'
import { paths } from '../../paths.js'

const PLUGINS_DIR = path.join(paths.sandboxDir, 'plugins')
const PLUGIN_MANIFEST = 'plugin.json'
const REGISTRY_URL = 'https://raw.githubusercontent.com/nousresearch/hermes-agent/main/plugins/registry.json'

// ─── 插件状态 ───
const PLUGIN_STATES = {
  INSTALLED: 'installed',
  ACTIVE: 'active',
  DISABLED: 'disabled',
  ERROR: 'error',
  UNINSTALLING: 'uninstalling'
}

// ─── 插件清单结构 ───
class PluginManifest {
  constructor({
    name, version, description, author, capabilities = [],
    dependencies = {}, permissions = {}, rating = 0, installCount = 0
  } = {}) {
    this.name = name
    this.version = version
    this.description = description || ''
    this.author = author || 'unknown'
    this.capabilities = capabilities
    this.dependencies = dependencies
    this.permissions = permissions
    this.rating = rating
    this.installCount = installCount
    this.installedAt = null
    this.state = PLUGIN_STATES.INSTALLED
  }

  static fromJSON(json) {
    return new PluginManifest(typeof json === 'string' ? JSON.parse(json) : json)
  }

  toJSON() {
    return {
      name: this.name, version: this.version, description: this.description,
      author: this.author, capabilities: this.capabilities,
      dependencies: this.dependencies, permissions: this.permissions,
      rating: this.rating, installCount: this.installCount,
      installedAt: this.installedAt, state: this.state
    }
  }
}

// ─── 插件注册中心 ───
class PluginRegistry {
  constructor() {
    this._plugins = new Map()  // name → PluginManifest
    this._ensureDir()
    this._loadInstalled()
  }

  _ensureDir() {
    if (!fs.existsSync(PLUGINS_DIR)) {
      fs.mkdirSync(PLUGINS_DIR, { recursive: true })
    }
  }

  _loadInstalled() {
    if (!fs.existsSync(PLUGINS_DIR)) return
    const entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const manifestPath = path.join(PLUGINS_DIR, entry.name, PLUGIN_MANIFEST)
      if (fs.existsSync(manifestPath)) {
        try {
          const raw = fs.readFileSync(manifestPath, 'utf-8')
          const manifest = PluginManifest.fromJSON(raw)
          this._plugins.set(manifest.name, manifest)
        } catch (e) {
          console.error(`[PluginRegistry] Failed to load ${entry.name}: ${e.message}`)
        }
      }
    }
  }

  // ─── 发现远程插件 ───
  async discoverRemote({ registryUrl = REGISTRY_URL, query = null } = {}) {
    try {
      const resp = await fetch(registryUrl)
      if (!resp.ok) throw new Error(`Registry returned ${resp.status}`)
      const data = await resp.json()
      let plugins = (data.plugins || []).map(p => PluginManifest.fromJSON(p))
      if (query) {
        const q = query.toLowerCase()
        plugins = plugins.filter(p =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.capabilities.some(c => c.toLowerCase().includes(q))
        )
      }
      return { ok: true, plugins: plugins.map(p => p.toJSON()) }
    } catch (e) {
      return { ok: false, error: `Failed to discover plugins: ${e.message}` }
    }
  }

  // ─── 安装插件 ───
  async install(pluginName, { source = 'registry', url = null, version = 'latest' } = {}) {
    if (this._plugins.has(pluginName)) {
      const existing = this._plugins.get(pluginName)
      if (existing.state === PLUGIN_STATES.ACTIVE) {
        return { ok: false, error: `Plugin ${pluginName} is already installed and active (v${existing.version})` }
      }
    }

    const pluginDir = path.join(PLUGINS_DIR, pluginName)
    
    try {
      // 从注册中心获取插件信息
      let manifest
      if (source === 'registry') {
        const result = await this.discoverRemote({ query: pluginName })
        if (!result.ok || !result.plugins.length) {
          return { ok: false, error: `Plugin ${pluginName} not found in registry` }
        }
        manifest = PluginManifest.fromJSON(result.plugins[0])
      } else if (url) {
        // 从URL安装
        const resp = await fetch(url)
        if (!resp.ok) throw new Error(`Download failed: ${resp.status}`)
        manifest = PluginManifest.fromJSON(await resp.json())
      } else {
        return { ok: false, error: 'Either source="registry" or url is required' }
      }

      // 检查依赖
      const missingDeps = []
      for (const [depName, depVersion] of Object.entries(manifest.dependencies || {})) {
        if (!this._plugins.has(depName)) {
          missingDeps.push(`${depName}@${depVersion}`)
        }
      }
      if (missingDeps.length > 0) {
        return { ok: false, error: `Missing dependencies: ${missingDeps.join(', ')}`, missingDeps }
      }

      // 写入插件目录
      fs.mkdirSync(pluginDir, { recursive: true })
      manifest.installedAt = new Date().toISOString()
      manifest.state = PLUGIN_STATES.ACTIVE
      manifest.installCount = (manifest.installCount || 0) + 1
      
      fs.writeFileSync(
        path.join(pluginDir, PLUGIN_MANIFEST),
        JSON.stringify(manifest.toJSON(), null, 2),
        'utf-8'
      )

      this._plugins.set(pluginName, manifest)
      return { ok: true, plugin: manifest.toJSON() }
    } catch (e) {
      return { ok: false, error: `Failed to install ${pluginName}: ${e.message}` }
    }
  }

  // ─── 卸载插件 ───
  async uninstall(pluginName) {
    if (!this._plugins.has(pluginName)) {
      return { ok: false, error: `Plugin ${pluginName} is not installed` }
    }

    // 检查是否有其他插件依赖此插件
    const dependents = []
    for (const [name, plugin] of this._plugins) {
      if (name === pluginName) continue
      if (plugin.dependencies && pluginName in plugin.dependencies) {
        dependents.push(name)
      }
    }
    if (dependents.length > 0) {
      return { ok: false, error: `Cannot uninstall: ${dependents.join(', ')} depend on ${pluginName}` }
    }

    const pluginDir = path.join(PLUGINS_DIR, pluginName)
    try {
      fs.rmSync(pluginDir, { recursive: true, force: true })
      this._plugins.delete(pluginName)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: `Failed to uninstall ${pluginName}: ${e.message}` }
    }
  }

  // ─── 启用/禁用插件 ───
  setState(pluginName, state) {
    if (!this._plugins.has(pluginName)) {
      return { ok: false, error: `Plugin ${pluginName} not found` }
    }
    const plugin = this._plugins.get(pluginName)
    plugin.state = state
    const manifestPath = path.join(PLUGINS_DIR, pluginName, PLUGIN_MANIFEST)
    fs.writeFileSync(manifestPath, JSON.stringify(plugin.toJSON(), null, 2), 'utf-8')
    return { ok: true, plugin: plugin.toJSON() }
  }

  enable(pluginName) {
    return this.setState(pluginName, PLUGIN_STATES.ACTIVE)
  }

  disable(pluginName) {
    return this.setState(pluginName, PLUGIN_STATES.DISABLED)
  }

  // ─── 评分 ───
  rate(pluginName, rating) {
    if (!this._plugins.has(pluginName)) {
      return { ok: false, error: `Plugin ${pluginName} not found` }
    }
    if (rating < 1 || rating > 5) {
      return { ok: false, error: 'Rating must be between 1 and 5' }
    }
    const plugin = this._plugins.get(pluginName)
    // 简单平均（生产环境应记录每次评分）
    plugin.rating = Math.round(((plugin.rating || 0) + rating) / 2 * 10) / 10
    const manifestPath = path.join(PLUGINS_DIR, pluginName, PLUGIN_MANIFEST)
    fs.writeFileSync(manifestPath, JSON.stringify(plugin.toJSON(), null, 2), 'utf-8')
    return { ok: true, rating: plugin.rating }
  }

  // ─── 列出已安装插件 ───
  listInstalled({ state = null } = {}) {
    const plugins = []
    for (const [name, plugin] of this._plugins) {
      if (state && plugin.state !== state) continue
      plugins.push(plugin.toJSON())
    }
    return { ok: true, plugins, count: plugins.length }
  }

  // ─── 获取插件详情 ───
  getPlugin(pluginName) {
    if (!this._plugins.has(pluginName)) {
      return { ok: false, error: `Plugin ${pluginName} not found` }
    }
    return { ok: true, plugin: this._plugins.get(pluginName).toJSON() }
  }

  // ─── 检查更新 ───
  async checkUpdates() {
    const updates = []
    try {
      const result = await this.discoverRemote()
      if (!result.ok) return { ok: false, error: result.error }
      
      for (const remote of result.plugins) {
        const local = this._plugins.get(remote.name)
        if (local && remote.version !== local.version) {
          updates.push({
            name: remote.name,
            currentVersion: local.version,
            latestVersion: remote.version
          })
        }
      }
      return { ok: true, updates }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }
}

// ─── 单例 ───
let _instance = null
export function getPluginRegistry() {
  if (!_instance) _instance = new PluginRegistry()
  return _instance
}

export { PluginRegistry, PluginManifest, PLUGIN_STATES }
