/**
 * Gateway Registry — 统一消息通道注册中心
 *
 * 设计（借鉴 Hermes Agent gateway/）：
 *   - 每个通道实现 Channel 接口：{ name, start({ pushMessage, emitEvent }) → connector, stop() }
 *   - 支持注册任意数量的通道
 *   - 统一的消息入站/出站接口
 *
 * 用法：
 *   import { registerChannel, startAllChannels, stopAllChannels } from './gateway-registry.js'
 *   registerChannel('discord', discordConnector)
 *   await startAllChannels({ pushMessage, emitEvent })
 */

let _channels = new Map()
let _running = new Map()

/**
 * 注册一个消息通道
 * @param {string} name 通道名称
 * @param {object} channel { name, start({ pushMessage, emitEvent }) → connector, stop(connector) }
 */
export function registerChannel(name, channel) {
  if (!name || !channel || typeof channel.start !== 'function') {
    throw new Error(`Invalid channel: must have name and start() method`)
  }
  _channels.set(name, channel)
}

/**
 * 启动所有已注册通道
 * @param {object} deps { pushMessage, emitEvent }
 * @returns {Array} 启动成功的连接器列表
 */
export async function startAllChannels(deps = {}) {
  const connectors = []
  for (const [name, channel] of _channels) {
    try {
      const connector = await channel.start(deps)
      if (connector) {
        _running.set(name, connector)
        deps.emitEvent?.('social_status', { platform: name, status: 'started' })
        connectors.push(connector)
      }
    } catch (err) {
      console.error(`[gateway] ${name} channel failed to start: ${err.message}`)
      deps.emitEvent?.('social_status', { platform: name, status: 'start_error', error: err.message })
    }
  }
  return connectors
}

/**
 * 停止所有运行中的通道
 */
export async function stopAllChannels() {
  for (const [name, connector] of _running) {
    try {
      const channel = _channels.get(name)
      if (channel?.stop) await channel.stop(connector)
    } catch (err) {
      console.error(`[gateway] ${name} channel stop error: ${err.message}`)
    }
  }
  _running.clear()
}

/**
 * 重启单个通道
 * @param {string} name
 * @param {object} deps
 */
export async function restartChannel(name, deps = {}) {
  const existing = _running.get(name)
  if (existing) {
    try {
      const channel = _channels.get(name)
      if (channel?.stop) await channel.stop(existing)
    } catch (err) {
      console.error(`[gateway] ${name} stop error during restart: ${err.message}`)
    }
    _running.delete(name)
  }

  const channel = _channels.get(name)
  if (!channel) throw new Error(`Channel not found: ${name}`)

  const connector = await channel.start(deps)
  if (connector) {
    _running.set(name, connector)
    deps.emitEvent?.('social_status', { platform: name, status: 'restarted' })
  }
  return connector
}

/**
 * 列出所有已注册通道
 * @returns {string[]}
 */
export function listChannels() {
  return [..._channels.keys()]
}

/**
 * 列出运行中的通道
 * @returns {string[]}
 */
export function listRunningChannels() {
  return [..._running.keys()]
}
