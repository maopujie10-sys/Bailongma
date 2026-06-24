// 外部技能包执行器：agent-reach 搜索、humanizer-zh 人性化、superpowers 子技能加载
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILLS_DIR = path.resolve(__dirname, '..', 'skills')

// agent-reach 搜索
export async function execAgentReachSearch(args) {
  try {
    const { query, platform = 'web', max_results = 10 } = args
    const agentReachDir = path.join(SKILLS_DIR, 'agent-reach')
    const cliPath = path.join(agentReachDir, 'agent_reach', 'cli.py')
    
    if (!fs.existsSync(cliPath)) {
      return JSON.stringify({ ok: false, error: 'agent-reach CLI not found' })
    }

    const cmdArgs = ['search', query, '--platform', platform, '--max-results', String(max_results)]
    const result = spawnSync('python', [cliPath, ...cmdArgs], {
      cwd: agentReachDir,
      timeout: 30000,
      encoding: 'utf-8'
    })

    if (result.error) {
      return JSON.stringify({ ok: false, error: result.error.message })
    }
    return JSON.stringify({ ok: true, stdout: result.stdout, stderr: result.stderr })
  } catch (err) {
    return JSON.stringify({ ok: false, error: err.message })
  }
}

// humanizer-zh 人性化
export async function execHumanizeText(args) {
  try {
    const { text, style = 'casual' } = args
    const skillPath = path.join(SKILLS_DIR, 'humanizer-zh', 'SKILL.md')
    
    if (!fs.existsSync(skillPath)) {
      return JSON.stringify({ ok: false, error: 'humanizer-zh SKILL.md not found' })
    }

    const skillContent = fs.readFileSync(skillPath, 'utf-8')
    // 返回 SKILL.md 指令 + 待处理文本，由 LLM 在上下文中执行人性化
    return JSON.stringify({
      ok: true,
      skill_instruction: skillContent,
      text_to_process: text,
      style,
      hint: '请按照上述 SKILL.md 指令对 text_to_process 进行人性化处理，输出处理后的文本。'
    })
  } catch (err) {
    return JSON.stringify({ ok: false, error: err.message })
  }
}

// superpowers 子技能加载
export async function execSkillSuperpowersLoad(args) {
  try {
    const { skill_name } = args
    const skillMdPath = path.join(SKILLS_DIR, 'superpowers', skill_name, 'SKILL.md')
    
    if (!fs.existsSync(skillMdPath)) {
      // 列出可用子技能
      const superpowersDir = path.join(SKILLS_DIR, 'superpowers')
      const available = fs.readdirSync(superpowersDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
      return JSON.stringify({
        ok: false,
        error: 子技能 '' 不存在,
        available_skills: available
      })
    }

    const skillContent = fs.readFileSync(skillMdPath, 'utf-8')
    return JSON.stringify({
      ok: true,
      skill_name,
      skill_instruction: skillContent,
      hint: 已加载  技能指令，请按照上述 SKILL.md 执行。
    })
  } catch (err) {
    return JSON.stringify({ ok: false, error: err.message })
  }
}
