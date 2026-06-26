---
name: self-evolution
description: 白龙马自我进化核心技能。投喂源码时自动触发：AST级分析→双校验写入→智能构建→原子升级+30s健康检查→失败自动回滚。非UI框架外所有模块均可自我升级。
allowed-tools: [Read, Write, Bash, list_source, read_source, write_source, self_build, self_upgrade, self_rollback, self_test]
metadata:
  trigger: 投喂源码/要求吸收复刻学习/发现能力缺失/要求升级进化/发现代码缺陷
---

# Self-Evolution v3

## 核心能力
- read_source 自动解析 imports/functions/classes 结构
- write_source: add_import / add_function / replace_function / replace(空白容错) / insert / append / delete
- 每次写入先写 temp → node --check 语法检查 → 导入路径验证 → 通过才原子 rename
- self_build 自动检测改动范围(仅src走增量,原生模块走全量)
- self_upgrade: upgrade-launcher detached子进程→等旧进程退出→原子替换→启动新版→30s HTTP健康检查→失败自动回滚快照→重启旧版
- self_test: 快速扫描源码语法错误+关键文件+Git状态

## 安全网
1. write_source前git commit备份 2. 语法错→改动丢弃 3. 导入错→拒绝 4. 原子写入(temp→rename) 5. 升级前完整快照 6. 30s健康检查→不健康自动恢复 7. self_rollback→git reset+快照恢复

## 进化流程
Phase 1: list_source+read_source分析结构
Phase 2: write_source逐文件修改(add_import/add_function/replace等)
Phase 3: self_test快速自检
Phase 4: self_build智能构建
Phase 5: self_upgrade原子升级+健康检查
