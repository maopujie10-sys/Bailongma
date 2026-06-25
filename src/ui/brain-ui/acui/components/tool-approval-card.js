// ACUI ToolApprovalCard — tool execution approval dialog
// Triggered by SSE event: { type: "tool_approval_required", data: { tool_name, parameters, risk_level, request_id } }
// placement: center (modal overlay)

const CSS = `
  :host { display: block; pointer-events: auto; }
  .card {
    padding: 20px 24px;
    min-width: 320px;
    max-width: 420px;
    border-radius: 12px;
    background: rgba(20, 20, 36, 0.96);
    border: 1px solid rgba(120, 140, 240, 0.30);
    box-shadow: 0 12px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(120,140,240,0.08);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    color: #e0e0e0;
    user-select: none;
  }
  .icon-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .icon-row .icon { font-size: 22px; }
  .title {
    font-size: 13px;
    font-weight: 600;
    color: #f0c040;
  }
  .tool-name {
    font-size: 14px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 8px;
  }
  .param-section {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 10px;
    max-height: 150px;
    overflow-y: auto;
  }
  .param-section pre {
    margin: 0;
    font-size: 11px;
    font-family: "JetBrains Mono", "SF Mono", ui-monospace, monospace;
    color: #b0b8d0;
    white-space: pre-wrap;
    word-break: break-all;
    line-height: 1.6;
  }
  .risk-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    margin-bottom: 14px;
    color: #999;
  }
  .risk-badge {
    padding: 2px 10px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
  }
  .risk-low    { background: rgba(46, 204, 113, 0.18); color: #2ecc71; }
  .risk-medium { background: rgba(243, 156, 18, 0.18); color: #f39c12; }
  .risk-high   { background: rgba(231, 76, 60, 0.18); color: #e74c3c; }
  .timer {
    font-size: 11px;
    color: #777;
    text-align: right;
    margin-bottom: 8px;
  }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn {
    padding: 7px 16px;
    border-radius: 5px;
    font-size: 12px;
    cursor: pointer;
    border: none;
    transition: opacity 0.15s;
    white-space: nowrap;
  }
  .btn:hover { opacity: 0.85; }
  .btn-allow      { background: #2ecc71; color: #111; }
  .btn-always     { background: #3498db; color: #fff; }
  .btn-deny       { background: transparent; border: 1px solid #666; color: #ccc; }
`

const _sheet = new CSSStyleSheet()
_sheet.replaceSync(CSS)

class ToolApprovalCard extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.shadowRoot.adoptedStyleSheets = [_sheet]
    this._props = {}
    this._timerId = null
    this._seconds = 30
  }

  set props(v) {
    this._props = v || {}
    this._seconds = Number(v?.timeout) || 30
    this._render()
    this._startTimer()
  }

  connectedCallback() {
    this._render()
    this._startTimer()
  }

  disconnectedCallback() {
    this._clearTimer()
  }

  _clearTimer() {
    if (this._timerId) { clearInterval(this._timerId); this._timerId = null; }
  }

  _startTimer() {
    this._clearTimer()
    const timerEl = () => this.shadowRoot.getElementById('timer-text')
    this._timerId = setInterval(() => {
      this._seconds--
      const el = timerEl()
      if (el) el.textContent = `⏱ ${this._seconds}s 后自动拒绝`
      if (this._seconds <= 0) {
        this._clearTimer()
        this._emit('deny_tool', { reason: 'timeout' })
      }
    }, 1000)
  }

  _emit(action, payload = {}) {
    this.dispatchEvent(new CustomEvent('acui:action', {
      bubbles: true,
      composed: true,
      detail: { action, payload },
    }))
  }

  _riskClass(level) {
    const lv = String(level || 'low').toLowerCase()
    if (lv === 'medium' || lv === '中') return 'risk-medium'
    if (lv === 'high' || lv === '高') return 'risk-high'
    return 'risk-low'
  }

  _riskLabel(level) {
    const lv = String(level || '低').toLowerCase()
    if (lv === 'medium' || lv === '中') return '中风险'
    if (lv === 'high' || lv === '高') return '高风险'
    return '低风险'
  }

  _render() {
    const { tool_name = '未知工具', parameters = {}, risk_level = 'low', request_id = '' } = this._props
    const toolNameZh = String(tool_name).replace(/^_+|_+$/g, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())

    let paramsStr = ''
    try {
      if (typeof parameters === 'string') {
        paramsStr = parameters
      } else if (parameters && typeof parameters === 'object') {
        paramsStr = JSON.stringify(parameters, null, 2)
      }
    } catch {
      paramsStr = String(parameters || '')
    }

    this.shadowRoot.innerHTML = `
      <div class="card">
        <div class="icon-row">
          <span class="icon">🔧</span>
          <span class="title">工具审批请求</span>
        </div>
        <div class="tool-name">${this._escapeHtml(toolNameZh)}</div>
        ${paramsStr ? `<div class="param-section"><pre>${this._escapeHtml(paramsStr)}</pre></div>` : ''}
        <div class="risk-row">
          风险等级：
          <span class="risk-badge ${this._riskClass(risk_level)}">${this._riskLabel(risk_level)}</span>
        </div>
        <div class="timer" id="timer-text">⏱ ${this._seconds}s 后自动拒绝</div>
        <div class="actions">
          <button class="btn btn-allow" id="btn-allow">✅ 允许本次</button>
          <button class="btn btn-always" id="btn-always">🔄 始终允许</button>
          <button class="btn btn-deny" id="btn-deny">❌ 拒绝</button>
        </div>
      </div>`

    const payload = { tool_name, request_id }

    this.shadowRoot.getElementById('btn-allow').onclick = () => {
      this._clearTimer()
      this._emit('approve_tool_once', payload)
    }
    this.shadowRoot.getElementById('btn-always').onclick = () => {
      this._clearTimer()
      this._emit('approve_tool_always', payload)
    }
    this.shadowRoot.getElementById('btn-deny').onclick = () => {
      this._clearTimer()
      this._emit('deny_tool', { ...payload, reason: 'user_denied' })
    }
  }

  _escapeHtml(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }
}

ToolApprovalCard.tagName = 'acui-tool-approval-card'
customElements.define(ToolApprovalCard.tagName, ToolApprovalCard)

export { ToolApprovalCard }
