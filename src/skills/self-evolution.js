/**
 * Self-Evolution Loop — 自进化学习闭环
 * 借鉴 Hermes Agent 自进化学习设计
 * 
 * 核心能力：
 *   1. 对话Skill提取 — 从对话中自动识别可复用工作流
 *   2. 定期自我优化 — 分析使用模式，优化Skill触发条件
 *   3. 性能追踪 — 记录Skill使用频率和成功率
 *   4. 自动归档 — 低效Skill自动归档
 *   5. 知识蒸馏 — 从多次对话中提炼通用模式
 */

import fs from 'fs'
import path from 'path'
import { paths } from '../paths.js'
import { splitFrontmatter, parseYamlLite, refreshSkills } from './registry.js'
import { runCuratorCycle } from './curator.js'

const SKILL_FILE = 'SKILL.md'
const EVOLUTION_LOG = 'evolution.json'
const MIN_USES_FOR_PATTERN = 3      // 最少使用次数才提取模式
const EXTRACTION_COOLDOWN_MS = 3600000 // 提取冷却1小时
const SELF_OPTIMIZE_INTERVAL_MS = 86400000 // 自优化间隔24小时

// ─── 进化日志 ───
class EvolutionLog {
  constructor(logPath) {
    this.path = logPath || path.join(paths.sandboxDir, EVOLUTION_LOG)
    this._data = this._load()
  }

  _load() {
    try {
      if (fs.existsSync(this.path)) {
        return JSON.parse(fs.readFileSync(this.path, 'utf-8'))
      }
    } catch (e) { /* ignore */ }
    return {
      extractions: [],      // 提取记录
      optimizations: [],    // 优化记录
      skillStats: {},       // 技能统计 { skillName: { uses, successes, failures, lastUsed } }
      lastExtraction: null,
      lastOptimization: null
    }
  }

  _save() {
    fs.writeFileSync(this.path, JSON.stringify(this._data, null, 2), 'utf-8')
  }

  recordSkillUse(skillName, success) {
    if (!this._data.skillStats[skillName]) {
      this._data.skillStats[skillName] = { uses: 0, successes: 0, failures: 0, lastUsed: null }
    }
    const stats = this._data.skillStats[skillName]
    stats.uses++
    if (success) stats.successes++
    else stats.failures++
    stats.lastUsed = new Date().toISOString()
    this._save()
  }

  recordExtraction(skillName, source) {
    this._data.extractions.push({
      skillName,
      source,
      timestamp: new Date().toISOString()
    })
    this._data.lastExtraction = new Date().toISOString()
    this._save()
  }

  recordOptimization(skillName, changes) {
    this._data.optimizations.push({
      skillName,
      changes,
      timestamp: new Date().toISOString()
    })
    this._data.lastOptimization = new Date().toISOString()
    this._save()
  }

  getTopSkills(limit = 10) {
    return Object.entries(this._data.skillStats)
      .sort((a, b) => b[1].uses - a[1].uses)
      .slice(0, limit)
      .map(([name, stats]) => ({ name, ...stats }))
  }

  getLowPerformingSkills(threshold = 0.3) {
    return Object.entries(this._data.skillStats)
      .filter(([, stats]) => stats.uses >= MIN_USES_FOR_PATTERN && (stats.failures / stats.uses) > threshold)
      .map(([name, stats]) => ({ name, ...stats, failRate: stats.failures / stats.uses }))
  }

  canExtract() {
    return !this._data.lastExtraction || 
      (Date.now() - new Date(this._data.lastExtraction).getTime()) > EXTRACTION_COOLDOWN_MS
  }

  canOptimize() {
    return !this._data.lastOptimization || 
      (Date.now() - new Date(this._data.lastOptimization).getTime()) > SELF_OPTIMIZE_INTERVAL_MS
  }
}

// ─── 对话模式提取器 ───
class PatternExtractor {
  constructor({ callLLM, skillsDir } = {}) {
    this.callLLM = callLLM
    this.skillsDir = skillsDir || paths.sandboxSkillsDir
    this.evolutionLog = new EvolutionLog()
  }

  /**
   * 从对话历史中提取可复用的Skill模式
   * @param {Array} conversationHistory — 最近的对话轮次
   * @returns {Object} { extracted: [], skipped: number }
   */
  async extractFromConversation(conversationHistory) {
    if (!this.callLLM) return { extracted: [], skipped: 0, error: 'No LLM caller' }
    if (!this.evolutionLog.canExtract()) return { extracted: [], skipped: 0, reason: 'cooldown' }

    // 构建对话摘要
    const summary = conversationHistory
      .map(m => `[${m.role}]: ${(m.content || '').slice(0, 500)}`)
      .join('\n')

    const prompt = `Analyze this conversation and identify any reusable workflows or patterns that could become a Skill.

Conversation:
${summary}

Output JSON array of skills to extract. Each skill:
{
  "name": "kebab-case-name",
  "description": "one sentence",
  "triggers": ["phrase1", "phrase2"],
  "workflow": "step by step instructions",
  "confidence": 0.0-1.0
}

Only include skills with confidence >= 0.7. If none found, output empty array [].`

    try {
      const result = await this.callLLM({
        systemPrompt: 'You are a workflow pattern analyzer. Extract reusable skills from conversations.',
        message: prompt,
        temperature: 0.2,
      })

      const skills = JSON.parse(result.content || '[]')
      const extracted = []

      for (const skill of skills) {
        if (skill.confidence < 0.7) continue
        
        const skillDir = path.join(this.skillsDir, skill.name)
        if (fs.existsSync(skillDir)) continue // 已存在，跳过

        const skillMd = this._buildSkillMd(skill)
        fs.mkdirSync(skillDir, { recursive: true })
        fs.writeFileSync(path.join(skillDir, SKILL_FILE), skillMd, 'utf-8')
        
        this.evolutionLog.recordExtraction(skill.name, 'conversation')
        extracted.push(skill.name)
      }

      if (extracted.length > 0) {
        await refreshSkills()
      }

      return { extracted, skipped: skills.length - extracted.length }
    } catch (e) {
      return { extracted: [], skipped: 0, error: e.message }
    }
  }

  /**
   * 自优化：分析Skill使用统计，优化触发条件和描述
   */
  async selfOptimize() {
    if (!this.callLLM) return { optimized: [], error: 'No LLM caller' }
    if (!this.evolutionLog.canOptimize()) return { optimized: [], reason: 'cooldown' }

    const lowPerformers = this.evolutionLog.getLowPerformingSkills(0.4)
    const topSkills = this.evolutionLog.getTopSkills(5)
    const optimized = []

    // 优化低效Skill
    for (const skill of lowPerformers) {
      const skillPath = path.join(this.skillsDir, skill.name, SKILL_FILE)
      if (!fs.existsSync(skillPath)) continue

      const content = fs.readFileSync(skillPath, 'utf-8')
      const { frontmatter, body } = splitFrontmatter(content)
      const meta = parseYamlLite(frontmatter)

      const prompt = `This skill has a high failure rate (${Math.round(skill.failRate * 100)}%). 
Current triggers: ${JSON.stringify(meta.triggers || [])}
Current body:
${body.slice(0, 1000)}

Suggest improvements:
1. Better trigger phrases
2. Clearer workflow steps
3. Missing edge cases

Output JSON: { "triggers": [...], "body_additions": "..." }`

      try {
        const result = await this.callLLM({
          systemPrompt: 'You are a skill optimizer. Improve skill definitions.',
          message: prompt,
          temperature: 0.3,
        })
        const improvements = JSON.parse(result.content || '{}')

        // 应用改进
        if (improvements.triggers?.length) {
          meta.triggers = [...new Set([...(meta.triggers || []), ...improvements.triggers])]
        }
        
        let newBody = body
        if (improvements.body_additions) {
          newBody += `\n\n## Optimization Notes (auto-generated)\n${improvements.body_additions}`
        }

        const newContent = `---\n${Object.entries(meta).map(([k, v]) => 
          Array.isArray(v) ? `${k}:\n${v.map(x => `  - ${x}`).join('\n')}` : `${k}: ${v}`
        ).join('\n')}\n---\n${newBody}`

        fs.writeFileSync(skillPath, newContent, 'utf-8')
        this.evolutionLog.recordOptimization(skill.name, { 
          newTriggers: improvements.triggers,
          failRateBefore: skill.failRate 
        })
        optimized.push(skill.name)
      } catch (e) {
        console.error(`[SelfEvolution] Failed to optimize ${skill.name}: ${e.message}`)
      }
    }

    if (optimized.length > 0) {
      await refreshSkills()
    }

    return { optimized, topSkills }
  }

  /**
   * 知识蒸馏：从高频Skill中提炼通用模式
   */
  async distillPatterns() {
    const topSkills = this.evolutionLog.getTopSkills(10)
    if (topSkills.length < 3) return { patterns: [], reason: 'not enough data' }

    const skillContents = []
    for (const skill of topSkills) {
      const skillPath = path.join(this.skillsDir, skill.name, SKILL_FILE)
      if (fs.existsSync(skillPath)) {
        skillContents.push({
          name: skill.name,
          uses: skill.uses,
          content: fs.readFileSync(skillPath, 'utf-8').slice(0, 800)
        })
      }
    }

    if (!this.callLLM) return { patterns: [] }

    const prompt = `Analyze these frequently-used skills and identify common patterns that could become meta-skills or templates:

${skillContents.map(s => `### ${s.name} (used ${s.uses} times)\n${s.content}`).join('\n\n')}

Output JSON array of patterns: [{ "name": "pattern-name", "description": "...", "template": "..." }]`

    try {
      const result = await this.callLLM({
        systemPrompt: 'You are a knowledge distillation engine. Extract meta-patterns from skills.',
        message: prompt,
        temperature: 0.3,
      })
      return { patterns: JSON.parse(result.content || '[]') }
    } catch (e) {
      return { patterns: [], error: e.message }
    }
  }

  _buildSkillMd(skill) {
    const frontmatter = [
      '---',
      `name: ${skill.name}`,
      `description: ${skill.description}`,
      skill.triggers?.length ? `triggers:\n${skill.triggers.map(t => `  - ${t}`).join('\n')}` : '',
      'auto_extracted: true',
      '---',
    ].filter(Boolean).join('\n')

    return `${frontmatter}\n\n# ${skill.name}\n\n${skill.description}\n\n## Workflow\n\n${skill.workflow}\n\n## Auto-Extracted\nThis skill was automatically extracted from conversation patterns. Review and refine as needed.`
  }
}

// ─── 进化循环调度器 ───
class EvolutionScheduler {
  constructor({ callLLM, skillsDir, intervalMs = 3600000 } = {}) {
    this.extractor = new PatternExtractor({ callLLM, skillsDir })
    this.intervalMs = intervalMs
    this._timer = null
    this._running = false
  }

  start() {
    if (this._running) return
    this._running = true
    this._timer = setInterval(() => this._tick(), this.intervalMs)
    console.log('[SelfEvolution] Scheduler started')
  }

  stop() {
    this._running = false
    if (this._timer) { clearInterval(this._timer); this._timer = null }
    console.log('[SelfEvolution] Scheduler stopped')
  }

  async _tick() {
    try {
      // 运行Curator归档
      await runCuratorCycle({ callLLM: this.extractor.callLLM })

      // 自优化
      const optResult = await this.extractor.selfOptimize()
      if (optResult.optimized?.length) {
        console.log(`[SelfEvolution] Optimized ${optResult.optimized.length} skills: ${optResult.optimized.join(', ')}`)
      }

      // 知识蒸馏
      const distillResult = await this.extractor.distillPatterns()
      if (distillResult.patterns?.length) {
        console.log(`[SelfEvolution] Distilled ${distillResult.patterns.length} patterns`)
      }
    } catch (e) {
      console.error(`[SelfEvolution] Tick error: ${e.message}`)
    }
  }

  async runOnce() {
    return this._tick()
  }
}

export { 
  EvolutionLog, 
  PatternExtractor, 
  EvolutionScheduler 
}
