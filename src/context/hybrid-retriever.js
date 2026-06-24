/**
 * Context Engine Enhancements — 混合检索策略
 * 借鉴 Hermes Agent Context Engine 设计
 * 
 * 核心能力：
 *   1. 混合检索 — 语义相似度 + 关键词匹配 + 时间衰减
 *   2. 多级缓存 — 热数据内存缓存 + 温数据文件缓存
 *   3. 上下文窗口优化 — 智能截断，保留高相关性内容
 *   4. 相关性评分 — 综合多维度打分
 */

// ─── 混合检索器 ───
class HybridRetriever {
  constructor({ 
    keywordWeight = 0.3,    // 关键词匹配权重
    semanticWeight = 0.4,   // 语义相似度权重
    recencyWeight = 0.3,    // 时间衰减权重
    decayHalfLifeHours = 24 // 时间衰减半衰期（小时）
  } = {}) {
    this.keywordWeight = keywordWeight
    this.semanticWeight = semanticWeight
    this.recencyWeight = recencyWeight
    this.decayHalfLifeHours = decayHalfLifeHours
  }

  /**
   * 混合检索
   * @param {string} query — 查询文本
   * @param {Array} candidates — 候选文档 [{ id, content, keywords, timestamp }]
   * @param {Object} options
   * @returns {Array} 排序后的结果
   */
  search(query, candidates, { limit = 10, minScore = 0.1 } = {}) {
    const queryTokens = this._tokenize(query)
    const now = Date.now()

    const scored = candidates.map(doc => {
      const keywordScore = this._keywordScore(queryTokens, doc.keywords || this._tokenize(doc.content))
      const semanticScore = this._semanticScore(query, doc.content)
      const recencyScore = this._recencyScore(doc.timestamp || now, now)
      
      const totalScore = 
        keywordScore * this.keywordWeight +
        semanticScore * this.semanticWeight +
        recencyScore * this.recencyWeight

      return { ...doc, score: totalScore, _keywordScore: keywordScore, _semanticScore: semanticScore, _recencyScore: recencyScore }
    })

    return scored
      .filter(d => d.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  _tokenize(text) {
    if (!text) return []
    // 简单分词：按空格/标点分割，去重，转小写
    return [...new Set(
      text.toLowerCase()
        .split(/[\s,.;:!?，。；：！？、\n\r]+/)
        .filter(t => t.length > 0)
    )]
  }

  _keywordScore(queryTokens, docTokens) {
    if (!queryTokens.length || !docTokens.length) return 0
    const docSet = new Set(docTokens)
    let matches = 0
    for (const token of queryTokens) {
      if (docSet.has(token)) matches++
      else {
        // 部分匹配
        for (const dt of docSet) {
          if (dt.includes(token) || token.includes(dt)) {
            matches += 0.5
            break
          }
        }
      }
    }
    return matches / queryTokens.length
  }

  _semanticScore(query, content) {
    if (!query || !content) return 0
    // 简化版语义相似度：基于共同子串和词频
    const queryTokens = this._tokenize(query)
    const contentTokens = this._tokenize(content)
    if (!queryTokens.length || !contentTokens.length) return 0

    const contentSet = new Set(contentTokens)
    let overlap = 0
    for (const token of queryTokens) {
      if (contentSet.has(token)) overlap++
    }
    
    // Jaccard相似度
    const union = new Set([...queryTokens, ...contentTokens])
    return union.size > 0 ? overlap / union.size : 0
  }

  _recencyScore(timestamp, now) {
    if (!timestamp) return 0.5
    const ageHours = (now - timestamp) / 3600000
    // 指数衰减：score = 2^(-age/halfLife)
    return Math.pow(2, -ageHours / this.decayHalfLifeHours)
  }
}

// ─── 多级缓存 ───
class TieredCache {
  constructor({ 
    l1MaxSize = 100,      // L1内存缓存最大条目
    l1TtlMs = 300000,     // L1过期时间5分钟
    l2Path = null         // L2文件缓存路径
  } = {}) {
    this.l1 = new Map()   // key → { value, expiresAt }
    this.l1MaxSize = l1MaxSize
    this.l1TtlMs = l1TtlMs
    this.l2Path = l2Path
  }

  get(key) {
    // L1检查
    const l1Entry = this.l1.get(key)
    if (l1Entry && Date.now() < l1Entry.expiresAt) {
      return l1Entry.value
    }
    if (l1Entry) this.l1.delete(key)

    // L2检查
    if (this.l2Path) {
      try {
        const fs = require('fs')
        const path = require('path')
        const filePath = path.join(this.l2Path, `${this._safeKey(key)}.json`)
        if (fs.existsSync(filePath)) {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
          if (Date.now() < data.expiresAt) {
            // 提升到L1
            this.set(key, data.value, { ttlMs: data.expiresAt - Date.now() })
            return data.value
          }
        }
      } catch (e) { /* ignore */ }
    }

    return null
  }

  set(key, value, { ttlMs = null } = {}) {
    const ttl = ttlMs || this.l1TtlMs
    this.l1.set(key, { value, expiresAt: Date.now() + ttl })

    // L1淘汰
    if (this.l1.size > this.l1MaxSize) {
      const oldest = [...this.l1.entries()]
        .sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0]
      if (oldest) this.l1.delete(oldest[0])
    }

    // L2写入
    if (this.l2Path) {
      try {
        const fs = require('fs')
        const path = require('path')
        fs.mkdirSync(this.l2Path, { recursive: true })
        fs.writeFileSync(
          path.join(this.l2Path, `${this._safeKey(key)}.json`),
          JSON.stringify({ value, expiresAt: Date.now() + ttl }),
          'utf-8'
        )
      } catch (e) { /* ignore */ }
    }
  }

  clear() {
    this.l1.clear()
  }

  _safeKey(key) {
    return String(key).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
  }
}

// ─── 上下文窗口优化器 ───
class ContextWindowOptimizer {
  constructor({ maxTokens = 8000, reserveTokens = 2000 } = {}) {
    this.maxTokens = maxTokens
    this.reserveTokens = reserveTokens
  }

  /**
   * 智能截断上下文，保留高相关性内容
   * @param {Array} sections — [{ content, score, priority }]
   * @param {number} maxTokens — 最大token数
   * @returns {Array} 截断后的sections
   */
  optimize(sections, { maxTokens = null } = {}) {
    const limit = maxTokens || (this.maxTokens - this.reserveTokens)
    
    // 按优先级分组
    const critical = sections.filter(s => s.priority === 'critical')
    const high = sections.filter(s => s.priority === 'high')
    const normal = sections.filter(s => s.priority === 'normal' || !s.priority)

    const result = []
    let tokenCount = 0

    // 优先保留critical
    for (const section of critical) {
      const tokens = this._estimateTokens(section.content)
      if (tokenCount + tokens <= limit) {
        result.push(section)
        tokenCount += tokens
      } else {
        // 截断
        result.push({ ...section, content: this._truncateToTokens(section.content, limit - tokenCount), truncated: true })
        return result
      }
    }

    // 按分数排序high和normal
    const rest = [...high, ...normal].sort((a, b) => (b.score || 0) - (a.score || 0))
    for (const section of rest) {
      const tokens = this._estimateTokens(section.content)
      if (tokenCount + tokens <= limit) {
        result.push(section)
        tokenCount += tokens
      }
    }

    return result
  }

  _estimateTokens(text) {
    // 粗略估计：中文约1.5字符/token，英文约4字符/token
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
    const otherChars = text.length - chineseChars
    return Math.ceil(chineseChars / 1.5 + otherChars / 4)
  }

  _truncateToTokens(text, maxTokens) {
    // 从开头保留maxTokens估算的字符数
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
    const ratio = chineseChars / Math.max(text.length, 1)
    const charsPerToken = ratio > 0.5 ? 1.5 : 4
    const maxChars = Math.floor(maxTokens * charsPerToken)
    return text.slice(0, maxChars) + '…'
  }
}

export { HybridRetriever, TieredCache, ContextWindowOptimizer }
