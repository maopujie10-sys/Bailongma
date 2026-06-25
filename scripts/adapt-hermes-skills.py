#!/usr/bin/env python3
"""
将 hermes-skills 中的 Hermes 特有路径/环境变量/命令适配为 BaiLongma (白龙马) 命名规范。
备份已保存在 skills/hermes-skills.backup/
"""
import os
import re
import sys
import io

# 强制 UTF-8 输出
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

SKILLS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "skills", "hermes-skills")

# 替换规则（按顺序执行，避免重复替换）
RULES = [
    # === 1. 复合模式（必须先于简单模式） ===
    # ${HERMES_HOME:-~/.hermes} → ${BAILONGMA_USER_DIR}
    (r'\$\{HERMES_HOME:-\~\/\.hermes\}', '${BAILONGMA_USER_DIR}'),
    # ${HERMES_HOME:-$HOME/.hermes} → ${BAILONGMA_USER_DIR}
    (r'\$\{HERMES_HOME\:-\$HOME\/\.hermes\}', '${BAILONGMA_USER_DIR}'),

    # === 2. 环境变量 ===
    (r'\bHERMES_HOME\b', 'BAILONGMA_USER_DIR'),

    # === 3. 路径引用 ===
    # ~/.hermes/ 路径 → $BAILONGMA_USER_DIR/
    (r'~\/\.hermes\/', '$BAILONGMA_USER_DIR/'),
    # ~/.hermes (行尾或空格结尾)
    (r'~\/\.hermes\b', '$BAILONGMA_USER_DIR'),
    # .hermes/plans/ → plans/
    (r'\.hermes\/plans\/', 'plans/'),
    # .hermes/auth.json → config.json
    (r'\.hermes\/auth\.json', 'config.json'),
    # .hermes/.env → 白龙马配置
    (r'\.hermes\/\.env\b', 'config.json (Bailongma user config)'),

    # === 4. 项目名称 ===
    # hermes-agent → bailongma
    (r'\bhermes-agent\b', 'bailongma'),

    # === 5. 描述性引用 ===
    # "Hermes Agent" (保留来源说明)
    (r'Hermes Agent', 'Bailongma (白龙马)'),
    # "Hermes agent"
    (r'Hermes agent', 'Bailongma (白龙马)'),
    # "the Hermes"
    (r'\bthe Hermes\b', 'Bailongma (白龙马)'),
    # "Hermes'" (所有格)
    (r"Hermes'", "Bailongma (白龙马)'s"),
    # "Hermes's"
    (r"Hermes's", "Bailongma (白龙马)'s"),

    # === 6. 章节标题 ===
    (r'## Hermes Agent Integration', '## Bailongma (白龙马) 集成'),
    (r'## Hermes Integration Notes', '## Bailongma (白龙马) 集成说明'),
    (r'## Hermes Gateway Caveat', '## Bailongma (白龙马) 网关注意事项'),
    (r'## Important Notes for Hermes', '## Bailongma (白龙马) 重要说明'),
    (r'## How to use it in Hermes', '## 如何在 Bailongma (白龙马) 中使用'),
    (r'## Hermes CLI Note', '## Bailongma (白龙马) CLI 说明'),
    (r'Important Hermes CLI note', 'Bailongma (白龙马) CLI 重要说明'),

    # === 7. 上下文句子 ===
    (r'For Hermes itself,', 'For Bailongma (白龙马) itself,'),
    (r'This skill is designed for the Hermes agent\.', 'This skill is designed for Bailongma (白龙马).'),
    (r'When invoking the Codex CLI from a Hermes gateway', 'When invoking the Codex CLI from a Bailongma gateway'),
    (r'in a Hermes gateway/service context', 'in a Bailongma (白龙马) gateway/service context'),
    (r'via the Hermes terminal\.', 'via the Bailongma (白龙马) terminal.'),
    (r'from a Hermes gateway/service', 'from a Bailongma (白龙马) gateway/service'),
    (r'Hermes interacts with', 'Bailongma (白龙马) interacts with'),
    (r'Hermes has three design', 'Bailongma (白龙马) has three design'),
    (r"Hermes's baseline voice", "Bailongma (白龙马)'s baseline voice"),
    (r'Ported to Hermes Agent with Hermes-native', 'Ported from Hermes Agent, adapted for Bailongma (白龙马) with'),
    (r'Use these Hermes tools during', 'Use these Bailongma (白龙马) tools during'),
    (r'Hermes file tools are backend-aware', 'Bailongma (白龙马) file tools are backend-aware'),
    (r'This skill is designed for the Hermes agent', 'This skill is designed for Bailongma (白龙马)'),
    (r'Hermes interacts with Claude Code in two', 'Bailongma (白龙马) interacts with Claude Code in two'),
    (r'Delegate coding tasks to Codex via the Hermes terminal', 'Delegate coding tasks to Codex via the Bailongma (白龙马) terminal'),
    (r'Delegate coding tasks to Claude Code.*via the Hermes terminal', 'Delegate coding tasks to Claude Code via the Bailongma (白龙马) terminal'),
    (r'installed via npx get-shit-done-cc --hermes', 'installed via npx get-shit-done-cc --hermes (compatible with Bailongma)'),
    (r'Hermes-managed Codex', 'Bailongma (白龙马)-managed Codex'),
    (r'Hermes orchestration', 'Bailongma (白龙马) orchestration'),

    # === 8. author 字段 ===
    (r'author: Hermes Agent$', 'author: Hermes Agent (adapted for Bailongma 白龙马)'),
    (r'author: Hermes Agent \+', 'author: Hermes Agent +'),
    (r'author: Hermes Agent \(adapted from', 'author: Hermes Agent, adapted for Bailongma 白龙马 (original: '),

    # === 9. Hermes MCP → Bailongma MCP ===
    (r"Hermes' MCP support", "Bailongma (白龙马)'s MCP support"),

    # === 10. CLI 命令说明 ===
    # hermes computer-use doctor → 保留但加注释
    (r'`hermes computer-use doctor`', '`hermes computer-use doctor` (use Bailongma equivalent)'),

    # === 11. 清理多余空格 ===
    (r'Bailongma \(白龙马\)  Bailongma \(白龙马\)', 'Bailongma (白龙马)'),
]

def adapt_file(filepath):
    """适配单个 SKILL.md 文件"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    changes = []

    for pattern, replacement in RULES:
        new_content = re.sub(pattern, replacement, content)
        if new_content != content:
            # 计算变更次数
            count = len(re.findall(pattern, content))
            if count > 0:
                changes.append(f"  {pattern[:60]}... → {replacement[:60]}... ({count}处)")
            content = new_content

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return changes

    return None

def main():
    if not os.path.isdir(SKILLS_DIR):
        print(f"错误: 目录不存在 {SKILLS_DIR}")
        sys.exit(1)

    total_files = 0
    modified_files = 0
    total_changes = 0

    for root, dirs, files in os.walk(SKILLS_DIR):
        for f in files:
            if f == 'SKILL.md':
                total_files += 1
                filepath = os.path.join(root, f)
                relpath = os.path.relpath(filepath, SKILLS_DIR)

                changes = adapt_file(filepath)
                if changes:
                    modified_files += 1
                    change_count = len(changes)
                    total_changes += change_count
                    print(f"✅ {relpath} ({change_count} 处修改)")
                    for c in changes:
                        print(c)
                    print()

    print(f"\n{'='*60}")
    print(f"总计: {total_files} 个文件, {modified_files} 个被修改, {total_changes} 处变更")
    print(f"备份位置: skills/hermes-skills.backup/")
    print(f"如需回滚: cp -r skills/hermes-skills.backup/* skills/hermes-skills/")

if __name__ == '__main__':
    main()
