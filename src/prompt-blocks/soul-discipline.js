// soul-discipline.js — 从可编辑文件动态加载规则，拒绝硬编码
// 加载优先级: 用户数据目录 > 项目根目录 > 内置兜底
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ── 动态加载函数 ─────────────────────────────────────────────
function loadFile(filename, fallback) {
  try {
    // 1. 优先从用户数据目录加载（运行时修改无需重编译）
    const userDir = process.env.BAILONGMA_USER_DIR
    if (userDir) {
      const userPath = path.join(userDir, filename)
      if (fs.existsSync(userPath)) {
        return fs.readFileSync(userPath, 'utf-8').trim()
      }
    }
  } catch {}

  try {
    // 2. 从项目根目录加载（源码级可编辑）
    const projPath = path.resolve(__dirname, '..', '..', filename)
    if (fs.existsSync(projPath)) {
      return fs.readFileSync(projPath, 'utf-8').trim()
    }
  } catch {}

  // 3. 内置兜底（源码删了也不会崩）
  return fallback
}

// ── 动态内容块 ───────────────────────────────────────────────

const DEFAULT_SOUL = `## 你是指挥官，不是兵

你是白龙马，AI 指挥官。你只下命令、派 Agent、汇总结果、向用户汇报。
你绝不自己动手干活。

### 铁律：不自己干活
- 搜代码、读文件 → 派探路者 Agent
- 改代码、修 Bug → 派架构师/后端/前端 Agent
- 编译、部署 → 派运维 Agent
- 测试验证 → 派质检员 Agent
- 汇总规划 → 派军师 Agent

### 铁律：能查的绝不问用户
### 铁律：做完必须汇报（不汇报 = 没做）`

const DEFAULT_CONSTRAINTS = `## 约束层

### 强制暂停
以下情况必须暂停确认：
- 删除数据、覆盖生产文件、清空数据库
- 影响生产环境
- 操作不可撤销
- 用户指令明显矛盾

### 禁止
- 未验证说"已完成/已修复/已部署"
- 编造命令结果、日志、文件内容
- 能查的信息问用户
- 自己动手干活
- 做了不汇报`

export const SOUL_BLOCK = loadFile('SOUL.md', DEFAULT_SOUL)
export const CONSTRAINTS_BLOCK = loadFile('CONSTRAINTS.md', DEFAULT_CONSTRAINTS)

// ── 触发器 ───────────────────────────────────────────────────

const SOUL_TEXT_RE = new RegExp(
  ['(执行|部署|实现|完成|修改|创建|删除|更新|迁移|重启|配置|安装|运行|启动|停止|回滚|备份|恢复)',
   '(任务|计划|规划|方案|步骤|流程|目标|需求)',
   '(服务器|数据库|代码|文件|脚本|接口|API|docker|nginx|mysql|redis|mongo)',
   '(deploy|execute|implement|create|delete|update|migrate|configure|install|run|start|stop)',
   '(报错|出错|错误|坏了|崩了|打不开|不工作|不能用|没反应|不显示|debug|broken|error|bug\\b|fix)',
  ].join('|'), 'i'
)

const CONSTRAINTS_TEXT_RE = new RegExp(
  ['(删除|清空|覆盖|重置|格式化|drop|truncate|rm -rf|清库|清数据)',
   '(生产|线上|prod|production|正式环境|上线)',
   '(第.步|步骤[0-9]|分[0-9]步|阶段[0-9]|phase [0-9]|step [0-9])',
   '(权限|认证|鉴权|token|secret|password|密钥|证书)',
  ].join('|'), 'i'
)

function recentActionsLookLikeExecution(text) {
  const t = String(text || '')
  if (!t) return false
  return ((t.match(/exec_command\(/g) || []).length >= 2 ||
    (/write_file\(/.test(t) && /exec_command\(/.test(t)) ||
    (/read_file\(/.test(t) && /write_file\(/.test(t) && /exec_command\(/.test(t))))
}

export function shouldInjectSoul({ userMessage = '', taskText = '', recentActionsText = '' } = {}) {
  if (SOUL_TEXT_RE.test(String(userMessage))) return true
  if (SOUL_TEXT_RE.test(String(taskText))) return true
  return recentActionsLookLikeExecution(recentActionsText)
}

export function shouldInjectConstraints({ userMessage = '', taskText = '' } = {}) {
  if (CONSTRAINTS_TEXT_RE.test(String(userMessage))) return true
  return CONSTRAINTS_TEXT_RE.test(String(taskText))
}

export const __internal = { SOUL_TEXT_RE, CONSTRAINTS_TEXT_RE, recentActionsLookLikeExecution }
