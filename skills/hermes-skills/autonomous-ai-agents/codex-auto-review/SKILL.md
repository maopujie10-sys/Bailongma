---
name: codex-auto-review
description: "Codex-style auto-review: after every code change, self-review against correctness, security, and style"
version: 1.0.0
tags: [review, codex, quality, security]
triggers:
  - 自动审查
  - auto review
  - 自我检查
  - check my code
  - 代码审查
---

# Codex Auto-Review

After every code change, run a self-review before considering the task done. Adapted from OpenAI Codex CLI.

## Review Checklist

### Correctness
- Does the code do what was asked?
- Are edge cases handled?
- Will it break on empty input, large input, or unexpected input?

### Security
- No hardcoded secrets or tokens
- Input validation at boundaries
- No unsafe shell command injection

### Style
- Follows existing project conventions
- Naming is clear and consistent
- No dead code or debug logs left in

### Verification
- Run the code and confirm it works
- Check the output matches expectations
- If tests exist, run them

## Rule
Never say "done" without running this review. If issues found, fix them before reporting completion.
