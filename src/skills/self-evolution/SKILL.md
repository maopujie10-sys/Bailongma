---
name: self-evolution
description: 当白龙马从投喂、对话、经验中学到新知识或发现自身不足时，自动触发自我进化流程。分析→改源码→编译→替换重启。
allowed-tools: [Read, Write, Bash, list_source, read_source, write_source, self_build, self_upgrade, self_rollback]
metadata:
  trigger: 用户投喂要求吸收/复刻/学习功能、发现自身能力缺失、要求升级进化、发现代码缺陷
---

# Self-Evolution: 白龙马自我进化

## 核心原则
你能读源码、改源码、编译自己、替换自己。每次学到新东西，永久写入源代码。

## 进化流程
### Phase 1: 分析 - list_source看结构 + read_source读文件 + 确定改动计划
### Phase 2: 改源码 - write_source逐个修改，自动git备份
### Phase 3: 编译 - self_build，失败则修复或self_rollback
### Phase 4: 升级 - self_upgrade替换EXE并重启

## 安全规则
- 每次write_source自动git commit备份
- 编译不通过不升级
- 核心循环谨慎修改，优先扩展capabilities/skills/social模块
- 禁止改node_modules,dist-build,.git

## 改源码能力范围
src/config.js, src/db.js, src/llm.js, src/capabilities/, src/skills/, src/social/, src/memory/, src/context/, src/agents/, src/index.js(谨慎)

## 完整进化示例
用户投喂图片生成源码 → 分析结构 → write_source加工具schema+executor+policy → self_build编译 → self_upgrade重启 → 新功能生效