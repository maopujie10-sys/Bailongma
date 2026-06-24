/**
 * ACP — Agent Communication Protocol
 * 借鉴 Hermes Agent ACP 协议设计
 * 
 * 核心能力：
 *   1. Agent发现 — 广播/单播发现网络中的Agent节点
 *   2. 消息路由 — 基于能力匹配的消息路由
 *   3. 能力协商 — Agent间交换capability清单
 *   4. 心跳维持 — 定期心跳检测Agent存活
 * 
 * 协议消息格式（JSON）：
 *   { type, from, to, id, payload, timestamp }
 * 
 * 消息类型：
 *   discover / announce / capability_request / capability_response
 *   task_delegate / task_result / heartbeat / heartbeat_ack
 */

import { EventEmitter } from 'events'
import crypto from 'crypto'

// ─── 协议常量 ───
const PROTOCOL_VERSION = '1.0.0'
const DEFAULT_HEARTBEAT_MS = 30000
const AGENT_TTL_MS = 90000  // 超过此时间未心跳视为离线

// ─── Agent 节点 ───
class AgentNode {
  constructor({ id, name, capabilities = [], endpoint = null, metadata = {} } = {}) {
    this.id = id || crypto.randomUUID()
    this.name = name || this.id
    this.capabilities = capabilities
    this.endpoint = endpoint
    this.metadata = metadata
    this.lastHeartbeat = Date.now()
    this.status = 'online'
  }

  isAlive() {
    return Date.now() - this.lastHeartbeat < AGENT_TTL_MS
  }

  hasCapability(cap) {
    return this.capabilities.some(c => 
      c === cap || (typeof c === 'string' && c.toLowerCase().includes(cap.toLowerCase()))
    )
  }
}

// ─── ACP 消息 ───
class ACPMessage {
  constructor({ type, from, to = null, payload = {}, id = null } = {}) {
    this.id = id || crypto.randomUUID()
    this.type = type
    this.from = from
    this.to = to
    this.payload = payload
    this.timestamp = Date.now()
    this.version = PROTOCOL_VERSION
  }

  static fromJSON(json) {
    const obj = typeof json === 'string' ? JSON.parse(json) : json
    return new ACPMessage(obj)
  }

  toJSON() {
    return {
      id: this.id, type: this.type, from: this.from, to: this.to,
      payload: this.payload, timestamp: this.timestamp, version: this.version
    }
  }
}

// ─── ACP 路由器 ───
class ACPRouter extends EventEmitter {
  constructor({ agentId = 'bailongma', agentName = 'Bailongma', capabilities = [] } = {}) {
    super()
    this.agentId = agentId
    this.agentName = agentName
    this.capabilities = capabilities
    this.nodes = new Map()       // agentId → AgentNode
    this.pendingRequests = new Map() // requestId → { resolve, reject, timer }
    this.transports = []         // 传输层列表
    this._heartbeatTimer = null
    this._started = false
  }

  // ─── 传输层注册 ───
  registerTransport(transport) {
    if (typeof transport.send !== 'function' || typeof transport.onMessage !== 'function') {
      throw new Error('Transport must implement send() and onMessage()')
    }
    this.transports.push(transport)
    transport.onMessage((raw) => this._handleIncoming(raw))
  }

  // ─── 启动/停止 ───
  start() {
    if (this._started) return
    this._started = true
    this._heartbeatTimer = setInterval(() => this._sendHeartbeat(), DEFAULT_HEARTBEAT_MS)
    this._broadcastDiscovery()
    this.emit('started', { agentId: this.agentId })
  }

  stop() {
    this._started = false
    if (this._heartbeatTimer) { clearInterval(this._heartbeatTimer); this._heartbeatTimer = null }
    this.emit('stopped')
  }

  // ─── Agent 发现 ───
  _broadcastDiscovery() {
    const msg = new ACPMessage({
      type: 'discover',
      from: this.agentId,
      payload: { name: this.agentName, capabilities: this.capabilities }
    })
    this._broadcast(msg)
  }

  discover() {
    this._broadcastDiscovery()
    return this.getOnlineAgents()
  }

  // ─── 能力协商 ───
  async requestCapabilities(targetAgentId, timeoutMs = 10000) {
    const msg = new ACPMessage({
      type: 'capability_request',
      from: this.agentId,
      to: targetAgentId
    })
    return this._requestResponse(msg, timeoutMs)
  }

  // ─── 任务委托 ───
  async delegateTask(targetAgentId, task, timeoutMs = 60000) {
    const msg = new ACPMessage({
      type: 'task_delegate',
      from: this.agentId,
      to: targetAgentId,
      payload: { task }
    })
    return this._requestResponse(msg, timeoutMs)
  }

  // ─── 查找具备某能力的Agent ───
  findAgentsByCapability(capability) {
    const results = []
    for (const [id, node] of this.nodes) {
      if (node.isAlive() && node.hasCapability(capability)) {
        results.push({ id, name: node.name, capabilities: node.capabilities, status: node.status })
      }
    }
    return results
  }

  // ─── 获取在线Agent ───
  getOnlineAgents() {
    const results = []
    for (const [id, node] of this.nodes) {
      if (node.isAlive()) {
        results.push({ id, name: node.name, capabilities: node.capabilities, status: node.status, lastHeartbeat: node.lastHeartbeat })
      }
    }
    return results
  }

  // ─── 内部方法 ───
  _broadcast(msg) {
    for (const transport of this.transports) {
      try { transport.send(msg.toJSON()) } catch (e) { /* ignore */ }
    }
  }

  _sendTo(targetAgentId, msg) {
    for (const transport of this.transports) {
      try { transport.send(msg.toJSON(), targetAgentId) } catch (e) { /* ignore */ }
    }
  }

  _handleIncoming(raw) {
    let msg
    try { msg = ACPMessage.fromJSON(raw) } catch (e) { return }

    // 更新或注册节点
    if (msg.from && msg.from !== this.agentId) {
      let node = this.nodes.get(msg.from)
      if (!node) {
        node = new AgentNode({ id: msg.from, name: msg.payload?.name || msg.from })
        this.nodes.set(msg.from, node)
        this.emit('agent_discovered', { id: msg.from, name: node.name })
      }
      node.lastHeartbeat = Date.now()
      if (msg.payload?.capabilities) {
        node.capabilities = msg.payload.capabilities
      }
    }

    // 处理请求-响应匹配
    if (msg.type.endsWith('_response') && this.pendingRequests.has(msg.payload?.requestId)) {
      const { resolve, timer } = this.pendingRequests.get(msg.payload.requestId)
      clearTimeout(timer)
      this.pendingRequests.delete(msg.payload.requestId)
      resolve(msg.payload)
      return
    }

    // 路由消息
    switch (msg.type) {
      case 'discover':
        this._handleDiscover(msg)
        break
      case 'announce':
        this._handleAnnounce(msg)
        break
      case 'capability_request':
        this._handleCapabilityRequest(msg)
        break
      case 'task_delegate':
        this._handleTaskDelegate(msg)
        break
      case 'heartbeat':
        this._handleHeartbeat(msg)
        break
      default:
        this.emit('message', msg)
    }
  }

  _handleDiscover(msg) {
    // 收到发现请求，回复announce
    const reply = new ACPMessage({
      type: 'announce',
      from: this.agentId,
      to: msg.from,
      payload: { name: this.agentName, capabilities: this.capabilities }
    })
    this._sendTo(msg.from, reply)
  }

  _handleAnnounce(msg) {
    let node = this.nodes.get(msg.from)
    if (!node) {
      node = new AgentNode({ id: msg.from })
      this.nodes.set(msg.from, node)
    }
    node.name = msg.payload?.name || node.name
    node.capabilities = msg.payload?.capabilities || node.capabilities
    node.lastHeartbeat = Date.now()
    node.status = 'online'
    this.emit('agent_announced', { id: msg.from, name: node.name, capabilities: node.capabilities })
  }

  _handleCapabilityRequest(msg) {
    const reply = new ACPMessage({
      type: 'capability_response',
      from: this.agentId,
      to: msg.from,
      payload: {
        requestId: msg.id,
        capabilities: this.capabilities,
        agentName: this.agentName
      }
    })
    this._sendTo(msg.from, reply)
  }

  _handleTaskDelegate(msg) {
    this.emit('task_received', {
      from: msg.from,
      task: msg.payload?.task,
      replyTo: (result) => {
        const reply = new ACPMessage({
          type: 'task_result',
          from: this.agentId,
          to: msg.from,
          payload: { requestId: msg.id, result }
        })
        this._sendTo(msg.from, reply)
      }
    })
  }

  _handleHeartbeat(msg) {
    const ack = new ACPMessage({
      type: 'heartbeat_ack',
      from: this.agentId,
      to: msg.from,
      payload: { timestamp: Date.now() }
    })
    this._sendTo(msg.from, ack)
  }

  _sendHeartbeat() {
    const msg = new ACPMessage({
      type: 'heartbeat',
      from: this.agentId,
      payload: { timestamp: Date.now() }
    })
    this._broadcast(msg)
  }

  _requestResponse(msg, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(msg.id)
        reject(new Error(`ACP request ${msg.type} to ${msg.to} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      this.pendingRequests.set(msg.id, { resolve, reject, timer })
      if (msg.to) {
        this._sendTo(msg.to, msg)
      } else {
        this._broadcast(msg)
      }
    })
  }
}

// ─── 内存传输层（本地Agent间通信） ───
class MemoryTransport {
  constructor() {
    this._listeners = []
  }

  onMessage(handler) {
    this._listeners.push(handler)
  }

  send(message, targetId = null) {
    // 内存传输层：直接触发本地监听器
    // 实际部署时可替换为WebSocket/HTTP等
    for (const listener of this._listeners) {
      try { listener(message) } catch (e) { /* ignore */ }
    }
  }
}

// ─── 导出 ───
export { 
  ACPRouter, 
  ACPMessage, 
  AgentNode, 
  MemoryTransport,
  PROTOCOL_VERSION 
}
