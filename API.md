# 白龙马 (BaiLongma) API 文档

## 内部 API

白龙马通过 `src/api.js` 提供 HTTP API 服务，供前端 brain-ui 和其他客户端调用。

### 启动

```javascript
import { startAPI } from './api.js';
const server = startAPI({ port: 0 }); // 0 = 自动分配端口
```

### 端点

#### POST /api/message

发送消息给 Agent。

**请求：**
```json
{
  "text": "你好，今天天气怎么样？",
  "user": "user-001",
  "channel": "brain-ui"
}
```

**响应：**
```json
{
  "status": "queued",
  "messageId": "msg_xxx"
}
```

#### GET /api/status

获取 Agent 运行状态。

**响应：**
```json
{
  "running": true,
  "uptime": 3600,
  "memoryCount": 150,
  "queueSize": 2,
  "processing": false,
  "systemMonitor": {
    "cpu": 23.5,
    "memory": 45.2,
    "disk": 67.8
  }
}
```

#### GET /api/events (SSE)

Server-Sent Events 流，实时推送 Agent 事件。

**事件类型：**
- `message` — 新消息
- `turn:start` — 对话轮次开始
- `turn:end` — 对话轮次结束
- `tool:call` — 工具调用
- `tool:result` — 工具结果
- `status` — 状态更新
- `alert` — 告警

#### GET /api/memories

获取记忆列表。

**参数：**
- `limit` (默认 50)
- `offset` (默认 0)
- `search` 搜索关键词

#### GET /api/threads

获取对话线程列表。

#### POST /api/skills/reload

重新加载 Skills。

---

## Agent Army Python Bridge API

Node.js ↔ Python JSON-RPC 桥接协议（通过 `bridge.js` / `bridge_server.py`）。

### 协议

每行一个 JSON，stdio 通信。

**请求：**
```json
{"id": "1", "method": "method_name", "params": {}}
```

**响应：**
```json
{"id": "1", "result": {}}
```

### 方法

| 方法 | 参数 | 说明 |
|------|------|------|
| `get_status` | - | 获取所有 adapter 状态 |
| `initialize_all` | `{llmConfig}` | 初始化所有 adapter |
| `browser_use` | `{task, llmModel, maxSteps}` | 执行网页自动化任务 |
| `crewai_create_agent` | `{name, role, goal, backstory, tools, llm}` | 创建 CrewAI Agent |
| `crewai_create_task` | `{name, description, agentName, expectedOutput}` | 创建 CrewAI 任务 |
| `crewai_form_and_run` | `{agentNames, taskNames, process}` | 组队执行 |
| `mem0_add` | `{messages, userId, metadata}` | 添加记忆 |
| `mem0_search` | `{query, userId, limit}` | 搜索记忆 |
| `metagpt_start_company` | `{idea, investment, nRound}` | 启动 MetaGPT 公司 |
| `shutdown` | - | 关闭桥接 |

## Perception API

### ClipboardWatcher

```javascript
import { ClipboardWatcher } from './perception/index.js';

// 写入剪切板
ClipboardWatcher.setText('Hello World');

// 读取剪切板
const text = ClipboardWatcher.getText();

// 键盘模拟
ClipboardWatcher.copy();      // Ctrl+C
ClipboardWatcher.paste();     // Ctrl+V
ClipboardWatcher.selectAll(); // Ctrl+A
ClipboardWatcher.cut();       // Ctrl+X

// 全选并复制当前焦点窗口内容
const selected = ClipboardWatcher.copyAllText();
```

### ComputerUse

```javascript
import { computerUse } from './perception/index.js';

// 截图
const { data } = await computerUse.capture(); // base64 PNG

// 鼠标操作
await computerUse.click(100, 200);           // 左键点击
await computerUse.doubleClick(100, 200);     // 双击
await computerUse.drag(100, 100, 300, 300); // 拖拽
await computerUse.scroll('down', 3);         // 滚轮

// 键盘操作
await computerUse.type('Hello World');       // 输入文本
await computerUse.key('ctrl+c');             // 组合键

// 窗口管理
const windows = await computerUse.listApps();
await computerUse.focusApp('Chrome');

// 大段文字粘贴
await computerUse.pasteText('长文本...');
```

### SystemMonitor

```javascript
import { systemMonitor } from './perception/index.js';

systemMonitor.start();
systemMonitor.on('alert', ({ type, value, threshold }) => {
  console.warn(`[Alert] ${type} at ${value}%`);
});

const snapshot = systemMonitor.formatForContext();
// → "CPU: 23% | Memory: 4.2/16GB | Disk: 67%"
```

## Cron API

```javascript
import { cronScheduler, CRON_PRESETS } from './cron/scheduler.js';

// 启动
cronScheduler.start();

// 添加每日任务
cronScheduler.addJob({
  id: 'morning-report',
  name: '晨间日报',
  mode: 'recurring',
  cronExpr: CRON_PRESETS.dailyMorning,
  callback: async (job) => {
    // 执行逻辑
    return 'Morning report generated';
  }
});

// 添加一次性任务
cronScheduler.addJob({
  id: 'remind-001',
  name: '提醒喝水',
  mode: 'oneshot',
  scheduledAt: new Date(Date.now() + 3600000).toISOString(),
  callback: async () => 'Time to drink water!'
});

// 管理任务
cronScheduler.pauseJob('morning-report');
cronScheduler.resumeJob('morning-report');
cronScheduler.removeJob('remind-001');

// 查看状态
const jobs = cronScheduler.listJobs();
```
