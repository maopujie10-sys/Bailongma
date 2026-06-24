import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { nowTimestamp } from '../time.js'
import { normalizeConversationPartyId, upsertPrefetchTask, removePrefetchTask, listPrefetchTasks, insertConversation, setConfig as dbSetConfig, markConversationOpenQuestion, findRecentJarvisDuplicate, getRecentActionLogs } from '../db.js'
import { emitEvent, emitUICommand, hasACUIClient, addActiveUICard, setStickyEvent } from '../events.js'
import { dispatchSocialMessage } from '../social/dispatch.js'
import { setCustomInterval as setTickerInterval, getStatus as getTickerStatus } from '../ticker.js'
import { setHotspotPanelState, getHotspotPanelState } from '../hotspots.js'
import { setWorldcupPanelState, getWorldcupPanelState } from '../worldcup.js'
import { setPersonCardPanelState, getPersonCardPanelState, getPersonCard } from '../person-cards.js'
import { setDocPanelState, getDocPanelState } from '../docs.js'
import { setUserLocation } from '../weather.js'
import { getAgentById, isDelegationAllowed } from '../agents/registry.js'
import { installTool, uninstallTool, listInstalledTools, isInstalledTool, executeInstalledTool, getInstalledToolSchema } from './marketplace/index.js'
import { execManageToolFactory } from './tool-factory.js'
import { TOOL_SCHEMAS } from './schemas.js'
import { TOOL_GROUPS } from '../memory/tool-router.js'
import { throwIfAborted } from './abort-utils.js'
import { execUIHide, execUIRegister, execUIShow, execUIUpdate, execUIPatch, execManageApp } from './tools/ui.js'
import { evaluateToolPolicy } from './tool-policy.js'
import { inferToolStatus, writeToolAuditLog } from './tool-audit.js'
import { execDeleteFile, execListDir, execMakeDir, execReadFile, execWriteFile } from './tools/filesystem.js'
import { execBackgroundCommand, execCommand, execDownloadFile, execKillProcess, execListProcesses, execQuickCommand, execTaskCommand } from './tools/shell.js'
import { execBrowserRead, execFetchUrl, execWebSearch } from './tools/web.js'
import { execDowngradeMemory, execMergeMemories, execProbeMemory, execRecallMemory, execSearchMemory, execSkipConsolidation, execSkipRecognition, execUpsertMemory } from './tools/memory.js'
import { execManageReminder } from './tools/reminders.js'
import { execGenerateImage, execGenerateLyrics, execGenerateMusic, execGenerateVideo, execMediaMode, execMusic, execSpeak } from './tools/media.js'
import { execManageRule } from './tools/rules.js'
import { runWorkReview } from '../review/reviewer.js'
import { dispatchToArmy, probeArmyEngines } from '../agents/army-adapter.js'
import { execDispatchToArmy, execProbeArmyEngines } from './tools/army.js'
import { execScreenCapture, execVisualPerceive, execEventPerceive, execGetActiveWindow, execGetClipboard } from './tools/perception.js'
import { execAgentReachSearch, execHumanizeText, execSkillSuperpowersLoad } from './tools/skills.js'
export { calculateNextDueAt } from './tools/reminders.js'
export { autoSpeakForVoiceReply } from './tools/media.js'
export { persistAppState } from './tools/ui.js'

import { config, setSecurity } from '../config.js'
import { paths } from '../paths.js'
import { spawnSync } from 'child_process'
import { lookupReplyTarget, normalizeChannel, suggestProactiveChannel } from '../identity.js'

// P0-2锛氳瘑鍒?send_message 鏈熬鏄惁鐣欎簡"闈炴緞娓呭瀷 follow-up question"銆?
const FOLLOWUP_VERB_RE = /(瑕佷笉瑕亅闇€涓嶉渶瑕亅瑕佷箞|瑕亅鎯硘闇€瑕亅鏄惁|甯垜?|缁欐垜?|琛屼笉琛寍鍙互鍚梶濂藉悧|鍙惁|鑳藉惁)/
const FOLLOWUP_EN_RE = /\b(should|want|need|shall|would you like|do you want|may i|can i)\b/i
const OUTBOUND_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])
const OUTBOUND_VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi'])

// ============================================================
// executeTool 鈥?宸ュ叿鎵ц缁熶竴鍏ュ彛
// ============================================================
export async function executeTool(name, args, context = {}) {
  const { signal, source } = context
  throwIfAborted(signal)

  // 绛栫暐璇勪及
  const policyResult = evaluateToolPolicy(name, args, context)
  if (policyResult && policyResult.blocked) {
    return JSON.stringify({ ok: false, error: policyResult.reason || 'tool blocked by policy' })
  }

  let result
  try {
    switch (name) {
      // --- 鏂囦欢绯荤粺 ---
      case 'read_file':          result = await execReadFile(args); break
      case 'write_file':         result = await execWriteFile(args); break
      case 'delete_file':        result = await execDeleteFile(args); break
      case 'list_dir':           result = await execListDir(args); break
      case 'make_dir':           result = await execMakeDir(args); break

      // --- Shell ---
      case 'exec_command':       result = await execCommand(args); break
      case 'exec_quick_command': result = await execQuickCommand(args); break
      case 'exec_task_command':  result = await execTaskCommand(args); break
      case 'exec_background_command': result = await execBackgroundCommand(args); break
      case 'download_file':      result = await execDownloadFile(args); break
      case 'kill_process':       result = await execKillProcess(args); break
      case 'list_processes':     result = await execListProcesses(args); break

      // --- Web ---
      case 'fetch_url':          result = await execFetchUrl(args); break
      case 'browser_read':       result = await execBrowserRead(args); break
      case 'web_search':         result = await execWebSearch(args); break

      // --- 璁板繂 ---
      case 'search_memory':      result = await execSearchMemory(args); break
      case 'recall_memory':      result = await execRecallMemory(args); break
      case 'probe_memory':       result = await execProbeMemory(args); break
      case 'upsert_memory':      result = await execUpsertMemory(args); break
      case 'merge_memories':     result = await execMergeMemories(args); break
      case 'downgrade_memory':   result = await execDowngradeMemory(args); break
      case 'skip_consolidation': result = await execSkipConsolidation(args); break
      case 'skip_recognition':   result = await execSkipRecognition(args); break

      // --- UI ---
      case 'ui_show':            result = await execUIShow(args); break
      case 'ui_update':          result = await execUIUpdate(args); break
      case 'ui_hide':            result = await execUIHide(args); break
      case 'ui_register':        result = await execUIRegister(args); break
      case 'ui_patch':           result = await execUIPatch(args); break
      case 'manage_app':         result = await execManageApp(args); break

      // --- 濯掍綋 ---
      case 'generate_image':     result = await execGenerateImage(args); break
      case 'generate_music':     result = await execGenerateMusic(args); break
      case 'generate_lyrics':    result = await execGenerateLyrics(args); break
      case 'generate_video':     result = await execGenerateVideo(args); break
      case 'speak':              result = await execSpeak(args); break
      case 'music':              result = await execMusic(args); break
      case 'media_mode':         result = await execMediaMode(args); break

      // --- 鎻愰啋 ---
      case 'manage_reminder':    result = await execManageReminder(args); break

      // --- 瑙勫垯 ---
      case 'manage_rule':        result = await execManageRule(args); break

      // --- 宸ュ叿宸ュ巶 ---
      case 'manage_tool_factory': result = await execManageToolFactory(args); break

      // --- 瀹¤ ---
      case 'review_work':        result = await runWorkReview(args); break

      // --- Agent 鍐涘洟 ---
      case 'dispatch_to_army':   result = await execDispatchToArmy(args); break
      case 'screen_capture':     result = await execScreenCapture(args); break
      case 'visual_perceive':    result = await execVisualPerceive(args); break
      case 'event_perceive':     result = await execEventPerceive(args); break
      case 'get_active_window':  result = await execGetActiveWindow(args); break
      case 'get_clipboard':      result = await execGetClipboard(args); break
      case 'probe_army_engines': result = await execProbeArmyEngines(args); break
      // --- 外部技能包 ---
      case 'agent_reach_search':    result = await execAgentReachSearch(args); break
      case 'humanize_text':         result = await execHumanizeText(args); break
      case 'skill_superpowers_load': result = await execSkillSuperpowersLoad(args); break

      // --- 宸插畨瑁呭伐鍏?---
      default:
        if (isInstalledTool(name)) {
          result = await executeInstalledTool(name, args)
        } else {
          throw new Error(`unknown tool: ${name}`)
        }
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err
    result = JSON.stringify({ ok: false, error: err.message })
  }

  // 瀹¤鏃ュ織
  const status = inferToolStatus(name, result)
  writeToolAuditLog({ name, args, result, status, source })

  return typeof result === 'string' ? result : JSON.stringify(result)
}

// ============================================================
// send_message 鈥?娑堟伅鍙戦€侊紙绀句氦娓犻亾鍒嗗彂锛?
// ============================================================
export async function execSendMessage(args, context = {}) {
  const { content, target_id, channel, image_path, media_path } = args
  const { source } = context

  if (!content && !image_path && !media_path) {
    return JSON.stringify({ ok: false, error: 'send_message requires content, image_path, or media_path' })
  }

  const target = target_id || context.targetId
  const resolvedChannel = channel || context.channel || 'AUTO'

  try {
    const result = await dispatchSocialMessage({
      content,
      target_id: target,
      channel: resolvedChannel,
      image_path,
      media_path,
      source: source || 'model',
    })
    return JSON.stringify({ ok: true, ...result })
  } catch (err) {
    return JSON.stringify({ ok: false, error: err.message })
  }
}

// ============================================================
// 绯荤粺宸ュ叿
// ============================================================
export async function execSetConfig(args) {
  try {
    if (args.key && args.value !== undefined) {
      await dbSetConfig(args.key, args.value)
      return JSON.stringify({ ok: true })
    }
    return JSON.stringify({ ok: false, error: 'set_config requires key and value' })
  } catch (err) {
    return JSON.stringify({ ok: false, error: err.message })
  }
}

export async function execSetLocation(args) {
  try {
    if (args.city) {
      setUserLocation(args.city)
      return JSON.stringify({ ok: true })
    }
    return JSON.stringify({ ok: false, error: 'set_location requires city' })
  } catch (err) {
    return JSON.stringify({ ok: false, error: err.message })
  }
}

export async function execFocusBanner(args) {
  try {
    const { action, task, current_step, tasks } = args
    if (action === 'show') {
      emitUICommand('focus_banner', { action: 'show', task, current_step, tasks })
    } else if (action === 'update') {
      emitUICommand('focus_banner', { action: 'update', task, current_step, tasks })
    } else if (action === 'hide') {
      emitUICommand('focus_banner', { action: 'hide' })
    }
    return JSON.stringify({ ok: true })
  } catch (err) {
    return JSON.stringify({ ok: false, error: err.message })
  }
}

export async function execSetTask(args) {
  try {
    emitUICommand('set_task', args)
    return JSON.stringify({ ok: true })
  } catch (err) {
    return JSON.stringify({ ok: false, error: err.message })
  }
}

export async function execCompleteTask(args) {
  try {
    emitUICommand('complete_task', args)
    return JSON.stringify({ ok: true })
  } catch (err) {
    return JSON.stringify({ ok: false, error: err.message })
  }
}

export async function execUpdateTaskStep(args) {
  try {
    emitUICommand('update_task_step', args)
    return JSON.stringify({ ok: true })
  } catch (err) {
    return JSON.stringify({ ok: false, error: err.message })
  }
}

export async function execFindTool(args) {
  try {
    const { query } = args
    if (!query) return JSON.stringify({ ok: false, error: 'find_tool requires query' })
    // find_tool 鐢?runtime 灞傚鐞嗭紝杩欓噷杩斿洖鍗犱綅
    return JSON.stringify({ ok: true, note: 'find_tool handled by runtime' })
  } catch (err) {
    return JSON.stringify({ ok: false, error: err.message })
  }
}

// ============================================================
// 闈㈡澘鎺у埗
// ============================================================
export async function execSetHotspotPanel(args) {
  try {
    setHotspotPanelState(args)
    return JSON.stringify({ ok: true })
  } catch (err) {
    return JSON.stringify({ ok: false, error: err.message })
  }
}

export async function execSetWorldcupPanel(args) {
  try {
    setWorldcupPanelState(args)
    return JSON.stringify({ ok: true })
  } catch (err) {
    return JSON.stringify({ ok: false, error: err.message })
  }
}

export async function execSetPersonCardPanel(args) {
  try {
    setPersonCardPanelState(args)
    return JSON.stringify({ ok: true })
  } catch (err) {
    return JSON.stringify({ ok: false, error: err.message })
  }
}

export async function execSetDocPanel(args) {
  try {
    setDocPanelState(args)
    return JSON.stringify({ ok: true })
  } catch (err) {
    return JSON.stringify({ ok: false, error: err.message })
  }
}

export async function execGetAgent(args) {
  try {
    const agent = getAgentById(args?.agent_id)
    return JSON.stringify({ ok: true, agent })
  } catch (err) {
    return JSON.stringify({ ok: false, error: err.message })
  }
}

export async function execCheckDelegation(args) {
  try {
    const allowed = isDelegationAllowed(args?.agent_id, args?.task)
    return JSON.stringify({ ok: true, allowed })
  } catch (err) {
    return JSON.stringify({ ok: false, error: err.message })
  }
}

// 妫€娴嬫秷鎭湯灏炬槸鍚︿负寮€鏀惧紡杩介棶
export function detectOpenFollowupQuestion(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  const last = t.split(/[.銆?锛?锛焅n]/).filter(Boolean).pop() || "";
  return /[?锛焆/.test(last) || /^(浠€涔坾鎬庝箞|濡備綍|涓轰粈涔坾鑳戒笉鑳絴鍙互鍚梶琛屽悧|瀵瑰悧|鏄惂|鍛鍚梶鍙惁|鏈夋棤|鏈夊摢浜泑璇峰憡璇夋垜|璇疯鏄巪璇疯В閲?/.test(last);
}
