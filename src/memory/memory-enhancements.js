/**
 * Memory Manager Enhancements — ChromaDB向量存储 + 自动摘要压缩
 * 借鉴 Hermes Agent Memory Manager 设计
 * 
 * 核心能力：
 *   1. ChromaDB向量存储Provider — 语义向量检索
 *   2. 自动摘要压缩 — 长记忆自动压缩为摘要
 *   3. 记忆重要性评分 — 基于使用频率和时效性
 *   4. 多Provider结果融合 — 向量+关键词+全文混合排序
 */

import fs from 'fs'
import path from 'path'
import { paths } from '../paths.js'

// ─── ChromaDB 向量存储 Provider ───
class ChromaDBProvider {
  constructor({ 
    collectionName = 'bailongma_memories',
    persistDir = null,
    embeddingDim = 1536  // OpenAI text-embedding-3-small 维度
  } = {}) {
    this.name = 'chromadb'
    this.collectionName = collectionName
    this.persistDir = persistDir || path.join(paths.sandboxDir, 'chromadb')
    this.embeddingDim = embeddingDim
    this._initialized = false
    this._collection = null
    this._embeddings = new Map() // id → { vector, metadata }
  }

  async _ensureInit() {
    if (this._initialized) return
    fs.mkdirSync(this.persistDir, { recursive: true })
    
    // 尝试加载持久化数据
    const dataPath = path.join(this.persistDir, `${this.collectionName}.json`)
    if (fs.existsSync(dataPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
        for (const [id, entry] of Object.entries(data.embeddings || {})) {
          this._embeddings.set(id, entry)
        }
      } catch (e) { /* ignore */ }
    }
    
    this._initialized = true
  }

  async search(query, limit = 10) {
    await this._ensureInit()
    
    // 简化版向量检索：基于关键词重叠 + TF-IDF近似
    // 生产环境应调用embedding API获取真实向量
    const queryTokens = this._tokenize(query)
    const results = []

    for (const [id, entry] of this._embeddings) {
      const docTokens = this._tokenize(entry.metadata?.content || '')
      const score = this._cosineSimApprox(queryTokens, docTokens)
      if (score > 0) {
        results.push({
          id,
          score,
          content: entry.metadata?.content || '',
          metadata: entry.metadata || {},
          provider: 'chromadb'
        })
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  async add(id, content, metadata = {}) {
    await this._ensureInit()
    
    const tokens = this._tokenize(content)
    // 简化版：用词频向量代替真实embedding
    const vector = this._buildTfVector(tokens)
    
    this._embeddings.set(id, { vector, metadata: { ...metadata, content } })
    await this._persist()
    return { ok: true }
  }

  async delete(id) {
    await this._ensureInit()
    this._embeddings.delete(id)
    await this._persist()
    return { ok: true }
  }

  async getByEntity(entityId, limit = 10) {
    await this._ensureInit()
    const results = []
    for (const [id, entry] of this._embeddings) {
      if (entry.metadata?.entityId === entityId) {
        results.push({
          id,
          content: entry.metadata?.content || '',
          metadata: entry.metadata || {},
          provider: 'chromadb'
        })
      }
    }
    return results.slice(0, limit)
  }

  async getPersonMemory(entityId) {
    const memories = await this.getByEntity(entityId, 50)
    if (!memories.length) return null
    return {
      entityId,
      memoryCount: memories.length,
      recentMemories: memories.slice(0, 10),
      summary: this._summarizeMemories(memories)
    }
  }

  _tokenize(text) {
    return (text || '').toLowerCase()
      .split(/[\s,.;:!?，。；：！？、\n\r]+/)
      .filter(t => t.length > 1)
  }

  _buildTfVector(tokens) {
    const tf = {}
    for (const t of tokens) {
      tf[t] = (tf[t] || 0) + 1
    }
    // 归一化
    const maxFreq = Math.max(...Object.values(tf), 1)
    for (const t in tf) {
      tf[t] /= maxFreq
    }
    return tf
  }

  _cosineSimApprox(queryTokens, docTokens) {
    if (!queryTokens.length || !docTokens.length) return 0
    const docSet = new Set(docTokens)
    let overlap = 0
    for (const t of queryTokens) {
      if (docSet.has(t)) overlap++
    }
    return overlap / Math.sqrt(queryTokens.length * docTokens.length)
  }

  _summarizeMemories(memories) {
    if (!memories.length) return ''
    const contents = memories.map(m => m.content).join(' | ')
    return contents.length > 500 ? contents.slice(0, 500) + '…' : contents
  }

  async _persist() {
    const dataPath = path.join(this.persistDir, `${this.collectionName}.json`)
    const data = {
      collectionName: this.collectionName,
      embeddings: Object.fromEntries(this._embeddings)
    }
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8')
  }
}

// ─── 自动摘要压缩器 ───
class MemoryCompressor {
  constructor({ 
    maxMemoriesBeforeCompress = 100,
    compressToMaxTokens = 500,
    callLLM = null
  } = {}) {
    this.maxMemoriesBeforeCompress = maxMemoriesBeforeCompress
    this.compressToMaxTokens = compressToMaxTokens
    this.callLLM = callLLM
  }

  /**
   * 压缩记忆：将多条相关记忆合并为摘要
   * @param {Array} memories — [{ id, content, timestamp, importance }]
   * @param {string} topic — 压缩主题
   * @returns {Object} { summary, originalIds, compressedAt }
   */
  async compress(memories, topic = 'general') {
    if (memories.length < 3) return null

    const sorted = memories.sort((a, b) => (b.importance || 0) - (a.importance || 0))
    const combined = sorted.map(m => `[${m.timestamp || 'unknown'}] ${m.content}`).join('\n')

    if (this.callLLM) {
      try {
        const result = await this.callLLM({
          systemPrompt: 'You are a memory compression engine. Summarize multiple related memories into a concise, information-dense summary. Preserve key facts, dates, names, and decisions.',
          message: `Compress these memories about "${topic}":\n\n${combined}\n\nOutput a single paragraph summary (max ${this.compressToMaxTokens} tokens).`,
          temperature: 0.2,
        })
        return {
          summary: result.content || combined.slice(0, this.compressToMaxTokens * 4),
          originalIds: memories.map(m => m.id),
          originalCount: memories.length,
          compressedAt: new Date().toISOString(),
          topic
        }
      } catch (e) {
        // LLM不可用时回退到简单截断
      }
    }

    // 回退：取最重要的几条拼接
    const topContent = sorted.slice(0, 5).map(m => m.content).join(' | ')
    return {
      summary: topContent.slice(0, this.compressToMaxTokens * 4),
      originalIds: memories.map(m => m.id),
      originalCount: memories.length,
      compressedAt: new Date().toISOString(),
      topic
    }
  }

  /**
   * 判断是否需要压缩
   */
  shouldCompress(memoryCount, topic) {
    return memoryCount >= this.maxMemoriesBeforeCompress
  }
}

// ─── 记忆重要性评分器 ───
class MemoryImportanceScorer {
  constructor({ 
    recencyWeight = 0.3,
    frequencyWeight = 0.3,
    salienceWeight = 0.4,
    decayHalfLifeDays = 7
  } = {}) {
    this.recencyWeight = recencyWeight
    this.frequencyWeight = frequencyWeight
    this.salienceWeight = salienceWeight
    this.decayHalfLifeDays = decayHalfLifeDays
  }

  score(memory, { accessCount = 0, lastAccessed = null, now = Date.now() } = {}) {
    const recency = this._recencyScore(memory.timestamp || now, now)
    const frequency = Math.min(accessCount / 10, 1) // 最多10次满分
    const salience = memory.salience || 0.5

    return (
      recency * this.recencyWeight +
      frequency * this.frequencyWeight +
      salience * this.salienceWeight
    )
  }

  _recencyScore(timestamp, now) {
    const ageDays = (now - new Date(timestamp).getTime()) / 86400000
    return Math.pow(2, -ageDays / this.decayHalfLifeDays)
  }
}

// ─── 多Provider结果融合器 ───
class ProviderFusion {
  constructor({ dedupThreshold = 0.8 } = {}) {
    this.dedupThreshold = dedupThreshold
  }

  /**
   * 融合多个Provider的检索结果
   * @param {Array} providerResults — [[{ id, score, content }], ...]
   * @returns {Array} 去重融合后的结果
   */
  fuse(providerResults, { limit = 20 } = {}) {
    const allResults = providerResults.flat()
    
    // 去重：相似度高的结果合并
    const fused = []
    const used = new Set()

    for (const result of allResults.sort((a, b) => (b.score || 0) - (a.score || 0))) {
      if (used.has(result.id)) continue
      
      // 检查是否与已有结果高度相似
      let isDuplicate = false
      for (const existing of fused) {
        if (this._contentSimilarity(result.content, existing.content) > this.dedupThreshold) {
          isDuplicate = true
          // 保留分数更高的
          if ((result.score || 0) > (existing.score || 0)) {
            Object.assign(existing, result)
          }
          break
        }
      }

      if (!isDuplicate) {
        fused.push(result)
        used.add(result.id)
      }
    }

    return fused.slice(0, limit)
  }

  _contentSimilarity(a, b) {
    if (!a || !b) return 0
    const tokensA = new Set((a || '').toLowerCase().split(/\s+/))
    const tokensB = new Set((b || '').toLowerCase().split(/\s+/))
    const intersection = [...tokensA].filter(t => tokensB.has(t)).length
    const union = new Set([...tokensA, ...tokensB]).size
    return union > 0 ? intersection / union : 0
  }
}

export { 
  ChromaDBProvider, 
  MemoryCompressor, 
  MemoryImportanceScorer, 
  ProviderFusion 
}
