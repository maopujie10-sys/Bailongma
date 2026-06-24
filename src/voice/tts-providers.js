// 流式 TTS 服务商接入层
// 支持: OpenAI TTS / ElevenLabs / 火山引擎 / 豆包（方舟）
// 统一返回 Node.js Readable stream，供 api.js pipe 到 HTTP 响应
import { Readable, Transform } from 'stream'
import fs from 'fs'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import path from 'path'
import os from 'os'

export const TTS_PROVIDERS = [
  { id: 'doubao',      label: '豆包（方舟）',   streaming: true  },
  { id: 'edgetts',     label: 'Edge TTS（微软免费）', streaming: false },
  { id: 'aliyun',      label: '阿里云百炼（DashScope）', streaming: false },
  { id: 'tencent',     label: '腾讯云语音合成', streaming: false },
  { id: 'minimax',     label: 'MiniMax',       streaming: false },
  { id: 'openai',      label: 'OpenAI TTS',   streaming: true  },
  { id: 'elevenlabs',  label: 'ElevenLabs',   streaming: true  },
  { id: 'volcano',     label: '火山引擎',       streaming: false },
]

export const TTS_VOICES = {
  edgetts: [
    { id: 'zh-CN-XiaoxiaoNeural',     label: '晓晓（女声，自然）' },
    { id: 'zh-CN-YunxiNeural',        label: '云希（男声，自然）' },
    { id: 'zh-CN-YunyangNeural',      label: '云扬（男声，新闻）' },
    { id: 'zh-CN-XiaoyiNeural',       label: '晓伊（女声，温柔）' },
    { id: 'zh-CN-YunjianNeural',      label: '云健（男声，运动）' },
    { id: 'zh-CN-XiaohanNeural',      label: '晓涵（女声，温柔）' },
    { id: 'zh-CN-XiaochenNeural',     label: '晓辰（女声，活泼）' },
    { id: 'zh-CN-XiaomengNeural',     label: '晓梦（女声，童声）' },
    { id: 'zh-CN-XiaomoNeural',       label: '晓墨（女声，知性）' },
    { id: 'zh-CN-XiaoruiNeural',      label: '晓睿（女声，成熟）' },
    { id: 'zh-CN-XiaoshuangNeural',   label: '晓双（女声，甜美）' },
    { id: 'zh-CN-XiaoxuanNeural',     label: '晓萱（女声，自信）' },
    { id: 'zh-CN-XiaoyanNeural',      label: '晓颜（女声，亲切）' },
    { id: 'zh-HK-HiuGaaiNeural',      label: '曉佳（粤语女声）' },
    { id: 'zh-HK-HiuMaanNeural',      label: '曉曼（粤语女声）' },
    { id: 'zh-HK-WanLungNeural',      label: '雲龍（粤语男声）' },
    { id: 'zh-TW-HsiaoChenNeural',    label: '曉臻（台湾女声）' },
    { id: 'zh-TW-HsiaoYuNeural',      label: '曉雨（台湾女声）' },
    { id: 'zh-TW-YunJheNeural',       label: '雲哲（台湾男声）' },
    { id: 'zh-CN-liaoning-XiaobeiNeural', label: '晓北（东北话）' },
    { id: 'zh-CN-sichuan-YunxiNeural',    label: '云希（四川话）' },
  ],
  aliyun: [
    { id: 'Cherry',      label: 'Cherry（女声，自然）' },
    { id: 'Stella',      label: 'Stella（女声，温柔）' },
    { id: 'Jace',        label: 'Jace（男声，磁性）' },
    { id: 'Layla',       label: 'Layla（女声，知性）' },
    { id: 'Ethan',       label: 'Ethan（男声，沉稳）' },
  ],
  tencent: [
    { id: '101001', label: '智瑜（女声，情感）' },
    { id: '101002', label: '智聆（女声，通用）' },
    { id: '101003', label: '智美（女声，客服）' },
    { id: '101004', label: '智云（男声，通用）' },
    { id: '101005', label: '智莉（女声，通用）' },
    { id: '101006', label: '智言（女声，助手）' },
    { id: '101007', label: '智娜（女声，客服）' },
    { id: '101008', label: '智琪（女声，客服）' },
    { id: '101009', label: '智芸（女声，知性）' },
    { id: '101010', label: '智诚（男声，通用）' },
    { id: '101011', label: '智燕（女声，新闻）' },
    { id: '101012', label: '智丹（女声，新闻）' },
    { id: '101013', label: '智辉（男声，新闻）' },
    { id: '101014', label: '智宁（女声，新闻）' },
    { id: '101015', label: '智萌（女声，童声）' },
    { id: '101016', label: '智甜（女声，童声）' },
  ],
  doubao: [
    { id: 'zh_female_xiaohe_uranus_bigtts',          label: '小何 2.0（女声，通用）' },
    { id: 'zh_female_vv_uranus_bigtts',              label: 'Vivi 2.0（女声，通用/多语种）' },
    { id: 'zh_female_shuangkuaisisi_uranus_bigtts',  label: '爽快思思 2.0（女声，活泼）' },
    { id: 'zh_female_cancan_uranus_bigtts',          label: '知性灿灿 2.0（女声，角色）' },
    { id: 'zh_female_tianmeixiaoyuan_uranus_bigtts', label: '甜美小源 2.0（女声，甜美）' },
    { id: 'zh_male_m191_uranus_bigtts',              label: '云舟 2.0（男声，通用）' },
    { id: 'zh_male_taocheng_uranus_bigtts',          label: '小天 2.0（男声，通用）' },
    { id: 'zh_female_kefunvsheng_uranus_bigtts',     label: '暖阳女声 2.0（客服）' },
  ],
  minimax: [
    { id: 'male-qn-qingse',    label: '青涩男声' },
    { id: 'male-qn-jingying',  label: '精英男声' },
    { id: 'male-qn-badao',     label: '霸道男声' },
    { id: 'female-shaonv',     label: '少女' },
    { id: 'female-yujie',      label: '御姐' },
    { id: 'female-chengshu',   label: '成熟女声' },
    { id: 'presenter_male',    label: '男主播' },
    { id: 'presenter_female',  label: '女主播' },
  ],
  openai: [
    { id: 'nova',    label: 'Nova（女声，自然）' },
    { id: 'shimmer', label: 'Shimmer（女声，轻柔）' },
    { id: 'alloy',   label: 'Alloy（中性）' },
    { id: 'echo',    label: 'Echo（男声）' },
    { id: 'fable',   label: 'Fable（男声，叙事）' },
    { id: 'onyx',    label: 'Onyx（男声，低沉）' },
  ],
  elevenlabs: [
    { id: 'pNInz6obpgDQGcFmaJgB', label: 'Adam（男声）' },
    { id: 'ErXwobaYiN019PkySvjV', label: 'Antoni（男声，温和）' },
    { id: 'MF3mGyEYCl7XYWbV9V6O', label: 'Elli（女声，年轻）' },
    { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel（女声，自然）' },
    { id: 'AZnzlk1XvdvUeBnXmlld', label: 'Domi（女声，有力）' },
    { id: 'TxGEqnHWrfWFTfGW9XjX', label: 'Josh（男声，深沉）' },
  ],
  volcano: [
    { id: 'zh_female_qingxin',       label: '清心（女声）' },
    { id: 'zh_female_tianmei_jingpin', label: '甜美精品（女声）' },
    { id: 'zh_female_meiqi',         label: '魅琦（女声，成熟）' },
    { id: 'zh_male_rap',             label: '说唱（男声）' },
    { id: 'zh_male_qingchengnanzhu', label: '倾城男主（男声）' },
    { id: 'BV001_streaming',         label: '通用女声' },
    { id: 'BV002_streaming',         label: '通用男声' },
  ],
}

// ── 各服务商凭证要求（合成前预检的单一权威）──────────────────────────────────
// 每个 provider 声明若干「必填组」：组内任一字段非空即满足该组（如豆包 token 可用
// accessKey 或 apiKey）。新增/调整 provider 只动这张表，execSpeak / /tts/stream 都复用。
// 这是根治"朗读经常失败"的关键：以前要冲到各家 API 才裸抛"缺少 API Key"，
// 现在合成前就能给出可执行的中文引导（不硬拦截，由模型/前端转述）。
export const TTS_PROVIDER_REQUIREMENTS = {
  doubao: {
    label: '豆包（方舟）',
    groups: [{ keys: ['doubaoAccessKey', 'doubaoKey'], label: 'Access Key 或 API Key' }],
    guide: '请在「语音设置 → 语音合成」里选择豆包，并填入控制台的语音合成 Access Key（或 API Key）。',
  },
  minimax: {
    label: 'MiniMax',
    groups: [{ keys: ['minimaxKey'], label: 'API Key' }],
    guide: '请在「语音设置 → 语音合成」里选择 MiniMax，并填入 MiniMax 的 API Key。',
  },
  openai: {
    label: 'OpenAI TTS',
    groups: [{ keys: ['openaiKey'], label: 'API Key' }],
    guide: '请在「语音设置 → 语音合成」里选择 OpenAI，并填入 OpenAI 的 API Key（可选填自定义 BaseURL）。',
  },
  elevenlabs: {
    label: 'ElevenLabs',
    groups: [{ keys: ['elevenLabsKey'], label: 'API Key' }],
    guide: '请在「语音设置 → 语音合成」里选择 ElevenLabs，并填入 ElevenLabs 的 API Key。',
  },
  edgetts: {
    label: 'Edge TTS（微软免费）',
    groups: [],
    guide: 'Edge TTS 完全免费，需安装 Python edge-tts 包：pip install edge-tts。选择后直接使用，20+ 中文神经语音可选。',
  },
  aliyun: {
    label: '阿里云百炼（DashScope）',
    groups: [
      { keys: ['aliyunAppKey', 'aliyunApiKey'], label: 'DashScope API Key（sk-开头）' },
    ],
    guide: '使用阿里云百炼 DashScope API Key（sk-开头）。与语音识别可共用同一密钥。每月有免费额度。',
  },
  tencent: {
    label: '腾讯云语音合成',
    groups: [
      { keys: ['tencentSecretId', 'tencentSecretKey'], label: 'SecretId + SecretKey' },
    ],
    guide: '请在腾讯云控制台获取 API 密钥，每月100万字符免费。',
  },
  volcano: {
    label: '火山引擎',
    groups: [
      { keys: ['volcanoAppId'], label: 'AppId' },
      { keys: ['volcanoToken'], label: 'Token' },
    ],
    guide: '请在「语音设置 → 语音合成」里选择火山引擎，并同时填写 AppId 和 Token 两项。',
  },
}

// 合成前预检：当前 provider 是否选对、必填凭证是否配齐。
// 返回 { ok:true } 或 { ok:false, provider, missing?, guide }——guide 是给用户看的可执行提示。
export function validateTTSConfig(creds = {}) {
  const provider = creds.provider
  const req = TTS_PROVIDER_REQUIREMENTS[provider]
  if (!req) {
    return {
      ok: false,
      provider,
      guide: `还没选择有效的语音合成服务商（当前：${provider || '空'}）。请在「语音设置 → 语音合成」里选择一个 TTS 服务商。可用：Edge TTS（免费）/ 阿里云 / 腾讯云 / 豆包 / MiniMax / OpenAI / ElevenLabs / 火山引擎。`,
    }
  }
  const missing = req.groups
    .filter(group => !group.keys.some(k => String(creds[k] || '').trim()))
    .map(group => group.label)
  if (missing.length) {
    return { ok: false, provider, missing, guide: `${req.label} 还没配置好：缺少 ${missing.join('、')}。${req.guide}` }
  }
  return { ok: true, provider }
}

// WHATWG ReadableStream (fetch response.body) → Node.js Readable
function webStreamToNode(webStream) {
  return Readable.fromWeb(webStream)
}

// ── 豆包 TTS（豆包语音平台 V3 HTTP Chunked，语音合成2.0）─────────────────────
// 文档: https://www.volcengine.com/docs/6561/1598757
// 2.0 音色使用 *_uranus_bigtts；旧 moon/BV 音色自动降到 seed-tts-1.0。
function resolveDoubaoResourceId(voiceId, resourceId) {
  if (resourceId) return resourceId
  if (/_moon_bigtts$/.test(voiceId) || /^BV\d+(_24k)?_streaming$/.test(voiceId)) return 'seed-tts-1.0'
  return 'seed-tts-2.0'
}

function annotateDoubaoError(statusCode, message, { speaker, resourceId }) {
  if (statusCode !== 55000000 || !/resource ID is mismatched/i.test(message || '')) {
    return message || '未知错误'
  }
  return [
    message,
    `当前音色 ${speaker} 使用资源 ${resourceId}。`,
    '豆包 2.0 音色（*_uranus_bigtts）需使用 seed-tts-2.0；1.0/moon/BV 音色需使用 seed-tts-1.0 或对应控制台资源。',
    '请在语音设置中切换声音，或填写控制台中该音色对应的 Resource ID。',
  ].join(' ')
}

function decodeDoubaoLine(transform, rawLine, context = {}) {
  const line = rawLine.trim().replace(/^data:\s*/, '')
  if (!line || line === '[DONE]') return
  if (!line.startsWith('{')) {
    // 非 JSON 行（如纯文本错误）记录到 stderr 以便调试
    if (line.length > 0) console.warn('[豆包TTS] 非预期响应行:', line.slice(0, 200))
    return
  }
  const data = JSON.parse(line)
  const statusCode = Number(data.code ?? data.status_code ?? data.StatusCode ?? 0)
  if (statusCode > 0 && statusCode !== 20000000) {
    const message = annotateDoubaoError(statusCode, data.message || data.status_text, context)
    throw new Error(`豆包 TTS 流错误 (${statusCode}): ${message}`)
  }
  if (data.data) transform.push(Buffer.from(data.data, 'base64'))
}

function decodeDoubaoStream(webStream, context = {}) {
  let pending = ''
  const nodeStream = webStreamToNode(webStream)
  const transform = new Transform({
    transform(chunk, _encoding, callback) {
      pending += chunk.toString('utf-8')
      const lines = pending.split(/\r?\n/)
      pending = lines.pop() || ''
      try {
        for (const rawLine of lines) decodeDoubaoLine(this, rawLine, context)
        callback()
      } catch (err) {
        callback(err)
      }
    },
    flush(callback) {
      try {
        if (pending.trim()) decodeDoubaoLine(this, pending, context)
        callback()
      } catch (err) {
        callback(err)
      }
    },
  })
  // 把内部流的错误转发到 transform，否则外层 error 监听收不到
  nodeStream.on('error', (err) => transform.destroy(err))
  nodeStream.pipe(transform)
  return transform
}

async function streamDoubao({
  text,
  voiceId = 'zh_female_xiaohe_uranus_bigtts',
  apiKey,
  appId,
  accessKey,
  resourceId,
  style,
  speechRate,
}) {
  const token = accessKey || apiKey
  if (!token) throw new Error('豆包 TTS: 缺少 API Key/Access Key，请在设置中填写豆包语音凭证')
  const speaker = voiceId || 'zh_female_xiaohe_uranus_bigtts'
  const resolvedResourceId = resolveDoubaoResourceId(speaker, resourceId)
  const headers = {
    'X-Api-Resource-Id': resolvedResourceId,
    'X-Api-Request-Id': `blm_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    'Content-Type': 'application/json',
  }
  if (appId) headers['X-Api-App-Id'] = appId
  if (accessKey) headers['X-Api-Access-Key'] = accessKey
  if (apiKey) headers['X-Api-Key'] = apiKey
  const reqParams = {
    text,
    speaker,
    audio_params: { format: 'mp3', sample_rate: 24000 },
  }
  // 语速：speech_rate 范围 -50~100（0=正常，100=2倍速，-50=0.5倍速，正数更快）
  const rate = Number(speechRate)
  if (Number.isFinite(rate) && rate !== 0) {
    reqParams.audio_params.speech_rate = Math.max(-50, Math.min(100, Math.round(rate)))
  }
  // 情感风格：自然语言描述（如"用低沉沉稳、情绪饱满带金属感的人工智能管家声音"），
  // 通过 additions.context_texts 注入。additions 必须是序列化后的 JSON 字符串。
  const styleText = (style || '').trim()
  if (styleText) {
    reqParams.additions = JSON.stringify({ context_texts: [styleText], model_type: 4 })
  }
  const resp = await fetch('https://openspeech.bytedance.com/api/v3/tts/unidirectional', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      user: { uid: 'bailongma' },
      req_params: reqParams,
    }),
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`豆包 TTS 失败 (${resp.status}): ${err.slice(0, 300)}`)
  }
  const contentType = resp.headers.get('content-type') || ''
  if (contentType.includes('audio/')) return webStreamToNode(resp.body)
  return decodeDoubaoStream(resp.body, { speaker, resourceId: resolvedResourceId })
}


// ── XML/SSML 转义 ──────────────────────────────────────────────────────────
function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

// ── Edge TTS（微软免费，通过 Python edge-tts CLI）─────────────────────────
// 须先安装: pip install edge-tts
// 支持 20+ 中文神经语音（含粤语、台湾腔、东北话、四川话）
async function streamEdgeTTS({ text, voiceId = 'zh-CN-XiaoxiaoNeural', rate = 0, pitch = 0 }) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), `blm_etts_${randomUUID()}.mp3`)
    const args = ['--voice', voiceId, '--text', text, '--write-media', tmpFile]
    if (rate !== 0) args.push('--rate=' + rate + '%')
    if (pitch !== 0) args.push('--pitch=' + pitch + 'Hz')

    const proc = spawn('edge-tts', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stderr = ''
    proc.stderr.on('data', (d) => { stderr += d.toString() })

    proc.on('close', (code) => {
      if (code !== 0) {
        try { fs.unlinkSync(tmpFile) } catch {}
        reject(new Error(`Edge TTS 失败 (exit ${code}): ${stderr.slice(0, 300)}`))
        return
      }
      try {
        const buf = fs.readFileSync(tmpFile)
        fs.unlinkSync(tmpFile)
        if (buf.length < 100) {
          reject(new Error('Edge TTS: 返回音频数据过短（' + buf.length + ' bytes），可能文本过长'))
        } else {
          resolve(Readable.from([buf]))
        }
      } catch (e) {
        reject(new Error('Edge TTS: 读取临时文件失败: ' + e.message))
      }
    })

    proc.on('error', () => {
      reject(new Error('Edge TTS: 未找到 edge-tts 命令。请运行: pip install edge-tts'))
    })
  })
}

// ── MiniMax TTS ────────────────────────────────────────────────────────────
// 价格: ~¥0.1/千字
// 流式: 否（返回 hex 编码 buffer）
async function streamMiniMax({ text, voiceId = 'male-qn-qingse', apiKey }) {
  if (!apiKey) throw new Error('MiniMax TTS: 缺少 API Key，请在设置中配置 MiniMax')
  const resp = await fetch('https://api.minimaxi.com/v1/t2a_v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'speech-2.8-hd',
      text,
      voice_setting: { voice_id: voiceId, speed: 1.0, emotion: 'neutral', vol: 1.0 },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3' },
    }),
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`MiniMax TTS 失败 (${resp.status}): ${err.slice(0, 300)}`)
  }
  const data = await resp.json()
  if (!data?.data?.audio) throw new Error('MiniMax TTS: 响应中无音频数据')
  const buf = Buffer.from(data.data.audio, 'hex')
  return Readable.from([buf])
}

// ── OpenAI TTS ─────────────────────────────────────────────────────────────
// 价格: tts-1 $0.015/千字，tts-1-hd $0.030/千字
// 流式: 是（HTTP chunked），首字节延迟约 200-400ms
async function streamOpenAI({ text, voiceId = 'nova', apiKey, baseURL = 'https://api.openai.com' }) {
  if (!apiKey) throw new Error('OpenAI TTS: 缺少 API Key，请在设置中填写')
  const resp = await fetch(`${baseURL.replace(/\/$/, '')}/v1/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: voiceId,
      response_format: 'mp3',
    }),
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`OpenAI TTS 失败 (${resp.status}): ${err.slice(0, 300)}`)
  }
  return webStreamToNode(resp.body)
}

// ── ElevenLabs TTS ─────────────────────────────────────────────────────────
// 价格: ~$0.05-0.10/千字（Flash 更便宜）
// 流式: 是（HTTP chunked），首字节延迟约 100-300ms
async function streamElevenLabs({ text, voiceId = 'pNInz6obpgDQGcFmaJgB', apiKey }) {
  if (!apiKey) throw new Error('ElevenLabs TTS: 缺少 API Key，请在设置中填写')
  const resp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_flash_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0 },
      }),
    }
  )
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`ElevenLabs TTS 失败 (${resp.status}): ${err.slice(0, 300)}`)
  }
  return webStreamToNode(resp.body)
}

// ── 火山引擎 TTS ───────────────────────────────────────────────────────────
// 文档: https://www.volcengine.com/docs/6358/173281
// 认证: Authorization: Bearer {appId};{token}
// 返回: JSON { data: "<base64 mp3>" }
async function streamVolcano({ text, voiceId = 'BV001_streaming', appId, token }) {
  if (!appId || !token) throw new Error('火山引擎 TTS: 缺少 AppId 或 Token，请在设置中填写')
  const resp = await fetch('https://openspeech.bytedance.com/api/v1/tts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${appId};${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      app: { appid: appId, token, cluster: 'volcano_tts' },
      user: { uid: 'bailongma' },
      audio: {
        voice_type: voiceId,
        encoding: 'mp3',
        speed_ratio: 1.0,
        volume_ratio: 1.0,
        pitch_ratio: 1.0,
      },
      request: {
        reqid: `blm_${Date.now()}`,
        text,
        text_type: 'plain',
        operation: 'query',
        with_frontend: 1,
        frontend_type: 'unitTson',
      },
    }),
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`火山引擎 TTS 失败 (${resp.status}): ${err.slice(0, 300)}`)
  }
  const data = await resp.json()
  if (!data?.data) throw new Error('火山引擎 TTS: 响应中无音频数据')
  const buf = Buffer.from(data.data, 'base64')
  return Readable.from([buf])
}

// ── 通用入口 ────────────────────────────────────────────────────────────────

// ── 阿里云智能语音 TTS ─────────────────────────────────────────────────────
// 免费额度: 每月 100 万字符
// 文档: https://help.aliyun.com/document_detail/84435.html
// ── 阿里云百炼 DashScope TTS（qwen-tts / qwen3-tts-flash）─────────────────
// 使用 DashScope multimodal-generation API，与语音识别共用 sk- 密钥
// 文档: https://help.aliyun.com/zh/model-studio/
async function streamDashScopeTTS({ text, voiceId = 'Cherry', apiKey, model = 'qwen3-tts-flash' }) {
  if (!apiKey) throw new Error('阿里云百炼 TTS: 缺少 DashScope API Key（sk-开头），请在设置中填写')

  // 步骤1：调用 DashScope 生成音频
  const genResp = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model,
      input: { text: text.slice(0, 500) },
      parameters: {
        format: 'mp3',
        voice: voiceId,
      },
    }),
  })

  if (!genResp.ok) {
    const err = await genResp.text()
    throw new Error(`阿里云百炼 TTS 失败 (${genResp.status}): ${err.slice(0, 300)}`)
  }

  const data = await genResp.json()
  if (data.code) {
    throw new Error(`阿里云百炼 TTS 错误: ${data.code} - ${data.message}`)
  }

  const audioUrl = data?.output?.audio?.url
  if (!audioUrl) {
    throw new Error('阿里云百炼 TTS: 响应中无音频 URL')
  }

  // 步骤2：下载音频文件
  const audioResp = await fetch(audioUrl)
  if (!audioResp.ok) {
    throw new Error(`阿里云百炼 TTS: 音频下载失败 (${audioResp.status})`)
  }

  const buf = Buffer.from(await audioResp.arrayBuffer())
  if (buf.length < 100) throw new Error('阿里云百炼 TTS: 下载的音频数据过短')
  return Readable.from([buf])
}

// ── 腾讯云语音合成 TTS ─// ── 腾讯云语音合成 TTS ─────────────────────────────────────────────────────
// 免费额度: 每月 100 万字符
// 文档: https://cloud.tencent.com/document/product/1073/37993
async function streamTencentTTS({ text, voiceId = '101001', secretId, secretKey, appId }) {
  if (!secretId || !secretKey) throw new Error('腾讯云 TTS: 缺少 SecretId 或 SecretKey')

  const crypto = await import('crypto')
  const timestamp = Math.floor(Date.now() / 1000)
  const service = 'tts'
  const host = 'tts.tencentcloudapi.com'
  const algorithm = 'TC3-HMAC-SHA256'
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)

  const payload = JSON.stringify({
    Text: text.slice(0, 150),
    SessionId: `blm_${Date.now()}`,
    VoiceType: Number(voiceId),
    Codec: 'mp3',
    SampleRate: 16000,
    Volume: 5,
    Speed: 0,
    ProjectId: 0,
    ModelType: 1,
    PrimaryLanguage: 1,
  })

  const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex')
  const canonicalRequest = [
    'POST', '/', '',
    `content-type:application/json; charset=utf-8\nhost:${host}\n`,
    'content-type;host',
    hashedPayload,
  ].join('\n')

  const hashedCanonicalReq = crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  const stringToSign = [algorithm, timestamp, `${date}/${service}/tc3_request`, hashedCanonicalReq].join('\n')

  const kDate = crypto.createHmac('sha256', `TC3${secretKey}`).update(date).digest()
  const kService = crypto.createHmac('sha256', kDate).update(service).digest()
  const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest()
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')

  const authorization = `${algorithm} Credential=${secretId}/${date}/${service}/tc3_request, SignedHeaders=content-type;host, Signature=${signature}`

  const resp = await fetch(`https://${host}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Host': host,
      'X-TC-Action': 'TextToVoice',
      'X-TC-Version': '2019-08-23',
      'X-TC-Timestamp': String(timestamp),
      'Authorization': authorization,
    },
    body: payload,
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`腾讯云 TTS 失败 (${resp.status}): ${err.slice(0, 300)}`)
  }
  const data = await resp.json()
  if (data.Response?.Error) {
    throw new Error(`腾讯云 TTS: ${data.Response.Error.Code} - ${data.Response.Error.Message}`)
  }
  if (!data.Response?.Audio) throw new Error('腾讯云 TTS: 响应中无音频数据')
  const buf = Buffer.from(data.Response.Audio, 'base64')
  return Readable.from([buf])
}

export async function streamTTS({ text, provider, voiceId, keys = {} }) {
  if (!text?.trim()) throw new Error('TTS: 文本为空')
  switch (provider) {
    case 'doubao':
      return streamDoubao({
        text,
        voiceId,
        apiKey: keys.doubaoKey,
        appId: keys.doubaoAppId,
        accessKey: keys.doubaoAccessKey,
        resourceId: keys.doubaoResourceId,
        style: keys.doubaoStyle,
        speechRate: keys.doubaoSpeechRate,
      })
    case 'minimax':
      return streamMiniMax({ text, voiceId, apiKey: keys.minimaxKey })
    case 'openai':
      return streamOpenAI({ text, voiceId, apiKey: keys.openaiKey, baseURL: keys.openaiBaseURL })
    case 'elevenlabs':
      return streamElevenLabs({ text, voiceId, apiKey: keys.elevenLabsKey })
    case 'edgetts':
      return streamEdgeTTS({ text, voiceId, rate: keys.edgettsRate ?? 0, pitch: keys.edgettsPitch ?? 0 })
    case 'aliyun':
      return streamDashScopeTTS({
        text, voiceId,
        apiKey: keys.aliyunAppKey || keys.aliyunApiKey,
      })
    case 'tencent':
      return streamTencentTTS({
        text, voiceId,
        appId: keys.tencentAppId,
        secretId: keys.tencentSecretId,
        secretKey: keys.tencentSecretKey,
      })
    case 'volcano':
      return streamVolcano({ text, voiceId, appId: keys.volcanoAppId, token: keys.volcanoToken })
    default:
      throw new Error(`未知 TTS 服务商: ${provider}，请在设置中选择一个 TTS 服务商`)
  }
}
