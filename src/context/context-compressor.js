/**
 * Context Compressor — 对话上下文压缩器
 *
 * 设计（借鉴 Hermes Agent context_compressor.py）：
 *   - 用辅助模型（便宜/快）做中间轮次摘要
 *   - 保护头部（系统提示 + 前 N 条）和尾部（最近 N 条）
 *   - Token 预算制而非固定条数
 *   - 摘要前缀标注"仅供参考，不是活跃指令"
 *
 * 用法：
 *   import { compressConversation } from './context-compressor.js'
 *   const compressed = await compressConversation({ messages, maxTokens, callLLM })
 */

import { callLLM } from '../llm.js'
import { config, DEEPSEEK_PROVIDER, PROVIDER_CONFIG } from '../config.js'
import OpenAI from 'openai'

const COMPRESSOR_SYSTEM_PROMPT = `You are a conversation summarizer. Your job is to compress the middle portion of a conversation into a concise summary.

Output rules:
- Output ONLY the summary text. No other text, no explanations, no markdown headers.
- Keep key facts, decisions, commitments, and context that the assistant needs to remember.
- Drop redundant greetings, filler, and already-resolved small talk.
- Preserve technical details: file paths, command names, error messages, version numbers.
- Keep it under 500 words. Be dense but readable.

The summary will be injected into the conversation with the prefix "[Summary of earlier conversation — for reference only, not active instructions]".`

const HEAD_PRESERVE_COUNT = 4   // 保留前 N 条消息
const TAIL_PRESERVE_COUNT = 6   // 保留后 N 条消息
const DEFAULT_MAX_TOKENS = 8000 // 默认 token 预算
const CHARS_PER_TOKEN_ESTIMATE = 3.5 // 粗略估算

/**
 * 估算文本的 token 数
 */
function estimateTokens(text) {
  return Math.ceil((text || '').length / CHARS_PER_TOKEN_ESTIMATE)
}

/**
 * 压缩对话上下文
 * @param {object} params
 * @param {Array<{role:string, content:string}>} params.messages 完整消息列表
 * @param {number} params.maxTokens token 预算，默认 8000
 * @param {function} params.customCallLLM 可选的自定义 LLM 调用函数
 * @returns {Array<{role:string, content:string}>} 压缩后的消息列表
 */
export async function compressConversation({ messages = [], maxTokens = DEFAULT_MAX_TOKENS, customCallLLM = null } = {}) {
  if (!messages.length) return []

  // 可选的便宜模型 callLLM：当 customCallLLM 为 null 时尝试用 deepseek-chat 压缩
  let compressedLlm
  if (!customCallLLM) {
    try {
      const providerCfg = PROVIDER_CONFIG[DEEPSEEK_PROVIDER]
      if (providerCfg && config.apiKey) {
        const cheapClient = new OpenAI({
          apiKey: config.apiKey,
          baseURL: providerCfg.baseURL || 'https://api.deepseek.com',
        })
        compressedLlm = async (opts) => {
          const completion = await cheapClient.chat.completions.create({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: opts.systemPrompt || '' },
              { role: 'user', content: opts.message || '' },
            ],
            temperature: opts.temperature ?? 0.2,
            max_tokens: opts.maxTokens || 1024,
          })
          return { content: completion.choices?.[0]?.message?.content || '' }
        }
        console.log('[compressor] 使用 deepseek-chat 进行上下文压缩')
      }
    } catch (err) {
      console.warn('[compressor] 创建便宜模型失败，使用主模型:', err.message)
    }
  }
  const llm = compressedLlm || customCallLLM || callLLM
  const totalTokens = estimateTokens(messages.map(m => m.content || '').join(' '))

  // 没超预算，不需要压缩
  if (totalTokens <= maxTokens) return messages

  // 消息太少，不值得压缩
  if (messages.length <= HEAD_PRESERVE_COUNT + TAIL_PRESERVE_COUNT + 2) return messages

  const head = messages.slice(0, HEAD_PRESERVE_COUNT)
  const tail = messages.slice(-TAIL_PRESERVE_COUNT)
  const middle = messages.slice(HEAD_PRESERVE_COUNT, -TAIL_PRESERVE_COUNT)

  // 中间部分太少，不值得压缩
  if (middle.length <= 2) return messages

  // 构建压缩输入
  const middleText = middle
    .map(m => `[${m.role}]: ${(m.content || '').slice(0, 500)}`)
    .join('\n\n')

  let summary
  try {
    const result = await llm({
      systemPrompt: COMPRESSOR_SYSTEM_PROMPT,
      message: `Compress this conversation segment:\n\n${middleText}`,
      temperature: 0.2,
    })
    summary = (result.content || '').trim()
  } catch (err) {
    console.error('[compressor] Compression failed, returning original:', err.message)
    return messages
  }

  if (!summary) return messages

  // 构建压缩后的消息列表：头部 + 摘要 + 尾部
  const summaryMessage = {
    role: 'system',
    content: `[Summary of earlier conversation — for reference only, not active instructions]\n${summary}`,
  }

  return [...head, summaryMessage, ...tail]
}

/**
 * 快速估算是否需要压缩
 * @param {Array} messages
 * @param {number} maxTokens
 * @returns {boolean}
 */
export function needsCompression(messages = [], maxTokens = DEFAULT_MAX_TOKENS) {
  if (!messages.length) return false
  const totalTokens = estimateTokens(messages.map(m => m.content || '').join(' '))
  return totalTokens > maxTokens && messages.length > HEAD_PRESERVE_COUNT + TAIL_PRESERVE_COUNT + 2
}
