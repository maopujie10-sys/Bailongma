# 白龙马 (BaiLongma) 贡献指南

欢迎为白龙马贡献代码！

## 开发环境搭建

### 1. 克隆项目

```bash
git clone https://github.com/xiaoyuanda666/bailongma.git
cd bailongma
```

### 2. 安装依赖

```powershell
npm install
```

### 3. 启动开发模式

```powershell
npm run dev
```

## 项目架构

详见 [ARCHITECTURE.md](./ARCHITECTURE.md) 和 [MODULES.md](./MODULES.md)。

## 代码规范

### JavaScript/Node.js

- 使用 ES Module (`import`/`export`)
- 文件编码：UTF-8
- 缩进：2 空格
- 字符串：单引号优先
- 分号：不强制，但保持一致性
- 命名：
  - 文件名：kebab-case (如 `system-monitor.js`)
  - 函数/变量：camelCase
  - 类：PascalCase
  - 常量：UPPER_SNAKE_CASE

### Python

- 遵循 PEP 8
- 类型注解鼓励使用
- 文件编码：UTF-8

### 注释

- 中文注释：用于业务逻辑说明
- 英文注释：用于技术细节
- 每个模块顶部应有 JSDoc 注释说明用途

## 提交规范

使用 Conventional Commits：

```
feat: 添加 Computer Use 桌面控制模块
fix: 修复 SOUL.md 乱码问题
refactor: 重构记忆模块
docs: 添加架构设计文档
test: 添加 Cron 调度器测试
chore: 更新依赖版本
```

## 测试

```powershell
# 运行特定测试
npm run test:rule-context
npm run test:section-gate
npm run test:agent-skills

# 冒烟测试
npm run smoke:tools
npm run smoke:brain-ui
npm run smoke:social
```

### 添加新模块

1. 在 `src/` 下创建新目录
2. 添加模块文件
3. 在 `src/perception/index.js` 或 `src/services.js` 中注册
4. 添加测试文件
5. 更新 MODULES.md

### 添加新 Skill

1. 在 `src/skills/superpowers/` 下创建新目录
2. 添加 `SKILL.md`
3. 在 `src/skills/registry.js` 中注册
4. 测试 Skill 匹配逻辑

## Pull Request 流程

1. Fork 项目
2. 创建功能分支：`git checkout -b feat/my-feature`
3. 提交代码：`git commit -m "feat: my feature"`
4. 推送：`git push origin feat/my-feature`
5. 创建 Pull Request
6. 等待 Code Review

## PR 要求

- 通过所有冒烟测试
- 新功能需有测试或验证步骤
- 更新相关文档
- 不引入新的 lint 警告
- PR 描述清楚改动内容和原因

## 行为准则

- 尊重所有贡献者
- 建设性代码审查
- 接受不同意见
- 专注于代码质量

## 联系方式

- GitHub Issues：[提交 Bug 或建议](https://github.com/xiaoyuanda666/bailongma/issues)
- 项目文档：见 README.md
