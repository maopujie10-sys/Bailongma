# Claude Code 架构精华 — 白龙马进化参考

> 从 claude-code-best 2.8.1 源码逆向分析提炼

## 1. 核心架构

### Agent 主循环 (query.ts + QueryEngine.ts)
```
用户输入 → normalizeMessages → prependUserContext
  → API调用(streaming) → ToolUse检测
    → 权限检查(hooks/useCanUseTool) → Tool执行
      → ToolResult → 注入上下文 → 下一轮
        → autoCompact(自动压缩) → 继续/结束
```

### 核心类结构
- **Tool** (30.7KB) — 统一工具抽象：schema定义、权限检查、执行、结果存储
- **QueryEngine** (49.3KB) — 查询引擎：管理对话轮次、tool调用循环、上下文窗口
- **AppState** (55.8KB) — 全局状态管理：会话、配置、主题、权限模式

## 2. Tool 系统架构

### Tool 生命周期
```
define → register → checkPermission → validateArgs
  → execute(streaming progress) → storeResult → return
```

### 权限模式
- `default` — 每次询问
- `acceptEdits` — 自动批准文件编辑
- `bypassPermissions` — 完全自主
- `plan` — 只读模式

### Tool 分类
| 类别 | 工具 |
|------|------|
| 文件 | Read/Write/Edit/Glob/Grep |
| Shell | Bash(Bg)/Powershell |
| Agent | Task/Agent/Skill/Buddy |
| 外部 | MCP/WebSearch/ComputerUse/ChromeUse |
| 记忆 | extractMemories/promptSuggestion |
| 工作流 | Workflow/Goal/Ultracode |

## 3. Skills 系统

### 加载机制 (loadSkillsDir.ts 34.5KB)
```
skills/
  bundled/          ← 内置 Skills (verify, ultracode, debug, skillify...)
  用户目录/         ← 自定义 Skills
  MCP Skills        ← 从 MCP 服务器动态加载
```

### Skill 结构
```typescript
{
  name: string,           // kebab-case id
  description: string,    // 触发描述
  body: string,           // Markdown 指令
  triggers?: string[],    // 触发词
  tools?: string[],       // 需要的工具
  model?: string,         // 指定模型
}
```

### 关键 Skills (bundled/)
| Skill | 功能 |
|-------|------|
| verify | 验证代码正确性 |
| ultracode | 多 Agent 工作流编排 |
| debug | 系统化调试 |
| skillify | 从对话中提取新 Skill |
| remember | 记忆管理 |
| dream | 记忆整理优化 |
| simplify | 代码简化 |
| stuck | 卡住时求助 |

## 4. 记忆系统

### SessionMemory 架构
```
extractMemories → SessionMemory(multiStore)
  → MEMORY.md + skills/references/
    → promptSuggestion(注入上下文)
      → autoDream(定期整理)
```

### 记忆层次
1. **会话记忆** — 当前对话上下文
2. **项目记忆** — CLAUDE.md / MEMORY.md
3. **全局记忆** — 用户偏好、长期知识
4. **Skills** — 可复用工作流

## 5. Goal 驱动系统

### Goal 循环
```
/goal <objective> → goalState(持久化)
  → 每轮注入 goal context
    → 检测 completion/blocked
      → 自动跨轮驱动直到完成
```

### Goal 状态
- `active` — 正在执行
- `paused` — 网络中断/用户暂停
- `completed` — 目标达成
- `blocked` — 三次同一阻塞后标记

## 6. 多 Agent 协作

### Agent 类型
- **LocalAgent** — 同进程子 Agent
- **RemoteAgent** — 跨机器 Agent (Pipe IPC)
- **Teammate** — 协作 Agent (共享上下文)
- **Swarm** — Agent 集群

### Ultracode 工作流
```javascript
// 声明式工作流脚本
phase("setup", () => { agent("init", task1) })
parallel(() => {
  agent("worker1", task2)
  agent("worker2", task3)
})
phase("review", () => { agent("reviewer", task4) })
```

## 7. 白龙马可借鉴的核心模式

### 立即可移植
1. **Tool 权限分层** — default/acceptEdits/bypass/plan
2. **Skill 自动提取** — skillify: 从对话中自动生成新 Skill
3. **Goal 持续驱动** — 跨轮目标追踪
4. **autoDream** — 定期记忆整理
5. **Stuck 检测** — Agent 卡住时自动求助

### 需要适配
1. **Pipe IPC** — 多实例协作（已有 Agent Army 基础）
2. **Ultracode** — 工作流编排（白龙马有 workflow-engine）
3. **LSP 集成** — 代码智能（白龙马缺失）
4. **远程控制** — Docker 自托管界面

## 8. 技术亮点

### 性能优化
- 启动并行预取 (MDM, Keychain, FastMode)
- 流式 Tool 结果渲染
- 自动上下文压缩 (autoCompact)
- 被动压缩 (reactiveCompact)
- 图片优化 (resize/compress)

### 安全设计
- Hook 系统 (preToolUse/postToolUse/stop)
- 权限拒绝追踪 (denialTracking)
- 工具护栏 (tool guardrails)
- 沙盒执行 (Bash sandbox)
- 密钥安全存储 (localVault)
