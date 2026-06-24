// 外部技能包 schema：superpowers（14个子技能工作流）、agent-reach（多平台搜索）、humanizer-zh（中文人性化）
export const skillsSchemas = {
  agent_reach_search: {
    type: 'function',
    function: {
      name: 'agent_reach_search',
      description: '多平台搜索调研：支持小红书/Twitter/B站/V2EX/Reddit/LinkedIn/GitHub/YouTube/雪球/RSS等13个平台。适合用户要求调研、搜索、查资料、看评价时调用。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词或调研主题' },
          platform: { type: 'string', description: '目标平台，如 xiaohongshu/twitter/bilibili/v2ex/reddit/linkedin/github/youtube/xueqiu/web/rss，默认web通用搜索' },
          max_results: { type: 'number', description: '最大结果数，默认10' }
        },
        required: ['query']
      }
    }
  },
  humanize_text: {
    type: 'function',
    function: {
      name: 'humanize_text',
      description: '去除文本中的AI生成痕迹，使其听起来更自然、更像人类书写。基于维基百科AI写作特征指南。适合编辑或审阅文本时调用。',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '需要人性化处理的原始文本' },
          style: { type: 'string', enum: ['casual', 'formal', 'technical'], description: '期望的语体风格，默认casual' }
        },
        required: ['text']
      }
    }
  },
  skill_superpowers_load: {
    type: 'function',
    function: {
      name: 'skill_superpowers_load',
      description: '加载 superpowers 技能包中的指定子技能（brainstorming/dispatching-parallel-agents/executing-plans/finishing-a-development-branch/receiving-code-review/requesting-code-review/subagent-driven-development/systematic-debugging/test-driven-development/using-git-worktrees/using-superpowers/verification-before-completion/writing-plans/writing-skills）。加载后子技能的SKILL.md指令会注入当前上下文。',
      parameters: {
        type: 'object',
        properties: {
          skill_name: { type: 'string', description: '子技能名称，如 brainstorming、dispatching-parallel-agents、executing-plans 等' }
        },
        required: ['skill_name']
      }
    }
  }
}
