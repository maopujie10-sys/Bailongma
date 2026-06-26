import { config } from '../config.js'

// ── 会话级白名单 ──────────────────────────────────────────────────────
// 用户选择"始终允许"某个工具后，该工具在当前会话内免审批直接放行。
const sessionWhitelist = new Set()

export function addToWhitelist(toolName) {
  sessionWhitelist.add(toolName)
  console.log(`[tool-policy] 工具 "${toolName}" 已加入会话白名单`)
}

export function clearWhitelist() {
  sessionWhitelist.clear()
  console.log('[tool-policy] 会话白名单已清空')
}

const TOOL_RISK = {
  read_file: 'low',
  list_dir: 'low',
  search_memory: 'low',
  probe_memory: 'low',
  list_processes: 'low',
  skip_recognition: 'low',
  send_message: 'medium',
  express: 'medium',
  write_file: 'medium',
  make_dir: 'medium',
  upsert_memory: 'medium',
  merge_memories: 'high',
  downgrade_memory: 'low',
  skip_consolidation: 'low',
  manage_reminder: 'medium',
  schedule_reminder: 'medium',
  manage_prefetch_task: 'medium',
  manage_rule: 'medium',
  ui_show: 'medium',
  ui_update: 'medium',
  ui_hide: 'medium',
  ui_patch: 'medium',
  manage_app: 'medium',
  set_tick_interval: 'medium',
  media_mode: 'low',
  hotspot_mode: 'low',
  worldcup_mode: 'low',
  open_doc_panel: 'low',
  person_card_mode: 'low',
  music: 'low',
  delegate_to_agent: 'high',
  grant_agent_delegation: 'high',
  install_tool: 'high',
  uninstall_tool: 'medium',
  list_tools: 'low',
  manage_tool_factory: 'high',
  find_tool: 'low',
  complete_startup_self_check: 'low',
  delete_file: 'high',
  exec_command: 'high',
  exec_quick_command: 'medium',
  exec_task_command: 'high',
  exec_background_command: 'high',
  download_file: 'high',
  kill_process: 'high',
  web_search: 'medium',
  fetch_url: 'medium',
  browser_read: 'medium',
  speak: 'medium',
  generate_lyrics: 'medium',
  generate_music: 'medium',
  generate_image: 'medium',
  generate_video: 'medium',
  ui_register: 'medium',
  set_security: 'high',
  write_source: 'high',
  self_build: 'high',
  self_upgrade: 'high',
  self_rollback: 'high',
  list_source: 'low',
  read_source: 'low',
}
export function classifyTool(name) {
  return TOOL_RISK[name] || 'medium'
}

export function isDangerousShellCommand(command) {
  const text = String(command || '').trim()
  const reasons = []
  if (config.security?.execSandbox !== false) {
    if (/(^|[\s"'`])\.\.([\\/]|$)/.test(text)) reasons.push('command references a parent directory')
    if (/(^|[\s"'`])[a-z]:[\\/]/i.test(text) || /(^|[\s"'`])[\\/]{2}[^\\/]/.test(text)) reasons.push('command references an absolute filesystem path')
    if (/(^|[\s"'`])~([\\/]|$)/.test(text) || /\$(home|env:userprofile)\b/i.test(text) || /%userprofile%/i.test(text)) reasons.push('command references the user home directory')
    if (/\bgit\s+reset\s+--hard\b/i.test(text) || /\bgit\s+clean\b/i.test(text)) reasons.push('command can destructively rewrite the worktree')
    if (/\b(format|diskpart|shutdown)\b/i.test(text)) reasons.push('command is system-level destructive or disruptive')
    if (/Remove-Item\b.*-Recurse|-Recurse\b.*Remove-Item/i.test(text)) reasons.push('recursive delete (Remove-Item -Recurse) detected')
    if (/\brd\s+\/s\b/i.test(text)) reasons.push('recursive directory delete (rd /s) detected')
    if (/\bInvoke-Expression\b|\biex\s/i.test(text)) reasons.push('dynamic code execution via Invoke-Expression detected')
  }
  return reasons
}

export function evaluateToolPolicy(name, args = {}, context = {}) {
  const risk = classifyTool(name)

  // 会话白名单：用户已选择"始终允许" → 直接放行
  if (sessionWhitelist.has(name)) {
    console.log(`[tool-policy] 工具 "${name}" 在会话白名单中，直接放行`)
    return { status: 'allowed', risk, reason: 'session whitelist' }
  }

  // 安全策略已明确禁用的工具 → blocked
  const blockedTools = config.security?.blockedTools || []
  if (blockedTools.includes(name)) {
    return { status: 'blocked', risk, reason: `工具 "${name}" 已被安全策略禁用` }
  }

  // 危险命令检测 → blocked（此检查与审批无关，是硬性安全规则）
  if (['exec_command', 'exec_quick_command', 'exec_task_command', 'exec_background_command'].includes(name)) {
    const reasons = isDangerousShellCommand(args.command || args.cmd || '')
    if (reasons.length) return { status: 'blocked', risk, reason: reasons.join('; ') }
  }

  // risk low / medium → 直接放行（日常操作不需要审批）
  if (risk === 'low' || risk === 'medium') {
    return { status: 'allowed', risk, reason: '' }
  }

  // risk high → 审批
  if (risk === 'high') {
    // 自主模式且未授权高风险自主 → 仍然需要审批
    if (context.autonomous && !context.allowHighRiskAutonomy) {
      return {
        status: 'approval_required',
        risk: 'high',
        reason: 'high-risk tool in autonomous mode requires user approval',
      }
    }
    return {
      status: 'approval_required',
      risk: 'high',
      reason: `工具 "${name}" 风险等级为 high，需要用户确认`,
    }
  }

  // 兜底：未知风险等级 → 放行（不应到达这里）
  return { status: 'allowed', risk, reason: '' }
}
