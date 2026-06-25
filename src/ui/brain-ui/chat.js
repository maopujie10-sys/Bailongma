import { createMarkdownBody } from "./markdown.js";

// 把数据库/事件里的细粒度 channel 名转成 UI 友好的简化标签
export function friendlyChannelLabel(channel) {
  if (!channel) return "";
  const c = String(channel).toUpperCase();
  if (c === "WECHAT_CLAWBOT" || c === "WECHAT_OFFICIAL" || c === "WECHAT") return "WeChat";
  if (c === "WECOM") return "WeCom";
  if (c === "DISCORD") return "Discord";
  if (c === "FEISHU") return "Feishu";
  return "";
}

export function initChat({
  apiBase,
  maxHistory,
  activationWarmupKey,
  getAgentName,
  defaultInputPlaceholder,
  onUserMessage = null,
  openSettings = null,
} = {}) {
  const chatHistory = document.getElementById("chat-history");
  const chatMessages = document.getElementById("chat-messages");
  const msgInput = document.getElementById("msg-input");
  const chatArea = document.getElementById("chat-area");
  const sendBtn = document.getElementById("send-btn");

  let inputLocked = false;
  let closeTimer = null;
  let hasPendingJarvisMessage = false;
  let pendingMessageDismissed = false;
  let liveEl = null;  // 正在流式输出的 jarvis 气泡（边收 token 边重渲染），message 事件到达后定稿
  let audioCtx = null;
  let audioUnlocked = false;
  let warmupTimer = null;

  const PUSH_TO_TALK_PLACEHOLDER = "按住空格键开始说话";

  // 多行输入：每次内容变化时把高度重置为内容实际高度（上限由 CSS max-height 接管、超出后内部滚动）。
  function autoGrowInput() {
    msgInput.style.height = "auto";
    msgInput.style.height = msgInput.scrollHeight + "px";
  }

  // 聚焦输入框时提示发消息，未聚焦时提示语音输入
  function idlePlaceholder() {
    return document.activeElement === msgInput ? defaultInputPlaceholder() : PUSH_TO_TALK_PLACEHOLDER;
  }

  function setComposerLocked(locked, reason = "") {
    inputLocked = locked;
    msgInput.disabled = locked;
    sendBtn.disabled = locked;
    msgInput.placeholder = locked ? (reason || "系统准备中…") : idlePlaceholder();
  }

  function releaseWarmupLock() {
    if (warmupTimer) {
      clearTimeout(warmupTimer);
      warmupTimer = null;
    }
    try { sessionStorage.removeItem(activationWarmupKey); } catch {}
    setComposerLocked(false);
  }

  function applyActivationWarmupLock() {
    let until = 0;
    try {
      until = Number(sessionStorage.getItem(activationWarmupKey) || 0);
    } catch {}

    const remaining = until - Date.now();
    if (remaining <= 0) {
      releaseWarmupLock();
      return;
    }

    const seconds = Math.max(1, Math.ceil(remaining / 1000));
    setComposerLocked(true, `刚激活 — 模型预热中… ~${seconds}s`);
    if (warmupTimer) clearTimeout(warmupTimer);
    warmupTimer = setTimeout(releaseWarmupLock, remaining);
  }

  function isHoveringChat() {
    return chatArea.matches(":hover") || chatHistory.matches(":hover") || chatMessages.matches(":hover");
  }

  function ensureAudioContext() {
    if (!audioCtx) {
      if (!audioUnlocked) return null;  // Don't create before a user gesture — avoids Chrome autoplay warning
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      try { audioCtx = new AudioCtx(); } catch { return null; }
    }
    return audioCtx;
  }

  function unlockAudioOnFirstGesture() {
    const unlock = () => {
      if (audioUnlocked) return;
      audioUnlocked = true;
      // Create/resume AudioContext only after the first user gesture — avoids Chrome autoplay policy warning
      const ctx = ensureAudioContext();
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      window.removeEventListener("touchstart", unlock, true);
    };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    window.addEventListener("touchstart", unlock, true);
  }

  async function playJarvisAlert() {
    // 消息提示音已取消：很多用户在深夜处理工作，不希望任何声音打扰（含文本回复与语音识别后的回复）。
    // 这里直接返回，让两个调用点（普通消息 / 流式直播气泡）静默。TTS 朗读不受影响。
    return;
    // eslint-disable-next-line no-unreachable
    const ctx = ensureAudioContext();
    if (!ctx) return;
    try { if (ctx.state === "suspended") await ctx.resume(); } catch { return; }
    if (ctx.state !== "running") return;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.18, now + 0.28);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    master.connect(ctx.destination);

    const oscA = ctx.createOscillator();
    oscA.type = "sine";
    oscA.frequency.setValueAtTime(740, now);
    oscA.frequency.exponentialRampToValueAtTime(880, now + 0.18);
    oscA.connect(master);

    const oscB = ctx.createOscillator();
    oscB.type = "triangle";
    oscB.frequency.setValueAtTime(1110, now + 0.12);
    oscB.frequency.exponentialRampToValueAtTime(1320, now + 0.34);
    oscB.connect(master);

    oscA.start(now); oscA.stop(now + 0.32);
    oscB.start(now + 0.12); oscB.stop(now + 0.5);

    oscA.addEventListener("ended", () => oscA.disconnect(), { once: true });
    oscB.addEventListener("ended", () => oscB.disconnect(), { once: true });
    setTimeout(() => master.disconnect(), 700);
  }

  function isTyping() {
    return document.activeElement === msgInput || msgInput.value.trim().length > 0;
  }

  async function fetchChatHistory() {
    try {
      const res = await fetch(`${apiBase}/conversations?limit=${maxHistory}`);
      if (!res.ok) return [];
      const rows = await res.json();
      if (!Array.isArray(rows)) return [];
      return rows
        .filter(r => r && (r.role === "user" || r.role === "jarvis") && typeof r.content === "string")
        .map(r => {
          // 外部渠道判定：channel 非空且不是本地（TUI/API），或 from_id 仍带外部前缀（兼容历史数据）
          const channel = (r.channel || "").toUpperCase();
          const isExternal =
            r.role === "user"
            && ((channel && channel !== "TUI" && channel !== "API" && channel !== "SYSTEM" && channel !== "REMINDER" && channel !== "APP_SIGNAL" && channel !== "VOICE" && channel !== "语音识别")
                || /^(wechat|discord|feishu|wecom):/i.test(r.from_id || ""));
          if (isExternal) {
            const label = friendlyChannelLabel(r.channel) || r.from_id;
            return { role: "external", text: r.content, label };
          }
          return { role: r.role, text: r.content };
        });
    } catch { return []; }
  }

  function openChat(autoClose = false) {
    chatHistory.classList.add("open");
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    if (autoClose && (!hasPendingJarvisMessage || pendingMessageDismissed) && !isTyping()) scheduleClose(4500);
  }

  function closeChat() {
    if ((hasPendingJarvisMessage && !pendingMessageDismissed) || isTyping() || isHoveringChat()) return;
    chatHistory.classList.remove("open");
  }

  function scheduleClose(ms = 100) {
    if ((hasPendingJarvisMessage && !pendingMessageDismissed) || isTyping() || isHoveringChat()) return;
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(closeChat, ms);
  }

  function addMsg(role, text, options = {}) {
    const { alert = role === "jarvis", pending = true, label } = options;
    const defaultLabel = role === "user" ? "You" : role === "jarvis" ? getAgentName() : "Peer";
    const labelText = label || defaultLabel;
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');

    const div = document.createElement("div");
    div.className = `msg msg-${role}`;

    // 头部：标签 + 时间 + 复制按钮
    const header = document.createElement("div");
    header.className = "msg-header";
    const labelSpan = document.createElement("span");
    labelSpan.className = "msg-label";
    labelSpan.textContent = labelText;
    const timeSpan = document.createElement("span");
    timeSpan.className = "msg-time";
    timeSpan.textContent = timeStr;
    const copyBtn = document.createElement("button");
    copyBtn.className = "msg-copy-btn";
    copyBtn.title = "复制消息";
    copyBtn.textContent = "复制";
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = "已复制";
        setTimeout(() => copyBtn.textContent = "复制", 1500);
      }).catch(() => {});
    };
    header.appendChild(labelSpan);
    header.appendChild(timeSpan);
    header.appendChild(copyBtn);
    div.appendChild(header);
    div.appendChild(createMarkdownBody(text));
    chatMessages.appendChild(div);

    while (chatMessages.children.length > maxHistory) {
      chatMessages.removeChild(chatMessages.firstChild);
    }

    if (role === "jarvis") {
      hasPendingJarvisMessage = pending;
      pendingMessageDismissed = !pending;
      if (alert) playJarvisAlert();
      if (pending) openChat();
    } else if (role === "user") {
      hasPendingJarvisMessage = false;
      pendingMessageDismissed = false;
    }

    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async function restoreChatHistory() {
    const history = await fetchChatHistory();
    history.forEach(i => addMsg(i.role, i.text, { persist: false, alert: false, pending: false, label: i.label }));
    if (history.length) {
      pendingMessageDismissed = true;
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  // text 显式传入时直接发送、不经过输入框（语音识别用：voice 完全不在 msg-input 留草稿）；
  // 不传 text 则保持原行为，从输入框读取并清空。
  async function send({ channel = null, label = null, text = null } = {}) {
    if (inputLocked) return;
    const fromInput = (text == null);
    const content = (fromInput ? msgInput.value : text).trim();
    if (!content) return;
    if (fromInput) { msgInput.value = ""; autoGrowInput(); }
    // If onUserMessage returns a string, use it as the backend payload; if it returns false, skip the backend call
    const override = onUserMessage?.(content);
    addMsg("user", content, { label: label || undefined });
    openChat();
    scheduleClose(1000);
    if (override === false) return;

    try {
      const backendText = (typeof override === "string") ? override : content;
      const payload = { content: backendText, from_id: "ID:000001" };
      if (channel) payload.channel = channel;
      const resp = await fetch(`${apiBase}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        let message = `HTTP ${resp.status}`;
        try {
          const body = await resp.json();
          message = body.error || body.message || message;
        } catch {}
        throw new Error(message);
      }
    } catch (error) {
      console.warn("[send]", error.message);
      addMsg("jarvis", "发送失败 — 请检查本地服务是否运行。");
      openChat(true);
    }
  }

  chatArea.addEventListener("mouseenter", () => {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    openChat();
  });
  chatArea.addEventListener("mouseleave", () => scheduleClose());
  msgInput.addEventListener("focus", () => {
    openChat();
    if (!inputLocked) msgInput.placeholder = defaultInputPlaceholder();
  });
  msgInput.addEventListener("blur", () => {
    if (!inputLocked) msgInput.placeholder = PUSH_TO_TALK_PLACEHOLDER;
    if (!isTyping()) scheduleClose();
    // 延迟关闭，让命令项的 mousedown 先触发
    setTimeout(hideSlashMenu, 120);
  });
  msgInput.addEventListener("input", () => {
    autoGrowInput();
    updateSlashMenu();
    if (isTyping()) openChat();
    else if (!hasPendingJarvisMessage || pendingMessageDismissed) scheduleClose();
  });
  msgInput.addEventListener("keydown", event => {
    if (handleSlashKeydown(event)) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  });
  sendBtn.addEventListener("click", () => send());

  // ── 拖拽投喂 & 粘贴 ──────────────────────────────────────────────
  // 把文件/图片/视频拖入或粘贴到聊天窗口，自动读取并投喂给白龙马
  let dragOverlay = null
  let dragCounter = 0

  function ensureDragOverlay() {
    if (dragOverlay) return
    dragOverlay = document.createElement('div')
    dragOverlay.id = 'drag-overlay'
    dragOverlay.innerHTML = '<div class="drag-hint"><span class="drag-icon">🐉</span><p>松手投喂白龙马</p><small>图片 · 代码 · 文档 · 视频</small></div>'
    document.body.appendChild(dragOverlay)
  }

  function showDragOverlay() { ensureDragOverlay(); dragOverlay.classList.add('show') }
  function hideDragOverlay() { dragCounter = 0; if (dragOverlay) dragOverlay.classList.remove('show') }

  // 判断是否为可投喂的文件类型
  const IMG_TYPES = ['image/png','image/jpeg','image/gif','image/webp','image/bmp','image/svg+xml']
  const CODE_EXTS = ['.js','.ts','.py','.java','.go','.rs','.c','.cpp','.h','.cs','.rb','.php','.swift','.kt','.sh','.bash','.ps1','.sql','.yaml','.yml','.toml','.xml','.json','.css','.html','.vue','.jsx','.tsx','.md','.txt','.cfg','.ini','.env','.conf','.log','.csv']
  const VIDEO_TYPES = ['video/mp4','video/webm','video/quicktime','video/x-msvideo']
  const CODE_MAX = 512 * 1024  // 512KB — 代码文件直接读到内存

  function isImage(file) { return IMG_TYPES.includes(file.type) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name) }
  function isVideo(file) { return VIDEO_TYPES.includes(file.type) || /\.(mp4|webm|mov|avi)$/i.test(file.name) }
  function isCode(file) { return CODE_EXTS.some(ext => file.name.toLowerCase().endsWith(ext)) }

  async function feedFile(file) {
    if (isImage(file)) {
      // 大图片 → 上传后端；小图片 → base64 data URL 内联
      if (file.size > 2 * 1024 * 1024) {
        const form = new FormData(); form.append('file', file)
        const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 300000)
        const resp = await fetch(`${apiBase}/upload`, { method: 'POST', body: form, signal: ctl.signal }).finally(() => clearTimeout(to))
        if (!resp.ok) throw new Error('上传失败')
        const result = await resp.json()
        const url = result.files?.[0]?.url
        if (!url) throw new Error('上传响应缺少 url')
        msgInput.value += `\n![${file.name}](${url})\n`
      } else {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        msgInput.value += `\n![${file.name}](${dataUrl})\n`
      }
      autoGrowInput(); openChat(); msgInput.focus()
      return
    }

    if (isCode(file) && file.size <= CODE_MAX) {
      // 文本/代码文件 → 上传后端，静默存储到第二大脑
      const form = new FormData(); form.append('file', file)
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 300000)
      const resp = await fetch(`${apiBase}/upload`, { method: 'POST', body: form, signal: ctl.signal }).finally(() => clearTimeout(to))
      if (!resp.ok) throw new Error('上传失败')
      const result = await resp.json()
      const url = result.files?.[0]?.url
      if (!url) throw new Error('上传失败')
      // 静默投喂到记忆系统，不展示内容
      await send({ text: `/记忆 存储文件 ${file.name} ${url}` })
      return
    }

    // 视频/其他文件 → 上传后端 → 获取 URL → 插入输入框
    const form = new FormData()
    form.append('file', file)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 300000) // 5分钟超时
    const resp = await fetch(`${apiBase}/upload`, { method: 'POST', body: form, signal: controller.signal }).finally(() => clearTimeout(timeout))
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(err.error || `上传失败 HTTP ${resp.status}`)
    }
    const result = await resp.json()
    const uploaded = result.files?.[0]
    if (!uploaded?.url) throw new Error('上传响应缺少 url')

    if (isVideo(file)) {
      msgInput.value += `\n<video src="${uploaded.url}" controls width="320"></video>\n`
    } else {
      msgInput.value += `\n[${file.name}](${uploaded.url})\n`
    }
    autoGrowInput()
    openChat()
    msgInput.focus()
  }

  // 递归遍历文件夹
  async function getFilesFromEntry(entry) {
    if (entry.isFile) {
      return new Promise((resolve) => entry.file(resolve))
    }
    if (entry.isDirectory) {
      const reader = entry.createReader()
      const allFiles = []
      const readBatch = () => new Promise((resolve) => {
        reader.readEntries((entries) => {
          if (!entries.length) return resolve()
          Promise.all(entries.map(e => getFilesFromEntry(e))).then(results => {
            results.flat().forEach(f => allFiles.push(f))
            readBatch().then(resolve)
          })
        })
      })
      await readBatch()
      return allFiles
    }
    return []
  }

  async function handleFiles(files) {
    // 也支持文件夹（从 dataTransfer.items 递归提取）
    const allFiles = [...files]
    // 如果 files 为空但 dataTransfer 有 items，尝试从 items 提取
    for (const file of allFiles) {
      try {
        await feedFile(file)
      } catch (e) {
        console.warn('[feed]', file.name, e.message)
        addMsg('jarvis', `投喂失败 \`${file.name}\`: ${e.message}`, { alert: false, pending: false })
      }
    }
  }

  async function handleDropItems(dataTransfer) {
    const items = dataTransfer?.items
    if (!items) return
    const allFiles = []
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.()
      if (entry) {
        const files = await getFilesFromEntry(entry)
        allFiles.push(...(Array.isArray(files) ? files : [files]))
      } else {
        const file = items[i].getAsFile()
        if (file) allFiles.push(file)
      }
    }
    if (allFiles.length) {
      for (const file of allFiles) {
        try { await feedFile(file) } catch (e) { console.warn('[feed]', file.name, e.message) }
      }
      addMsg('jarvis', `已存储 ${allFiles.length} 个文件到第二大脑`, { alert: false, pending: false })
    }
  }

  // 全局拖拽事件 — 拖文件到窗口任意位置即可投喂
  document.addEventListener('dragenter', e => {
    if (!e.dataTransfer?.types?.includes('Files')) return
    e.preventDefault(); dragCounter++; showDragOverlay()
  })
  document.addEventListener('dragover', e => {
    if (!e.dataTransfer?.types?.includes('Files')) return
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'
  })
  document.addEventListener('dragleave', e => {
    dragCounter--
    if (dragCounter <= 0) hideDragOverlay()
  })
  document.addEventListener('drop', async e => {
    e.preventDefault(); hideDragOverlay()
    if (e.dataTransfer?.files?.length) {
      // 优先用 webkitGetAsEntry 支持文件夹递归
      if (e.dataTransfer.items?.[0]?.webkitGetAsEntry) {
        await handleDropItems(e.dataTransfer)
      } else {
        openChat(); await handleFiles(e.dataTransfer.files)
      }
    }
  })

  // 粘贴事件 — Ctrl+V 粘贴图片直接渲染
  msgInput.addEventListener('paste', async e => {
    const items = e.clipboardData?.items
    if (!items) return
    const files = []
    for (const item of items) {
      if (item.kind === 'file') files.push(item.getAsFile())
    }
    if (files.length) { e.preventDefault(); openChat(); await handleFiles(files) }
  })

  // 初始未聚焦：显示语音输入提示
  if (!inputLocked) msgInput.placeholder = idlePlaceholder();

  // ── 斜杠命令 ────────────────────────────────────────────────
  // 输入框以 "/" 开头时弹出命令菜单。ASR/TTS/LLM 直接打开对应设置面板；
  // 视频生成无独立面板，预填一句配置请求由 Agent 引导。
  const slashMenu = document.getElementById("slash-menu");
  const SLASH_COMMANDS = [
    {
      cmd: "/llm", keys: ["llm", "模型", "model"],
      label: "配置 LLM 模型", desc: "选择大模型服务商并填入 API Key",
      run: () => openSettings?.("llm"),
    },
    {
      cmd: "/voice", keys: ["voice", "asr", "语音对话", "语音识别", "shibie"],
      label: "配置语音对话", desc: "麦克风转文字 + 回复转语音",
      run: () => openSettings?.("voice"),
    },
    {
      cmd: "/tts", keys: ["tts", "语音合成", "hecheng"],
      label: "配置语音合成", desc: "Agent 回复转语音 · 豆包/MiniMax/OpenAI",
      run: openVoiceTTS,
    },
    {
      cmd: "/video", keys: ["video", "视频", "视频生成", "seedance", "huoshan"],
      label: "配置视频生成", desc: "AI 视频生成 · 火山方舟 Seedance",
      run: prefillVideoConfig,
    },
    {
      cmd: "/help", keys: ["help", "帮助", "命令"],
      label: "查看全部命令", desc: "列出所有可用斜杠命令",
      run: showSlashHelp,
    },
  ];

  let slashItems = [];    // 当前过滤后的命令
  let slashActive = -1;   // 当前高亮索引

  function slashQuery() {
    const v = msgInput.value;
    if (!v.startsWith("/")) return null;
    return v.slice(1).trim().toLowerCase();
  }

  function filterSlash(q) {
    if (!q) return SLASH_COMMANDS.slice();
    return SLASH_COMMANDS.filter(c =>
      c.cmd.slice(1).startsWith(q) ||
      c.keys.some(k => k.toLowerCase().includes(q)) ||
      c.label.includes(q)
    );
  }

  function renderSlashMenu() {
    slashMenu.innerHTML = "";
    if (!slashItems.length) {
      const empty = document.createElement("div");
      empty.className = "slash-empty";
      empty.textContent = "无匹配命令";
      slashMenu.appendChild(empty);
      return;
    }
    slashItems.forEach((c, i) => {
      const item = document.createElement("div");
      item.className = "slash-item" + (i === slashActive ? " active" : "");
      item.setAttribute("role", "option");
      item.innerHTML =
        '<span class="slash-cmd"></span>' +
        '<span class="slash-text"><div class="slash-label"></div><div class="slash-desc"></div></span>';
      item.querySelector(".slash-cmd").textContent = c.cmd;
      item.querySelector(".slash-label").textContent = c.label;
      item.querySelector(".slash-desc").textContent = c.desc;
      // 用 mousedown 而非 click：抢在输入框 blur 之前执行，保留焦点
      item.addEventListener("mousedown", (e) => { e.preventDefault(); runSlash(c); });
      item.addEventListener("mouseenter", () => { slashActive = i; highlightSlash(); });
      slashMenu.appendChild(item);
    });
  }

  function highlightSlash() {
    Array.from(slashMenu.children).forEach((el, i) =>
      el.classList.toggle("active", i === slashActive));
  }

  function updateSlashMenu() {
    const q = slashQuery();
    if (q === null) { hideSlashMenu(); return; }
    slashItems = filterSlash(q);
    slashActive = slashItems.length ? 0 : -1;
    renderSlashMenu();
    slashMenu.hidden = false;
  }

  function hideSlashMenu() {
    slashMenu.hidden = true;
    slashItems = [];
    slashActive = -1;
  }

  function handleSlashKeydown(event) {
    if (slashMenu.hidden) return false;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (slashItems.length) { slashActive = (slashActive + 1) % slashItems.length; highlightSlash(); }
        return true;
      case "ArrowUp":
        event.preventDefault();
        if (slashItems.length) { slashActive = (slashActive - 1 + slashItems.length) % slashItems.length; highlightSlash(); }
        return true;
      case "Tab":
      case "Enter":
        if (slashActive >= 0 && slashItems[slashActive]) {
          event.preventDefault();
          runSlash(slashItems[slashActive]);
          return true;
        }
        return false;
      case "Escape":
        event.preventDefault();
        hideSlashMenu();
        return true;
      default:
        return false;
    }
  }

  function runSlash(c) {
    hideSlashMenu();
    msgInput.value = "";   // 清掉已输入的 "/xxx"
    autoGrowInput();
    try { c.run(); } catch (e) { console.warn("[slash]", c.cmd, e); }
  }

  function openVoiceTTS() {
    openSettings?.("voice");
    setTimeout(() => {
      document.getElementById("settings-tts-section")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  function prefillVideoConfig() {
    // 视频生成（火山方舟 Seedance）没有独立设置面板，靠对话引导配置
    msgInput.value = "我想配置视频生成（火山方舟 Seedance），请告诉我怎么申请 API Key 以及如何填入";
    openChat();
    autoGrowInput();
    try { msgInput.focus(); } catch {}
  }

  function showSlashHelp() {
    const lines = SLASH_COMMANDS.map(c => `· \`${c.cmd}\` — ${c.label}：${c.desc}`).join("\n");
    addMsg("jarvis", `可用命令（在输入框输入 \`/\` 调出菜单）：\n\n${lines}`, { alert: false, pending: false });
    openChat();
  }

  document.addEventListener("pointerdown", event => {
    if (chatArea.contains(event.target)) return;
    if (hasPendingJarvisMessage && !isTyping()) {
      pendingMessageDismissed = true;
      closeChat();
      return;
    }
    if (!isTyping()) {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      chatHistory.classList.remove("open");
    }
  });

  function deleteLastUserMsg() {
    const msgs = chatMessages.querySelectorAll('.msg-user')
    if (!msgs.length) return
    const last = msgs[msgs.length - 1]
    last.style.transition = 'opacity 0.3s ease'
    last.style.opacity = '0'
    setTimeout(() => last.remove(), 300)
  }

  // ── 流式回复气泡 ───────────────────────────────────────────────
  // 后端 LLM 边生成边通过 stream_chunk 推 token；这里先建一个空的 jarvis 气泡，
  // 随 token 到达不断重渲染，等权威的 message 事件到达再 finalize 成最终干净全文。
  // 该气泡始终是最后一个 .msg-jarvis，所以打断 ✋（updateLastJarvisMsg）照常作用其上。
  function beginLiveJarvisMsg({ alert = true } = {}) {
    if (liveEl) finalizeLiveJarvisMsg(null);  // 兜底：上一轮孤儿气泡先定稿
    const div = document.createElement("div");
    div.className = "msg msg-jarvis msg-live";
    const labelSpan = document.createElement("span");
    labelSpan.className = "msg-label";
    labelSpan.textContent = getAgentName();
    div.appendChild(labelSpan);
    div.appendChild(createMarkdownBody(""));
    chatMessages.appendChild(div);
    while (chatMessages.children.length > maxHistory) {
      chatMessages.removeChild(chatMessages.firstChild);
    }
    liveEl = div;
    hasPendingJarvisMessage = true;
    pendingMessageDismissed = false;
    if (alert) playJarvisAlert();
    openChat();
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function updateLiveJarvisMsg(text) {
    if (!liveEl) return;
    const children = Array.from(liveEl.children);
    for (let i = 1; i < children.length; i++) children[i].remove();
    liveEl.appendChild(createMarkdownBody(text));
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // text 为字符串则替换为权威全文；为 null 仅去掉 live 标记（保留已流出的内容）
  function finalizeLiveJarvisMsg(text) {
    if (!liveEl) return false;
    if (typeof text === "string") {
      const children = Array.from(liveEl.children);
      for (let i = 1; i < children.length; i++) children[i].remove();
      liveEl.appendChild(createMarkdownBody(text));
    }
    liveEl.classList.remove("msg-live");
    liveEl = null;
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return true;
  }

  function hasLiveJarvisMsg() { return !!liveEl; }

  function updateLastJarvisMsg(newText) {
    const msgs = chatMessages.querySelectorAll('.msg-jarvis');
    if (!msgs.length) return;
    const last = msgs[msgs.length - 1];
    // Remove the original markdown body (all child nodes after the label span)
    const children = Array.from(last.children);
    for (let i = 1; i < children.length; i++) children[i].remove();
    last.appendChild(createMarkdownBody(newText));
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  return {
    addMsg,
    deleteLastUserMsg,
    updateLastJarvisMsg,
    beginLiveJarvisMsg,
    updateLiveJarvisMsg,
    finalizeLiveJarvisMsg,
    hasLiveJarvisMsg,
    applyActivationWarmupLock,
    isComposerLocked: () => inputLocked,
    isTyping,
    openChat,
    restoreChatHistory,
    send,
    unlockAudioOnFirstGesture,
  };
}
