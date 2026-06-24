/**
 * SQLiteMemoryProvider — 默认记忆后端，包装 db.js 的现有逻辑
 *
 * 实现 MemoryProvider 接口：
 *   search(query, limit) → Array<{ content, detail, ... }>
 *   getByEntity(entityId, limit) → Array
 *   getPersonMemory(entityId) → Object|null
 */

import {
  searchMemories,
  getMemoriesByEntity,
  getPersonMemory,
} from '../../db.js'
import { registerMemoryProvider } from '../provider-registry.js'

class SQLiteMemoryProvider {
  constructor() {
    this.name = 'sqlite'
  }

  async search(query, limit = 10) {
    return searchMemories(query, limit)
  }

  async getByEntity(entityId, limit = 10) {
    return getMemoriesByEntity(entityId, limit)
  }

  async getPersonMemory(entityId) {
    return getPersonMemory(entityId)
  }
}

// 自动注册默认 Provider
registerMemoryProvider('sqlite', new SQLiteMemoryProvider())

export { SQLiteMemoryProvider }
