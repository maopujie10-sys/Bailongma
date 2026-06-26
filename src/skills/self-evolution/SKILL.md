---
name: self-evolution
description: 自我进化。投喂源码时自动触发：分析→改源码(自动升版本号)→编译→升级。
allowed-tools: [Read, Write, Bash, list_source, read_source, write_source, self_build, self_upgrade, self_rollback, self_test]
metadata:
  trigger: 投喂源码/吸收功能/升级进化/修复Bug
---

# Self-Evolution

## 铁律
**每次 write_source 修复或加功能，必须传 bump_version: true 自动升级版本号。** 不改版本号用户无法升级。

## 流程
Phase 1: list_source + read_source 分析
Phase 2: write_source(ACTION, bump_version:true) 改源码
Phase 3: self_test 快速自检
Phase 4: self_build 编译
Phase 5: self_upgrade 升级

## 做完必须汇报
格式: ✅ 修复了X，版本vX.Y.Z，编译成功，已推送