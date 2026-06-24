/**
 * Gateway Enhancements — WebSocket实时通道 + 消息优先级队列
 * 借鉴 Hermes Agent Gateway 设计
 * 
 * 核心能力：
 *   1. WebSocket实时通道 — 双向实时通信
 *   2. 消息优先级队列 — 按优先级排序的消息队列
 *   3. 消息重试机制 — 失败自动重试
 *   4. 通道健康检查 — 定期检测通道连通性
 */

import { EventEmitter } from 'events'

// ─── 消息优先级 ───
const PRIORITY = {
  CRITICAL: 0,   // 系统告警、紧急通知
  HIGH: 1,       // 用户消息、任务结果
  NORMAL: 2,     // 常规消息
  LOW: 3,        // 心跳、状态更新
  BACKGROUND: 4  // 日志、统计
}

// ─── 优先级消息队列 ───
class PriorityMessageQueue {
  constructor({ maxSize = 1000, flushIntervalMs = 100 } = {}) {
    this._queues = {
      [PRIORITY.CRITICAL]: [],
      [PRIORITY.HIGH]: [],
      [PRIORITY.NORMAL]: [],
      [PRIORITY.LOW]: [],
      [PRIORITY.BACKGROUND]: []
    }
    this.maxSize = maxSize
    this._totalSize = 0
    this._flushTimer = null
    this._flushInterval = flushIntervalMs
    this._handlers = []
  }

  enqueue(message, priority = PRIORITY.NORMAL) {
    if (this._totalSize >= this.maxSize) {
      // 丢弃最低优先级的旧消息
      this._dropLowest()
    }
    const queue = this._queues[priority] || this._queues[PRIORITY.NORMAL]
    queue.push({ message, timestamp: Date.now(), retries: 0 })
    this._totalSize++
  }

  dequeue() {
    // 按优先级从高到低取消息
    for (const level of [PRIORITY.CRITICAL, PRIORITY.HIGH, PRIORITY.NORMAL, PRIORITY.LOW, PRIORITY.BACKGROUND]) {
      const queue = this._queues[level]
      if (queue.length > 0) {
        this._totalSize--
        return queue.shift()
      }
    }
    return null
  }

  onFlush(handler) {
    this._handlers.push(handler)
  }

  startFlushing() {
    if (this._flushTimer) return
    this._flushTimer = setInterval(() => {
      let item
      while ((item = this.dequeue()) !== null) {
        for (const handler of this._handlers) {
          try { handler(item.message, item) } catch (e) { /* ignore */ }
        }
      }
    }, this._flushInterval)
  }

  stopFlushing() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer)
      this._flushTimer = null
    }
  }

  getStats() {
    return {
      totalSize: this._totalSize,
      byPriority: {
        critical: this._queues[PRIORITY.CRITICAL].length,
        high: this._queues[PRIORITY.HIGH].length,
        normal: this._queues[PRIORITY.NORMAL].length,
        low: this._queues[PRIORITY.LOW].length,
        background: this._queues[PRIORITY.BACKGROUND].length
      }
    }
  }

  _dropLowest() {
    for (const level of [PRIORITY.BACKGROUND, PRIORITY.LOW, PRIORITY.NORMAL, PRIORITY.HIGH]) {
      const queue = this._queues[level]
      if (queue.length > 0) {
        queue.shift()
        this._totalSize--
        return
      }
    }
  }
}

// ─── WebSocket 通道连接器 ───
class WebSocketChannel {
  constructor({ name = 'websocket', url = null, reconnectMs = 5000, maxRetries = 10 } = {}) {
    this.name = name
    this.url = url
    this.reconnectMs = reconnectMs
    this.maxRetries = maxRetries
    this._ws = null
    this._retryCount = 0
    this._started = false
    this._messageHandler = null
    this._eventEmitter = new EventEmitter()
  }

  start({ pushMessage, emitEvent } = {}) {
    if (this._started) return null
    this._started = true
    this._pushMessage = pushMessage
    this._emitEvent = emitEvent

    if (this.url) {
      this._connect()
    }

    return {
      name: this.name,
      send: (msg) => this.send(msg),
      stop: () => this.stop(),
      isConnected: () => this._ws?.readyState === 1
    }
  }

  _connect() {
    if (!this.url) return
    try {
      // 使用Node.js内置WebSocket（Node 22+）或ws库
      const WebSocket = globalThis.WebSocket || (await import('ws').then(m => m.WebSocket))
      this._ws = new WebSocket(this.url)

      this._ws.onopen = () => {
        this._retryCount = 0
        this._emitEvent?.('channel_connected', { name: this.name, url: this.url })
      }

      this._ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (this._messageHandler) {
            this._messageHandler(data)
          }
          this._pushMessage?.(data)
        } catch (e) {
          this._pushMessage?.({ raw: event.data })
        }
      }

      this._ws.onclose = () => {
        this._emitEvent?.('channel_disconnected', { name: this.name })
        this._scheduleReconnect()
      }

      this._ws.onerror = (err) => {
        console.error(`[WebSocketChannel:${this.name}] Error:`, err.message)
      }
    } catch (e) {
      console.error(`[WebSocketChannel:${this.name}] Connection failed:`, e.message)
      this._scheduleReconnect()
    }
  }

  _scheduleReconnect() {
    if (!this._started) return
    if (this._retryCount >= this.maxRetries) {
      console.error(`[WebSocketChannel:${this.name}] Max retries reached`)
      return
    }
    this._retryCount++
    setTimeout(() => this._connect(), this.reconnectMs)
  }

  send(message) {
    if (this._ws?.readyState === 1) {
      this._ws.send(typeof message === 'string' ? message : JSON.stringify(message))
      return true
    }
    return false
  }

  onMessage(handler) {
    this._messageHandler = handler
  }

  stop() {
    this._started = false
    if (this._ws) {
      this._ws.close()
      this._ws = null
    }
  }

  isHealthy() {
    return this._ws?.readyState === 1
  }
}

// ─── 通道健康检查器 ───
class ChannelHealthChecker {
  constructor({ intervalMs = 30000 } = {}) {
    this.intervalMs = intervalMs
    this._channels = new Map()
    this._timer = null
  }

  registerChannel(name, channel) {
    this._channels.set(name, channel)
  }

  unregisterChannel(name) {
    this._channels.delete(name)
  }

  start() {
    if (this._timer) return
    this._timer = setInterval(() => this._check(), this.intervalMs)
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  }

  _check() {
    const status = {}
    for (const [name, channel] of this._channels) {
      status[name] = typeof channel.isHealthy === 'function' ? channel.isHealthy() : true
    }
    return status
  }

  getStatus() {
    return this._check()
  }
}

// ─── 消息重试管理器 ───
class MessageRetryManager {
  constructor({ maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 30000 } = {}) {
    this.maxRetries = maxRetries
    this.baseDelayMs = baseDelayMs
    this.maxDelayMs = maxDelayMs
    this._pending = new Map()
  }

  async sendWithRetry(sendFn, message, { priority = PRIORITY.NORMAL } = {}) {
    let lastError = null
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await sendFn(message)
        return { ok: true, result, attempts: attempt + 1 }
      } catch (e) {
        lastError = e
        if (attempt < this.maxRetries) {
          const delay = Math.min(this.baseDelayMs * Math.pow(2, attempt), this.maxDelayMs)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }
    return { ok: false, error: lastError?.message, attempts: this.maxRetries + 1 }
  }
}

export {
  PriorityMessageQueue,
  WebSocketChannel,
  ChannelHealthChecker,
  MessageRetryManager,
  PRIORITY
}
