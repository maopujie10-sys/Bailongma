import fs from 'fs'
import path from 'path'
import { paths } from '../paths.js'
import {
  splitFrontmatter,
  parseYamlLite,
  refreshSkills,
} from './registry.js'

const SKILL_FILE = 'SKILL.md'

// ─── /learn 命令：Agent 自动生成 SKILL.md ───
const LEARN_SYSTEM_PROMPT = `You are a skill authoring assistant. Your job is to write a SKILL.md file based on the user's description of a workflow or capability they want the agent to remember.

Output rules:
- Output ONLY the SKILL.md content. No other text, no explanations.
- The SKILL.md must start with YAML frontmatter between --- markers.
- Frontmatter fields: name (required, short kebab-case id), description (required, one sentence), tags (optional, YAML list), triggers (optional, YAML list of phrases that should activate this skill), aliases (optional, YAML list of alternative names).
- After the frontmatter, write the skill body in Markdown. Include:
  1. When to use this skill (trigger conditions)
  2. Step-by-step workflow
  3. Tools/resources needed
  4. Expected output or completion criteria
  5. Pitfalls or notes
- Keep it concise but complete. The agent will read this as a workflow instruction.`

export async function learnSkill(userDescription, { callLLM, sandboxSkillsDir } = {}) {
  if (!userDescription || !callLLM) return { ok: false, error: 'Missing description or LLM caller' }

  const dir = sandboxSkillsDir || paths.sandboxSkillsDir
  let skillName = null
  let skillContent = null

  try {
    const result = await callLLM({
      systemPrompt: LEARN_SYSTEM_PROMPT,
      message: `Write a SKILL.md for this workflow:\n\n${userDescription}`,
      temperature: 0.3,
    })
    skillContent = result.content || ''
  } catch (err) {
    return { ok: false, error: `LLM call failed: ${err.message}` }
  }

  if (!skillContent.trim()) {
    return { ok: false, error: 'LLM returned empty content' }
  }

  // Parse the generated SKILL.md to extract the skill name for the folder
  const { frontmatter } = splitFrontmatter(skillContent)
  const parsed = parseYamlLite(frontmatter)
  skillName = parsed.name || 'unnamed-skill'

  // Create folder: sandbox/skills/<skillName>/
  const skillDir = path.join(dir, skillName)
  try {
    fs.mkdirSync(skillDir, { recursive: true })
  } catch (err) {
    return { ok: false, error: `Failed to create skill directory: ${err.message}` }
  }

  // Write SKILL.md
  const skillPath = path.join(skillDir, SKILL_FILE)
  try {
    fs.writeFileSync(skillPath, skillContent, 'utf-8')
  } catch (err) {
    return { ok: false, error: `Failed to write SKILL.md: ${err.message}` }
  }

  // Refresh the skill cache
  refreshSkills()

  return {
    ok: true,
    skillName,
    skillPath,
    preview: skillContent.slice(0, 500),
  }
}

// Check if a message is a /learn command
export function isLearnCommand(message) {
  const text = String(message || '').trim()
  return /^\/learn\b/i.test(text) || /^\/学习\b/.test(text) || /^\/教\b/.test(text)
}

// Extract the description from a /learn command (everything after /learn)
export function extractLearnDescription(message) {
  const text = String(message || '').trim()
  return text.replace(/^\/(learn|学习|教)\s*/i, '').trim()
}
