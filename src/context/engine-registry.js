/**
 * Context Engine Registry — 可插拔上下文引擎注册中心
 *
 * 设计：
 *   - 每个引擎实现 { name, gather(params) → extraContext[] } 接口
 *   - 默认引擎 = DefaultContextEngine（即 gatherer.js 的现有逻辑）
 *   - 通过 registerEngine / setActiveEngine 切换引擎
 *   - runtime-injector.js 从 registry 获取当前活跃引擎
 *
 * 用法：
 *   import { getActiveEngine, registerEngine, setActiveEngine } from './engine-registry.js'
 *   const engine = getActiveEngine()
 *   const extraContext = await engine.gather({ task, taskKnowledge, memories, message, signal })
 */

let _engines = new Map()
let _activeEngineName = 'default'

/**
 * 注册一个上下文引擎
 * @param {string} name 引擎名称
 * @param {object} engine { name, gather(params) → Array }
 */
export function registerEngine(name, engine) {
  if (!name || !engine || typeof engine.gather !== 'function') {
    throw new Error(`Invalid engine: must have name and gather() method`)
  }
  _engines.set(name, engine)
}

/**
 * 设置当前活跃引擎
 * @param {string} name 引擎名称
 */
export function setActiveEngine(name) {
  if (!_engines.has(name)) {
    throw new Error(`Engine not found: ${name}. Registered: ${[..._engines.keys()].join(', ')}`)
  }
  _activeEngineName = name
}

/**
 * 获取当前活跃引擎
 * @returns {object} { name, gather(params) → Array }
 */
export function getActiveEngine() {
  const engine = _engines.get(_activeEngineName)
  if (!engine) {
    throw new Error(`Active engine "${_activeEngineName}" not found in registry`)
  }
  return engine
}

/**
 * 列出所有已注册引擎
 * @returns {string[]}
 */
export function listEngines() {
  return [..._engines.keys()]
}

/**
 * 获取活跃引擎名称
 * @returns {string}
 */
export function getActiveEngineName() {
  return _activeEngineName
}
