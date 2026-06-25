# 白龙马 (BaiLongma) 部署运维文档

## 开发环境

### 前置要求

- Node.js ≥ 18
- Python ≥ 3.11 (Agent Army 桥接)
- Windows 10+ / macOS 12+ / Linux
- Git

### 安装

```powershell
cd D:\Projects\AI项目\BaiLongma-main
npm install
```

### 开发启动

```powershell
# Electron 桌面应用
npm start

# 仅后端（无 GUI）
npm run start:backend

# 开发模式（热重载）
npm run dev

# LAN 模式
npm run start:lan
```

### 构建

```powershell
# Windows 构建
npm run build:win

# macOS 构建
npm run build:mac

# 发布到 GitHub Releases
$env:GH_TOKEN = "ghp_your_token"
npm run publish
```

构建产物：
- `dist\Bailongma Setup 2.5.0.exe`
- `dist\latest.yml`

## 配置文件

### .env

```env
# AI Provider
MINIMAX_API_KEY=your_key_here
MINIMAX_GROUP_ID=your_group_id

# 可选
OPENAI_API_KEY=
DEEPSEEK_API_KEY=
ANTHROPIC_API_KEY=

# 社交平台
WECHAT_ILINK_TOKEN=
DISCORD_BOT_TOKEN=

# 语音
ELEVENLABS_API_KEY=

# 路径
BAILONGMA_DATA_DIR=D:\bailongma-data
```

### 数据目录

默认数据目录：`%APPDATA%\Bailongma` (Windows)

```
%APPDATA%\Bailongma\
├── config.json        # 配置
├── bailongma.db       # SQLite 数据库
├── logs\              # 日志
├── sandbox\           # 用户沙盒
├── captures\          # 截图
├── cron-data\         # Cron 任务数据
│   ├── jobs.json
│   └── output\
├── skills\            # Agent Skills
└── plugins\           # 插件
```

## 生产部署

### Windows 安装

1. 运行 `Bailongma Setup 2.5.0.exe`
2. 首次启动进入激活页面
3. 输入 API Key 完成激活
4. 应用常驻系统托盘

### 自动更新

应用启动时自动检查 GitHub Releases 更新。

### 卸载

通过 Windows "添加/删除程序" 卸载，会自动清理 `%APPDATA%\Bailongma`。

## 健康检查

### 系统监控

```javascript
import { systemMonitor } from './src/perception/index.js';
systemMonitor.start();

// 阈值告警
const THRESHOLDS = {
  cpu: 90,
  memory: 85,
  disk: 90,
};
```

### 日志

日志位置：`%APPDATA%\Bailongma\logs\`

## 常见问题

### 编译失败

```powershell
# 重新编译 better-sqlite3
npm run postinstall
```

### Agent Army 桥接失败

确保 Python 3.11+ 和所需包已安装：
```bash
pip install browser-use crewai mem0 metagpt
```

### 剪切板/键盘模拟不工作

Windows：需要 PowerShell 5.1+，且 Allow scripts  
macOS：需要在 系统设置 → 隐私与安全性 → 辅助功能 中授权终端  
Linux：需要安装 `xdotool` 和 `xclip`
