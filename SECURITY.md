# 白龙马 (BaiLongma) 安全策略

## 概述

白龙马是一个运行在用户本地机器上的 AI Agent，能够执行文件操作、Shell 命令、桌面控制等。本文档定义了其安全边界和最佳实践。

## 安全原则

### 1. 最小权限

Agent 在用户权限下运行，不请求额外系统权限。所有操作受限于当前用户能做的事。

### 2. 密钥保护

- API Key 存储在本地配置文件中，不上传到任何远程服务器
- 配置文件权限设为仅当前用户可读
- 不在日志中打印完整密钥
- `.env` 文件已加入 `.gitignore`

### 3. 网络隔离

- 所有 LLM API 调用通过 HTTPS
- 支持自定义 API 端点（私有部署）
- 社交网关消息通过官方 SDK/API 发送

### 4. 沙盒执行

- 用户文件操作限制在 sandbox 目录内
- 危险 Shell 命令（`rm -rf /`、`format`）被拦截
- Computer Use 桌面自动化屏蔽危险组合键（关机、锁屏、清空回收站）

## 被屏蔽的操作

### Computer Use 禁止的组合键

| 组合键 | 原因 |
|--------|------|
| `cmd+shift+backspace` | 清空回收站 |
| `cmd+option+backspace` | 强制删除 |
| `cmd+ctrl+q` | 锁屏 |
| `cmd+shift+q` | 登出 |
| `cmd+option+shift+q` | 强制登出 |
| `win+l` | Windows 锁屏 |
| `ctrl+alt+delete` | 安全选项 |
| `alt+f4` | 强制关闭窗口 |

### 文件操作限制

- 不删除用户文档目录外的文件
- 不修改系统关键文件
- 批量删除前需要用户确认

## 数据隐私

### 本地存储

- 所有对话记忆存储在本地 SQLite 数据库
- 用户画像、偏好设置不离开本地
- 截图仅用于实时分析，不持久存储

### 云 API 调用

- 提示词上下文会发送到 LLM Provider
- 敏感信息（密码、Token）在发送前从上下文中移除
- 支持使用本地模型（通过 Ollama / LM Studio）

## 报告漏洞

如发现安全漏洞，请通过 GitHub Issues 报告（标记为 Security）。

## 合规建议

### 企业部署

- 建议通过组策略限制 Agent 的文件访问范围
- 建议配置审计日志
- 可配置仅允许特定 LLM Provider

### 个人使用

- 定期检查 `~/.bailongma/config.json` 中的权限设置
- 不共享 API Key
- 保持软件更新到最新版本
