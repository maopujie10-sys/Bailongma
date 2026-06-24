/**
 * Curator — 技能维护器
 *
 * 设计（借鉴 Hermes Agent curator.py）：
 *   - 后台定期审查 Agent 自建的技能库
 *   - 自动归档不用的技能（移到 archive/ 子目录）
 *   - 合并重复技能（相似度 > 阈值）
 *   - 标记生命周期状态：active / stale / archived
 *   - 不删只归档，可恢复
 *
 * 用法：
 *   import { runCuratorCycle } from './curator.js'
 *   await runCuratorCycle({ skillsDir, callLLM })
 */

import fs from 'fs'
import path from 'path'
import { paths } from '../paths.js'
import { splitFrontmatter, parseYamlLite } from '../skills/registry.js'

const SKILL_FILE = 'SKILL.md'
const ARCHIVE_DIR = 'archive'
const STALE_DAYS = 30          // 30天未使用标记为 stale
const SIMILARITY_THRESHOLD = 0.7 // 相似度阈值，超过则合并

/**
 * 运行一次 Curator 维护周期
 * @param {object} params
 * @param {string} params.skillsDir 技能目录
 * @param {function} params.callLLM LLM 调用函数
 * @returns {object} { archived, merged, skipped }
 */
export async function runCuratorCycle({ skillsDir = null, callLLM = null } = {}) {
  const dir = skillsDir || paths.sandboxSkillsDir
  const result = { archived: [], merged: [], skipped: 0 }

  if (!fs.existsSync(dir)) {
    console.log('[curator] Skills directory not found, skipping')
    return result
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const skillDirs = entries.filter(e => e.isDirectory() && e.name !== ARCHIVE_DIR)

  if (skillDirs.length === 0) {
    console.log('[curator] No skills to curate')
    return result
  }

  // 读取所有技能元数据
  const skills = []
  for (const entry of skillDirs) {
    const skillPath = path.join(dir, entry.name, SKILL_FILE)
    if (!fs.existsSync(skillPath)) continue

    try {
      const content = fs.readFileSync(skillPath, 'utf-8')
      const { frontmatter } = splitFrontmatter(content)
      const meta = parseYamlLite(frontmatter)
      const stat = fs.statSync(skillPath)

      skills.push({
        name: entry.name,
        path: skillPath,
        dirPath: path.join(dir, entry.name),
        meta,
        mtime: stat.mtime,
        size: content.length,
      })
    } catch (err) {
      console.warn(`[curator] Failed to read skill ${entry.name}: ${err.message}`)
    }
  }

  // 1. 归档过期技能（30天未修改）
  const now = new Date()
  for (const skill of skills) {
    const daysSinceMod = (now - skill.mtime) / (1000 * 60 * 60 * 24)
    if (daysSinceMod > STALE_DAYS) {
      try {
        archiveSkill(dir, skill)
        result.archived.push(skill.name)
      } catch (err) {
        console.warn(`[curator] Failed to archive ${skill.name}: ${err.message}`)
      }
    }
  }

  // 2. 检测重复技能（基于名称和描述的简单相似度）
  const active = skills.filter(s => !result.archived.includes(s.name))
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]
      const b = active[j]
      const similarity = computeSkillSimilarity(a, b)
      if (similarity > SIMILARITY_THRESHOLD) {
        // 保留较新的，归档较旧的
        const [keep, archive] = a.mtime > b.mtime ? [a, b] : [b, a]
        try {
          archiveSkill(dir, archive)
          result.merged.push({ kept: keep.name, archived: archive.name, similarity })
        } catch (err) {
          console.warn(`[curator] Failed to merge ${archive.name}: ${err.message}`)
        }
      }
    }
  }

  result.skipped = active.length - result.merged.length

  if (result.archived.length > 0 || result.merged.length > 0) {
    console.log(`[curator] Cycle complete: archived ${result.archived.length}, merged ${result.merged.length}, kept ${result.skipped}`)
  }

  return result
}

/**
 * 归档技能：移动到 archive/ 子目录
 */
function archiveSkill(baseDir, skill) {
  const archiveDir = path.join(baseDir, ARCHIVE_DIR)
  fs.mkdirSync(archiveDir, { recursive: true })

  const destDir = path.join(archiveDir, skill.name)
  if (fs.existsSync(destDir)) {
    // 如果已存在，加时间戳后缀
    const ts = Date.now()
    const newDest = path.join(archiveDir, `${skill.name}_${ts}`)
    fs.renameSync(skill.dirPath, newDest)
  } else {
    fs.renameSync(skill.dirPath, destDir)
  }

  console.log(`[curator] Archived: ${skill.name}`)
}

/**
 * 计算两个技能的相似度（基于名称和描述的简单 Jaccard 相似度）
 */
function computeSkillSimilarity(a, b) {
  const textA = `${a.name} ${a.meta.description || ''}`.toLowerCase()
  const textB = `${b.name} ${b.meta.description || ''}`.toLowerCase()

  const wordsA = new Set(textA.split(/\s+/).filter(w => w.length > 1))
  const wordsB = new Set(textB.split(/\s+/).filter(w => w.length > 1))

  if (wordsA.size === 0 || wordsB.size === 0) return 0

  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)))
  const union = new Set([...wordsA, ...wordsB])

  return intersection.size / union.size
}

/**
 * 恢复已归档的技能
 * @param {string} skillsDir
 * @param {string} skillName
 */
export function restoreSkill(skillsDir, skillName) {
  const dir = skillsDir || paths.sandboxSkillsDir
  const archiveDir = path.join(dir, ARCHIVE_DIR)

  if (!fs.existsSync(archiveDir)) {
    throw new Error('Archive directory does not exist')
  }

  // 查找归档的技能（可能有时间戳后缀）
  const entries = fs.readdirSync(archiveDir, { withFileTypes: true })
  const match = entries.find(e => e.isDirectory() && e.name.startsWith(skillName))

  if (!match) {
    throw new Error(`Archived skill not found: ${skillName}`)
  }

  const srcPath = path.join(archiveDir, match.name)
  const destPath = path.join(dir, skillName)

  if (fs.existsSync(destPath)) {
    throw new Error(`Skill already exists in active directory: ${skillName}`)
  }

  fs.renameSync(srcPath, destPath)
  console.log(`[curator] Restored: ${skillName}`)
  return { name: skillName, path: destPath }
}
