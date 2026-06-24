// curator/index.js — 记忆整理器：去重、摘要、过期清理
import { getDB } from '../db.js'

export class Curator {
  constructor(options = {}) {
    this.autoInterval = options.autoInterval || 3600000 // 默认1小时
    this.maxAgeDays = options.maxAgeDays || 90
    this.timer = null
  }

  // 去重：合并相似记忆
  deduplicate() {
    const db = getDB()
    const results = { merged: 0, removed: 0 }
    try {
      const rows = db.exec('SELECT id, content, event_type FROM memories ORDER BY created_at DESC')
      if (!rows || rows.length === 0) return results
      const flat = rows[0]?.values || []
      const seen = new Map()
      for (const row of flat) {
        const [id, content, type] = row
        const key = ${type}:
        if (seen.has(key)) {
          db.exec('DELETE FROM memories WHERE id = ?', [id])
          results.removed++
        } else {
          seen.set(key, id)
        }
      }
    } catch (e) {
      console.error('[curator] deduplicate error:', e.message)
    }
    return results
  }

  // 摘要：统计记忆库状态
  summarize() {
    const db = getDB()
    try {
      const countRow = db.exec('SELECT COUNT(*) FROM memories')
      const typeRow = db.exec('SELECT event_type, COUNT(*) as cnt FROM memories GROUP BY event_type ORDER BY cnt DESC LIMIT 10')
      const total = countRow?.[0]?.values?.[0]?.[0] || 0
      const byType = (typeRow?.[0]?.values || []).map(([type, cnt]) => ({ type, count: cnt }))
      return { total, byType, timestamp: Date.now() }
    } catch (e) {
      return { total: 0, byType: [], error: e.message }
    }
  }

  // 过期清理
  purgeExpired() {
    const db = getDB()
    const cutoff = new Date(Date.now() - this.maxAgeDays * 86400000).toISOString()
    try {
      db.exec('DELETE FROM memories WHERE created_at < ?', [cutoff])
      const changes = db.getRowsModified?.() || 0
      return { purged: changes, cutoff }
    } catch (e) {
      return { purged: 0, error: e.message }
    }
  }

  // 自动维护
  startAuto() {
    this.timer = setInterval(() => {
      this.deduplicate()
      this.purgeExpired()
    }, this.autoInterval)
  }

  stopAuto() {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }

  // 全量维护
  runFullMaintenance() {
    const dedup = this.deduplicate()
    const summary = this.summarize()
    const purged = this.purgeExpired()
    return { dedup, summary, purged, timestamp: Date.now() }
  }
}
