/**
 * Cost Saver — 自动模型路由 + 成本节省引擎
 *
 * 借鉴 Hermes Agent 的成本路由策略：根据消息复杂度自动选择低成本模型，
 * 对简单查询（<50 字、无代码/技术关键词）走便宜模型 deepseek-chat。
 *
 * 原则：
 * - 所有操作 try/catch 保护，失败不影响主流程
 * - console.log 关键决策
 * - 不引入新依赖
 * - 默认开启
 */

// ── 内部状态 ────────────────────────────────────────────────────────────────

let enabled = true

/** 简易模型 ID（便宜），deepseek-chat 已被 deprecated 但功能完好，适合简单问答 */
const CHEAP_MODEL = 'deepseek-chat'

/** 成本预估：deepseek-chat ~0.5 元/百万 token，deepseek-v4-pro 和 deepseek-v4-flash ~2 元/百万 token */
const COST_PER_TOKEN_CHEAP = 0.0000005   // 0.5元/百万
const COST_PER_TOKEN_EXPENSIVE = 0.000002 // 2元/百万

/** 简单查询最大字符数 */
const SIMPLE_MAX_CHARS = 50

/**
 * 需要走复杂模型的代码/技术关键词。
 * 命中任一即判为 complex。
 */
const COMPLEX_KEYWORDS = [
  // 代码相关
  'def ', 'function', 'class ', 'import ', 'export ',
  '```', '`', 'const ', 'let ', 'var ',
  'if ', 'for ', 'while ', 'switch ',
  // 技术/故障排查
  'bug', '报错', 'error', 'exception',
  '修复', 'fix', '重构', 'refactor',
  '架构', 'arch', '设计模式',
  '配置', 'config', '性能', 'performance',
  '优化', 'optimize', '部署', 'deploy',
  // 文件/系统操作
  '文件', '路径', '目录', '命令',
  'file', 'path', 'command',
  // 工具调用
  'send_message', 'write_file', 'read_file', 'exec_command',
  'web_search', 'fetch_url',
  // 数据/网络
  '获取', '查询', '搜索', 'search',
  '爬取', '下载', 'download',
]

/**
 * 分类消息复杂度
 *
 * @param {string} message 用户消息
 * @returns {'simple'|'normal'|'complex'}
 */
export function classifyComplexity(message) {
  try {
    const text = String(message || '').trim()
    if (!text) return 'normal'

    // complex：包含代码块或技术/架构关键词
    const lower = text.toLowerCase()
    for (const keyword of COMPLEX_KEYWORDS) {
      if (lower.includes(keyword.toLowerCase())) {
        console.log(`[CostSaver] hit complexity keyword: "${keyword}"`)
        return 'complex'
      }
    }

    // simple：<50 字且无代码关键词
    if (text.length <= SIMPLE_MAX_CHARS) {
      return 'simple'
    }

    // normal：其他
    return 'normal'
  } catch (err) {
    console.warn('[CostSaver] classifyComplexity 出错:', err.message)
    return 'normal'
  }
}

/**
 * 根据复杂度选择模型
 *
 * @param {'simple'|'normal'|'complex'} complexity
 * @returns {string} modelId
 */
export function selectModel(complexity) {
  try {
    if (complexity === 'simple') {
      console.log(`[CostSaver] simple → ${CHEAP_MODEL}`)
      return CHEAP_MODEL
    }
    // normal/complex 返回 null 表示使用当前主模型（由调用方决定）
    console.log(`[CostSaver] ${complexity} → 主模型`)
    return null
  } catch (err) {
    console.warn('[CostSaver] selectModel 出错:', err.message)
    return null
  }
}

/**
 * 查询 cost-saver 是否启用
 *
 * @returns {boolean}
 */
export function isEnabled() {
  return enabled
}

/**
 * 启用或停用 cost-saver
 *
 * @param {boolean} flag
 */
export function setEnabled(flag) {
  enabled = !!flag
  console.log(`[CostSaver] ${enabled ? '已启用' : '已停用'}`)
}

// ── 节省统计 ─────────────────────────────────────────────────────────────────

const stats = {
  totalCalls: 0,
  simpleRouted: 0,
}

/**
 * 记录一次 LLM 调用（被路由时调用）
 *
 * @param {object} opts
 * @param {boolean} opts.routedToCheap 是否被路由到了便宜模型
 * @param {number} opts.tokens 本次调用消耗的 token 数
 */
export function recordCall({ routedToCheap = false, tokens = 0 } = {}) {
  try {
    stats.totalCalls += 1
    if (routedToCheap) stats.simpleRouted += 1
  } catch (err) {
    console.warn('[CostSaver] recordCall 出错:', err.message)
  }
}

/**
 * 获取成本节省报告
 *
 * @returns {{ totalCalls: number, simpleRouted: number, estimatedSavingsYuan: number }}
 */
export function getSavingsReport() {
  try {
    const avgTokensPerCall = 500 // 保守估计每次简单查询 ~500 tokens
    const cheapCost = stats.simpleRouted * avgTokensPerCall * COST_PER_TOKEN_CHEAP
    const expensiveCost = stats.simpleRouted * avgTokensPerCall * COST_PER_TOKEN_EXPENSIVE
    const estimatedSavingsYuan = Math.max(0, expensiveCost - cheapCost)

    return {
      totalCalls: stats.totalCalls,
      simpleRouted: stats.simpleRouted,
      estimatedSavingsYuan: Math.round(estimatedSavingsYuan * 100) / 100,
    }
  } catch (err) {
    console.warn('[CostSaver] getSavingsReport 出错:', err.message)
    return { totalCalls: 0, simpleRouted: 0, estimatedSavingsYuan: 0 }
  }
}
