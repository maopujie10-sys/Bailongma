import { config, getMinimaxKey as _getMinimaxKey, getSecurity } from './config.js'
import { callLLM } from './llm.js'
import { buildSystemPrompt, buildContextBlock, combinePromptForPreview } from './prompt.js'
import { enqueueTurnForRecognition, configureRecognizerScheduler } from './memory/recognizer-scheduler.js'
import { runInjector, formatMemoriesForPrompt, formatActivePoliciesForPrompt, formatTaskKnowledge, formatPrefetchedItems, formatActiveUICards, formatTemporalRecall, formatAIVideoPanel } from './memory/injector.js'
import {
  ensureThreadState, attributeUserMessage, buildThreadView, getForegroundThread,
  getThreadById, openCommitment, closeCommitment, touchCommitmentThread,
  latestOpenCommitment, mergeThreads, migrateFocusStackToThreads, describeThread,
} from './memory/threads.js'
import { summarizeThread } from './memory/thread-summarize.js'
import { classifyThreadAttribution } from './memory/thread-classifier.js'
import { runMemoryRefreshLoop } from './memory/refresh-loop.js'
import { startConsolidationLoop } from './memory/consolidation-loop.js'
import { runRuntimeInjector } from './context/runtime-injector.js'
import { selectContextSections } from './context/section-gate.js'
import { getDB, getConfig, setConfig, getKnownEntities, getOrInitBirthTime, insertConversation, insertMemory, getRecentConversationPartners, getDueReminders, markReminderFired, advanceReminderDueAt, getNextPendingReminder, getMemoryCount, getRecentConversationTimeline, loadFocusStack, loadThreadState, saveThreadState, setCurrentFocusTopic, setCurrentThreadId, updateUserMessageFocusTopic, reassignConversationsThread, insertActionLog } from './db.js'
import { calculateNextDueAt, autoSpeakForVoiceReply, detectOpenFollowupQuestion } from './capabilities/executor.js'
import { popMessage, hasMessages, hasUserMessages, getQueueSnapshot, setInterruptCallback, requeueMessage, pushMessage } from './queue.js'
import { startTUI } from './tui.js'
import { startAPI } from './api.js'
import { emitEvent, emitUICommand, addActiveUICard, hasACUIClient, setStickyEvent, clearStickyEvent } from './events.js'
import { formatTick, nowTimestamp, describeExistence } from './time.js'
import { getAdaptiveTickInterval, getQuotaStatus, setRateLimited, isRateLimited, getTickInterval } from './quota.js'
import { registerProvider } from './providers/registry.js'
import { MinimaxProvider } from './providers/minimax.js'
import { isRunning, setScheduler } from './control.js'
import { getCustomIntervalMs, consumeTick as consumeTickerTick, getStatus as getTickerStatus } from './ticker.js'
import { seedSandboxOnce, seedMusicOnce, rescueDataFromInstallDir } from './paths.js'
import { ensureSkillMemories } from './memory/seed-skills.js'
import { loadInstalledTools } from './capabilities/marketplace/index.js'
import './memory/providers/sqlite.js'  // auto-registers SQLiteMemoryProvider
import { resumePendingVideoJobs, getAIVideoPanelState } from './capabilities/tools/media.js'
import { dispatchSocialMessage } from './social/dispatch.js'
import { startSocialConnectors } from './social/index.js'
import { getWeatherCardProps, isWeatherQuery } from './weather.js'
import { collectSystemInfo, getSystemInfoBlock, getBatteryBlock, getDesktopPath } from './system-info.js'
import { collectDesktopInfo, getDesktopBlock } from './desktop-scanner.js'
import { collectInstalledSoftware, getInstalledSoftwareBlock } from './installed-software-scanner.js'
import { collectLocalResources } from './local-resources-scanner.js'
import { collectGeoWeather, getGeoWeatherBlock } from './geo-weather.js'
import { collectTrending, getTrendingBlock } from './trending.js'
import { collectAgents, buildAgentContextBlock, buildDelegationAskDirections } from './agents/registry.js'
import { dispatchToArmy, probeArmyEngines } from './agents/army-adapter.js'
import { refreshSkills, selectSkillsForMessage, formatSkillsForContext } from './skills/registry.js'

// ─── Hermes v0.17.0 能力移植模块 ───
import { ACPRouter, MemoryTransport } from './acp/router.js'
import { getPluginRegistry } from './capabilities/marketplace/plugin-registry.js'
import { EvolutionScheduler } from './skills/self-evolution.js'
import { PriorityMessageQueue, ChannelHealthChecker } from './social/gateway-enhancements.js'
import { HybridRetriever, ContextWindowOptimizer } from './context/hybrid-retriever.js'
import { ChromaDBProvider, MemoryCompressor, ProviderFusion } from './memory/memory-enhancements.js'
import { learnSkill, isLearnCommand, extractLearnDescription } from './skills/learn.js'
import { tryAutoConfigureKey } from './key-auto-config.js'
import { PRIMARY_USER_ID, formatPresenceForPrompt, normalizeChannel, isExternalChannel } from './identity.js'
import { truncateToolResultForUI } from './runtime/tool-result-preview.js'
import { buildLLMMessages } from './runtime/messages.js'
import { parseMarkers } from './runtime/markers.js'
import { buildStrictEvaluationContext, filterStrictEvaluationTools, resolveStrictEvaluationMode } from './runtime/strict-evaluation.js'
import { extractVerbatimPayload, findRecentVerbatimPayload, hasInlineVerbatimPayload, isVerbatimOutputRequest, isVerbatimSetup, isVerbatimStart } from './runtime/verbatim.js'
import { refreshUserProfile } from './profile/infer.js'

// On first launch, copy sandbox seed files from the resource directory to the user data directory (Electron install)
seedSandboxOnce()
seedMusicOnce()

// 瀹夊叏鎶ゆ爮锛氭妸鍘嗗彶涓婅钀藉湪瀹夎鐩綍閲岀殑宸ヤ綔鏂囦欢杩佸洖 sandbox锛堥伩鍏嶄笅娆℃洿鏂伴殢瀹夎鐩綍琚竻绌猴級銆?
// 杩佺Щ鍙戠敓鍚庣敤绮樻€т簨浠跺憡璀︼紝鍓嶇杩炰笂鍗冲彲鐪嬪埌鎻愮ず銆?
try {
  const rescuedDirs = rescueDataFromInstallDir()
  if (rescuedDirs.length > 0) {
    setStickyEvent('install_dir_rescue', {
      level: 'warning',
      dirs: rescuedDirs,
      message: `妫€娴嬪埌 ${rescuedDirs.length} 涓伐浣滅洰褰曞師鍏堝瓨鏀惧湪绋嬪簭瀹夎鐩綍閲岋紙鏇存柊鏃朵細琚竻绌猴級锛屽凡鑷姩杩佺Щ鍒?sandbox锛?{rescuedDirs.join('銆?)}`,
    })
  }
} catch (err) {
  console.warn('[startup] 瀹夎鐩綍鏁版嵁杩佺Щ妫€鏌ュけ璐?', err?.message || err)
}

// Collect host system environment info (full scan + persist on first run, then refresh dynamic fields).
// Must complete before the main loop starts so buildSystemPrompt can inject the env block.
await collectSystemInfo()

// Scan the user's desktop (shortcuts cached by mtime, regular files scanned every time)
collectDesktopInfo(getDesktopPath())

// Scan installed software once so software/app/proxy questions can use local evidence.
collectInstalledSoftware()

// Scan the user's local resources (ssh hosts, keys, known_hosts, git identity)
// for the "Self-Sufficient Execution" prompt 鈥?so the agent already knows what
// the user has before being asked "涓婃湇鍔″櫒鐪嬬湅".
collectLocalResources()

// Collect geo-location + live weather (refresh on IP change or after 7 days; weather refreshed every time)
const geoResult = await collectGeoWeather()

// Collect trending topics (CN 鈫?Weibo+Zhihu, others 鈫?HN+Reddit; 1h cache)
await collectTrending(geoResult?.location?.country_code)

// Scan locally installed AI agents (Claude Code, Codex, Hermes, OpenClaw, etc.) and persist to known_agents table
await collectAgents()

// Load persisted installed tools
await loadInstalledTools()

// Load Agent Skills metadata. Full SKILL.md bodies are injected only when a turn matches.
const startupSkills = refreshSkills()
console.log(`[skills] Loaded ${startupSkills.length} Agent Skill(s)`)

// ACP
const acpRouter = new ACPRouter({ agentId: 'bailongma', agentName: 'Bailongma', capabilities: ['memory','context','skills','perception','execution','communication'] })
const memTransport = new MemoryTransport()
acpRouter.registerTransport(memTransport)
acpRouter.start()
console.log('[acp] ACP Router started')

// Plugin registry
const pluginRegistry = getPluginRegistry()
console.log('[plugins] Plugin registry initialized')

// Self-evolution scheduler
const evolutionScheduler = new EvolutionScheduler({ callLLM, skillsDir: null, intervalMs: 21600000 })
evolutionScheduler.start()
console.log('[evolution] Self-evolution scheduler started')

// Priority message queue
const messageQueue = new PriorityMessageQueue({ maxSize: 1000 })
messageQueue.startFlushing()
console.log('[gateway] Priority message queue started')

// Channel health checker
const healthChecker = new ChannelHealthChecker({ intervalMs: 30000 })
healthChecker.start()
console.log('[gateway] Channel health checker started')

// ChromaDB provider
const chromaProvider = new ChromaDBProvider({ collectionName: 'bailongma_memories' })
try {
  const { registerMemoryProvider } = await import('./memory/provider-registry.js')
  registerMemoryProvider('chromadb', chromaProvider)
  console.log('[memory] ChromaDB provider registered')
} catch (e) {
  console.warn('[memory] ChromaDB provider registration skipped:', e.message)
}

// AbortController for the current LLM call (used to interrupt the main loop)
let currentAbortController = null
let currentExecution = null

// Watchdog锛氬崟杞?runTurn 瓒呰繃杩欎釜鏃堕棿鏈繑鍥炶涓哄崱姝伙紙鏈€鍙兘鏄?fetch/LLM stream/涓夋柟缃戠粶璋冪敤
// 娌′紶 AbortSignal 涔熸病鑷繁瓒呮椂锛夈€傝Е鍙戝悗寮?abort锛屾妸 processing 娓呮帀锛屼富寰幆鑳界户缁?
// 澶勭悊鍚庣画娑堟伅銆備笉淇鎸傜潃鐨?promise锛堝畠浼氱暀鍦ㄥ唴瀛橀噷鐩村埌 GC 鎴栬嚜琛岀粨鏉燂級锛屼絾淇濊瘉 UI
// "鎬濊€冧腑"姘歌繙鍦ㄦ湁闄愭椂闂村唴瑙ｉ攣銆佺敤鎴风殑涓嬩竴鍙ヨ瘽鑳借姝ｅ父澶勭悊銆?
const RUN_TURN_WATCHDOG_MS = 600_000

const PRIORITY = {
  tick: 10,
  background: 50,
  user: 100,
}

const L2_CONTEXT_HOURS = 24 * 7
const STARTUP_SELF_CHECK_VERSION = 'v2'
const STARTUP_SELF_CHECK_CONFIG_KEY = 'l2_startup_self_check'

// Initialize database
getDB()
if (getMemoryCount() === 0) {
  console.log('[system] Memory store is empty 鈥?injecting default seed memories')
  await import('../scripts/seed-memories.js')
}
const birthTime = getOrInitBirthTime()
refreshUserProfile(PRIMARY_USER_ID)

// Awakening phase: first 10 heartbeat ticks after initial activation run at a fixed 10s cadence
const AWAKENING_CONFIG_KEY = 'awakening_ticks_remaining'
function getAwakeningTicks() {
  const raw = getConfig(AWAKENING_CONFIG_KEY)
  if (raw === null || raw === undefined || raw === '') return 10
  return Math.max(0, parseInt(raw, 10) || 0)
}
function decrementAwakeningTick() {
  const current = getAwakeningTicks()
  if (current > 0) setConfig(AWAKENING_CONFIG_KEY, String(current - 1))
}

// Awakening exploration tasks: after self-check completes, each autonomous heartbeat tick completes one in order
const EXPLORATION_INDEX_KEY = 'awakening_exploration_index'
// AwakeningCard call template 鈥?must be executed after completing each exploration step:
// ui_show("AwakeningCard", { index: N, total: 3, title: "title", finding: "one-sentence finding", emoji: "emoji" })
const AWAKENING_EXPLORATION_TASKS = [
  // 1. Read existing memories
  `Exploration (1/2): See what you already know.
Go through the injected memories silently and take stock: who do you know, what do you know, are there any threads with no follow-up.
[HARD RULE 鈥?DO NOT VIOLATE] During the awakening exploration phase the user has not started a conversation with you yet. Calling send_message to proactively open a topic 鈥?including any "casual mention" of memories you uncovered 鈥?is forbidden. Record findings only in the AwakeningCard below; do not turn them into outbound messages.
When done, call ui_show("AwakeningCard", { index:1, total:2, title:"Reading memories", finding:"(one sentence: the most notable lead in the memory store, or 'memory store ready')", emoji:"馃" }).
If later the user opens a conversation and the topic is relevant, you may bring the finding in then 鈥?not before.`,

  // 2. Surface an unfinished thread
  `Exploration (2/2): Find a forgotten thread.
Look through memories silently 鈥?what did the user mention before but never bring up again? A plan, an idea, something they said they wanted to do but never did?
[HARD RULE 鈥?DO NOT VIOLATE] Same as Task 1: send_message is forbidden during awakening exploration. Do not "casually bring it up". Do not ask "do you need me to move this forward?". Do not draft an opening line to the user. The thread, if found, lives only in the AwakeningCard finding field; it waits for the user to start the conversation.
When done, call ui_show("AwakeningCard", { index:2, total:2, title:"Unfinished thread", finding:"(one sentence describing the forgotten thread, or 'no open threads found')", emoji:"馃攳" }).`,
]

function getExplorationIndex() {
  const raw = getConfig(EXPLORATION_INDEX_KEY)
  if (raw === null || raw === undefined || raw === '') return 0
  return Math.max(0, parseInt(raw, 10) || 0)
}
function advanceExplorationTask() {
  const current = getExplorationIndex()
  if (current < AWAKENING_EXPLORATION_TASKS.length) {
    setConfig(EXPLORATION_INDEX_KEY, String(current + 1))
  }
}
function buildAwakeningExplorationDirections() {
  if (getAwakeningTicks() <= 0) return null  // 瑙夐啋鏈熷凡缁撴潫锛屼笉鍐嶆敞鍏ユ帰绱换鍔?
  const index = getExplorationIndex()
  if (index < AWAKENING_EXPLORATION_TASKS.length) return AWAKENING_EXPLORATION_TASKS[index]
  // All exploration tasks done 鈥?check whether to ask about agent delegation permissions
  const delegationAsk = buildDelegationAskDirections()
  return delegationAsk || null
}

// Restore persisted task from database (survives restarts)
const persistedTask = getConfig('current_task')
let persistedTaskSteps = []
try {
  const raw = getConfig('current_task_steps')
  if (raw) persistedTaskSteps = JSON.parse(raw)
} catch {}
if (persistedTask) {
  console.log(`[system] Resuming in-progress task: ${persistedTask.slice(0, 80)}`)
  if (persistedTaskSteps.length) console.log(`[system] Restoring task steps: ${persistedTaskSteps.length} step(s)`)
}

// Register provider (MiniMax handles multimedia capabilities, independent of the LLM choice).
function registerMinimaxIfAvailable() {
  const envKey = process.env.MINIMAX_API_KEY
  const configKey = config.provider === 'minimax' ? config.apiKey : null
  const storedKey = _getMinimaxKey()
  const key = envKey || configKey || storedKey
  if (key) registerProvider(new MinimaxProvider({ apiKey: key }))
}
registerMinimaxIfAvailable()

if (config.needsActivation) {
  console.log('[LLM] Not activated 鈥?waiting for user to enter API key on the activation page')
} else {
  console.log(`[LLM] Using ${config.provider} (model: ${config.model})`)
}

// Runtime state
const state = {
  action: null,
  task: persistedTask || null,
  taskSteps: persistedTaskSteps,  // [{ text, status, note }], status: pending/done/failed/skipped
  taskIdleTickCount: 0,           // consecutive idle tick count (increments when no tool calls in task mode)
  prev_recall: null,
  lastToolResult: null, // result of the last tool call; injected by the injector on the next TICK then cleared
  sessionCounter: 0,
  recentActions: [], // summaries of recent turns, format: { ts, summary }
  thoughtStack: [],  // thought stack, max 3 entries, format: { concept, line }
  startupSelfCheck: null,
  pendingVerbatimRecital: null,
  pendingConfidenceHint: null,  // 涓婁竴杞?refresh-loop 鐨?confidence锛屼緵涓嬫 runInjector 璋冩暣鍙洖鏁伴噺鍚庢竻绌?
  tickCounter: 0,             // 绱 TICK 璁℃暟锛堟瘡娆¤繘 isTick 璺緞鑷锛?
  lastTaskRefreshTick: -10,   // 涓婃 TICK 璺緞瑙﹀彂 refresh-loop 鏃剁殑 tickCounter锛涘垵鍊?-10 淇濊瘉棣栦釜 TICK 绔嬪埢鍙Е鍙戯紙宸€?= 0 - (-10) = 10 >= 5锛?
  threadState: initThreadState(),  // 绾跨储妯″瀷锛圖ynamicMemoryPool.md 绗?8 绔狅級锛歵hreads + 鍓嶅彴鎸囬拡 + 鎵胯锛岄噸鍚粠 db 鎭㈠
}

// 鍚姩鏃舵仮澶嶇嚎绱㈢姸鎬侊紱threads 琛ㄤ负绌轰絾鏃?focus_stack 鏈夎揣 鈫?涓€娆℃€ц縼绉伙紙鏍堥《=鍓嶅彴锛夈€?
function initThreadState() {
  const loaded = loadThreadState()
  if (loaded) return loaded
  try {
    const legacy = loadFocusStack()
    if (Array.isArray(legacy) && legacy.length > 0) {
      const migrated = migrateFocusStackToThreads(legacy)
      saveThreadState(migrated)
      console.log(`[threads] 浠庝笓娉ㄦ爤杩佺Щ ${migrated.threads.length} 鏉＄嚎绱紙鍓嶅彴 = 鍘熸爤椤讹級`)
      return migrated
    }
  } catch (e) {
    console.warn('[threads] focus_stack 杩佺Щ澶辫触:', e?.message || e)
  }
  return { threads: [], foregroundId: null, commitments: [] }
}

// brain-ui 鍏煎锛氭妸绾跨储鐘舵€佹淳鐢熸垚"鏍堣鍥?锛堝悗鍙版寜娲昏穬鏃堕棿鍗囧簭 + 鍓嶅彴鍨簳=鏍堥《锛夛紝
// focus_frame 浜嬩欢 payload 褰㈢姸涓嶅彉锛屼笓娉ㄥ抚瑙傚療闈㈡澘闆舵敼鍔ㄣ€?
function deriveStackView(state) {
  const ts = ensureThreadState(state)
  const background = ts.threads
    .filter(t => t.id !== ts.foregroundId)
    .sort((a, b) => Date.parse(a.lastEventAt || 0) - Date.parse(b.lastEventAt || 0))
  const fg = getForegroundThread(state)
  return fg ? [...background, fg] : background
}

const TASK_IDLE_TICK_LIMIT = 5  // auto-clear task after N consecutive task ticks with no tool calls

// 璇嗗埆鍣ㄥ幓鎶栬皟搴︼細鎵归噺 recognizer 瀹屾垚鍚庣収甯稿箍鎾?memories_written锛堟寜鎵癸紝count 涓鸿鎵瑰啓鍏ユ€绘暟锛?
configureRecognizerScheduler({
  onResult: (memories) => {
    emitEvent('memories_written', { count: memories?.length || 0, memories: memories || [] })
    if (Array.isArray(memories) && memories.length > 0) {
      refreshUserProfile(PRIMARY_USER_ID)
    }
  },
})

function summarizeToolCall(t = {}) {
  const args = t.args || {}
  const status = t.ok === false ? ' failed' : ''
  if (t.name === 'send_message') return `send_message -> ${args.target_id || args.to || 'unknown'}${status}`
  if (t.name === 'fetch_url') return `fetch_url(${String(args.url || '').slice(0, 60)})${status}`
  if (t.name === 'write_file') return `write_file(${args.path || args.filename || args.file_path || '?'})${status}`
  if (t.name === 'read_file') {
    const pathArg = args.path || args.filename || args.file_path || '?'
    const rangeParts = []
    if (args.start_line !== undefined) rangeParts.push(`start=${args.start_line}`)
    if (args.end_line !== undefined) rangeParts.push(`end=${args.end_line}`)
    if (args.max_lines !== undefined) rangeParts.push(`max=${args.max_lines}`)
    const range = rangeParts.length ? ` ${rangeParts.join(' ')}` : ''
    return `read_file(${pathArg}${range})${status}`
  }
  if (t.name === 'exec_command') return `exec_command(${String(args.command || '').slice(0, 80)})${status}`
  return `${t.name || 'tool'}${status}`
}

// 绾跨储妯″瀷锛歵ask 鐢熷懡鍛ㄦ湡 鈫?鎵胯鐢熷懡鍛ㄦ湡銆?
// set_task = "濂界殑鎴戝幓鍋?鐨勫伐绋嬪寲鏃跺埢锛堝崟 Agent 鐗?spawn锛夛細缁欏墠鍙扮嚎绱㈡寕鎵胯锛岄拤浣忔俯搴︼紱
// 浠诲姟瀹屾垚/鍙栨秷 = 浜ゅ樊锛氬叧鎵胯锛岀嚎绱㈡寜 lastEventAt 鑷劧闄嶆俯鈥斺€旀病鏈変换浣曠獊鍙樺姩浣溿€?
function openTaskCommitment(description) {
  try {
    const commitment = openCommitment(state, { text: String(description || ''), tick: state.tickCounter || 0 })
    // task 鈫?鎵胯缁戝畾锛歵ask 妲芥槸鍗曚緥锛坰et_task B 浼氳鐩?A锛夛紝浣嗘壙璇烘槸澶氫緥鐨勨€斺€?
    // 鏀跺熬鏃跺繀椤绘寜 id 绮剧‘鍏?褰撳墠 task 鐨勬壙璇?锛屽惁鍒?closeCommitment 榛樿鍏虫渶鑰佺殑
    // open 鎵胯锛屼换鍔?B 瀹屾垚浼氳鍏充换鍔?A 鐨勬壙璇猴紙琚鐩栫殑 A 鎵胯淇濇寔 open锛?
    // 鐢ㄦ埛娌″彇娑?A锛屾壙璇轰粛鏈厬鐜帮紝绾跨储淇濇寔 warm 绛夌敤鎴峰洖鏉ラ棶锛夈€?
    state.taskCommitmentId = commitment?.id || null
    // 璺ㄩ噸鍚寔涔呭寲锛歵ask 浠?config 鎭㈠銆佹壙璇轰粠 db 鎭㈠锛岀粦瀹氬叧绯讳篃寰楄窡鐫€娲讳笅鏉ワ紝
    // 鍚﹀垯閲嶅惎鍚庢敹灏鹃€€鍖栧洖"鍏虫渶鑰佺殑 open 鎵胯"銆?
    setConfig('current_task_commitment_id', commitment?.id || '')
    saveThreadState(state.threadState)
  } catch (e) {
    console.log('[threads] openCommitment failed:', e?.message || e)
  }
}
function closeTaskCommitment(status = 'done') {
  try {
    const boundId = state.taskCommitmentId || getConfig('current_task_commitment_id') || null
    const closed = closeCommitment(state, {
      commitmentId: boundId,
      status,
    })
    state.taskCommitmentId = null
    setConfig('current_task_commitment_id', '')
    if (closed) saveThreadState(state.threadState)
  } catch (e) {
    console.log('[threads] closeCommitment failed:', e?.message || e)
  }
}

function autoCompleteTask(reason) {
  const clearedTask = state.task
  state.task = null
  state.lastTaskRefreshTick = -10
  state.taskSteps = []
  state.taskIdleTickCount = 0
  setConfig('current_task', '')
  setConfig('current_task_steps', '[]')
  closeTaskCommitment('done')
  console.log(`[task] Auto-cleared (${reason}): ${clearedTask}`)
  emitEvent('task_cleared', { task: clearedTask, summary: `Auto-cleared: ${reason}` })
  if (clearedTask) {
    insertMemory({
      event_type: 'task_complete',
      content: `Task auto-cleared: ${clearedTask.slice(0, 60)}`,
      detail: `Reason: ${reason}`,
      entities: [], concepts: [], tags: ['task_complete'],
      timestamp: nowTimestamp(),
    })
  }
}

function newSessionRef() {
  state.sessionCounter++
  return `session_${Date.now()}_${state.sessionCounter}`
}

function readStartupSelfCheckState() {
  try {
    const raw = getConfig(STARTUP_SELF_CHECK_CONFIG_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeStartupSelfCheckState(value) {
  setConfig(STARTUP_SELF_CHECK_CONFIG_KEY, JSON.stringify(value))
}

function ensureStartupSelfCheckState() {
  const current = readStartupSelfCheckState()
  if (current?.version === STARTUP_SELF_CHECK_VERSION && current.status === 'completed') {
    state.startupSelfCheck = { ...current, active: false }
    return state.startupSelfCheck
  }

  const now = nowTimestamp()
  const next = {
    version: STARTUP_SELF_CHECK_VERSION,
    status: 'running',
    started_at: current?.started_at || now,
    updated_at: now,
    attempts: Number(current?.attempts || 0) + (current?.status === 'running' ? 0 : 1),
    results: current?.version === STARTUP_SELF_CHECK_VERSION && current?.results ? current.results : {},
    active: true,
  }
  writeStartupSelfCheckState(next)
  state.startupSelfCheck = next
  return next
}

function buildStartupSelfCheckDirections(checkState) {
  if (!checkState?.active) return ''
  return [
    `This is the L2 startup self-check flow (${STARTUP_SELF_CHECK_VERSION}). It runs once; when finished you must call complete_startup_self_check to record the results 鈥?it will not run again.`,
    `[HARD RULE 鈥?DO NOT VIOLATE] During self-check, calling send_message is strictly forbidden. No text output of any kind (including "checking鈥?, "self-check complete", or any other text). All status must be expressed through speak (voice) and ui_show (cards). The text channel must remain completely silent; any text output counts as self-check failure.`,
    `Complete the following 3 checks in order. Before each one, you must simultaneously play a Chinese voice announcement and show a progress card. After the check completes, close the card before moving to the next:`,
    `1. Call speak text="姝ｅ湪妫€鏌ユ枃浠惰鍐欒兘鍔?; call ui_show("SelfCheckStepCard", {step:1, total:3, name:"鏂囦欢璇诲啓", icon:"馃搧"}) and save the returned id as step_card_id. Then: use write_file to write self_check.txt in the sandbox root (content = current timestamp), then read_file it back to verify consistency. Record the result and call ui_hide(step_card_id).`,
    `2. Call speak text="姝ｅ湪妫€鏌ョ儹鐐归潰鏉?; call ui_show("SelfCheckStepCard", {step:2, total:3, name:"鐑偣闈㈡澘", icon:"馃寪"}) and save the returned id as step_card_id. Then: hotspot_mode action=show; confirm it returns ok, then hotspot_mode action=hide. Record the result and call ui_hide(step_card_id).`,
    `3. Call speak text="姝ｅ湪妫€鏌ヨ棰戞ā寮?; call ui_show("SelfCheckStepCard", {step:3, total:3, name:"瑙嗛妯″紡", icon:"馃幀"}) and save the returned id as step_card_id. Then: web_search for "bilibili Iron Man JARVIS" ONCE 鈥?this is only a self-check, so take the FIRST BV number that appears in the results and stop immediately; do NOT keep searching for more videos or compare options, one valid BV id is enough. media_mode mode=video action=show url=https://www.bilibili.com/video/<BV> autoplay=true; wait ~5 seconds; media_mode mode=video action=hide. Record the result and call ui_hide(step_card_id).`,
    `Result values: use ok, degraded, error, or skipped_* for each item. Continue to the next item even if one fails.`,
    `[FINAL TWO STEPS 鈥?REQUIRED]\n(a) Call ui_show to display SelfCheckCard with props: { results: [{name:"鏂囦欢璇诲啓",status:"ok/error",...},{name:"鐑偣闈㈡澘",...},{name:"瑙嗛妯″紡",...}], overall:"ok/degraded/error" }. Infer overall from actual results: all ok 鈫?ok; any skipped 鈫?degraded; any error 鈫?error.\n(b) Call complete_startup_self_check with a summary (one sentence) and the results object.`,
  ].join('\n')
}

// Fallback 鎶曢€掞細褰撴ā鍨嬫湭鎸夊崗璁皟 send_message 鏃剁敱涓诲惊鐜唬涓烘姇閫掋€?
// 鐢?msg 鑷甫鐨?externalPartyId + channel 璺敱锛堢敤鎴蜂粠鍝効鍙戯紝灏卞洖鍒板摢鍎匡級锛屽苟鍐欏叆 conversations 琛ㄣ€?
//
// 鍚屾鍐欎竴鏉?action_logs锛坱ool='send_message', source='fallback'锛夛紝淇濊瘉 jarvis 鍦?
// action_log 閲岃兘瀹屾暣鐪嬪埌鑷繁鐨勬墍鏈夌湡瀹炶緭鍑衡€斺€攕elf-snapshot 鐨勮韩浠介敋鎵嶆湁鎹彲渚濓紝
// 涓嶄細鎶?fallback 鎶曢€掕鍒ゆ垚"骞界伒鍥炲锛堢湅浼兼槸浣犺杩囦絾 action_log 娌¤褰曪級"銆?
function deliverFallbackReply(msg, content, timestamp) {
  const channel = msg.channel || ''
  const externalPartyId = msg.externalPartyId || ''
  emitEvent('message', {
    from: 'consciousness',
    to: msg.fromId,
    content,
    timestamp,
    channel,
    external_party_id: externalPartyId,
  })
  if (externalPartyId) {
    dispatchSocialMessage(externalPartyId, content).catch(err => console.warn('[social] fallback send failed:', err.message))
  }
  insertConversation({
    role: 'jarvis',
    from_id: 'jarvis',
    to_id: msg.fromId,
    content,
    timestamp,
    channel,
    external_party_id: externalPartyId,
    // P0-2锛歠allback 鎶曢€掔殑 reply 鍚屾牱妫€娴嬫湯灏炬槸鍚︽槸 follow-up 鎮康
    open_question: detectOpenFollowupQuestion(content) ? 1 : 0,
  })
  // 鍚屾鐧昏 action_log锛岃 self-snapshot 鑳界敤 action_log 浣滀负韬唤閿氱殑鐪熷€兼簮銆?
  // tool 浠嶄负 send_message锛屼絾 source 鏍?'fallback' 浠ヤ究鍖哄垎涓诲姩璋冪敤涓庡崗璁厹搴曘€?
  try {
    insertActionLog({
      timestamp,
      tool: 'send_message',
      summary: `send_message -> ${msg.fromId} (fallback)`,
      detail: String(content).slice(0, 280),
      status: 'ok',
      risk: 'medium',
      args: { target_id: msg.fromId, content, channel },
      resultPreview: `娑堟伅宸插彂閫佽嚦 ${msg.fromId}${channel ? `锛?{channel}锛塦 : ''} [fallback]`,
      durationMs: 0,
      source: 'fallback',
    })
  } catch (e) {
    console.warn('[fallback] insertActionLog failed:', e?.message || e)
  }
}

function formatQuickWeatherReply(cardProps) {
  if (!cardProps) return ''
  const city = cardProps.city || '褰撳湴'
  const temp = Number.isFinite(cardProps.temp) ? `${Math.round(cardProps.temp)}搴 : ''
  const feel = Number.isFinite(cardProps.feel) ? `浣撴劅${Math.round(cardProps.feel)}` : ''
  const condition = cardProps.condition || cardProps.desc || ''
  const parts = [temp, feel, condition].filter(Boolean)
  return parts.length ? `${city}鐜板湪${parts.join('锛?)}銆俙 : ''
}

async function tryHandleDirectWeatherTurn(input, msg, { finishTurn } = {}) {
  if (!msg || !isWeatherQuery(input)) return false

  emitEvent('action', {
    tool: 'weather_query',
    summary: '鏌ヨ澶╂皵',
    detail: String(input || '').slice(0, 120),
  })

  const cardProps = await getWeatherCardProps(input)
  if (!cardProps) return false

  const reply = formatQuickWeatherReply(cardProps)
  if (!reply) return false

  // P0-1锛氬ぉ姘斿揩閫熻矾寰勭粫寮€浜?updateFocusFrame锛岄渶瑕佹墜鍔ㄧ粰鏈疆 user 娑堟伅鍜?
  //   鍗冲皢鍐欏叆鐨?jarvis 鍥炲鎵撲笂"澶╂皵"鐒︾偣鏍囩锛涘惁鍒?conversationWindow 閲?
  //   杩欎袱琛?focus_topic 姘歌繙鏄┖锛岀牬鍧忚瘽棰樿竟鐣屾爣娉ㄣ€?
  setCurrentFocusTopic('澶╂皵')
  setCurrentThreadId('')  // 澶╂皵鏄竴娆℃€у彾瀛愶紝涓嶅綊灞炰换浣曠嚎绱?
  try { updateUserMessageFocusTopic(msg.fromId, msg.timestamp, '澶╂皵') } catch {}

  const timestamp = nowTimestamp()
  if (isVoiceChannel(msg.channel)) autoSpeakForVoiceReply(reply)
  deliverFallbackReply(msg, reply, timestamp)

  if (hasACUIClient()) {
    const id = `weathercard-${Date.now()}`
    emitUICommand({
      op: 'mount',
      id,
      component: 'WeatherCard',
      props: cardProps,
      hint: { placement: 'notification', enter: 'flash-in', exit: 'flash-out' },
    })
    addActiveUICard(id, { component: 'WeatherCard' })
    emitEvent('action', { tool: 'ui_show', summary: '鎺ㄩ€佸崱鐗?, detail: 'WeatherCard' })
  }

  finishTurn?.(reply)
  return true
}

export function buildToolContext({ currentTargetId = null, conversationWindow = [], includeRecentPartners = false } = {}) {
  const visibleTargetIds = [
    currentTargetId,
    ...conversationWindow.flatMap(item => [item.from_id, item.to_id]),
  ].filter(id => id && id !== 'jarvis')

  // TICK scenario: add recent contacts and the primary user so the agent can proactively reach established connections.
  if (includeRecentPartners && !currentTargetId) {
    visibleTargetIds.push(PRIMARY_USER_ID, ...getRecentConversationPartners(L2_CONTEXT_HOURS, 20))
  }

  const unique = [...new Set(visibleTargetIds.filter(Boolean))]
  // currentTargetId 蹇呴』鍥炰紶锛氬伐鍏锋墽琛屽眰锛坙lm.js 鐨勮€楁椂宸ュ叿鍗虫椂鍥炲簲 ack銆乻end_message 鍗忚鍏滃簳锛?
  // 閮介潬 toolContext.currentTargetId 鎵?褰撳墠璇ュ洖澶嶈皝"銆傛棭鍏堝彧鐢ㄥ畠绠?visibleTargetIds 鍗存病鏀惧洖
  // 杩斿洖瀵硅薄锛屽鑷?toolContext.currentTargetId 鎭掍负 undefined 鈥斺€?ack 涓嶅彂銆乫allback 鎶曢€掍篃鎷夸笉鍒扮洰鏍囥€?
  return { currentTargetId: currentTargetId || null, allowedTargetIds: unique, visibleTargetIds: unique }
}

function buildToolContextForProcess(msg, injection) {
  const base = buildToolContext({
    currentTargetId: msg?.reminderTargetId || msg?.fromId || null,
    conversationWindow: injection.conversationWindow || [],
    includeRecentPartners: true,
  })

  return {
    ...base,
    // 褰撳墠 turn 鐨勬笭閬撲俊鎭細execSendMessage 鍦?AUTO 妯″紡涓嬩紭鍏堢敤杩欓噷锛岀‘淇?鍦ㄥ摢鍎挎敹鐨勬秷鎭氨鍥炲埌鍝効"
    currentChannel: msg?.channel || null,
    currentExternalPartyId: msg?.externalPartyId || null,
    currentUserMessage: msg?.content || null,
    // 鑷垜鎰熺煡淇″彿锛氫紶缁欏伐鍏锋墽琛屽眰锛堝 upsert_memory 瀹堥棬锛夛紝璁?闀滃儚姹℃煋"鍦ㄥ啓鍏ラ暱鏈熻蹇嗗墠灏辫鎷︽埅
    selfPerception: injection.selfPerception || null,

    // 瀹¤鍒嗚韩锛坮eview_work锛夊彇璇佺敤锛氬綋鍓嶄换鍔＄洰鏍?+ 姣忔鐘舵€併€傝瀹¤鍒嗚韩鑳芥嬁鍒颁富 Agent 鑷繁鐨?
    // 璁″垝鍋氬鐓э紝鐪?澹扮О瀹屾垚"涓庢瘡姝ヨ瘉鎹槸鍚︿竴鑷淬€傚彧璇诲揩鐓э紝涓嶅彲琚富 Agent 鏀瑰啓銆?
    getTaskState: () => ({ task: state.task, steps: state.taskSteps }),

    onSetTask: (description, steps) => {
      state.task = description
      state.lastTaskRefreshTick = -10
      state.taskSteps = steps.map(s => ({ text: s, status: 'pending', note: '' }))
      setConfig('current_task', description)
      setConfig('current_task_steps', JSON.stringify(state.taskSteps))
      openTaskCommitment(description)
      console.log(`[task] Started: ${description} (${steps.length} step(s))`)
      emitEvent('task_set', { task: description, steps })
    },

    onCompleteTask: (summary) => {
      const clearedTask = state.task
      state.task = null
      state.taskSteps = []
      state.taskIdleTickCount = 0
      setConfig('current_task', '')
      setConfig('current_task_steps', '[]')
      closeTaskCommitment('done')
      console.log(`[task] Completed: ${clearedTask}`)
      emitEvent('task_cleared', { task: clearedTask, summary })
      if (clearedTask) {
        insertMemory({
          event_type: 'task_complete',
          content: `Task completed: ${clearedTask.slice(0, 60)}${summary ? ' 鈥?' + summary.slice(0, 60) : ''}`,
          detail: 'Task marked complete via the complete_task tool',
          entities: [], concepts: [], tags: ['task_complete'],
          timestamp: nowTimestamp(),
        })
      }
    },

    onUpdateTaskStep: (idx, status, note) => {
      if (!state.taskSteps[idx]) return { error: `Step ${idx + 1} does not exist (${state.taskSteps.length} total)` }
      state.taskSteps[idx] = { ...state.taskSteps[idx], status, note }
      setConfig('current_task_steps', JSON.stringify(state.taskSteps))
      const total = state.taskSteps.length
      const done = state.taskSteps.filter(s => s.status === 'done').length
      emitEvent('task_step_updated', { index: idx, status, note, progress: `${done}/${total}` })
      // Option C: auto-clear task when all steps reach a terminal state
      const terminal = ['done', 'failed', 'skipped']
      const allTerminal = total > 0 && state.taskSteps.every(s => terminal.includes(s.status))
      // 鍦?autoCompleteTask 娓呯┖ taskSteps 涔嬪墠鍏堢畻濂?涓嬩竴姝?鏄惁鏈夊け璐?锛屽洖浼犵粰 executor锛?
      // 璁?update_task_step 鐨勮繑鍥炰覆鎶婃ā鍨嬫帹杩涗笅涓€涓?鎵ц鈫掕瀵熲啋鍒ゆ柇 寰惊鐜紙ReAct 椹卞姩锛夈€?
      const nextIndex = state.taskSteps.findIndex(s => s.status === 'pending')
      const nextStep = nextIndex >= 0 ? state.taskSteps[nextIndex].text : null
      const anyFailed = state.taskSteps.some(s => s.status === 'failed')
      if (allTerminal) autoCompleteTask('all steps complete')
      return {
        total,
        done,
        progress: `${done}/${total}`,
        allTerminal,
        nextIndex: nextIndex >= 0 ? nextIndex : null,
        nextStep,
        anyFailed,
      }
    },

    startupSelfCheck: state.startupSelfCheck,
    onCompleteStartupSelfCheck: ({ summary = '', results = {} } = {}) => {
      const now = nowTimestamp()
      const completed = {
        version: STARTUP_SELF_CHECK_VERSION,
        status: 'completed',
        started_at: state.startupSelfCheck?.started_at || now,
        completed_at: now,
        updated_at: now,
        results,
        summary,
      }
      writeStartupSelfCheckState(completed)
      state.startupSelfCheck = { ...completed, active: false }
      insertMemory({
        mem_id: `system_l2_startup_self_check_${STARTUP_SELF_CHECK_VERSION}`,
        type: 'system',
        title: `L2 startup self-check ${STARTUP_SELF_CHECK_VERSION}`,
        content: `L2 startup self-check completed: ${summary || 'no summary'}`,
        detail: JSON.stringify({ summary, results }, null, 2),
        tags: ['system', 'l2', 'startup_self_check', STARTUP_SELF_CHECK_VERSION],
        entities: [],
        timestamp: now,
      })
      clearStickyEvent('startup_self_check_started')
      emitEvent('startup_self_check_completed', completed)
      return completed
    },

    onRecall: (query) => {
      state.prev_recall = query
    },
  }
}

function resolveTurnTools(injectedTools = [], { silentSignal = false, strictEvaluation = null } = {}) {
  if (silentSignal) return []
  const tools = Array.isArray(injectedTools) ? injectedTools.filter(Boolean) : []
  if (!tools.includes('send_message')) tools.unshift('send_message')
  return filterStrictEvaluationTools(tools, strictEvaluation)
}

const MAX_MESSAGE_RETRIES = 3

function createAbortError(reason = 'Aborted') {
  const err = new Error(reason)
  err.name = 'AbortError'
  return err
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw createAbortError(signal.reason || 'Aborted')
}

function getProcessPriority(msg) {
  if (!msg) return PRIORITY.tick
  return typeof msg.priority === 'number' ? msg.priority : PRIORITY.background
}

function isVoiceChannel(channel) {
  return channel === 'voice' || channel === '璇煶璇嗗埆' || channel === 'FocusBanner' || channel === 'web' || channel === 'API'
}

// 璇煶杞噷"鏄庢樉瑕佸線澶栭儴/绀句氦娓犻亾鍙戦€?鐨勬剰鍥锯€斺€斿懡涓垯淇濈暀 send_message 宸ュ叿锛?
// 鍚﹀垯璇煶杞粯璁ゆ挙鎺夊畠锛堝洖澶嶈蛋绾枃鏈洿鎶?TTS锛夈€傚畞鍙紡鍒わ紙灏戞暟鎯呭喌涓嬫ā鍨嬪涓嶅埌澶栧彂閫氶亾锛?
// 浼氬瀹炶涓€澹帮級涔熶笉璇垽锛?鍙?瀛楀お瀹芥硾涓嶆敹锛屽繀椤诲甫鏄庣‘娓犻亾璇嶆垨"鍙戝埌/鍙戠粰鎴?杩欑被璺敱鎰忓浘锛夈€?
const EXTERNAL_SEND_HINTS = [
  '寰俊', 'wechat', 'discord', '椋炰功', 'feishu', '浼佸井', 'wecom',
  '鍙戝埌', '鎺ㄩ€佸埌', '鍙戠粰鎴?, '杞粰', '鍙戞潯寰俊', '鍙戜釜寰俊', '鍙戞垜寰俊',
]
function voiceTurnNeedsSendMessage(text) {
  const b = String(text || '').toLowerCase()
  return EXTERNAL_SEND_HINTS.some(k => b.includes(k.toLowerCase()))
}

function deliverDirectReply(msg, content, finishTurn) {
  const timestamp = nowTimestamp()
  if (isVoiceChannel(msg?.channel)) autoSpeakForVoiceReply(content)
  deliverFallbackReply(msg, content, timestamp)
  finishTurn?.(content)
}

function tryHandleVerbatimTurn(input, msg, { finishTurn, conversationWindow = [] } = {}) {
  if (!msg || msg.silent === true) return false
  const text = String(input || '').trim()
  if (!text) return false

  if (isVerbatimStart(text) && state.pendingVerbatimRecital?.text) {
    const reply = state.pendingVerbatimRecital.text
    state.pendingVerbatimRecital = null
    deliverDirectReply(msg, reply, finishTurn)
    return true
  }

  const payload = extractVerbatimPayload(text)
  if (isVerbatimSetup(text) && payload.length >= 20) {
    state.pendingVerbatimRecital = {
      text: payload,
      sourceTimestamp: msg.timestamp || nowTimestamp(),
      createdAt: Date.now(),
    }
    deliverDirectReply(msg, '鏀跺埌锛屽噯澶囧ソ浜嗐€傝"寮€濮?鎴戝氨璇汇€?, finishTurn)
    return true
  }

  if (isVerbatimOutputRequest(text)) {
    const reply = (hasInlineVerbatimPayload(text) && payload.length >= 20)
      ? payload
      : (state.pendingVerbatimRecital?.text || findRecentVerbatimPayload(conversationWindow, msg))
    if (reply) {
      state.pendingVerbatimRecital = null
      deliverDirectReply(msg, reply, finishTurn)
      return true
    }
  }

  return false
}

function isFastUserMessage(msg) {
  return !!msg && getProcessPriority(msg) >= PRIORITY.user
}

function stableFocusTopic(frame) {
  if (!frame || !Array.isArray(frame.topic) || frame.topic.length === 0) return ''
  const hitCount = Number(frame.hitCount || 0)
  const hasConclusion = Array.isArray(frame.conclusions) && frame.conclusions.length > 0
  if (hitCount < 2 && !hasConclusion) return ''
  return frame.topic.slice(0, 3).join(',')
}

function shouldPreemptFor(entry) {
  if (!entry || !processing || !currentExecution) return true
  const incomingPriority = entry.priority || PRIORITY.background
  if (incomingPriority > currentExecution.priority) return true

  // Allow preemption between concurrent user messages.
  // If the current execution is stuck in a tool call, a new user message can still interrupt immediately.
  if (incomingPriority >= PRIORITY.user && currentExecution.priority >= PRIORITY.user) return true

  return false
}

function beginExecution({ priority, kind, label, controller }) {
  currentAbortController = controller
  currentExecution = {
    priority,
    kind,
    label,
    startedAt: Date.now(),
  }
}

function clearExecution(controller) {
  if (currentAbortController === controller) currentAbortController = null
  if (currentExecution && currentAbortController === null) currentExecution = null
}

function enqueueDueReminders() {
  const now = new Date().toISOString()
  const dueReminders = getDueReminders(now, 20)
  for (const reminder of dueReminders) {
    if (reminder.recurrence_type) {
      let nextDueIso
      try {
        const config = JSON.parse(reminder.recurrence_config || '{}')
        nextDueIso = calculateNextDueAt(reminder.recurrence_type, config, new Date()).toISOString()
      } catch (err) {
        console.error(`[reminder #${reminder.id}] Failed to calculate next recurrence time: ${err.message} 鈥?falling back to one-shot`)
        const marked = markReminderFired(reminder.id, now)
        if (!marked.changes) continue
      }
      if (nextDueIso) {
        const advanced = advanceReminderDueAt(reminder.id, nextDueIso)
        if (!advanced.changes) continue
      }
    } else {
      const marked = markReminderFired(reminder.id, now)
      if (!marked.changes) continue
    }
    pushMessage('SYSTEM', reminder.system_message, 'REMINDER', {
      reminderTargetId: reminder.user_id,
      reminderId: reminder.id,
    })
    emitEvent('reminder_fired', {
      id: reminder.id,
      user_id: reminder.user_id,
      due_at: reminder.due_at,
      task: reminder.task,
      recurrence_type: reminder.recurrence_type,
    })
  }
}

// Common LLM failure handler: set rate-limit on 429, requeue message, drop after max retries
function handleLLMFailure(err, label, msg) {
  console.error('LLM call failed:', err.message)
  if (err.message?.includes('429') || err.status === 429) setRateLimited()
  emitEvent('error', { label, error: err.message })
  if (msg) {
    const nextRetry = (msg.retryCount || 0) + 1
    if (nextRetry <= MAX_MESSAGE_RETRIES) {
      console.log(`[system] Message requeued (retry ${nextRetry}/${MAX_MESSAGE_RETRIES})`)
      emitEvent('message_requeued', { fromId: msg.fromId, retryCount: nextRetry, error: err.message })
      requeueMessage(msg, nextRetry)
    } else {
      console.error(`[system] Message dropped after ${MAX_MESSAGE_RETRIES} retries: ${msg.content?.slice(0, 60)}`)
      emitEvent('message_dropped', { fromId: msg.fromId, retryCount: nextRetry - 1, reason: err.message })
    }
  }
}

// 鍒ゆ柇鏈疆娑堟伅鐩稿鍘嗗彶鏄惁鍙戠敓浜?channel 鍒囨崲锛堝 TUI 鈫?WECHAT锛夈€?
// 鐢ㄤ簬缁?LLM 鏄惧紡鎻愮ず"鍏ュ彛鎹簡"锛岄伩鍏?閭ｇ幇鍦ㄥ憿"杩欑被杩介棶琚?runtime 鍧楋紙鐢甸噺绛夛級鎶㈣蛋浠ｈ瘝銆?
function detectChannelSwitch(msg, conversationWindow) {
  if (!msg) return false
  const currentNorm = normalizeChannel(msg.channel || '')
  if (!currentNorm) return false
  const rows = Array.isArray(conversationWindow) ? conversationWindow : []
  // 鍊掑簭鎵炬渶杩戜竴鏉′笉鏄?current 鏈韩銆佷笉鏄?SYSTEM 鐨勬秷鎭?
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    if (!row) continue
    const isSelf = row.role === 'user'
      && row.from_id === msg.fromId
      && row.timestamp === msg.timestamp
      && row.content === msg.content
    if (isSelf) continue
    const prevNorm = normalizeChannel(row.channel || '')
    if (!prevNorm || prevNorm === 'SYSTEM') continue
    return prevNorm !== currentNorm
  }
  return false
}

function isSoftwareInstallRequest(text = '') {
  const t = String(text || '').toLowerCase()
  return /瀹夎杞欢|瀹夎搴旂敤|瀹夎绋嬪簭|瀹夎瀹㈡埛绔瘄瑁呰蒋浠秥瑁呭簲鐢▅瑁呯▼搴弢瑁呭鎴风|涓嬭浇瀹夎鍖厊涓嬭浇杞欢|杞欢涓嬭浇|杞欢瀹夎鍖厊瀹夎鍖厊瀹樻柟瀹夎鍖厊瀹夎寰俊|瑁呭井淇涓嬭浇寰俊|寰俊瀹夎鍖厊瀹夎鍓槧|瑁呭壀鏄爘涓嬭浇鍓槧|鍓槧瀹夎鍖厊capcut|install app|install software|install program|install client|download installer|download setup|software installer|setup\.exe|\.msi|\.exe/.test(t)
}

// Build systemEnv on demand: inject each block based on keywords in the message
function buildSystemEnv(msg) {
  const text = (typeof msg === 'string' ? msg : msg?.content || '').toLowerCase()
  const blocks = []
  // 鑻辨枃缂╁啓鐢?\b 閬垮厤璇尮閰嶅瓙涓诧紙os鈫抍lose, ip鈫抯cript, ram鈫抪rogram锛?
  if (/绯荤粺淇℃伅|鎿嶄綔绯荤粺|鐢佃剳|涓绘満鍚峾鍐呭瓨|杩愯鍐呭瓨|hostname|鏃跺尯|鐢ㄦ埛鍚峾\bos\b|\bcpu\b|\bram\b|\bip\b|\bip鍦板潃\b|locale/.test(text))
    blocks.push(getSystemInfoBlock())
  if (/妗岄潰|蹇嵎鏂瑰紡|妗岄潰鏂囦欢|妗岄潰搴旂敤|宸插畨瑁厊娴忚鍣▅鍚姩绋嬪簭/.test(text))
    blocks.push(getDesktopBlock())
  if (isSoftwareInstallRequest(text) || /杞欢|搴旂敤|绋嬪簭|瀹㈡埛绔瘄宸ュ叿|瑁呬簡浠€涔坾鐢ㄤ簡浠€涔坾浠ｇ悊|绉戝涓婄綉|缈诲|\bvpn\b|\bproxy\b|clash|mihomo|v2ray|xray|sing-?box|shadowrocket|shadowsocks|wireguard|tailscale|zerotier|openvpn/.test(text))
    blocks.push(getInstalledSoftwareBlock())
  if (/澶╂皵|姘旀俯|娓╁害|涓嬮洦|涓嬮洩|鏅村ぉ|姘斿€檤椋庡姏|椋庨€焲鍙伴|浣嶇疆|鍩庡競|鍦ㄥ摢涓煄甯?.test(text))
    blocks.push(getGeoWeatherBlock())
  if (/鐑偣|鏂伴椈|鐑悳|鐑|浠婂ぉ鍙戠敓|鏈€杩戝彂鐢焲寰崥|鐭ヤ箮|澶存潯/.test(text))
    blocks.push(getTrendingBlock())
  return blocks.filter(Boolean).join('\n\n')
}

async function runTurn(input, label, msg = null) {
  const sessionRef = newSessionRef()
  const isTick = !msg
  const silentSignal = msg?.silent === true
  if (isTick) state.tickCounter += 1
  const priority = getProcessPriority(msg)
  const fastUserPath = isFastUserMessage(msg)
  const controller = new AbortController()
  let llmResult = null
  let toolCallLog = []
  let voiceTurn = false
  let localReply = false
  let terminalEmitted = false
  const finishTurn = (content = '') => {
    if (isTick || silentSignal || terminalEmitted) return
    terminalEmitted = true
    emitEvent('response', { sessionRef, label, content })
  }

  console.log(`\n鈹€鈹€ ${label} 鈹€鈹€`)
  if (!silentSignal) emitEvent(isTick ? 'tick' : 'message_received', { label, input: input.slice(0, 300) })

  // User messages are written to conversations at the pushMessage stage (recorded on arrival) 鈥?do not write them again here.
  try {
    beginExecution({
      priority,
      kind: isTick ? 'tick' : (fastUserPath ? 'user' : 'background'),
      label,
      controller,
    })

    if (isTick) ensureStartupSelfCheckState()

    const earlyConversationWindow = msg ? getRecentConversationTimeline(12, 2, { includeAbsorbed: true }) : []
    if (!isTick && tryHandleVerbatimTurn(input, msg, { finishTurn, conversationWindow: earlyConversationWindow })) {
      return
    }

    // Key auto-config: if the user message contains an API key, silently configure it, purge the DB entry, notify frontend, and skip LLM
    let keyConfigFailDir = null
    if (!isTick && msg) {
      const recentCtx = getRecentConversationTimeline(5, 1).map(r => r.content || '').join(' ')
      const autoConfigResult = await tryAutoConfigureKey(input, recentCtx)
      if (autoConfigResult?.ok) {
        // Delete the user message from DB (no key trace left)
        getDB().prepare(
          `DELETE FROM conversations WHERE role = 'user' AND from_id = ? AND timestamp = ?`
        ).run(msg.fromId, msg.timestamp)
        // Notify frontend: remove last user message bubble + speak via TTS if available
        emitEvent('key_configured', {
          ttsText: autoConfigResult.hasTTS ? 'Voice synthesis successful' : null,
        })
        finishTurn()
        return  // Skip LLM, silent round
      }
      if (autoConfigResult && !autoConfigResult.ok) {
        // Key detected but validation failed: keep message and let LLM inform the user
        keyConfigFailDir = `[system] An API key was detected in the user message but validation failed: ${autoConfigResult.error}. Inform the user that the key is invalid and suggest checking whether it is correct or has expired.`
      }
    }

    if (!isTick && await tryHandleDirectWeatherTurn(input, msg, { finishTurn })) {
      return
    }
    // /learn command: Agent auto-generates SKILL.md from user description
    if (!isTick && msg && isLearnCommand(input)) {
      const desc = extractLearnDescription(input)
      if (!desc) {
        finishTurn('璇锋弿杩颁綘鎯虫暀鎴戠殑宸ヤ綔娴侊紝渚嬪锛?learn 姣忓ぉ鏃╀笂8鐐规鏌ュぉ姘斿苟鎺ㄩ€?)
        return
      }
      const result = await learnSkill(desc, { callLLM, sandboxSkillsDir: null })
      if (result.ok) {
        finishTurn(`宸插浼氥€?{result.skillName}銆嶆妧鑳姐€俓n\n棰勮锛歕n${result.preview}`)
      } else {
        finishTurn(`瀛︿範澶辫触锛?{result.error}`)
      }
      return
    }


    // 1. Injector
    const injection = await runInjector({ message: input, state })
    throwIfAborted(controller.signal)

    // 1b. 绾跨储妯″瀷锛圖ynamicMemoryPool.md 绗?8 绔狅級鈥斺€?涓撴敞鏍堢殑缁т换鑰呫€?
    // 鍙湁鐢ㄦ埛娑堟伅璧板綊灞炲垽瀹氾紙绾惎鍙戝紡锛岄浂 LLM 寤惰繜锛夛紱TICK 姘镐笉鍙備笌鍒ゅ畾涔熸案涓嶈Е鍙戦檷娓?
    // 鈥斺€旀俯搴︽槸璇绘椂绠楀嚭鏉ョ殑锛坆uildThreadView锛夛紝娌℃湁"stale 娓呯悊"杩欎釜鍔ㄤ綔銆?
    try {
      const saveState = () => saveThreadState(state.threadState)
      let threadResult = { event: 'noop', thread: null, switchedFrom: null }
      if (!isTick) {
        threadResult = attributeUserMessage(state, input, {
          tick: state.tickCounter || 0,
          channel: msg ? normalizeChannel(msg.channel || '') : '',
        })
      }
      const foregroundThread = getForegroundThread(state)
      emitEvent('focus_frame', {
        focusStack: deriveStackView(state),
        topFrame: foregroundThread,
        threadState: state.threadState,
        event: threadResult?.event || 'noop',
      })

      // 鍐欐椂褰掑睘鍗扮珷锛氭湰杞墍鏈?insertConversation 鑷姩甯?thread_id + focus_topic銆?
      // TICK 杞紙鑷富骞叉椿锛夊綊灞炲埌寮€鏀炬壙璇虹殑绾跨储鈥斺€擜gent 骞叉椿鏈韩灏辨槸娉ㄦ剰鍔涗簨浠躲€?
      const stampThread = !isTick
        ? foregroundThread
        : (() => {
            const oc = latestOpenCommitment(state)
            return (oc && getThreadById(state, oc.threadId)) || foregroundThread
          })()
      const stampTopicStr = stableFocusTopic(stampThread)
      setCurrentFocusTopic(stampTopicStr)
      setCurrentThreadId(stampThread?.id || '')
      if (!isTick && msg?.fromId && msg?.timestamp && stampThread) {
        try { updateUserMessageFocusTopic(msg.fromId, msg.timestamp, stampTopicStr, stampThread.id) } catch {}
      }

      if (threadResult?.event && threadResult.event !== 'noop') {
        saveState()
      }

      // 鍓嶅彴鍒囪蛋 鈫?鏃у墠鍙板仛涓€娆″閲忔憳瑕侊紙fire-and-forget锛涘彧澧炲姞琛ㄧず锛屼笉闅愯棌浠讳綍瀵硅瘽锛夈€?
      if (threadResult?.switchedFrom) {
        const switched = threadResult.switchedFrom
        ;(async () => {
          try {
            await summarizeThread(switched, { sessionRef, emitEvent, saveState })
          } catch {}
        })().catch(() => {})
      }

      // 寮变俊鍙峰€欓€夛紙涓庢煇鍚庡彴绾跨储閲嶅彔=1锛夆啋 鍚庡彴 LLM 浠茶銆?
      // same 鈫?鍚堝苟锛堢嚎绱㈡棤鏍堝簭涓嶅彉閲忥紝鍚堝苟姘歌繙瀹夊叏锛夛紱different 鈫?鐢ㄨ涔夊寲 label/topic 娑﹁壊鏂扮嚎绱€?
      if (threadResult?.ambiguousWith && state.focusClassifierDisabled !== true) {
        const createdThread = threadResult.thread
        const candidate = threadResult.ambiguousWith
        const body = msg?.content || input || ''
        ;(async () => {
          try {
            const verdict = await classifyThreadAttribution({
              newMessage: body,
              candidateThread: candidate,
              createdTopic: createdThread?.topic || [],
              signal: controller.signal,
            })
            if (!verdict) return
            const ts = ensureThreadState(state)
            if (verdict.verdict === 'same' && ts.threads.includes(createdThread) && ts.threads.includes(candidate)) {
              mergeThreads(state, createdThread.id, candidate.id)
              try { reassignConversationsThread(createdThread.id, candidate.id) } catch {}
              ts.mergedAwayIds = [...(ts.mergedAwayIds || []), createdThread.id]
              setCurrentThreadId(candidate.id)
              saveState()
              ts.mergedAwayIds = []   // db 琛屽凡鏍?merged锛屾竻鎺夐伩鍏嶆瘡娆?save 閲嶅 UPDATE
            } else if (ts.threads.includes(createdThread)) {
              if (verdict.label) createdThread.label = verdict.label
              if (verdict.topic.length > 0) createdThread.topic = verdict.topic
              saveState()
            }
            emitEvent('focus_frame', {
              focusStack: deriveStackView(state),
              topFrame: getForegroundThread(state),
              threadState: state.threadState,
              event: 'refined',
            })
          } catch {}
        })().catch(() => {})
      }
    } catch (e) {
      // 绾跨储鍒ゆ柇涓嶅簲璇ュ奖鍝嶄富娴佺▼锛涗换浣曞紓甯稿悶鎺夈€佽褰曟棩蹇楀嵆鍙?
      console.log('[threads] attributeUserMessage failed:', e.message)
    }

    const directions = [...(injection.directions || [])]
    if (isTick) {
      const startupSelfCheckDirections = buildStartupSelfCheckDirections(state.startupSelfCheck)
      if (startupSelfCheckDirections) {
        // When self-check is active, inject only the self-check instruction 鈥?not the generic tick directions.
        // This prevents the "can stay silent" option from conflicting with "must run self-check".
        directions.unshift(startupSelfCheckDirections)
      } else {
        const explorationDirections = buildAwakeningExplorationDirections()
        if (explorationDirections) {
          // Awakening exploration phase: each autonomous tick focuses on one exploration task 鈥?skip generic directions.
          directions.unshift(explorationDirections)
        } else {
          directions.unshift(
            `This is an autonomous L2 heartbeat tick with no new user message. You have full tool access and may act proactively 鈥?no need to wait for the user.\n` +
            `Things you can proactively do (examples, not exhaustive):\n` +
            `- Check in with the user based on the time of day (morning/evening/late night)\n` +
            `- Browse the sandbox folder and check for in-progress projects or file changes; report if relevant\n` +
            `- Search memories for unfinished commitments, pending follow-ups, or upcoming reminders and move them forward\n` +
            `- Find a topic worth expanding from recent conversation and share a thought or piece of information\n` +
            `- Search the web for something the user cares about and push valuable findings\n` +
            `- Check task progress or prefetched data (weather/news) and proactively report changes\n` +
            `Guidelines:\n` +
            `- **Cooldown 鈥?strongest rule.** Look at the recent conversation timeline. If your own last send_message is less than 30 minutes old AND the user has not replied since, the default action is silence. Do NOT call send_message. Do not restart a topic the user just walked away from, do not "follow up" on a question you already asked, do not pivot to a stale earlier topic just because the new one didn't get a response. The only carve-outs: a real new fact arrived (reminder fires, a tool you were running just finished with a result the user asked for, a scheduled action's time came up). Boredom, curiosity, and "maybe they'd want to know" are not carve-outs.\n` +
            `- Proactive but not intrusive: don't repeat what was just said; don't bother late at night without reason (23:00鈥?6:00: only message when there is clear value)\n` +
            `- Have substance: before sending, make sure there is something genuinely worth saying 鈥?not just "checking in"\n` +
            `- One thing per tick: pick the most valuable action, do it, and stop 鈥?don't pile multiple actions into one tick\n` +
            `- If there is truly nothing worth doing, stay silent and call no tools`
          )
        }
      }
    }
    if (fastUserPath) {
      directions.unshift('Current turn is a real-time external user message. Understand it quickly and reply directly with send_message. If no slow tool is needed, send exactly one final answer and stop. Use heavier tools only when the reply depends on them. During longer execution, send progress only for meaningful new findings or blockers; do not send an acknowledgement and then a near-duplicate final answer.')
    }
    if (!isTick && isSoftwareInstallRequest(input)) {
      directions.unshift('Software install workflow: first use injected installed-software context to see whether the app is already installed. If installation is still needed, prefer official vendor sources found via web_search/fetch_url; download installers with download_file so progress events are available. Save installers under sandbox downloads. Only run an installer with exec_task_command/exec_command after you have a concrete local file path or official installer command. Read the tool result before claiming success; if the installer opens a GUI, tell the user exactly what is now waiting for them instead of pretending it completed silently.')
    }
    if (isVoiceChannel(msg?.channel)) {
      directions.push('Voice mode: answer with judgment and meaning first. Do not read out an inventory. If details are merely evidence, compress them into the situation they prove.')
      directions.push('Voice mode style: speak like a person in the room. Default to one or two short sentences. No Markdown, no bullets, no headings, no process acknowledgement, no repeated summary. Say the situation, then stop.')
      directions.push('The current user message came from voice input. Speak naturally and concisely 鈥?like talking to a person, not writing an article. Get to the point, avoid filler phrases, and do not use Markdown formatting (no bullet points, asterisks, or headers). Say what needs to be said and stop.')
      directions.push('For voice input, do not send process acknowledgements like "I will look" or "let me check" before the answer. Send one compact answer unless you truly need a slow tool and have no result yet.')
      directions.push('If the user asks you to read, repeat, or output exact text for recording, reply with the exact text as normal chat text. Do not call the speak tool; this voice channel already turns assistant text into audio automatically. Do not paraphrase, summarize, shorten, or add commentary.')
      directions.push('If the voice input is clearly a speech recognition error (meaningless noise, garbled syllables, random characters) OR appears to be ambient speech not directed at you 鈥?such as someone nearby talking to another person, background conversation, or utterances with no plausible intent to address an AI assistant 鈥?treat it as noise and stay genuinely silent. Do NOT call send_message or any other tool. Critically, do NOT write any spoken sentence about it either: on a voice/local turn your plain text reply is read aloud by TTS, so explaining "this looks like recognition noise, so I will stay silent" is self-defeating 鈥?that explanation itself becomes spoken sound, which is the opposite of silence. Instead reply with a SINGLE emoji and nothing else 鈥?prefer 馃憘 鈥?with no words, punctuation, or reasoning before or after it. A lone emoji gives TTS nothing meaningful to speak, so it stays effectively silent while still showing on screen that you registered the input and deliberately chose not to act on it. Only answer normally when the input is reasonably addressed to you.')
    }

    if (keyConfigFailDir) directions.unshift(keyConfigFailDir)

    const memoriesText = formatMemoriesForPrompt(injection.memories, injection.recallMemories)
    const activePoliciesText = formatActivePoliciesForPrompt(injection.activePolicies)
    const directionsText = directions.join('\n')
    const taskKnowledgeText = formatTaskKnowledge(injection.taskKnowledge)
    const temporalRecallText = formatTemporalRecall(injection.temporalRecall)

    // Real-time user messages take the fast path: skip heavy context gathering to avoid slowdowns from task background.
    const prefetchText = formatPrefetchedItems(injection.prefetchedItems)
    const runtimeInjection = await runRuntimeInjector({
      message: msg?.content || input,
      task: state.task,
      taskKnowledge: taskKnowledgeText,
      memories: memoriesText,
      fastUserPath,
      signal: controller.signal,
    })
    throwIfAborted(controller.signal)

    // When weather keywords are detected, auto-pop WeatherCard after 1 second
    if (runtimeInjection.weatherCardProps && hasACUIClient()) {
      setTimeout(() => {
        const id = `weathercard-${Date.now()}`
        emitUICommand({ op: 'mount', id, component: 'WeatherCard', props: runtimeInjection.weatherCardProps, hint: { placement: 'notification', enter: 'flash-in', exit: 'flash-out' } })
        addActiveUICard(id, { component: 'WeatherCard' })
      }, 1000)
    }

    // 鐢ㄦ埛璺ㄦ笭閬撳彲杈炬€у揩鐓э紙璁?L2 涓诲姩娑堟伅鑳介€夊娓犻亾锛氱敤鎴峰湪澶栭潰灏卞彂寰俊锛屽湪鐢佃剳鍓嶅氨鍙戞湰鍦帮級
    const presenceText = formatPresenceForPrompt(PRIMARY_USER_ID)

    if (runtimeInjection.taskExtraContextItems.length > 0) {
      console.log(`[context] Added ${runtimeInjection.taskExtraContextItems.length} context item(s)`)
      emitEvent('context_gathered', {
        count: runtimeInjection.taskExtraContextItems.length,
        items: runtimeInjection.taskExtraContextItems.map(c => c.label),
      })
    }

    // Emit injector result event (used by brain.html for display)
    emitEvent('injector_result', {
      directions,
      tools: injection.tools || [],
      matchedMemories: (injection.memories || []).map(m => ({
        id: m.id,
        mem_id: m.mem_id || '',
        event_type: m.event_type || '',
        content: m.content || '',
        detail: m.detail || '',
      })),
      recallMemories: (injection.recallMemories || []).map(m => ({
        id: m.id,
        mem_id: m.mem_id || '',
        event_type: m.event_type || '',
        content: m.content || '',
        detail: m.detail || '',
      })),
      activePolicies: (injection.activePolicies || []).map(m => ({
        id: m.id,
        mem_id: m.mem_id || '',
        event_type: m.event_type || '',
        content: m.content || '',
        detail: m.detail || '',
        score: m._policyScore || 0,
        reasons: m._policyReasons || [],
      })),
      constraints: (injection.constraints || []).map(m => m.content),
      thought: injection.thought || null,
      lastToolResult: injection.lastToolResult
        ? `${injection.lastToolResult.name}: ${String(injection.lastToolResult.result).slice(0, 120)}`
        : null,
      conversationWindow: (injection.conversationWindow || []).map(m => ({
        role: m.role,
        from_id: m.from_id,
        to_id: m.to_id,
        content: (m.content || '').slice(0, 120),
        timestamp: m.timestamp,
      })),
      personMemory: injection.personMemory
        ? { content: injection.personMemory.content, detail: injection.personMemory.detail || '' }
        : null,
      userProfile: injection.userProfile || null,
      fastUserPath,
    })

    // Update thought stack
    if (injection.thought) {
      state.thoughtStack.push(injection.thought)
      if (state.thoughtStack.length > 3) state.thoughtStack.shift()
    }

    // 2. Build system prompt (stable hard-floor) + context block (per-round dynamic)
    const persona = getConfig('persona') || ''
    const agentName = getConfig('agent_name') || '灏忕櫧榫?
    const entities = getKnownEntities()
    const hasActiveTask = !!state.task
    const extraContextJoined = [presenceText, runtimeInjection.contextText, prefetchText, injection.uiSignalSummary, formatActiveUICards(injection.activeUICards), formatAIVideoPanel(getAIVideoPanelState())].filter(Boolean).join('\n\n')
    const skillSelection = selectSkillsForMessage(msg?.content || input || '')
    const agentSkillsText = formatSkillsForContext(skillSelection)
    if (skillSelection.active.length > 0 || skillSelection.catalogRequested) {
      emitEvent('agent_skills_selected', {
        active: skillSelection.active.map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          source: s.source,
          relativeDir: s.relativeDir,
          score: s.score,
        })),
        catalogRequested: skillSelection.catalogRequested,
        total: skillSelection.catalog.length,
      })
    }

    // system 鍙暀绋冲畾纭簳绾匡紙agent_name / persona锛夆€斺€?璁?DeepSeek prefix cache
    // 鐪熸鍛戒腑銆俢urrentTime / existenceDesc / systemEnv / security 鏀硅蛋 <runtime> 娈碉紙姣忚疆鍙樺寲锛夈€?
    // P1锛氭妸褰撳墠 user 娑堟伅姝ｆ枃浼犵粰 buildSystemPrompt锛岃 agent registry 鍧楁寜闇€娉ㄥ叆
    //   锛堝彧鍦ㄧ敤鎴锋槑纭彁鍒?Claude Code/Codex/Hermes 绛夊閮?agent 鏃舵墠鍑虹幇锛夈€?
    // Wave 2锛氭妸 channel / geo / focus 淇″彿涓€璧蜂紶杩囧幓锛岃 8 娈靛満鏅鍒欐寜闇€娉ㄥ叆銆?
    // TODO: Wave 2 鍚庣画鎺ュ叆 鈥斺€?hasWechatHistory 鏆傛椂鎸?false 浼狅紙闇€瑕佹煡 conversations 琛?
    //   鐪嬪綋鍓?user 鏄惁鏈?WECHAT 鍘嗗彶锛涚洰鍓嶄緷璧?currentChannel === 'WECHAT' 鏉ヨЕ鍙戯級銆?
    // TODO: Wave 2 鍚庣画鎺ュ叆 鈥斺€?hasActiveFocus 鏆傛椂鎸?false 浼狅紙闇€瑕佹妸 focus banner active
    //   鐘舵€佸仛杩?state锛岀洰鍓嶄緷璧?keyword 瑙﹀彂锛夈€?
    const systemPrompt = buildSystemPrompt({
      agentName,
      persona,
      birthTime,
      userMessage: msg?.content || input || '',
      currentChannel: msg ? normalizeChannel(msg.channel || '') : '',
      hasWechatHistory: false,
      hasActiveFocus: false,
      currentCountryCode: geoResult?.location?.country_code || '',
      currentTimezone: geoResult?.location?.timezone || '',
      currentTools: injection.tools || [],
      // 缂栫▼绾緥鍐呭寲鐨勪俊鍙锋簮浜?涓夛細task 鏂囨湰 + 鏈€杩戝姩浣滄憳瑕侊紙TICK 骞叉椿杞篃鑳藉懡涓級
      currentTaskText: state.task || '',
      recentActionsSummary: (state.recentActions || []).map(a => a?.summary || '').join(' | '),
    })

    const baseContextArgs = {
      memories: memoriesText,
      activePolicies: activePoliciesText,
      temporalRecall: temporalRecallText,
      directions: directionsText,
      constraints: injection.constraints || [],
      personMemory: injection.personMemory || null,
      userProfile: injection.userProfile || null,
      thoughtStack: state.thoughtStack,
      entities,
      hasActiveTask,
      task: state.task || null,
      taskKnowledge: taskKnowledgeText,
      extraContext: extraContextJoined,
      awakeningTicks: getAwakeningTicks(),
      threadView: buildThreadView(state),
      agentSkills: agentSkillsText,
      // Runtime info锛氫粠 system 杩佹潵鐨勬瘡杞彉鍖栧瓧娈碉紝闆嗕腑鏀?<context><runtime>
      currentTime: nowTimestamp(),
      existenceDesc: describeExistence(birthTime),
      systemEnv: buildSystemEnv(msg),
      security: getSecurity(),
      currentChannel: msg ? normalizeChannel(msg.channel || '') : '',
      channelSwitched: detectChannelSwitch(msg, injection.conversationWindow || []),
      focusTickCounter: state.tickCounter || 0,
      selfPerception: injection.selfPerception || null,
      selfSnapshot: injection.selfSnapshot || null,
    }

    // 鈶?缁熶竴鐩稿叧搴﹂棬锛堝姩鎬佷笂涓嬫枃璁板繂姹?/ 灏戝嵆鏄己锛氭帓闄ゅ鍚戠殑绮剧粏鍖栫鐞嗭級銆?
    // 鍦?buildContextBlock 娓叉煋涔嬪墠锛屽"鍑犱箮甯搁┗浣嗗父鏃犲叧"鐨?section 鍋氱浉鍏冲害闂ㄦ帶 + 鍏ㄦ鍩嬬偣銆?
    // 鍙傜収绯?= 鏈疆 user 娑堟伅姝ｆ枃 + 褰撳墠鐒︾偣 topic锛堢紪鎺掑櫒宸茶捀棣忕殑"鍦ㄥ叧娉ㄤ粈涔?锛夈€?
    // 鍙傜収绯讳俊鍙蜂笉瓒虫椂 selectContextSections 鍐呴儴浼氳嚜鍔ㄨ烦杩囬棬鎺с€佷繚鐣欏叏閮紙瀹堣繛缁劅绾㈢嚎锛夈€?
    const focusTopicWords = (getForegroundThread(state)?.topic || []).join(' ')
    const referenceFrame = [msg?.content || input || '', focusTopicWords].filter(Boolean).join(' ')
    const gateResult = selectContextSections(baseContextArgs, {
      referenceFrame,
      enabled: !state.sectionGateDisabled,
    })
    emitEvent('context_section_gate', { audit: gateResult.audit, meta: gateResult.meta })
    // 鍩嬬偣鍗虫椂鍙锛氶棬鎺х湡姝ｈ窇杩囩殑杞锛屾墦涓€琛屽叏娈电浉鍏冲害鎽樿锛坢easure-only 鐨勫垎鏁颁篃鐪嬪緱鍒帮紝
    // 鏀掑垎甯冩暟鎹敤锛夈€? 鏍囪鏈彲琚墧闄や絾褰撳墠 measure-only 鏀捐鐨勬鈥斺€斿畠浠槸鍚庣画 flip enforce 鐨勫€欓€夈€?
    if (gateResult.meta.gated && gateResult.audit.length > 0) {
      const summary = gateResult.audit
        .map(a => `${a.section}=${a.score}${a.dropped ? '鉁? : (a.enforce ? '' : (a.hits === 0 ? '*' : ''))}`)
        .join(' ')
      console.log(`[鎺掗櫎灞俔 ${summary} | 鍙傜収绯?"${gateResult.meta.referenceFrame}"`)
    }

    let contextBlock = buildContextBlock(gateResult.args)
    const strictEvaluation = resolveStrictEvaluationMode(msg?.content || input || '', {
      strictEvaluation: msg?.strictEvaluation,
      forbiddenTools: msg?.forbiddenTools,
    })
    const strictEvaluationContext = buildStrictEvaluationContext(strictEvaluation)
    if (strictEvaluationContext) {
      contextBlock = [contextBlock, strictEvaluationContext].filter(Boolean).join('\n\n')
    }

    // P0-1锛氭妸鏈疆鐒︾偣 topic 瀛楃涓蹭紶缁?buildLLMMessages锛岀敤浜庯細
    //   - conversationWindow 姣忔潯娑堟伅 marker 涓婄殑 topic 鏍囩
    //   - 褰撳墠 user 娑堟伅 marker 涓婄殑 "topic switch" 鎻愮ず
    //   - 杩囨湡鏈瓟鎮康鐨勫垽鏂紙璇濋鍒囪蛋鏃剁洿鎺ユ爣 [expired]锛?
    const currentTopicStr = stableFocusTopic(getForegroundThread(state))

    const buildMessagesWithContext = (ctxBlock) => buildLLMMessages({
      systemPrompt,
      contextBlock: ctxBlock,
      conversationWindow: injection.conversationWindow || [],
      input,
      msg,
      recentActions: state.recentActions,
      actionLog: injection.actionLog || [],
      lastToolResult: injection.lastToolResult || null,
      taskSteps: state.taskSteps,
      batteryBlock: getBatteryBlock(),
      currentTopic: currentTopicStr,
      isTick,
    })

    let llmMessages = buildMessagesWithContext(contextBlock)

    // Memory refresh injection (L1 user messages only)
    // 瀹炴椂鐢ㄦ埛娑堟伅锛坒astUserPath锛夎烦杩囷細鍒锋柊娴佺▼浼氬厛璺戜竴娆¤瘎浼?LLM 璋冪敤锛屽瀹炴椂鑱婂ぉ鏄‖鎬у欢杩熺◣
    const shouldRefreshL1 = !isTick && !fastUserPath && msg?.content && msg.content.trim()
    const tickSinceLastRefresh = state.tickCounter - state.lastTaskRefreshTick
    const shouldRefreshTick = isTick && !!state.task && tickSinceLastRefresh >= 5
    if (shouldRefreshL1 || shouldRefreshTick) {
      try {
        const refreshResult = await runMemoryRefreshLoop({
          originalQuery: shouldRefreshL1 ? msg.content : state.task,
          baseMemories: injection.memories,
          formattedBaseMemories: memoriesText,
          systemPromptBase: combinePromptForPreview(systemPrompt, contextBlock),
          signal: controller.signal,
          maxRounds: shouldRefreshTick ? 2 : 3,
        })
        state.pendingConfidenceHint = refreshResult?.confidence ?? null
        if (shouldRefreshTick) state.lastTaskRefreshTick = state.tickCounter
        throwIfAborted(controller.signal)
        if (!refreshResult.skipped && (refreshResult.additionalMemories.length || refreshResult.round3Results)) {
          const extraParts = []
          if (refreshResult.additionalMemories.length) {
            extraParts.push(formatMemoriesForPrompt([], refreshResult.additionalMemories))
          }
          if (refreshResult.round3Results) {
            extraParts.push(`[Round 3 external query results]\n${refreshResult.round3Results}`)
          }
          const enrichedMemoriesText = memoriesText + '\n\n' + extraParts.join('\n\n')
          // Rebuild only the context block 鈥?system stays stable so prompt cache survives.
          // 鐢?gateResult.args锛堣繃闂ㄥ悗鐨勶級鑰岄潪鍘熷 baseContextArgs锛岃鎺掗櫎灞傜殑鍓旈櫎鍦?refresh 閲嶅缓閲屼篃淇濈暀銆?
          contextBlock = buildContextBlock({
            ...gateResult.args,
            memories: enrichedMemoriesText,
            roundInfo: { round: refreshResult.roundsRun },
          })
          llmMessages = buildMessagesWithContext(contextBlock)
          console.log(`[memory refresh] Done 鈥?${refreshResult.roundsRun} round(s), appended ${refreshResult.additionalMemories.length} memory/memories`)
        }
      } catch (e) {
        if (e.name !== 'AbortError') console.log('[memory refresh] Error:', e.message)
      }
    }

    // Emit full prompt preview event (system + context, joined for human display)
    emitEvent('system_prompt', { content: combinePromptForPreview(systemPrompt, contextBlock), fastUserPath })

    // 3. Call Jarvis LLM (can be interrupted by a new message)
    const toolContext = buildToolContextForProcess(msg, injection)
    toolContext.strictEvaluation = strictEvaluation
    // 瀹¤鍒嗚韩鍙栬瘉锛氭妸鏈疆姝ｅ湪绱Н鐨勫伐鍏锋棩蹇楁暟缁勫紩鐢ㄦ寕杩?toolContext銆俥xecReviewWork 鍦ㄥ惊鐜腑閫?
    // 琚皟鏃惰瀹冿紝鍗冲彲鎷垮埌"涓?Agent 鍒版涓烘瀹為檯鍋氫簡浠€涔?鐨勭湡瀹炶瘉鎹紙鏁扮粍鎸夊紩鐢ㄤ紶閫掞紝璋冪敤鏃跺凡濉厖锛夈€?
    // 杩欐槸瀹¤鐙珛鎬х殑鎵块噸澧欌€斺€斾富 Agent 鏃犳硶鍦?review_work 鍙傛暟閲岀矇楗版垨鐪佺暐瀹冨仛杩囩殑浜嬨€?
    toolContext.turnToolLog = toolCallLog
    voiceTurn = isVoiceChannel(msg?.channel)
    // localReply锛氭湰鍦版笭閬擄紙璇煶 / TUI锛岄潪绀句氦锛変笅绾枃鏈嵆鍥炲锛屾ā鍨嬫棤闇€璋?send_message鈥斺€?
    // runtime 鍗忚鍏滃簳浼氭浛瀹冪湡姝ｆ姇閫掞紙鍚闊?TTS锛夈€傜ぞ浜ゆ笭閬擄紙寰俊/Discord/椋炰功/浼佸井锛夋墠蹇呴』
    // send_message 鎵嶈兘閫佽揪澶栭儴骞冲彴銆傜渷鎺?send_message 閭ｄ竴鏁磋疆棰濆 LLM 璋冪敤鏄闊虫彁閫熺殑鍏抽敭銆?
    localReply = !!msg?.fromId && !silentSignal && !isExternalChannel(msg?.channel)
    let turnTools = resolveTurnTools(injection.tools, { silentSignal, strictEvaluation })
    // 璇煶杞挙鎺?send_message锛堢敤鎴峰喅绛栵級锛氳闊冲洖澶嶇洿鎺ヨ蛋绾枃鏈?鈫?runtime 鍗忚鍏滃簳 executeTool
    // 鎶曢€?+ 鑷姩 TTS锛屾ā鍨嬫棦涓嶅繀涔熶笉鑳借皟 send_message锛屽交搴曟秷闄?璋冨伐鍏烽偅涓€杞?鐨勫欢杩燂紝涔熶笉璁╁畠
    // 鍦?UI 閲屾樉寮忓嚭鐜般€備緥澶栵細娑堟伅鎰忓浘鏄庢樉瑕佸線澶栭儴/绀句氦娓犻亾鍙戯紙"鍙戝埌鎴戝井淇?绛夛級鏃朵繚鐣欙紝鍚﹀垯妯″瀷
    // 澶熶笉鍒板鍙戦€氶亾銆傛挙鐨勫彧鏄ā鍨嬬殑宸ュ叿鍏ュ彛鈥斺€旀湰鍦版姇閫掗€氶亾锛坒allback / slow-ack锛変笉鍙楀奖鍝嶃€?
    if (voiceTurn && !silentSignal && !voiceTurnNeedsSendMessage(input)) {
      turnTools = turnTools.filter(t => t !== 'send_message')
    }
    // thinking 涓嶇敤"娑堟伅鏄惁 trivial"鐨勬鍒欏垽瀹氭潵寮€鍏?reasoning锛氭祬灞傛ā寮忎笉璇ユ浛妯″瀷鍐冲畾"杩欓鐢ㄤ笉鐢ㄦ兂"
    // 鈥斺€斿鍚堟剰鍥句笅浼氭妸闇€瑕?reasoning 鐨勯儴鍒嗚鍒ゃ€傛槸鍚︽€濊€冪敱銆岀敤鎴峰湪璁剧疆閲岀殑鏄惧紡閫夋嫨銆?config.thinking) 鍐冲畾锛?
    // 榛樿鍏抽棴銆佺敤鎴蜂富鍔ㄥ紑鍚墠鎬濊€冿紱杩欐槸鐢ㄦ埛鐨勯€夋嫨锛屼笉鏄?runtime 鎸夐毦搴︽浛瀹冨垽瀹氥€?
    //
    // 娴佸紡鍥炲锛歰nStream 鎶?text/think 涓ょ妯″紡鐨?token 閫愬潡鍚愬嚭銆俢urStreamMode 璺熻釜褰撳墠妯″紡
    // 璁?stream_chunk 涔熷甫涓?mode锛堝墠绔嵁姝ゅ尯鍒?鎬濊€冩祦"涓?姝ｆ枃娴?锛夈€俿awTextStream 鏍囪鏈疆
    // 鏄惁娴佸嚭杩囨鏂団€斺€旇嫢鏄紝鍒欒闊?TTS 鐢卞墠绔竟鍑鸿竟閫愬彞鍚堟垚锛堣 onToolCall 鐨?autoSpeak 瀹堝崼锛夛紝
    // 鍚庣涓嶅啀鏁存琛ヤ竴娆?autoSpeakForVoiceReply锛岄伩鍏嶉噸澶嶅康銆?
    let curStreamMode = null
    let sawTextStream = false
    llmResult = await callLLM({
      systemPrompt,
      message: input,
      messages: llmMessages,
      tools: turnTools,
      temperature: voiceTurn ? Math.min(config.temperature, 0.35) : config.temperature,
      thinking: config.thinking === true,
      signal: controller.signal,
      toolContext,
      mustReply: !!msg?.fromId && !silentSignal,
      silentSignal,
      localReply,
      onToolCall: (name, args, result) => {
        const resultText = String(result)
        let ok = true
        let parsed = null
        try {
          parsed = JSON.parse(resultText)
          if (parsed && parsed.ok === false) ok = false
        } catch {
          ok = !/^(閿欒|璇锋眰澶辫触|鎵ц澶辫触|鍛戒护瓒呮椂|鍛戒护鎵ц澶辫触|error|failed|execution failed|command timed out)/.test(resultText.trim())
        }
        // callLLM 鐨勫崗璁厹搴曚細鐢?__fallback 鏍囪瀹冧唬涓烘姇閫掔殑閭ｆ send_message锛?
        // 璁╀笅鏂归仴娴嬭兘鍖哄垎"妯″瀷鑷繁鍙戠殑"涓?runtime 鍏滃簳鍙戠殑"銆傝鏍囪涓嶈繘 UI 浜嬩欢銆?
        const isFallbackDelivery = !!(args && args.__fallback)
        // __ack锛氳€楁椂宸ュ叿鐨勫嵆鏃跺洖搴旓紙"鎴戞煡涓€涓嬧€?锛夌敱 llm.js 鐩存姇鍚庤ˉ璋冩湰鍥炶皟锛屼粎涓鸿Е鍙戣闊?TTS
        // 锛圱TS 鍙寕鍦ㄨ繖閲岋級銆傛爣璁伴渶鍓ョ锛岄伩鍏嶆硠杩?tool_call 浜嬩欢 / toolCallLog銆?
        const isAckDelivery = !!(args && args.__ack)
        const cleanArgs = (isFallbackDelivery || isAckDelivery) ? { ...args } : args
        if (isFallbackDelivery) delete cleanArgs.__fallback
        if (isAckDelivery) delete cleanArgs.__ack
        // 鎴柇绛栫暐锛氫繚璇?JSON 浠嶅彲瑙ｆ瀽锛屽惁鍒欏墠绔牸寮忓寲鍣ㄤ細鍥為€€灞曠ず鍘熷 JSON 鏂囨湰銆?
        // 浼樺厛鍘嬬缉 stdout/stderr/content/snippet 绛夐暱瀛楁锛屽啀鏁翠綋 stringify锛岃€岄潪绮楁毚 slice銆?
        const resultForEvent = truncateToolResultForUI(parsed, resultText)
        emitEvent('tool_call', { name, args: cleanArgs, result: resultForEvent, ok })
        toolCallLog.push({ name, args: cleanArgs, result: resultText.slice(0, 500), ok, fallback: isFallbackDelivery, ack: isAckDelivery })
        // 娉細send_message 鐨?conversations 鍐欏叆宸茬敱 executor.js 鍐呯粺涓€澶勭悊锛堝甫 channel + external_party_id锛?
        // 杩欓噷浠呭鐞嗚闊宠緭鍏ョ殑 TTS 鑷姩鍥炴斁
        // 璇煶娓犻亾鎵嶈嚜鍔ㄦ挱鎶ャ€傛湰杞嫢娴佸嚭杩囨鏂囷紙sawTextStream锛夛紝璇存槑鍓嶇宸茶竟鍑鸿竟閫愬彞娴佸紡鍚堟垚锛?
        // 鍚庣涓嶅啀鏁存琛ヤ竴娆★紝鍚﹀垯浼氬拰鍓嶇娴佸紡閲嶅蹇点€備粎褰撴病鏈夋鏂囨祦锛堟瀬灏戯細妯″瀷鐩存帴鍙戜簡 send_message
        // 鑰屾病娴佷换浣曟鏂囷級鏃舵墠鐢卞悗绔厹搴曟暣娈靛悎鎴愶紝淇濊瘉璇煶涓嶄細鍙樺搼銆?
        if (name === 'send_message' && args?.content && isVoiceChannel(msg?.channel) && !sawTextStream) {
          const speakText = String(args.content).trim()
          if (speakText) autoSpeakForVoiceReply(speakText)
        }
      },
      onRetry: ({ attempt, nextAttempt, maxAttempts, delayMs, error }) => {
        emitEvent('llm_retry', { attempt, nextAttempt, maxAttempts, delayMs, error })
      },
      onToolExecute: (name) => {
        emitEvent('tool_executing', { name })
      },
      onStream: ({ event, mode, text, name }) => {
        if (event === 'start') {
          curStreamMode = mode
          // plainReply锛氭湰鍦版笭閬擄紙璇煶 / TUI锛岄潪绀句氦锛変笅姝ｆ枃娴佸嵆鐢ㄦ埛鍙鍥炲鈥斺€斿墠绔嵁姝ゆ妸姝ｆ枃瀹炴椂
          //   鎵撹繘鑱婂ぉ姘旀场锛堢ぞ浜ゆ笭閬撳洖澶嶅湪 send_message 宸ュ叿鍙傛暟閲岋紝姝ｆ枃娴侀潪鍥炲锛屼笉瀹炴椂鏄剧ず锛夈€?
          // speak锛氳闊宠疆鎵嶈嚜鍔ㄦ挱鎶モ€斺€斿墠绔嵁姝ゅ姝ｆ枃娴侀€愬彞娴佸紡鍚堟垚銆?
          emitEvent('stream_start', {
            mode,
            plainReply: mode === 'text' && localReply,
            speak: mode === 'text' && voiceTurn && !silentSignal,
          })
        } else if (event === 'chunk') {
          if (curStreamMode === 'text') sawTextStream = true
          emitEvent('stream_chunk', { text, mode: curStreamMode })
        } else if (event === 'end') emitEvent('stream_end', { mode: curStreamMode })
        else if (event === 'tool_preparing') emitEvent('tool_preparing', { name })
      },
    })
    throwIfAborted(controller.signal)
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('[system] LLM processing interrupted (new message arrived)')
      llmResult = { content: '', toolResult: null, aborted: true, delivered: false }
    } else {
      handleLLMFailure(err, label, msg)
      finishTurn()
      return
    }
  } finally {
    clearExecution(controller)
  }

  if (llmResult.aborted) {
    // WeChat-style interruption: discard partial output; the next round will naturally pick up this context from conversationWindow.
    // Mark this tick as aborted so onTick's finally block skips tick decrement and exploration advance.
    console.log('[system] Current processing interrupted by new message 鈥?partial output discarded')
    lastTickAborted = true
    return
  }

  const response = llmResult.content

  // Store tool result for injection on the next TICK
  state.lastToolResult = llmResult.toolResult || null

  console.log('\nJarvis:', response)
  finishTurn(response)

  // User messages must not fail silently: if the model generated a response but forgot to call send_message,
  // the runtime delivers it as a fallback. **鍗曚竴鏉冨▉**锛氭姇閫掕繖浠朵簨鐜板湪瀹屽叏鐢?callLLM 璐熻矗鈥斺€?
  //   callLLM 鍦?mustReply && !delivered && 鏈夊彲鎶曢€掓枃鏈椂锛岀洿鎺ヨ蛋鐪熸鐨?send_message 鎵ц鍣?
  //   锛坋xecuteTool锛変唬涓烘姇閫掞紝浠庤€屽鐢?executor 鐨勫幓閲?/ open_question / social 娲惧彂锛屽苟鎶?
  //   action_log 鏍囨垚 source:'fallback'锛堜笉鍙橀噺 #8锛夈€傛姇閫掓垚鍔熷悗 llmResult.delivered=true銆?
  // 鍥犳 index.js 涓嶅啀浠?toolCallLog 鏈」浜屾鎺ㄥ"鏄惁宸插洖澶?锛屼篃涓嶅啀鎵嬪伐 emit+dispatch+insert锛?
  //   杩欓噷鍙墿閬ユ祴锛氭牴鎹?callLLM 杩斿洖鐨勬潈濞?delivered 淇″彿鍖哄垎"鍏滃簳鎶曞嚭浜?涓?瀹屽叏鏃犲彲鎶曢€掓枃鏈?銆?
  //   silentSignal 杞?callLLM 鍐呴儴宸插畧鍗粷涓嶆姇閫掞紙涓嶅彉閲?#1锛夛紝杩欓噷涔熺敤鍚屼竴瀹堝崼璺宠繃閬ユ祴鍣０銆?
  if (msg && msg.fromId && !silentSignal) {
    const lastToolCall = toolCallLog[toolCallLog.length - 1]
    // "妯″瀷鑷繁鍙戠殑鏈€缁堝洖澶? = 鏈」鏄?send_message 涓斾笉鏄?runtime 鍏滃簳鎵撶殑鏍囪銆?
    //   鍏滃簳鎶曢€掕櫧鐒朵篃浼氬湪 toolCallLog 鐣欎笅涓€鏉?send_message锛堝甫 fallback:true锛夛紝浣嗛偅涓嶇畻妯″瀷閬靛畧鍗忚銆?
    const modelSentExplicitly = lastToolCall?.name === 'send_message' && !lastToolCall?.fallback
    if (!modelSentExplicitly) {
      if (llmResult.delivered && localReply) {
        // 鏈湴娓犻亾锛堣闊?/ TUI锛夛細绾枃鏈洿鎶曟槸璁捐鍐呯殑蹇矾寰勶紝涓嶆槸鍗忚杩濊鈥斺€斾笉鍙?violation 閬ユ祴銆?
        //   callLLM 鍏滃簳宸茬湡姝ｆ姇閫掞紙鍚闊?TTS / 鍘婚噸 / source:'fallback' 钀藉簱锛夈€?
        console.log(`[local reply] Plain-text reply delivered to ${msg.fromId} without send_message (fast path)`)
      } else if (llmResult.delivered) {
        // 绀句氦娓犻亾锛氭ā鍨嬭繚鍙嶄簡"鍥炲=璋?send_message"鍗忚浣嗚 runtime 鍏滃簳鏁戝洖鈥斺€旇涓€鏉￠仴娴嬩究浜庤娴嬭繚瑙勭巼銆?
        console.warn(`[protocol fallback] Model did not call send_message 鈥?callLLM delivered the response body to ${msg.fromId}`)
        emitEvent('protocol_violation', {
          label,
          reason: 'missing_send_message_fallback_delivered',
          fromId: msg.fromId,
          content: response.slice(0, 500),
        })
      } else {
        // 鏃㈡病鏄惧紡 send_message锛宑allLLM 涔熸病鑳藉厹搴曟姇閫掞紙鏃犲彲鎶曢€掓鏂?/ 琚腑姝?绛夛級鈫?绾仴娴嬨€?
        console.warn(`[protocol violation] Model did not call send_message and runtime had nothing deliverable to fall back on. from=${msg.fromId}`)
        emitEvent('protocol_violation', {
          label,
          reason: 'missing_send_message',
          fromId: msg.fromId,
          content: response.slice(0, 500),
        })
      }
    }
  }

  // 鍗忚鏍囪瑙ｆ瀽锛氬崟涓€鐪熺浉婧?src/runtime/markers.js锛堝彧瑙ｆ瀽锛屽壇浣滅敤鐣欏湪涓嬫柟鍘熷湴锛夈€?
  const markers = parseMarkers(response)

  // 4. Detect [RECALL: ...]
  if (markers.recall !== null) {
    state.prev_recall = markers.recall
    console.log(`[system] Recall requested: ${state.prev_recall}`)
    emitEvent('recall_requested', { query: state.prev_recall })
  } else {
    state.prev_recall = null
  }

  // 5. Detect [UPDATE_PERSONA: ...]
  if (markers.updatePersona !== null) {
    const newPersona = markers.updatePersona.trim()
    setConfig('persona', newPersona)
    console.log('[system] Persona updated')
    emitEvent('persona_updated', { persona: newPersona.slice(0, 200) })
  }

  // 6. Detect [SET_TASK: ...] / [CLEAR_TASK]
  if (markers.setTask !== null) {
    state.task = markers.setTask.trim()
    setConfig('current_task', state.task)
    openTaskCommitment(state.task)
    console.log(`[system] Task set: ${state.task}`)
    emitEvent('task_set', { task: state.task })
  }
  if (markers.clearTask) {
    const clearedTask = state.task
    console.log(`[system] Task completed: ${clearedTask}`)
    emitEvent('task_cleared', { task: clearedTask })
    state.task = null
    state.taskIdleTickCount = 0
    setConfig('current_task', '')
    closeTaskCommitment('done')
    // Write a task_complete memory to prevent old task memories from making Jarvis think the task is still active
    if (clearedTask) {
      insertMemory({
        event_type: 'task_complete',
        content: `Task completed: ${clearedTask.slice(0, 60)}`,
        detail: 'Task marked complete via [CLEAR_TASK] 鈥?no further execution',
        entities: [], concepts: [], tags: ['task_complete'],
        timestamp: nowTimestamp(),
      })
    }
  }

  // Update recent action log (keep last 5)
  if (toolCallLog.length > 0) {
    const summary = toolCallLog.map(summarizeToolCall).join(', ')
    state.recentActions.push({ ts: nowTimestamp(), summary })
    if (state.recentActions.length > 5) state.recentActions.shift()

    // 绾跨储妯″瀷锛堣璇嗚淇锛夛細Agent 骞叉椿鏈韩灏辨槸娉ㄦ剰鍔涗簨浠垛€斺€旇鍔ㄨ€呯洿鎺ュ０鏄庯紝涓嶇粡杩囧綊灞炲垽瀹氥€?
    // touch 寮€鏀炬壙璇虹殑绾跨储锛堟病鏈夊氨 touch 鍓嶅彴锛夛紝鍒锋柊 lastEventAt銆?
    // 杩欎竴鏉℃秷鐏簡涓撴敞鏍堟椂浠ｇ殑"骞叉椿鏃跺抚楗挎"锛坱ask 妯″紡 30s/tick 脳 20 = 10 鍒嗛挓鍗冲け鐒︼級銆?
    try {
      if (touchCommitmentThread(state, { tick: state.tickCounter || 0 })) {
        saveThreadState(state.threadState)
      }
    } catch {}
  }

  // Option B: task idle detection 鈥?auto-clear after N consecutive ticks with no tool calls
  if (state.task && isTick) {
    if (toolCallLog.length === 0) {
      state.taskIdleTickCount++
      console.log(`[task] Idle tick count ${state.taskIdleTickCount}/${TASK_IDLE_TICK_LIMIT}`)
      if (state.taskIdleTickCount >= TASK_IDLE_TICK_LIMIT) {
        autoCompleteTask(`${TASK_IDLE_TICK_LIMIT} consecutive ticks with no tool calls`)
      }
    } else {
      state.taskIdleTickCount = 0
    }
  }

  // 6. Recognizer: split think block and response body, pass full experience.
  //    Runs in the background 鈥?does not block the next message/TICK.
  const thinkMatch = response.match(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/i)
  const jarvisThink = thinkMatch ? thinkMatch[1].trim() : ''
  const jarvisText = response.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim()

  // Silent tick with no tool calls = nothing happened worth remembering; skip LLM call entirely.
  if (isTick && toolCallLog.length === 0 && !jarvisText) {
    emitEvent('memories_written', { count: 0, memories: [] })
    return
  }

  // 鍘绘姈鎵瑰鐞嗭細鎶婃湰杞帓杩涜瘑鍒槦鍒楋紝鐢?scheduler 鍐冲畾浣曟椂鍚堝苟鎴愪竴娆℃壒閲?recognizer 璋冪敤
  // 锛堢┖闂?鏀掓弧/瓒呮椂/鐢ㄨ繃鑰愪箙淇℃伅宸ュ叿鏃?flush锛夈€備笉鍐嶆瘡杞竴娆?LLM 璋冪敤銆?
  enqueueTurnForRecognition({
    userMessage: input,
    jarvisThink,
    jarvisResponse: jarvisText,
    toolCallLog,
    task: state.task,
    sessionRef,
  })
}

let processing = false
let lastTickAborted = false
let currentTimer = null  // timer for the next pending tick; can be cleared by pushMessage to run immediately

// 鎶?runTurn 鐢?watchdog 鍖呬竴灞傦細瓒呮椂 鈫?寮?abort + reject锛岃 onTick 鐨?finally 鑳借窇銆?
// processing 娓呮帀銆俽unTurn 鍐呴儴閭ｄ釜姘歌繙涓?resolve 鐨?promise 鐣欏湪鍚庡彴锛屾渶缁堣 GC銆?
async function runTurnWithWatchdog(input, label, msg) {
  let timer = null
  const watchdog = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const stuckLabel = currentExecution?.label || label
      const elapsedS = currentExecution ? Math.round((Date.now() - currentExecution.startedAt) / 1000) : null
      console.error(`[watchdog] runTurn 鍗℃ ${RUN_TURN_WATCHDOG_MS / 1000}s 鏈繑鍥?(label=${stuckLabel}, elapsed=${elapsedS}s)锛屽己鍒?abort`)
      try { currentAbortController?.abort?.('watchdog timeout') } catch {}
      // 绔嬪嵆娓呮帀鍏ㄥ眬 execution 寮曠敤锛岄伩鍏嶅悗缁?message 杩涙潵杩?abort 鍚屼竴涓?controller
      currentAbortController = null
      currentExecution = null
      try { emitEvent('error', { label: 'watchdog', error: `runTurn stuck > ${RUN_TURN_WATCHDOG_MS / 1000}s` }) } catch {}
      const err = new Error('runTurn watchdog timeout')
      err.name = 'WatchdogTimeoutError'
      reject(err)
    }, RUN_TURN_WATCHDOG_MS)
  })
  try {
    await Promise.race([runTurn(input, label, msg), watchdog])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function onTick() {
  if (processing) return
  processing = true
  lastTickAborted = false
  let autoTick = false
  let selfCheckActiveAtStart = false

  try {
    enqueueDueReminders()
    if (hasMessages()) {
      const msg = popMessage()
      const lane = msg.queueName === 'background' ? 'BG' : 'L1'
      await runTurnWithWatchdog(msg.raw, `${lane} message from ${msg.fromId}`, msg)
    } else {
      autoTick = true
      selfCheckActiveAtStart = !!state.startupSelfCheck?.active
      const tick = formatTick()
      await runTurnWithWatchdog(tick, 'L2 TICK', null)
    }
  } catch (err) {
    // runTurn 鎶涢敊锛堝惈 watchdog 瓒呮椂鍜?runTurn 鍐呴儴 LLM 涔嬪悗鏈崟鑾风殑寮傚父锛夊繀椤诲悶鎺夛紝
    // 鍚﹀垯浼氬啋娉″埌 setTimeout 鍥炶皟澶栧眰锛岀粫杩?scheduleNextTick 鈫?涓诲惊鐜仠鎽嗐€?
    if (err?.name === 'WatchdogTimeoutError') {
      lastTickAborted = true
    } else {
      console.error('[onTick] runTurn 鎶涘嚭鏈鐞嗗紓甯?', err?.stack || err?.message || err)
    }
  } finally {
    processing = false
    consumeTickerTick()
    // When interrupted by the user, do not decrement the tick or advance exploration 鈥?retry next heartbeat
    if (!lastTickAborted) {
      decrementAwakeningTick()
      // Do not advance exploration index during self-check; exploration begins sequentially after self-check ends
      if (autoTick && !selfCheckActiveAtStart) advanceExplorationTask()
    }
  }
}

// Schedule priority (high to low):
//   1. Messages pending 鈫?0
//   2. 429 rate-limited 鈫?quota's 10-minute interval
//   3. L2 custom cadence (ttl > 0) 鈫?L2-specified value
//   4. Task active 鈫?30s
//   5. Idle 鈫?config.tickInterval
function scheduleNextTick() {
  if (!isRunning()) return
  if (currentTimer) { clearTimeout(currentTimer); currentTimer = null }

  enqueueDueReminders()

  const hasPending = hasMessages()
  const hasPendingUser = hasUserMessages()
  const queueSnapshot = getQueueSnapshot()
  const rateLimited = isRateLimited()
  const customMs = getCustomIntervalMs()
  const taskActive = !!state.task
  const nextReminder = getNextPendingReminder()

  let interval
  let label
  if (hasPendingUser) {
    interval = 0
    label = 'immediate (user message pending)'
  } else if (hasPending) {
    interval = 0
    label = 'immediate (background message pending)'
  } else if (rateLimited) {
    interval = getTickInterval(config.tickInterval)
    label = `rate-limited (${interval / 1000}s)`
  } else if (customMs !== null) {
    const ticker = getTickerStatus()
    interval = customMs
    label = `L2 custom ${interval / 1000}s (${ticker.ttl} tick(s) remaining${ticker.reason ? ' 路 ' + ticker.reason : ''})`
  } else if (getAwakeningTicks() > 0) {
    const awTicks = getAwakeningTicks()
    interval = 10000
    label = `awakening 10s (${awTicks} tick(s) remaining)`
  } else if (taskActive) {
    interval = 30000
    label = 'task mode 30s'
  } else {
    interval = config.tickInterval
    label = `${interval / 1000}s`
  }

  if (nextReminder) {
    const dueInMs = Math.max(0, new Date(nextReminder.due_at).getTime() - Date.now())
    if (dueInMs < interval) {
      interval = dueInMs
      label = `reminder fires in ${Math.ceil(dueInMs / 1000)}s`
    }
  }

  const quota = getQuotaStatus()
  console.log(`[quota] ${quota.rpmUsed} RPM | ${quota.tpmUsed} TPM | ratio ${quota.ratio} | queue U:${queueSnapshot.user} B:${queueSnapshot.background} | next tick ${label}`)
  emitEvent('quota', { ...quota, nextTickMs: interval, ticker: getTickerStatus(), queue: queueSnapshot })
  currentTimer = setTimeout(async () => {
    currentTimer = null
    // try/finally 鍏滃簳锛氬嵆浣?onTick 鎶涢敊锛堢悊璁轰笂 onTick 鑷繁宸?catch锛寃atchdog 涔熷悶浜?
    // 寮傚父锛夛紝涔熶繚璇?scheduleNextTick 鎬昏璋冪敤锛屼富寰幆涓嶄細鍥犱负鍗曡疆寮傚父姘镐箙鍋滄憜銆?
    try {
      await onTick()
    } catch (err) {
      console.error('[scheduleNextTick] onTick threw:', err?.stack || err?.message || err)
    } finally {
      scheduleNextTick()
    }
  }, interval)
}

// Called when a new message arrives: clear the pending timer and run the next tick immediately.
// If currently processing, rely on the abort mechanism to finish quickly; scheduleNextTick will use interval=0 to resume.
function triggerImmediateTick() {
  if (processing) return  // rely on abort + the post-finish scheduleNextTick to continue
  if (!isRunning()) return
  if (currentTimer) { clearTimeout(currentTimer); currentTimer = null }
  // 寮傛鍚姩涓€杞紝涓嶇瓑缁撴灉
  ;(async () => {
    try {
      await onTick()
    } catch (err) {
      console.error('[triggerImmediateTick] onTick threw:', err?.stack || err?.message || err)
    } finally {
      scheduleNextTick()
    }
  })()
}

let loopStarted = false

async function startConsciousnessLoop({ runImmediateTick = true } = {}) {
  if (loopStarted) return
  loopStarted = true

  startConsolidationLoop()

  // Register the scheduler so the control layer (stop/start) can wake it up
  setScheduler(scheduleNextTick)

  // Register interrupt callback: when a new message arrives, interrupt the current LLM call and trigger the next tick immediately (don't wait for the timer)
  setInterruptCallback((entry) => {
    if (currentAbortController && shouldPreemptFor(entry)) {
      console.log(`[system] Higher-priority message arrived 鈥?interrupting current processing: ${entry.fromId} (${entry.queueName})`)
      emitEvent('processing_preempted', {
        by: entry.fromId,
        queueName: entry.queueName,
        priority: entry.priority,
        current: currentExecution,
      })
      currentAbortController.abort('higher-priority-message')
    }
    triggerImmediateTick()
  })

  // Initialize self-check state before the first tick so the first tick can run self-check
  ensureStartupSelfCheckState()
  if (state.startupSelfCheck?.active) {
    console.log('[system] Startup self-check starting')
    const selfCheckPayload = { version: STARTUP_SELF_CHECK_VERSION }
    setStickyEvent('startup_self_check_started', selfCheckPayload)
    emitEvent('startup_self_check_started', selfCheckPayload)
  }

  // Whether to fire an immediate L2 TICK is up to the caller; initial activation uses it to trigger self-check.
  if (runImmediateTick) {
    await onTick()
  }
  scheduleNextTick()
}

async function main() {
  console.log('Jarvis starting...')

  // 鍚姩鏃舵墦鍗版仮澶嶇殑绾跨储鐘舵€侊紝渚夸簬"閲嶅惎涓嶄涪绾跨储/鎵胯"鐨勭洿瑙傞獙璇併€?
  {
    const ts = ensureThreadState(state)
    if (ts.threads.length > 0) {
      const fg = getForegroundThread(state)
      const open = ts.commitments.filter(c => c.status === 'open').length
      console.log(`[threads] 鎭㈠ ${ts.threads.length} 鏉＄嚎绱紙鍓嶅彴锛?{fg ? describeThread(fg) : '鏃?}锛涘紑鏀炬壙璇?${open} 涓級`)
    }
  }

  // Sync ACUI skill memories (compare AGENT_GUIDE.md hash, update skill-ui-* entries as needed)
  ensureSkillMemories()

  const persona = getConfig('persona')
  if (persona) {
    console.log(`[system] Persona loaded: ${persona.slice(0, 60)}...`)
  } else {
    console.log('[system] No persona set 鈥?waiting for Jarvis to self-define')
  }

  // Start HTTP API 鈥?must start regardless of activation status; the activation page depends on it
  const apiPort = Number(process.env.BAILONGMA_PORT) || 3721
  startAPI(apiPort, {
    getStateSnapshot: () => ({
      action: state.action,
      task: state.task,
      taskSteps: (state.taskSteps || []).map(s => ({ ...s })),
      prev_recall: state.prev_recall,
      lastToolResult: state.lastToolResult
        ? { ...state.lastToolResult, args: { ...(state.lastToolResult.args || {}) } }
        : null,
      sessionCounter: state.sessionCounter,
      recentActions: (state.recentActions || []).map(item => ({ ...item })),
      thoughtStack: (state.thoughtStack || []).map(item => ({ ...item })),
    }),
    onActivated: () => {
      console.log(`[LLM] Activated: ${config.provider} (${config.model})`)
      registerMinimaxIfAvailable()
      startConsciousnessLoop({ runImmediateTick: true }).catch(err => console.error('[system] Main loop failed to start:', err))
    },
  })
  startSocialConnectors({ pushMessage, emitEvent }).catch(err => console.warn('[social] startup failed:', err.message))

  // 鎭㈠閲嶅惎鍓嶆湭瀹屾垚鐨?AI 瑙嗛鐢熸垚浠诲姟锛堢户缁疆璇紝閬垮厤闈㈡澘姘歌繙鍗♀€滅敓鎴愪腑鈥濓級
  try { resumePendingVideoJobs() } catch (err) { console.warn('[aivideo] resume failed:', err.message) }

  // Start TUI
  startTUI('ID:000001')

  if (config.needsActivation) {
    console.log(`Please open http://127.0.0.1:${apiPort}/activation in your browser to activate before sending messages\n`)
    return
  }

  console.log('Type a message and press Enter to send it to Jarvis\n')
  await startConsciousnessLoop()
}

main()
