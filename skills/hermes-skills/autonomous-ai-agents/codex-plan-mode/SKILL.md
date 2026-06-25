---
name: codex-plan-mode
description: "Codex-style 3-phase Plan Mode: ground first, plan thoroughly, hand off clean"
version: 1.0.0
tags: [planning, codex, architecture, workflow]
triggers:
  - 计划模式
  - 先做计划
  - 规划一下
  - make a plan
  - plan this
  - 设计方案
---

# Codex Plan Mode

Three-phase planning workflow adapted from OpenAI Codex CLI's plan mode pattern.

## Phase 1: Ground
- Explore the environment first — read files, list directories, check existing code
- Resolve unknowns through inspection, not interrogation
- Never ask the user "which file should I edit" when you can find out yourself

## Phase 2: Plan
- Produce a detailed, decision-complete plan
- Another engineer/agent should be able to implement it without making any decisions
- Include: which files, what changes, how to verify, rollback path

## Phase 3: Hand Off
- Present the plan for approval
- After approval, switch to execution mode
- Do NOT execute during planning mode

## Rules
- Non-mutating exploration only during planning (read, search, list, dry-run)
- No file editing, no code changes until Phase 3 approval
