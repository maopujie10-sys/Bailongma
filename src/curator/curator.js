/**
 * Curator 策划器 — 任务意图理解与拆解
 * 
 * 职责：
 *   1. 理解用户真实意图（不只是字面意思）
 *   2. 拆解复杂任务为可执行步骤
 *   3. 判断哪些步骤可并行、哪些有依赖
 *   4. 评估风险等级和影响范围
 *   5. 产出结构化的执行计划
 * 
 * 与爱马仕 Curator 对齐：
 *   - 爱马仕 Curator 是完整的任务规划引擎
 *   - 白龙马实现核心子集：意图识别 + 任务拆解 + 风险评估
 */

/**
 * 意图分析结果
 * @typedef {Object} IntentAnalysis
 * @property {string} primaryGoal - 主要目标
 * @property {string[]} subGoals - 子目标列表
 * @property {string} riskLevel - low | medium | high
 * @property {string[]} constraints - 约束条件
 * @property {string[]} unknowns - 未知信息
 */

/**
 * 任务步骤
 * @typedef {Object} TaskStep
 * @property {string} id - 步骤ID
 * @property {string} description - 步骤描述
 * @property {string[]} dependsOn - 依赖的步骤ID
 * @property {string} status - pending | running | done | blocked
 * @property {string} riskLevel - low | medium | high
 */

/**
 * 执行计划
 * @typedef {Object} ExecutionPlan
 * @property {string} goal - 最终目标
 * @property {IntentAnalysis} intent - 意图分析
 * @property {TaskStep[]} steps - 步骤列表
 * @property {string} estimatedComplexity - simple | medium | complex
 */

/**
 * 分析用户意图
 * @param {string} userMessage - 用户消息
 * @param {object} context - 上下文（对话历史、记忆等）
 * @returns {IntentAnalysis}
 */
export function analyzeIntent(userMessage, context = {}) {
  const msg = userMessage.toLowerCase()
  
  // 识别操作类型
  const patterns = {
    create: /创建|新建|生成|写|建|做|弄|加|添加|增加/,
    fix: /修|改|修复|修好|解决|处理|搞定/,
    query: /查|看|找|搜|什么|怎么|如何|为什么|哪里|哪个|多少/,
    deploy: /部署|发布|上线|推送|push|deploy|构建|build|打包|编译/,
    delete: /删|移除|去掉|清除|清理/,
    update: /更新|升级|更新到|升到/,
    test: /测试|验证|检查|确认|试/,
  }
  
  const operations = Object.entries(patterns)
    .filter(([, re]) => re.test(msg))
    .map(([op]) => op)
  
  // 识别风险等级
  let riskLevel = 'low'
  if (/删|移除|清空|覆盖|生产|线上|部署|push|数据库/.test(msg)) {
    riskLevel = 'high'
  } else if (/修改|改|重构|迁移|更新/.test(msg)) {
    riskLevel = 'medium'
  }
  
  // 识别约束
  const constraints = []
  if (/不要|别|不能|禁止|避免/.test(msg)) {
    constraints.push('has_negative_constraints')
  }
  if (/全部|所有|每个|都/.test(msg)) {
    constraints.push('scope_all')
  }
  if (/只|仅|就/.test(msg)) {
    constraints.push('scope_limited')
  }
  
  return {
    primaryGoal: userMessage.slice(0, 100),
    subGoals: [],
    riskLevel,
    constraints,
    unknowns: [],
    operations,
  }
}

/**
 * 拆解任务为步骤
 * @param {IntentAnalysis} intent - 意图分析结果
 * @param {object} context - 上下文
 * @returns {TaskStep[]}
 */
export function decomposeTask(intent, context = {}) {
  const steps = []
  const ops = intent.operations || []
  
  // 通用步骤模板
  if (ops.includes('create') || ops.includes('deploy')) {
    steps.push(
      { id: 'check_env', description: '检查环境和依赖', dependsOn: [], status: 'pending', riskLevel: 'low' },
      { id: 'prepare', description: '准备所需资源和配置', dependsOn: ['check_env'], status: 'pending', riskLevel: 'low' },
      { id: 'execute', description: '执行核心操作', dependsOn: ['prepare'], status: 'pending', riskLevel: intent.riskLevel },
      { id: 'verify', description: '验证结果', dependsOn: ['execute'], status: 'pending', riskLevel: 'low' },
    )
  } else if (ops.includes('fix')) {
    steps.push(
      { id: 'diagnose', description: '诊断问题根因', dependsOn: [], status: 'pending', riskLevel: 'low' },
      { id: 'plan_fix', description: '制定修复方案', dependsOn: ['diagnose'], status: 'pending', riskLevel: 'medium' },
      { id: 'apply_fix', description: '执行修复', dependsOn: ['plan_fix'], status: 'pending', riskLevel: intent.riskLevel },
      { id: 'verify_fix', description: '验证修复效果', dependsOn: ['apply_fix'], status: 'pending', riskLevel: 'low' },
    )
  } else if (ops.includes('query')) {
    steps.push(
      { id: 'gather', description: '收集相关信息', dependsOn: [], status: 'pending', riskLevel: 'low' },
      { id: 'analyze', description: '分析整理结果', dependsOn: ['gather'], status: 'pending', riskLevel: 'low' },
    )
  } else {
    // 默认：单步执行
    steps.push(
      { id: 'execute', description: intent.primaryGoal, dependsOn: [], status: 'pending', riskLevel: intent.riskLevel },
    )
  }
  
  return steps
}

/**
 * 生成完整执行计划
 * @param {string} userMessage - 用户消息
 * @param {object} context - 上下文
 * @returns {ExecutionPlan}
 */
export function createPlan(userMessage, context = {}) {
  const intent = analyzeIntent(userMessage, context)
  const steps = decomposeTask(intent, context)
  
  const complexity = steps.length <= 2 ? 'simple' : steps.length <= 4 ? 'medium' : 'complex'
  
  return {
    goal: intent.primaryGoal,
    intent,
    steps,
    estimatedComplexity: complexity,
  }
}

/**
 * 判断两个步骤是否可以并行
 */
export function canParallelize(stepA, stepB) {
  return !stepA.dependsOn.includes(stepB.id) && !stepB.dependsOn.includes(stepA.id)
}

/**
 * 获取下一步可执行的步骤
 */
export function getNextSteps(plan) {
  const done = new Set(plan.steps.filter(s => s.status === 'done').map(s => s.id))
  return plan.steps.filter(s => 
    s.status === 'pending' && 
    s.dependsOn.every(dep => done.has(dep))
  )
}
