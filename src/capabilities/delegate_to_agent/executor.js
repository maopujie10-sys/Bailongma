import { execSync } from 'child_process'
import { getDB } from '../../db.js'

export async function execute(params) {
  const { agent_id, prompt, context, timeout = 60 } = params || {}
  if (!agent_id || !prompt) return { ok: false, error: '需要 agent_id 和 prompt' }

  // 从 DB 查 agent 信息
  const db = getDB()
  const agent = db.prepare('SELECT * FROM known_agents WHERE id = ? AND available = 1').get(agent_id)
  if (!agent) return { ok: false, error: `Agent "${agent_id}" 不可用或未安装` }

  const invokeType = agent.invoke_type
  const cmd = agent.invoke_cmd
  const args = (agent.invoke_args || []).map(a => a.replace('{prompt}', prompt))
  const fullPrompt = context ? `${context}\n\n${prompt}` : prompt
  const timeoutMs = Math.min(timeout, 300) * 1000

  console.log(`[delegate] 派出 ${agent.name} (${agent_id}): ${fullPrompt.slice(0, 100)}...`)

  try {
    let result
    if (invokeType === 'cli') {
      // CLI 模式：直接执行命令
      const shellCmd = [cmd, ...args.map(a => a === '{prompt}' ? fullPrompt : a)]
        .map(s => s.includes(' ') ? `"${s}"` : s).join(' ')
      result = execSync(shellCmd, {
        timeout: timeoutMs,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe']
      })
    } else if (invokeType === 'http') {
      // HTTP 模式：curl
      const url = `${cmd}/v1/chat/completions`
      const body = JSON.stringify({
        model: agent.version?.replace('ollama:', '') || 'hermes3',
        messages: [{ role: 'user', content: fullPrompt }],
        stream: false
      })
      result = execSync(`curl -s -m ${timeout} -X POST "${url}" -H "Content-Type: application/json" -d '${body.replace(/'/g, "'\\''")}'`, {
        timeout: timeoutMs,
        encoding: 'utf-8',
        maxBuffer: 1 * 1024 * 1024,
      })
      try {
        const json = JSON.parse(result)
        result = json.choices?.[0]?.message?.content || result
      } catch {}
    } else {
      return { ok: false, error: `不支持的调用类型: ${invokeType}` }
    }

    const output = String(result || '').trim().slice(0, 8000)
    console.log(`[delegate] ${agent.name} 返回 ${output.length} 字`)
    return { ok: true, agent: agent.name, agent_id, output }
  } catch (e) {
    console.error(`[delegate] ${agent.name} 失败:`, e.message)
    // 尝试返回 stderr
    const stderr = e.stderr ? String(e.stderr).trim().slice(0, 500) : e.message
    return { ok: false, agent: agent.name, agent_id, error: stderr }
  }
}
