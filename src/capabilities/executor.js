// capabilities/executor.js
import { loadAllSchemas, findCapability } from './registry.js'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { EventEmitter } from 'events'
import { paths } from '../paths.js'
import { emitEvent } from '../events.js'
import { evaluateToolPolicy, addToWhitelist } from './tool-policy.js'

const CAPABILITIES_DIR = paths.srcCapabilities || path.join(paths.src, 'capabilities')

// ── 审批事件总线 ──────────────────────────────────────────────────────
// executor.js 和 api.js 通过这个 EventEmitter 通信审批结果。
// executor.js 在 executeCapability 中创建 Promise 等待审批，
// api.js 的 POST /approval-response 触发 approvalEmitter.emit() 来 resolve。
export const approvalEmitter = new EventEmitter()

// maxListeners 上限设为 0（无限制），避免并发审批时触发 Node 警告
approvalEmitter.setMaxListeners(0)

const APPROVAL_TIMEOUT_MS = 30_000

export async function executeCapability(capName, params = {}, context = {}) {
  // ── 工具策略检查 ──────────────────────────────────────────────────
  try {
    const policy = evaluateToolPolicy(capName, params, context)

    console.log(`[executor] 工具策略检查: ${capName} → status=${policy.status}, risk=${policy.risk}`)

    // blocked → 拒绝执行
    if (policy.status === 'blocked') {
      console.log(`[executor] 工具 "${capName}" 被阻止: ${policy.reason}`)
      return JSON.stringify({
        ok: false,
        tool: capName,
        blocked: true,
        reason: policy.reason,
      })
    }

    // approval_required → 进入审批流程
    if (policy.status === 'approval_required') {
      const approvalId = crypto.randomUUID()
      const description = `${policy.reason}（风险等级: ${policy.risk}）`

      console.log(`[executor] 工具 "${capName}" 需要审批 (${approvalId})`)

      // 通过 SSE 通知前端显示审批弹窗
      emitEvent('tool_approval_required', {
        approvalId,
        toolName: capName,
        args: params,
        risk: policy.risk,
        description,
      })

      // 等待审批结果（最多 30 秒）
      const approvalResult = await new Promise((resolve) => {
        const timer = setTimeout(() => {
          console.log(`[executor] 审批超时: ${capName} (${approvalId})`)
          approvalEmitter.removeAllListeners(approvalId)
          resolve({ action: 'timeout' })
        }, APPROVAL_TIMEOUT_MS)

        approvalEmitter.once(approvalId, (result) => {
          clearTimeout(timer)
          console.log(`[executor] 收到审批结果: ${capName} → ${result.action}`)
          resolve(result)
        })
      })

      // 超时 → 自动拒绝
      if (approvalResult.action === 'timeout') {
        return JSON.stringify({
          ok: false,
          tool: capName,
          approval_timeout: true,
          error: '审批超时，已自动拒绝',
        })
      }

      // 拒绝 → 返回拒绝信息
      if (approvalResult.action === 'deny') {
        return JSON.stringify({
          ok: false,
          tool: capName,
          denied: true,
          error: '用户拒绝了此操作',
        })
      }

      // 始终允许 → 加入白名单
      if (approvalResult.action === 'always_allow') {
        addToWhitelist(capName)
      }

      // allow / always_allow → 继续执行
      console.log(`[executor] 审批通过: ${capName}`)
    }
    // allowed → 直接继续执行
  } catch (policyErr) {
    // 策略检查异常不应阻断核心流程
    console.warn(`[executor] 工具策略检查异常: ${capName}`, policyErr.message)
  }

  // ── 原有执行逻辑 ──────────────────────────────────────────────────
  const cap = findCapability(capName)
  if (!cap) return { ok: false, error: `capability not found: ${capName}` }
  const execPath = path.join(CAPABILITIES_DIR, capName, 'executor.js')
  if (!fs.existsSync(execPath)) return { ok: false, error: `executor not found for ${capName}` }
  try {
    const mod = await import(`file://${execPath}?t=${Date.now()}`)
    if (typeof mod.execute !== 'function') return { ok: false, error: `no execute function for ${capName}` }
    return await mod.execute(params)
  } catch (e) { return { ok: false, error: e.message } }
}

export function listExecutableCapabilities() {
  return loadAllSchemas().filter(s => fs.existsSync(path.join(CAPABILITIES_DIR, s.name, 'executor.js'))).map(s => s.name)
}

export { persistAppState } from "./tools/ui.js"

export { calculateNextDueAt } from "./tools/reminders.js"
export { autoSpeakForVoiceReply } from "./tools/media.js"
export function detectOpenFollowupQuestion(text) {
  if (!text || typeof text !== "string") return false
  return /[?]$/.test(text.trim()) || /(?:吗|呢|吧|好不好|行不行)\s*[?]?$/.test(text.trim())
}
