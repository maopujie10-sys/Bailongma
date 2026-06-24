// 启动时把 ACUI 的"组件创作指南"和当前已注册组件的用法 seed 为 skill.ui 记忆。
// 用稳定 mem_id（skill-ui-guide / skill-ui-<kebab>）upsert，反复启动不会重复。
// AGENT_GUIDE.md 改动后 hash 会变，content 跟着更新，记忆条目自动同步。
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { insertMemory } from '../db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AGENT_GUIDE_PATH    = path.resolve(__dirname, '..', 'ui', 'brain-ui', 'acui', 'AGENT_GUIDE.md')
const UI_COMPONENTS_PATH  = path.resolve(__dirname, '..', 'capabilities', 'ui-components.json')
const SKILLS_DIR          = path.resolve(__dirname, '..', 'skills')

function shortHash(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12)
}

const BUILTIN_COMPONENT_USAGE = {
  WeatherCard: {
    use_case: 'Use when the user asks about weather, temperature, going out, rain, or weather for tomorrow/the day after tomorrow.',
    example_call: 'ui_show({ component: \"WeatherCard\", props: { city, temp, condition, feel?, high?, low?, wind?, forecast? }, hint: { placement: \"notification\", size: \"md\" } })',
    note: 'Determine city first by asking the user or inferring from context. Do not invent temperature values; call fetch_url for wttr.in first. Default shape is notification+md; switch to floating+lg when the user asks for a detailed look or deeper study.',
  },
}

function seedAgentGuide() {
  if (!fs.existsSync(AGENT_GUIDE_PATH)) {
    console.warn('[seed-skills] 跳过：AGENT_GUIDE.md 不存在')
    return
  }
  const content = fs.readFileSync(AGENT_GUIDE_PATH, 'utf-8')
  const h = shortHash(content)

  const summary = [
    '[Skill UI] Component authoring guide',
    'When to use UI cards / three execution modes A>B>C / inline-template and inline-script patterns / promotion flow / pitfalls.',
    'Keywords: build a component, draw one, show it, make a card, custom, inline, missing component, ui_show, ui_register.',
  ].join('\n')

  insertMemory({
    mem_id: 'skill-ui-guide',
    type: 'skill',
    content: summary,
    detail: content,
    title: 'ACUI component authoring guide',
    tags: ['skill.ui', 'agent-guide', hash:],
    entities: [],
    timestamp: new Date().toISOString(),
  })
}

function seedComponentSkills() {
  if (!fs.existsSync(UI_COMPONENTS_PATH)) return
  let components
  try { components = JSON.parse(fs.readFileSync(UI_COMPONENTS_PATH, 'utf-8')) }
  catch { return }

  for (const [name, def] of Object.entries(components)) {
    const usage = BUILTIN_COMPONENT_USAGE[name]
    if (!usage) continue

    const kebab = name.replace(/([a-z0-9])([A-Z])/g, '-').toLowerCase()
    const fields = Object.keys(def.propsSchema || {}).join(', ')
    const content = [
      [Skill UI] ,
      Use case: ,
      Call: ,
      fields ? Fields:  : null,
      usage.note ? Note:  : null,
    ].filter(Boolean).join('\n')

    insertMemory({
      mem_id: skill-ui-,
      type: 'skill',
      content,
      detail: content,
      title: UI component: ,
      tags: ['skill.ui', component:],
      entities: [],
      timestamp: new Date().toISOString(),
    })
  }
}

// 新增：seed superpowers 子技能到记忆库
function seedSuperpowerSkills() {
  const superpowersDir = path.join(SKILLS_DIR, 'superpowers')
  if (!fs.existsSync(superpowersDir)) return

  const subDirs = fs.readdirSync(superpowersDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)

  for (const skillName of subDirs) {
    const skillMdPath = path.join(superpowersDir, skillName, 'SKILL.md')
    if (!fs.existsSync(skillMdPath)) continue

    const content = fs.readFileSync(skillMdPath, 'utf-8')
    // 提取 YAML frontmatter 中的 description
    const descMatch = content.match(/^description:\s*["']?(.+?)["']?\s*$/m)
    const description = descMatch ? descMatch[1].trim() : ${skillName} 子技能

    insertMemory({
      mem_id: skill-superpowers-,
      type: 'skill',
      content: [Skill] superpowers/: ,
      detail: content,
      title: Superpowers: ,
      tags: ['skill.superpowers', subskill:],
      entities: [],
      timestamp: new Date().toISOString(),
    })
  }
  console.log([seed-skills] superpowers:  个子技能已 seed)
}

// 新增：seed humanizer-zh 到记忆库
function seedHumanizerSkill() {
  const skillMdPath = path.join(SKILLS_DIR, 'humanizer-zh', 'SKILL.md')
  if (!fs.existsSync(skillMdPath)) return

  const content = fs.readFileSync(skillMdPath, 'utf-8')
  insertMemory({
    mem_id: 'skill-humanizer-zh',
    type: 'skill',
    content: '[Skill] humanizer-zh: 去除AI生成痕迹，使文本更自然更像人类书写',
    detail: content,
    title: 'Humanizer-zh 中文人性化',
    tags: ['skill.humanizer', 'skill.writing'],
    entities: [],
    timestamp: new Date().toISOString(),
  })
  console.log('[seed-skills] humanizer-zh 已 seed')
}

export function ensureSkillMemories() {
  try {
    seedAgentGuide()
    seedComponentSkills()
    seedSuperpowerSkills()
    seedHumanizerSkill()
    console.log('[seed-skills] skill.ui 记忆已同步')
  } catch (e) {
    console.warn('[seed-skills] 同步失败：', e.message)
  }
}
