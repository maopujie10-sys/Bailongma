# 白龙马 (BaiLongma) 模块说明文档

## 目录结构

```
BaiLongma-main/
├── electron/            # Electron 主进程
│   └── main.cjs         #   窗口管理、托盘、IPC
├── src/                 # 核心源码
│   ├── index.js         #   主循环引擎
│   ├── config.js        #   配置管理
│   ├── db.js            #   数据库访问层
│   ├── llm.js           #   LLM 调用封装
│   ├── prompt.js        #   提示词构建
│   ├── identity.js      #   用户身份
│   ├── queue.js         #   消息队列
│   ├── events.js        #   事件系统
│   ├── time.js          #   时间工具
│   ├── quota.js         #   额度控制
│   ├── ticker.js        #   心跳计时
│   ├── control.js       #   运行控制
│   ├── paths.js         #   路径管理
│   ├── api.js           #   HTTP API
│   ├── tui.js           #   终端 UI
│   ├── services.js      #   服务加载器
│   ├── weather.js       #   天气查询
│   ├── system-info.js   #   系统信息
│   ├── desktop-scanner.js    # 桌面扫描
│   ├── installed-software-scanner.js  # 已装软件扫描
│   ├── local-resources-scanner.js     # 本地资源扫描
│   ├── geo-weather.js   #   地理天气
│   ├── trending.js      #   热门话题
│   │
│   ├── perception/      # 感知模块
│   │   ├── index.js
│   │   ├── screen.js         # 屏幕截图
│   │   ├── clipboard.js      # 剪切板读写 + 键盘模拟
│   │   ├── watcher.js        # 文件监控 + 活动窗口
│   │   ├── system-monitor.js # 系统资源监控
│   │   └── computer-use.js   # 桌面自动化控制
│   │
│   ├── memory/          # 记忆模块
│   │   ├── threads.js        # 对话线程
│   │   ├── thread-summarize.js  # 线程摘要
│   │   ├── thread-classifier.js # 线程分类
│   │   ├── injector.js       # 记忆注入
│   │   ├── recognizer-scheduler.js # 识别调度
│   │   ├── refresh-loop.js   # 刷新循环
│   │   ├── consolidation-loop.js  # 整合循环
│   │   └── seed-skills.js    # 种子技能记忆
│   │
│   ├── context/         # 上下文引擎
│   │   ├── runtime-injector.js    # 运行时注入
│   │   └── section-gate.js        # 上下文分段
│   │
│   ├── agent-army/      # Agent 军团
│   │   ├── bridge.js         # Node↔Python 桥接
│   │   └── bridge_server.py  # Python 服务端
│   │
│   ├── agents/          # Agent 管理
│   │   ├── registry.js       # Agent 注册
│   │   ├── detector.js       # Agent 检测
│   │   └── army-adapter.js   # 军团适配
│   │
│   ├── cron/            # 定时调度
│   │   └── scheduler.js      # Cron 调度器
│   │
│   ├── skills/          # 技能系统
│   │   ├── registry.js       # 技能注册
│   │   ├── curate.js         # 技能策展
│   │   ├── learn.js          # 技能学习
│   │   └── self-evolution.js # 自我进化
│   │
│   ├── capabilities/    # 能力市场
│   │   ├── marketplace/      # 插件市场
│   │   ├── schemas/          # 工具 Schema
│   │   └── tools/            # 工具实现
│   │
│   ├── providers/       # LLM Provider
│   │   ├── registry.js
│   │   ├── base.js
│   │   └── minimax.js
│   │
│   ├── runtime/         # 运行时
│   │   ├── channel.js
│   │   ├── messages.js
│   │   ├── markers.js
│   │   ├── tool-protocol.js
│   │   └── verbatim.js
│   │
│   ├── social/          # 社交网关
│   │   ├── index.js
│   │   ├── dispatch.js
│   │   ├── wechat-clawbot.js
│   │   ├── discord.js
│   │   └── webhooks.js
│   │
│   ├── voice/           # 语音模块
│   │   ├── manager.js
│   │   ├── cloud-asr.js
│   │   ├── tts-providers.js
│   │   └── whisper/     # Whisper 模型
│   │
│   ├── ui/              # UI 模块
│   │   └── brain-ui/    # 脑机界面
│   │
│   ├── acp/             # ACP 协议
│   │   └── router.js
│   │
│   ├── profile/         # 用户画像
│   ├── prompt-blocks/   # 提示词块
│   ├── review/          # 代码审查
│   ├── prefetch/        # 预取
│   ├── curator/         # 策展器
│   └── plugins/         # 插件
│
├── agent-army/          # Python Agent 适配器
│   ├── __init__.py
│   └── adapters/
│       ├── browseruse_adapter.py
│       ├── crewai_adapter.py
│       ├── mem0_adapter.py
│       └── metagpt_adapter.py
│
├── scripts/             # 构建脚本
├── skills/              # Agent Skills
├── build/               # 构建资源（图标等）
├── dist-build/          # 构建产物
│
├── ARCHITECTURE.md      # 架构设计文档
├── MODULES.md           # 本文件
├── API.md               # API 文档
├── DEPLOY.md            # 部署文档
├── SECURITY.md          # 安全策略
├── CONTRIBUTING.md      # 贡献指南
├── SOUL.md              # Agent 身份内核
├── README.md            # 项目说明
└── RELEASE.md           # 发布流程
```

## 核心模块依赖关系

```
index.js (主循环)
  ├── config.js
  ├── db.js
  ├── llm.js → providers/
  ├── prompt.js
  ├── queue.js
  ├── events.js
  ├── memory/          (记忆)
  ├── context/         (上下文)
  ├── perception/      (感知)
  ├── skills/          (技能)
  ├── social/          (社交)
  ├── voice/           (语音)
  ├── agents/          (Agent管理)
  ├── agent-army/      (Agent军团桥接)
  ├── cron/            (定时调度)
  ├── acp/             (ACP协议)
  └── services.js      (统一启动)
```
