/**
 * Memory Provider Registry — 多记忆后端编排
 *
 * 设计：
 *   - 每个 Provider 实现 MemoryProvider 接口：
 *     { name, search(query, limit) → Array, getByEntity(entityId, limit) → Array, getPersonMemory(entityId) → Object|null }
 *   - 默认 Provider = SQLiteMemoryProvider（包装 db.js 的现有逻辑）
 *   - 支持注册多个 Provider，injector 从 registry 获取活跃 Provider 列表
 *   - 多 Provider 结果合并去重
 *
 * 用法：
 *   import { getProviders, registerProvider, setActiveProviders } from './provider-registry.js'
 *   const providers = getProviders()
 *   const results = await Promise.all(providers.map(p => p.search(query, limit)))
 */

let _providers = new Map()
let _activeProviderNames = ['sqlite']

/**
 * 注册一个记忆 Provider
 * @param {string} name Provider 名称
 * @param {object} provider { name, search(query, limit) → Array, getByEntity(entityId, limit) → Array, getPersonMemory(entityId) → Object|null }
 */
export function registerMemoryProvider(name, provider) {
  if (!name || !provider || typeof provider.search !== 'function') {
    throw new Error(`Invalid memory provider: must have name and search() method`)
  }
  _providers.set(name, provider)
}

/**
 * 设置活跃 Provider 列表
 * @param {string[]} names
 */
export function setActiveMemoryProviders(names) {
  if (!Array.isArray(names) || names.length === 0) {
    throw new Error('At least one provider name is required')
  }
  for (const name of names) {
    if (!_providers.has(name)) {
      throw new Error(`Memory provider not found: ${name}. Registered: ${[..._providers.keys()].join(', ')}`)
    }
  }
  _activeProviderNames = [...names]
}

/**
 * 获取所有活跃 Provider
 * @returns {object[]}
 */
export function getActiveMemoryProviders() {
  return _activeProviderNames.map(name => _providers.get(name)).filter(Boolean)
}

/**
 * 列出所有已注册 Provider
 * @returns {string[]}
 */
export function listMemoryProviders() {
  return [..._providers.keys()]
}

/**
 * 获取活跃 Provider 名称列表
 * @returns {string[]}
 */
export function getActiveMemoryProviderNames() {
  return [..._activeProviderNames]
}
