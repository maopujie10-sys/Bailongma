# 白龙马 (BaiLongma) 架构设计文档

## 概述

白龙马 v2.4.3 是一个基于 Electron 的持续运行数字意识框架。它整合了 Hermes Agent 的核心架构思想，构建了一个具备感知、记忆、自我进化、多 Agent 协作能力的自主 AI 代理。

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Electron 33 + Node.js |
| 核心引擎 | Node.js ESM |
| 数据存储 | SQLite (better-sqlite3) |
| AI 模型 | Minimax / OpenAI / DeepSeek 多 Provider |
| 语音 | Whisper (ASR) + 多 TTS Provider |
| 前端 UI | Vanilla JS + ACUI 组件系统 |
| Python 桥接 | JSON-RPC stdio (Agent Army) |

## 系统架构

```
┌──────────────────────────────────────────────────┐
│                  Electron Shell                    │
│  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  main.cjs     │  │  Renderer (brain-ui)      │  │
│  │  (主进程)      │  │  - ACUI 组件              │  │
│  │  - 托盘管理    │  │  - 聊天界面              │  │
│  │  - 窗口管理    │  │  - 焦点横幅              │  │
│  └──────┬───────┘  └──────────────────────────┘  │
└─────────┼────────────────────────────────────────┘
          │ IPC
┌─────────▼────────────────────────────────────────┐
│                 src/index.js                       │
│              (核心主循环引擎)                        │
│                                                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ 感知模块  │ │ 记忆模块  │ │  上下文引擎       │  │
│  │perception │ │ memory   │ │  context          │  │
│  └──────────┘ └──────────┘ └──────────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Agent军团 │ │ 定时调度  │ │  服务加载器       │  │
│  │agent-army│ │ cron     │ │  services          │  │
│  └──────────┘ └──────────┘ └──────────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Skill系统 │ │ 语音模块  │ │  社交网关         │  │
│  │ skills   │ │ voice    │ │  social           │  │
│  └──────────┘ └──────────┘ └──────────────────┘  │
└──────────────────────────────────────────────────┘
```

## 模块说明

### 核心模块 (src/)

| 模块 | 路径 | 职责 |
|------|------|------|
| **主循环** | `src/index.js` | 核心执行循环、消息队列、LLM 调用编排 |
| **配置** | `src/config.js` | 全局配置管理 |
| **数据库** | `src/db.js` | SQLite 统一数据访问层 |
| **LLM** | `src/llm.js` | LLM 调用抽象 |
| **提示词** | `src/prompt.js` | 系统提示词构建 |
| **身份** | `src/identity.js` | 用户身份管理 |
| **队列** | `src/queue.js` | 消息队列 |
| **事件** | `src/events.js` | 事件发射器 |
| **时间** | `src/time.js` | 时间格式化工具 |
| **额度** | `src/quota.js` | API 调用额度控制 |
| **API** | `src/api.js` | HTTP API 服务 |

### 感知模块 (src/perception/)

| 文件 | 功能 |
|------|------|
| `screen.js` | 屏幕截图 |
| `clipboard.js` | 剪切板读写 + 键盘模拟 |
| `watcher.js` | 文件监控 + 活动窗口检测 |
| `system-monitor.js` | CPU/内存/磁盘/网络/进程监控 |
| `computer-use.js` | 桌面自动化（鼠标/键盘/截图/窗口管理） |

### 记忆模块 (src/memory/)

| 文件 | 功能 |
|------|------|
| `threads.js` | 对话线程管理 |
| `thread-summarize.js` | 线程摘要 |
| `thread-classifier.js` | 线程归属分类 |
| `injector.js` | 记忆注入到提示词 |
| `recognizer-scheduler.js` | 记忆识别调度 |
| `refresh-loop.js` | 记忆刷新循环 |
| `consolidation-loop.js` | 记忆整合循环 |

### Agent Army (src/agent-army/)

| 文件 | 功能 |
|------|------|
| `bridge.js` | Node ↔ Python JSON-RPC 桥接 |
| `bridge_server.py` | Python 端服务 |

### Cron 调度 (src/cron/)

| 文件 | 功能 |
|------|------|
| `scheduler.js` | Cron 表达式调度器、任务管理 |

### 服务加载 (src/services.js)

统一启动所有子系统：系统监控、ACP、Agent Army、插件市场、Cron

## 数据流

```
用户输入 → queue.js → index.js (主循环)
  → prompt.js (构建提示词)
  → memory/injector.js (注入记忆)
  → context/ (上下文引擎)
  → llm.js (调用 AI)
  → 响应处理
    → 普通回复 → events.js → UI
    → 工具调用 → tool-protocol.js → 执行 → 结果注入
    → 自进化 → skills/self-evolution.js
    → 记忆更新 → memory/
```

## Python 桥接层

`agent-army/` 目录包含 Python 适配器：
- `browseruse_adapter.py` — 网页自动化
- `crewai_adapter.py` — 多 Agent 协作
- `mem0_adapter.py` — 记忆管理
- `metagpt_adapter.py` — 软件开发团队

通过 `bridge.js` (Node) ↔ `bridge_server.py` (Python) 实现 JSON-RPC stdio 通信。
