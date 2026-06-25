/**
 * Engineering Discipline — 经典工程规范内化层
 *
 * 从 ~/.claude/rules/ 的 14 套经典规则中提取 nano 浓缩版，
 * 在编码场景下无条件注入 system prompt，确保 Agent 行为符合工程最佳实践。
 *
 * 参考开源社区最佳实践：
 *   - Boris (Claude Code creator): "Short beats long. Make a plan first."
 *   - proagents: 794 rules distilled from 6 frameworks
 *   - agent-style: 21 writing rules for AI agents
 *
 * 注入策略：
 *   - ALWAYS_ON_BLOCK: 始终注入（核心编码纪律，约 800 tokens）
 *   - REFACTOR_BLOCK: 修改已有代码时注入
 *   - PRODUCTION_BLOCK: 涉及部署/线上环境时注入
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 规则文件路径 — 优先项目本地（可打包部署），其次 ~/.claude/rules/（开发环境）
function getRulesDir() {
  // 项目本地规则目录（打包时一起走）
  const localDir = path.join(__dirname, 'rules')
  if (fs.existsSync(localDir)) return localDir
  // 开发环境 fallback
  const home = process.env.USERPROFILE || process.env.HOME || ''
  const claudeRules = path.join(home, '.claude', 'rules')
  if (fs.existsSync(claudeRules)) return claudeRules
  return localDir  // 都不存在时返回本地路径，loadNano 会静默失败
}

function loadNano(ruleName) {
  try {
    // 本地文件: rules/clean-code.nano.md
    const p = path.join(getRulesDir(), `${ruleName}.nano.md`)
    if (!fs.existsSync(p)) return ''
    return fs.readFileSync(p, 'utf8').trim()
  } catch { return '' }
}

// ── 始终注入的核心工程纪律 ────────────────────────────────────────
// 蒸馏自 Clean Code + A Philosophy of Software Design + The Pragmatic Programmer
const ALWAYS_ON_CORE = [
  'clean-code',
  'a-philosophy-of-software-design',
  'the-pragmatic-programmer',
]

// ── 修改代码时注入 ──────────────────────────────────────────────────
const REFACTOR_RULES = [
  'refactoring',
  'working-effectively-with-legacy-code',
]

// ── 生产/部署时注入 ────────────────────────────────────────────────
const PRODUCTION_RULES = [
  'release-it',
]

// 懒加载规则文本
let _coreBlock = null
let _refactorBlock = null
let _productionBlock = null

function getCoreBlock() {
  if (_coreBlock) return _coreBlock
  const parts = []
  for (const name of ALWAYS_ON_CORE) {
    const text = loadNano(name)
    if (text) parts.push(text)
  }
  _coreBlock = parts.length
    ? `## Engineering Discipline (Always Active)\n\n${parts.join('\n\n---\n\n')}`
    : ''
  return _coreBlock
}

function getRefactorBlock() {
  if (_refactorBlock) return _refactorBlock
  const parts = []
  for (const name of REFACTOR_RULES) {
    const text = loadNano(name)
    if (text) parts.push(text)
  }
  _refactorBlock = parts.length
    ? `## Refactoring Discipline\n\n${parts.join('\n\n---\n\n')}`
    : ''
  return _refactorBlock
}

function getProductionBlock() {
  if (_productionBlock) return _productionBlock
  const parts = []
  for (const name of PRODUCTION_RULES) {
    const text = loadNano(name)
    if (text) parts.push(text)
  }
  _productionBlock = parts.length
    ? `## Production Readiness Discipline\n\n${parts.join('\n\n---\n\n')}`
    : ''
  return _productionBlock
}

// ── 触发器 ──────────────────────────────────────────────────────────

// 修改已有代码的场景
const REFACTOR_TEXT_RE = /修改|改|重构|优化|重写|修复|修|更新|调整|迁移/i

// 生产/部署场景
const PRODUCTION_TEXT_RE = /部署|上线|发布|生产|服务器|重启|deploy|release|production|restart|nginx|tomcat|docker|k8s/i

/**
 * @param {object} signals
 * @param {string} signals.userMessage — 本轮用户消息
 * @param {string} signals.taskText — 当前 active task
 */
export function shouldInjectRefactor({ userMessage = '', taskText = '' } = {}) {
  return REFACTOR_TEXT_RE.test(String(userMessage)) || REFACTOR_TEXT_RE.test(String(taskText))
}

export function shouldInjectProduction({ userMessage = '', taskText = '' } = {}) {
  return PRODUCTION_TEXT_RE.test(String(userMessage)) || PRODUCTION_TEXT_RE.test(String(taskText))
}

/**
 * 获取始终注入的工程纪律块（~800 tokens）
 */
export function getEngineeringDisciplineBlock() {
  return getCoreBlock()
}

/**
 * 获取按需注入的纪律块
 */
export function getRefactorDisciplineBlock() {
  return getRefactorBlock()
}

export function getProductionDisciplineBlock() {
  return getProductionBlock()
}
