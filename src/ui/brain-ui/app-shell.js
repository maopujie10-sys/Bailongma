import { createHotspotPanel } from './hotspot-panel.js';
import { createWorldcupPanel } from './worldcup-panel.js';
import { createPersonCardPanel } from './person-card-panel.js';
import { createDocPanel } from './doc-panel.js';

const createGraphStage = () => `
<div class="grid-overlay"></div>
<svg id="graph" aria-label="Longma 璁板繂鑺傜偣鍥?></svg>
`;

const createPrimaryPanel = () => `
<aside id="panel-l1" class="panel">
  <header class="panel-identity">
    <div class="brand-mark"></div>
    <div class="brand-copy">
      <div class="eyebrow">璁ょ煡鐣岄潰</div>
      <div class="brand-title" id="agent-brand-name">Longma AI Agent</div>
    </div>
    <button class="voice-btn" id="voice-btn" title="楹﹀厠椋?寮€/鍏? type="button">馃帳</button>
    <button class="video-btn" id="video-btn" title="瑙嗛妯″紡 (V)" type="button" hidden>鈯?/button>
    <button class="music-btn" id="music-btn" title="闊充箰妯″紡 (M)" type="button" hidden>鈾?/button>
    <button class="settings-btn" id="settings-btn" title="璁剧疆" type="button">鈿?/button>
  </header>

  <div class="stream-meta">
    <div>
      <div class="stream-title-text">鐢ㄦ埛娑堟伅澶勭悊鍣?/div>
      <!-- <div class="stream-subtitle">user message 路 react</div> -->
    </div>
    <span class="pill" id="pill-l1">瀹炴椂</span>
  </div>

  <!-- AI 褰撳墠姝ｅ湪鍋氫粈涔堬細绾淳鐢熷睍绀猴紝浠?tool_call 浜嬩欢娴佽嚜鍔ㄥ綊绫伙紝AI 涓嶉渶瑕佸仛浠讳綍棰濆鍔ㄤ綔銆?       鍖楁瀬鏄燂細閫氫俊闂闈犵晫闈晶娲剧敓鍙鍖栬В鍐筹紝涓嶉€?AI 瀛︿汉寮€鍙ｃ€?-->
  <div class="ai-activity" id="ai-activity">
    <span class="ai-activity-dot" id="ai-activity-dot"></span>
    <span class="ai-activity-label" id="ai-activity-label">绌洪棽</span>
    <span class="ai-activity-detail" id="ai-activity-detail"></span>
  </div>

  ${createVoicePanel()}

  <div class="legend" id="legend"></div>

  <div class="stream">
    <div class="stream-inner" id="si-l1"></div>
  </div>

  <div class="panel-actions">
    <button class="reset-view" id="reset-view-btn" type="button">閲嶇疆鑺傜偣鍥?/button>

    <section class="physics-control" id="physics-control">
      <button class="physics-toggle" id="physics-toggle" type="button" aria-expanded="false">
        <span class="physics-toggle-label">鍥捐氨璋冭妭</span>
        <span class="physics-toggle-icon">鈻?/span>
      </button>
      <div class="physics-panel" id="physics-panel">
        <div class="physics-panel-inner">
          <div class="physics-field">
            <div class="physics-field-head">
              <label class="physics-field-label" for="gravity-slider">寮曞姏</label>
              <span class="physics-field-value" id="gravity-value">1.00x</span>
            </div>
            <input class="physics-slider" id="gravity-slider" type="range" min="0" max="5" step="0.02" value="2">
          </div>
          <div class="physics-field">
            <div class="physics-field-head">
              <label class="physics-field-label" for="repulsion-slider">鏂ュ姏</label>
              <span class="physics-field-value" id="repulsion-value">1.00x</span>
            </div>
            <input class="physics-slider" id="repulsion-slider" type="range" min="0" max="5" step="0.02" value="2">
          </div>
          <div class="physics-field">
            <div class="physics-field-head">
              <label class="physics-field-label" for="node-size-slider">鑺傜偣澶у皬</label>
              <span class="physics-field-value" id="node-size-value">1.00x</span>
            </div>
            <input class="physics-slider" id="node-size-slider" type="range" min="0" max="5" step="0.02" value="2">
          </div>
        </div>
      </div>
    </section>
  </div>
</aside>
`;

const createSecondaryPanel = () => `
<aside id="panel-l2" class="panel">
  <header class="panel-stats">
    <div class="stat">
      <span class="stat-label">鐘舵€?/span>
      <div class="stat-value live" id="conn-state"><span class="live-dot"></span>Token娴?/div>
    </div>
    <div class="stat">
      <span class="stat-label">鑺傜偣</span>
      <div class="stat-value" id="node-count">0</div>
    </div>
    <div class="stat">
      <span class="stat-label">杩炵嚎</span>
      <div class="stat-value" id="link-count">0</div>
    </div>
    <div class="stat">
      <span class="stat-label">tok/s</span>
      <div class="stat-value" id="tok-rate">鈥?/div>
    </div>
    <div class="stat" id="mem-recall-stat" title="杩?1 灏忔椂璁板繂鍙洖娆℃暟 / 骞冲潎鎷夊彇鏉℃暟銆傜偣鍑绘煡鐪嬫槑缁?>
      <span class="stat-label">鍙洖/h</span>
      <div class="stat-value" id="mem-recall-rate">鈥?/div>
    </div>
    <div class="stat" id="mem-extract-stat" title="杩?1 灏忔椂璁板繂鎶藉彇娆℃暟 / 骞冲潎鍐欏叆鏉℃暟銆傜偣鍑绘煡鐪嬫槑缁?>
      <span class="stat-label">鎶藉彇/h</span>
      <div class="stat-value" id="mem-extract-rate">鈥?/div>
    </div>
  </header>

  <!-- 涓撴敞甯?UI 宸查殣钘忥紙鍚庣 focus stack 浠嶅湪宸ヤ綔锛岀粰 LLM 娉ㄥ叆涓婁笅鏂囷級銆?       瑕佹仮澶嶈瀵熼潰鏉挎椂鎶婂搴?HTML 杩樺師鍗冲彲鈥斺€攁pp.js 娓叉煋閫昏緫淇濈暀鐫€锛岄潬 getElementById 杩斿洖 null 鑷姩 no-op銆?-->

  <div class="stream-meta">
    <div>
      <div class="stream-title-text">鑷富琛屽姩鏈哄埗 路 Tick</div>
      <div class="stream-subtitle">蹇冭烦 路 鎬濊€?路 宸ュ叿</div>
    </div>
    <span class="pill pill-warm" id="pill-l2">娴佸紡浼犺緭</span>
  </div>

  <div class="stream">
    <div class="stream-inner" id="si-l2"></div>
  </div>
</aside>
`;

const createConsole = () => `
<section class="console" id="chat-area">
  <div id="chat-history">
    <div id="chat-messages"></div>
  </div>
  <div id="input-row">
    <div id="slash-menu" class="slash-menu" role="listbox" aria-label="鍛戒护" hidden></div>
    <span class="prompt-mark">鈻?/span>
    <div class="chat-toolbar" id="chat-toolbar">
      <select class="toolbar-select" id="quick-model-select" title="蹇€熷垏鎹㈡ā鍨?>
        <option value="auto">馃 鑷姩</option>
        <option value="deepseek">DeepSeek</option>
        <option value="openai">OpenAI</option>
        <option value="anthropic">Anthropic</option>
      </select>
      <label class="toolbar-toggle" title="娌欑寮€鍏?>
        <input type="checkbox" id="quick-sandbox-toggle" checked />
        <span class="toggle-label">馃洝锔?娌欑</span>
      </label>
    </div>
    <textarea id="msg-input" rows="1" placeholder="鍚?Longma 鍙戦€佹秷鎭€︼紙杈撳叆 / 璋冨嚭鍛戒护锛孲hift+Enter 鎹㈣锛? autocomplete="off"></textarea>
    <button id="send-btn" type="button">鍙戦€?/button>
  </div>
</section>
`;

const createThemeSwitcher = () => `
<div class="theme-switcher" id="theme-switcher">
  <div class="theme-dot active" data-t="midnight" title="Midnight Steel"></div>
  <div class="theme-dot" data-t="phosphor" title="Phosphor CRT"></div>
  <div class="theme-dot" data-t="violet" title="Violet Lab"></div>
  <div class="theme-dot" data-t="rose" title="Rose Dusk"></div>
  <div class="theme-dot" data-t="arctic" title="Arctic"></div>
  <div class="theme-dot" data-t="sand" title="Warm Sand"></div>
</div>
`;

const createTooltip = () => `
<div id="tip"></div>
`;

const createSettingsModal = () => `
<div class="settings-overlay" id="settings-overlay" hidden>
  <div class="settings-modal" role="dialog" aria-modal="true" aria-label="璁剧疆">
    <div class="settings-header">
      <span class="settings-title">璁剧疆</span>
      <button class="settings-close" id="settings-close" type="button" aria-label="鍏抽棴">脳</button>
    </div>
    <div class="settings-body">

      <!-- 渚ф爮瀵艰埅 -->
      <nav class="settings-nav">
        <button class="settings-nav-item active" data-tab="appearance" type="button">澶栬</button>
        <button class="settings-nav-item" data-tab="llm" type="button">LLM 妯″瀷</button>
        <button class="settings-nav-item" data-tab="media" type="button">濯掍綋鑳藉姏</button>
        <button class="settings-nav-item" data-tab="social" type="button">绀句氦濯掍綋</button>
        <button class="settings-nav-item" data-tab="voice" type="button">璇煶瀵硅瘽</button>
        <button class="settings-nav-item" data-tab="web-search" type="button">涓婄綉鎼滅储</button>
        <button class="settings-nav-item" data-tab="security" type="button">瀹夊叏娌欑</button>
        <button class="settings-nav-item" data-tab="update" type="button">鏇存柊</button>
      </nav>

      <!-- 鍐呭鍖?-->
      <div class="settings-content">

        <!-- 鈹€鈹€ 澶栬 tab 鈹€鈹€ -->
        <div class="settings-tab active" data-tab="appearance">
          <div class="settings-section">
            <div class="settings-section-label">涓婚</div>
            ${createThemeSwitcher()}
          </div>
          <div class="settings-section">
            <div class="settings-section-label">AI 鍚嶅瓧</div>
            <div class="settings-row">
              <label class="settings-label" for="settings-agent-name">鏄剧ず鍚?/label>
              <input class="settings-input" id="settings-agent-name" type="text" maxlength="32" autocomplete="off" spellcheck="false" placeholder="灏忕櫧榫?>
            </div>
            <div class="settings-row-action">
              <button class="settings-save-btn" id="settings-save-agent-name" type="button">淇濆瓨</button>
              <span class="settings-feedback" id="settings-agent-name-feedback"></span>
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">璁板繂鑺傜偣鍥?/div>
            <p class="settings-hint">寮€鍚悗鍦ㄨ儗鏅樉绀鸿蹇嗚妭鐐瑰姏瀵煎悜鍥撅紝浼氬崰鐢ㄩ澶?CPU/GPU 璧勬簮锛屼綆閰嶈澶囧缓璁叧闂€備慨鏀瑰悗闇€鍒锋柊椤甸潰鐢熸晥銆?/p>
            <div class="settings-row">
              <label class="settings-label" for="settings-memory-graph-toggle">鏄剧ず璁板繂鑺傜偣鍥?/label>
              <input id="settings-memory-graph-toggle" type="checkbox" style="width:auto;flex:none;">
              <span class="settings-feedback" id="settings-memory-graph-feedback" style="margin-left:8px;"></span>
            </div>
          </div>
        </div>

        <!-- 鈹€鈹€ LLM 妯″瀷 tab 鈹€鈹€ -->
        <div class="settings-tab" data-tab="llm">
          <div class="settings-section">
            <div class="settings-section-label">褰撳墠鐘舵€?/div>
            <div class="settings-config-row">
              <span class="settings-config-type">LLM</span>
              <span class="settings-config-info" id="settings-cfg-llm">鈥?/span>
              <span class="settings-config-dot" id="settings-cfg-llm-dot"></span>
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">鍒囨崲閰嶇疆</div>
            <div class="settings-row">
              <label class="settings-label" for="settings-provider-select">鎻愪緵鍟?/label>
              <select class="settings-select" id="settings-provider-select">
                <option value="auto">鑷姩璇嗗埆</option>
                <option value="deepseek">DeepSeek</option>
                <option value="minimax">MiniMax</option>
                <option value="mimo">灏忕背 MiMo</option>
                <option value="custom">鑷畾涔夌鐐癸紙鏈湴/鍏朵粬锛?/option>
              </select>
            </div>
            <div class="settings-row" id="settings-model-row">
              <label class="settings-label" for="settings-model-select">妯″瀷</label>
              <select class="settings-select" id="settings-model-select"></select>
            </div>
            <!-- 鑷畾涔夌鐐瑰瓧娈碉紙閫夋嫨"鑷畾涔夌鐐?鏃舵樉绀猴級 -->
            <div id="settings-custom-llm-section" style="display:none;">
              <div class="settings-row">
                <label class="settings-label" for="settings-custom-baseurl">Base URL</label>
                <input class="settings-input" id="settings-custom-baseurl" type="text" placeholder="濡?http://localhost:11434/v1">
              </div>
              <div class="settings-row">
                <label class="settings-label" for="settings-custom-model">妯″瀷鍚嶇О</label>
                <input class="settings-input" id="settings-custom-model" type="text" placeholder="濡?llama3.2, qwen2.5, mistral">
              </div>
            </div>
            <div class="settings-row">
              <label class="settings-label" for="settings-llm-key">API Key</label>
              <div class="settings-secret-wrap">
                <input class="settings-input" id="settings-llm-key" type="password" placeholder="宸蹭繚瀛樼殑 Key 浼氬湪杩欓噷鏄剧ず" autocomplete="new-password">
                <button class="settings-secret-toggle" id="settings-llm-key-toggle" type="button" aria-label="鏄剧ず API Key" title="鏄剧ず/闅愯棌 API Key">馃憗</button>
              </div>
            </div>
            <div class="settings-row-action">
              <button class="settings-save-btn" id="settings-save-llm" type="button">淇濆瓨</button>
              <span class="settings-feedback" id="settings-llm-feedback"></span>
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">妯″瀷娓╁害</div>
            <p class="settings-hint">鎺у埗鍥炲鐨勯殢鏈烘€с€? = 纭畾鎬ф渶楂橈紝1 = 姝ｅ父鍒涙剰锛?.5 = 鏇撮殢鏈恒€傛帹鑽?0.3鈥?.7銆?/p>
            <div class="settings-row">
              <label class="settings-label" for="settings-temperature">Temperature</label>
              <input type="range" id="settings-temperature" min="0" max="1.5" step="0.05" value="0.5" style="flex:1;cursor:pointer;">
              <span id="settings-temperature-val" style="min-width:2.8em;text-align:right;color:var(--ink2);font-size:13px;">0.50</span>
            </div>
            <div class="settings-row-action">
              <button class="settings-save-btn" id="settings-save-temperature" type="button">淇濆瓨</button>
              <span class="settings-feedback" id="settings-temperature-feedback"></span>
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">鎬濊€冩ā寮?/div>
            <p class="settings-hint">榛樿鍏抽棴锛氱洿鎺ヤ綔绛旓紝鍝嶅簲鏇村揩銆佹洿鐪?token銆傚紑鍚悗妯″瀷浼氬厛鎺ㄧ悊鍐嶅洖绛旓紝澶嶆潅浠诲姟鏇村彲闈狅紙鍏蜂綋鎯冲娣辩敱妯″瀷鑷繁鍐冲畾锛夛紝浣嗗搷搴旀洿鎱€傞亣鍒伴毦棰樻兂瑕佹洿楂樿川閲忔椂鍐嶅紑鍚€?/p>
            <div class="settings-row">
              <label class="settings-label" for="settings-thinking">鍚敤鎬濊€冩ā寮?/label>
              <label class="settings-toggle">
                <input type="checkbox" id="settings-thinking">
                <span class="settings-toggle-track"></span>
              </label>
              <span class="settings-feedback" id="settings-thinking-feedback"></span>
            </div>
          </div>
        </div>

        <!-- 鈹€鈹€ 濯掍綋鑳藉姏 tab 鈹€鈹€ -->
        <div class="settings-tab" data-tab="media">
          <div class="settings-section">
            <div class="settings-section-label">褰撳墠鐘舵€?/div>
            <div class="settings-config-row">
              <span class="settings-config-type">濯掍綋</span>
              <span class="settings-config-info" id="settings-cfg-media">鈥?/span>
              <span class="settings-config-dot" id="settings-cfg-media-dot"></span>
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">MiniMax API Key</div>
            <div class="settings-row">
              <label class="settings-label" for="settings-minimax-key">API Key</label>
              <input class="settings-input" id="settings-minimax-key" type="password" placeholder="濉叆 MiniMax API Key鈥? autocomplete="new-password">
            </div>
            <div class="settings-row-action">
              <button class="settings-save-btn" id="settings-save-minimax" type="button">淇濆瓨</button>
              <span class="settings-feedback" id="settings-minimax-feedback"></span>
            </div>
          </div>
        </div>

        <!-- 鈹€鈹€ 绀句氦濯掍綋 tab 鈹€鈹€ -->
        <div class="settings-tab" data-tab="social">
          <div class="settings-section">
            <div class="settings-section-label">Discord</div>
            <div class="settings-platform-status" id="social-status-discord"></div>
            <div class="settings-row">
              <label class="settings-label" for="social-discord-token">Bot Token</label>
              <input class="settings-input" id="social-discord-token" type="password" placeholder="鐣欑┖淇濇寔鍘熷€间笉鍙樷€? autocomplete="new-password">
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">椋炰功</div>
            <div class="settings-platform-status" id="social-status-feishu"></div>
            <div class="settings-row">
              <label class="settings-label" for="social-feishu-appid">App ID</label>
              <input class="settings-input" id="social-feishu-appid" type="password" placeholder="鐣欑┖淇濇寔鍘熷€尖€? autocomplete="new-password">
            </div>
            <div class="settings-row">
              <label class="settings-label" for="social-feishu-secret">App Secret</label>
              <input class="settings-input" id="social-feishu-secret" type="password" placeholder="鐣欑┖淇濇寔鍘熷€尖€? autocomplete="new-password">
            </div>
            <div class="settings-row">
              <label class="settings-label" for="social-feishu-token">Verify Token</label>
              <input class="settings-input" id="social-feishu-token" type="password" placeholder="鐣欑┖淇濇寔鍘熷€尖€? autocomplete="new-password">
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">寰俊鍏紬鍙?/div>
            <div class="settings-platform-status" id="social-status-wechat"></div>
            <div class="settings-row">
              <label class="settings-label" for="social-wechat-appid">App ID</label>
              <input class="settings-input" id="social-wechat-appid" type="password" placeholder="鐣欑┖淇濇寔鍘熷€尖€? autocomplete="new-password">
            </div>
            <div class="settings-row">
              <label class="settings-label" for="social-wechat-secret">App Secret</label>
              <input class="settings-input" id="social-wechat-secret" type="password" placeholder="鐣欑┖淇濇寔鍘熷€尖€? autocomplete="new-password">
            </div>
            <div class="settings-row">
              <label class="settings-label" for="social-wechat-token">Token</label>
              <input class="settings-input" id="social-wechat-token" type="password" placeholder="鐣欑┖淇濇寔鍘熷€尖€? autocomplete="new-password">
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">浼佷笟寰俊</div>
            <div class="settings-platform-status" id="social-status-wecom"></div>
            <div class="settings-row">
              <label class="settings-label" for="social-wecom-botkey">Bot Key</label>
              <input class="settings-input" id="social-wecom-botkey" type="password" placeholder="鐣欑┖淇濇寔鍘熷€尖€? autocomplete="new-password">
            </div>
            <div class="settings-row">
              <label class="settings-label" for="social-wecom-token">Incoming Token</label>
              <input class="settings-input" id="social-wecom-token" type="password" placeholder="鐣欑┖淇濇寔鍘熷€尖€? autocomplete="new-password">
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">寰俊 ClawBot锛堜釜浜哄井淇★級</div>
            <div class="settings-platform-status" id="social-status-clawbot">鈼?鏈繛鎺?/div>
            <p class="settings-hint">鐐瑰嚮銆岃繛鎺ュ井淇°€嶅悗浼氱敓鎴愪簩缁寸爜锛岀敤寰俊鎵爜鍗冲彲缁戝畾涓汉璐﹀彿銆傚嚟璇佷繚瀛樺湪鏈湴锛岄噸鍚悗鏃犻渶閲嶆柊鎵爜銆?/p>
            <div class="settings-row" style="gap:8px;flex-wrap:wrap;">
              <button class="settings-save-btn" id="clawbot-connect-btn" type="button" style="width:auto;padding:0 16px;">杩炴帴寰俊</button>
              <button class="settings-save-btn" id="clawbot-logout-btn" type="button" style="width:auto;padding:0 16px;background:var(--danger,#c0392b);">鏂紑</button>
            </div>
            <div id="clawbot-qr-area" style="display:none;margin-top:12px;text-align:center;">
              <p class="settings-hint" style="margin-bottom:8px;">鐢ㄥ井淇℃壂鎻忎笅鏂逛簩缁寸爜锛?/p>
              <img id="clawbot-qr-img" src="" alt="寰俊浜岀淮鐮? style="width:200px;height:200px;border:1px solid var(--border);border-radius:4px;">
              <p class="settings-hint" style="margin-top:6px;font-size:11px;" id="clawbot-qr-hint">绛夊緟鎵爜鈥?/p>
            </div>
            <span class="settings-feedback" id="clawbot-feedback"></span>
          </div>
          <div class="settings-section settings-section-action">
            <button class="settings-save-btn" id="settings-save-social" type="button">淇濆瓨鎵€鏈?/button>
            <span class="settings-feedback" id="settings-social-feedback"></span>
          </div>
        </div>

        <!-- 鈹€鈹€ 璇煶 tab 鈹€鈹€ -->
        <div class="settings-tab" data-tab="voice">
          <div class="settings-section">
            <div class="settings-section-label">璇嗗埆妯″紡閰嶇疆</div>
            <div class="settings-row">
              <label class="settings-label" for="voice-auto-key">绮樿创 Key 鑷姩璇嗗埆鍘傚晢</label>
              <input class="settings-input" type="password" id="voice-auto-key" placeholder="闃块噷浜?/ 鑵捐浜?/ 璁 / 鐏北璞嗗寘 ASR Key">
              <span id="voice-auto-detect" style="color:var(--cool);font-size:12px;min-width:86px;text-align:right;"></span>
            </div>
            <div class="settings-row">
              <label class="settings-label" for="voice-provider-select">鏈嶅姟鍟?/label>
              <select class="settings-select" id="voice-provider-select">
                <option value="local">鏈満璇嗗埆锛坢acOS锛?/option>
                <option value="aliyun">闃块噷浜戠櫨鐐硷紙鎺ㄨ崘锛?/option>
                <option value="volcengine">鐏北寮曟搸璞嗗寘 ASR</option>
                <option value="tencent">鑵捐浜?ASR</option>
                <option value="xunfei">绉戝ぇ璁 RTASR</option>
              </select>
            </div>
            <div id="voice-cred-aliyun">
              <div class="settings-row">
                <label class="settings-label" for="voice-aliyun-key">闃块噷浜?API Key</label>
                <input class="settings-input" type="password" id="voice-aliyun-key" placeholder="鐣欑┖鍒欎笉淇敼">
              </div>
            </div>
            <div id="voice-cred-tencent" style="display:none;">
              <div class="settings-row">
                <label class="settings-label" for="voice-tencent-sid">SecretId</label>
                <input class="settings-input" type="password" id="voice-tencent-sid" placeholder="鐣欑┖鍒欎笉淇敼">
              </div>
              <div class="settings-row">
                <label class="settings-label" for="voice-tencent-skey">SecretKey</label>
                <input class="settings-input" type="password" id="voice-tencent-skey" placeholder="鐣欑┖鍒欎笉淇敼">
              </div>
              <div class="settings-row">
                <label class="settings-label" for="voice-tencent-appid">AppId</label>
                <input class="settings-input" type="text" id="voice-tencent-appid" placeholder="鑵捐浜?AppId">
              </div>
            </div>
            <div id="voice-cred-volcengine" style="display:none;">
              <div class="settings-row">
                <label class="settings-label" for="voice-volc-apikey">API Key锛堟柊鐗堬級</label>
                <input class="settings-input" type="password" id="voice-volc-apikey" placeholder="鐣欑┖鍒欎笉淇敼">
              </div>
              <div class="settings-row">
                <label class="settings-label" for="voice-volc-resourceid">Resource ID</label>
                <input class="settings-input" type="text" id="voice-volc-resourceid" placeholder="volc.bigasr.sauc.duration">
              </div>
              <div class="settings-row">
                <label class="settings-label" for="voice-volc-appkey">App Key锛堟棫鐗堬級</label>
                <input class="settings-input" type="password" id="voice-volc-appkey" placeholder="鏃х増鎺у埗鍙板彲濉?>
              </div>
              <div class="settings-row">
                <label class="settings-label" for="voice-volc-accesskey">Access Key锛堟棫鐗堬級</label>
                <input class="settings-input" type="password" id="voice-volc-accesskey" placeholder="鏃х増鎺у埗鍙板彲濉?>
              </div>
            </div>
            <div id="voice-cred-xunfei" style="display:none;">
              <div class="settings-row">
                <label class="settings-label" for="voice-xunfei-appid">AppId</label>
                <input class="settings-input" type="text" id="voice-xunfei-appid" placeholder="璁 AppId">
              </div>
              <div class="settings-row">
                <label class="settings-label" for="voice-xunfei-apikey">ApiKey</label>
                <input class="settings-input" type="password" id="voice-xunfei-apikey" placeholder="鐣欑┖鍒欎笉淇敼">
              </div>
            </div>
          </div>

          <div class="settings-section">
            <div class="settings-section-label">閫氱敤璁剧疆</div>
            <div class="settings-row">
              <label class="settings-label" for="voice-lang-select">璇嗗埆璇█</label>
              <select class="settings-select" id="voice-lang-select">
                <option value="zh-CN">涓枃锛堟櫘閫氳瘽锛?/option>
                <option value="en-US">English (US)</option>
              </select>
            </div>
            <div class="settings-row">
              <label class="settings-label" for="voice-mic-select">楹﹀厠椋?/label>
              <select class="settings-select" id="voice-mic-select">
                <option value="">绯荤粺榛樿楹﹀厠椋?/option>
              </select>
              <button class="settings-save-btn" id="voice-refresh-mics" type="button" style="padding:0 10px;">鍒锋柊</button>
            </div>
            <p class="settings-hint" id="voice-mic-status" style="margin-top:-2px;">鏇存崲楹﹀厠椋庡悗锛岄噸鏂板紑鍚闊冲璇濈敓鏁堛€?/p>
            <div class="settings-row">
              <label class="settings-label" for="voice-auto-send">璇嗗埆鍚庤嚜鍔ㄥ彂閫?/label>
              <input id="voice-auto-send" type="checkbox" checked style="width:auto;flex:none;">
            </div>
            <div class="settings-row">
              <label class="settings-label" for="voice-auto-mic">鍚姩鏃惰嚜鍔ㄥ紑鍚害鍏嬮</label>
              <input id="voice-auto-mic" type="checkbox" style="width:auto;flex:none;">
            </div>
          </div>

          <div class="settings-section">
            <div class="settings-section-label">璇煶鐏垫晱搴?/div>
            <p class="settings-hint">璋冭妭楹﹀厠椋庤Е鍙戦槇鍊笺€傝秺浣庤秺鐏垫晱锛岃秺楂樿秺闇€瑕佸ぇ澹拌璇濄€傞粯璁?0.008銆?/p>
            <div class="settings-row">
              <label class="settings-label" for="settings-voice-threshold">瑙﹀彂闃堝€?/label>
              <input type="range" id="settings-voice-threshold" min="0.002" max="0.04" step="0.001" value="0.008" style="flex:1;cursor:pointer;">
              <span id="settings-voice-threshold-val" style="min-width:3.5em;text-align:right;color:var(--ink2);font-size:13px;">0.008</span>
            </div>
          </div>

          <div class="settings-section" id="settings-tts-section">
            <div class="settings-section-label">璇煶鍚堟垚锛圱TS锛?/div>
            <p class="settings-hint">鐢ㄨ闊冲彂娑堟伅鏃讹紝Agent 鍥炲浼氳嚜鍔ㄨ浆涓鸿闊虫挱鏀俱€傛敮鎸?Edge TTS锛堝厤璐癸級/ 闃块噷浜戯紙鍏嶈垂棰濆害锛? 鑵捐浜戯紙鍏嶈垂棰濆害锛? 璞嗗寘 / MiniMax / OpenAI / ElevenLabs / 鐏北寮曟搸銆傞渶鍏?pip install edge-tts銆?/p>
            <div class="settings-row">
              <label class="settings-label" for="voice-output-select">杈撳嚭璁惧</label>
              <select class="settings-select" id="voice-output-select">
                <option value="">鑷姩锛堣窡闅忕郴缁燂紝閬垮紑铏氭嫙璁惧锛?/option>
              </select>
              <button class="settings-save-btn" id="voice-refresh-outputs" type="button" style="padding:0 10px;">鍒锋柊</button>
            </div>
            <p class="settings-hint" id="voice-output-status" style="margin-top:-2px;">璇煶浠庤繖閲屽彂澹般€傞粯璁よ嚜鍔ㄩ€夋嫨锛涙嫈鑰虫満浼氳嚜鍔ㄥ垏鍥炴壃澹板櫒锛屼笉浼氳涓叉祦/铏氭嫙澹板崱鍗犵敤銆?/p>
            <div class="settings-row">
              <label class="settings-label" for="tts-provider-select">鏈嶅姟鍟?/label>
              <select class="settings-select" id="tts-provider-select">
                <option value="edgetts">馃敟 Edge TTS锛堝井杞紝瀹屽叏鍏嶈垂锛岄渶Python edge-tts锛?/option>
                <option value="aliyun">闃块噷浜戞櫤鑳借闊筹紙姣忔湀100涓囧瓧鍏嶈垂锛?/option>
                <option value="tencent">鑵捐浜戣闊冲悎鎴愶紙姣忔湀100涓囧瓧鍏嶈垂锛?/option>
                <option value="doubao">璞嗗寘锛堟柟鑸燂紝娴佸紡锛屼腑鏂囨渶鑷劧锛?/option>
                <option value="openai">OpenAI TTS锛堟祦寮忥紝$0.015/鍗冨瓧锛?/option>
                <option value="elevenlabs">ElevenLabs锛堟祦寮忥紝楂樿川閲忥級</option>
                <option value="volcano">鐏北寮曟搸锛堜腑鏂囷紝鏈夊厤璐归搴︼級</option>
                <option value="minimax">MiniMax锛堝凡鏈夐厤缃級</option>
              </select>
            </div>
            <div class="settings-row">
              <label class="settings-label" for="tts-voice-select">澹伴煶</label>
              <select class="settings-select" id="tts-voice-select"></select>
            </div>
            <div class="settings-row">
              <label class="settings-label" for="tts-streaming-toggle">娴佸紡鍚堟垚</label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--ink2);">
                <input type="checkbox" id="tts-streaming-toggle" />
                杈瑰悎鎴愯竟鎾斁锛屽洖澶嶆洿蹇嚭澹帮紙榛樿寮€锛?              </label>
            </div>
            <div class="settings-row">
              <label class="settings-label" for="tts-fx-toggle">鏈哄櫒浜洪煶鏁?/label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--ink2);">
                <input type="checkbox" id="tts-fx-toggle" />
                缁欏綋鍓嶅０闊冲彔鍔犳贩鍝?/ 鏈烘璐ㄦ劅锛堥粯璁ゅ叧锛?              </label>
            </div>
            <div id="tts-fx-lock" style="display:none;flex-direction:column;align-items:stretch;gap:6px;padding:8px 0 4px;">
              <p class="settings-hint" style="margin:0;color:#e0a64d;">鏈潵鎰熼煶鏁堥渶瑕佷粯璐癸紝杩欐槸缁存寔杩欎釜椤圭洰鍔ㄥ姏锛岃鑱旂郴浣滆€呯储瑕佸瘑鐮?/p>
              <div style="display:flex;gap:8px;align-items:center;">
                <input class="settings-input" type="text" id="tts-fx-pw" placeholder="杈撳叆瀵嗙爜瑙ｉ攣" style="flex:1;">
                <button class="settings-save-btn" id="tts-fx-unlock" type="button" style="padding:4px 14px;font-size:12px;">瑙ｉ攣</button>
              </div>
              <span id="tts-fx-unlock-msg" style="font-size:11px;color:var(--ink2);"></span>
            </div>
            <div id="tts-fx-sliders" style="display:none;flex-direction:column;gap:7px;padding:8px 0 4px;">
              <div class="tts-fx-srow"><label for="tts-fx-wet">娣峰搷</label><input type="range" id="tts-fx-wet" min="0" max="2" step="0.01"><span id="tts-fx-wet-val"></span></div>
              <div class="tts-fx-srow"><label for="tts-fx-reverbSeconds">娣峰搷闀垮害</label><input type="range" id="tts-fx-reverbSeconds" min="0.2" max="3.5" step="0.1"><span id="tts-fx-reverbSeconds-val"></span></div>
              <div class="tts-fx-srow"><label for="tts-fx-driveMix">澶辩湡 / 閲嶉噺</label><input type="range" id="tts-fx-driveMix" min="0" max="2" step="0.01"><span id="tts-fx-driveMix-val"></span></div>
              <div class="tts-fx-srow"><label for="tts-fx-metallic">閲戝睘鎰?/label><input type="range" id="tts-fx-metallic" min="0" max="2" step="0.01"><span id="tts-fx-metallic-val"></span></div>
              <div class="tts-fx-srow"><label for="tts-fx-ring">鏈哄櫒浜烘劅</label><input type="range" id="tts-fx-ring" min="0" max="2" step="0.01"><span id="tts-fx-ring-val"></span></div>
              <div class="tts-fx-srow"><label for="tts-fx-chorus">鍚堟垚鍘氬害</label><input type="range" id="tts-fx-chorus" min="0" max="2" step="0.01"><span id="tts-fx-chorus-val"></span></div>
              <div class="tts-fx-srow"><label for="tts-fx-metallicFeedback">閲戝睘鍏辨尟</label><input type="range" id="tts-fx-metallicFeedback" min="0" max="0.92" step="0.01"><span id="tts-fx-metallicFeedback-val"></span></div>
              <div class="tts-fx-srow"><label for="tts-fx-metallicDelayMs">閲戝睘闊宠皟</label><input type="range" id="tts-fx-metallicDelayMs" min="2" max="20" step="0.5"><span id="tts-fx-metallicDelayMs-val"></span></div>
              <div class="tts-fx-srow"><label for="tts-fx-ringHz">鏈哄櫒浜洪煶璋?/label><input type="range" id="tts-fx-ringHz" min="30" max="600" step="5"><span id="tts-fx-ringHz-val"></span></div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span class="settings-hint" style="margin:0;">鎷栧姩鍗虫椂鐢熸晥锛屼笅娆℃挱鏀?/ 璇曞惉鍙惉鍒?/span>
                <button class="settings-save-btn" id="tts-fx-reset" type="button" style="padding:3px 10px;font-size:12px;">鎭㈠榛樿</button>
              </div>
            </div>

            
            <!-- Edge TTS creds -->
            <div id="tts-creds-edgetts" style="display:none;">
              <p class="settings-hint" style="color:#4caf50;font-weight:bold;">鉁?Edge TTS 瀹屽叏鍏嶈垂锛岄渶鍏堝畨瑁? pip install edge-tts</p>
              <p class="settings-hint">浣跨敤寰蒋 Edge 娴忚鍣ㄧ殑銆屽ぇ澹版湕璇汇€嶅悓娆剧缁忚闊冲紩鎿庛€傛敮鎸?20+ 涓枃澹伴煶锛堝惈绮よ銆佸彴婀捐厰銆佷笢鍖楄瘽銆佸洓宸濊瘽锛夈€?/p>
              <div class="tts-fx-srow" style="margin-bottom:8px;">
                <label for="tts-edgetts-rate">璇€?/label>
                <input type="range" id="tts-edgetts-rate" min="-50" max="100" step="5" value="0">
                <span id="tts-edgetts-rate-val">0%</span>
              </div>
              <div class="tts-fx-srow" style="margin-bottom:8px;">
                <label for="tts-edgetts-pitch">闊宠皟</label>
                <input type="range" id="tts-edgetts-pitch" min="-50" max="50" step="5" value="0">
                <span id="tts-edgetts-pitch-val">0%</span>
              </div>
            </div>
            <!-- 闃块噷浜戠櫨鐐?creds -->
            <div id="tts-creds-aliyun" style="display:none;">
              <p class="settings-hint" style="color:#4caf50;font-weight:bold;">馃攽 鑷姩澶嶇敤璇煶璇嗗埆锛圓SR锛夌殑 DashScope 瀵嗛挜</p>
              <p class="settings-hint">濡傛灉鏈～鍐欎笅鏂瑰瘑閽ワ紝浼氳嚜鍔ㄤ娇鐢ㄣ€岃闊冲璇濄€嶄腑宸查厤缃殑闃块噷浜?DashScope API Key銆?/p>
              <div class="settings-row">
                <label class="settings-label" for="tts-aliyun-appkey">DashScope API Key锛堥€夊～锛?/label>
                <input class="settings-input" type="password" id="tts-aliyun-appkey" placeholder="鐣欑┖鍒欒嚜鍔ㄥ鐢ˋSR瀵嗛挜锛坰k-寮€澶达級">
              </div>
              <p class="settings-hint">浣跨敤鐧剧偧 qwen3-tts-flash / qwen-tts 妯″瀷銆傛敮鎸?Cherry銆丼tella銆丣ace 绛夐煶鑹层€傚湪<a href="https://dashscope.console.aliyun.com/" target="_blank" style="color:var(--cool)">鐧剧偧鎺у埗鍙?/a>鑾峰彇瀵嗛挜銆?/p>
            </div>
            <!-- 鑵捐浜?creds -->
            <div id="tts-creds-tencent" style="display:none;">
              <div class="settings-row">
                <label class="settings-label" for="tts-tencent-appid">AppId</label>
                <input class="settings-input" type="text" id="tts-tencent-appid" placeholder="鑵捐浜?AppId">
              </div>
              <div class="settings-row">
                <label class="settings-label" for="tts-tencent-secret-id">SecretId</label>
                <input class="settings-input" type="text" id="tts-tencent-secret-id" placeholder="鑵捐浜?API 瀵嗛挜 SecretId">
              </div>
              <div class="settings-row">
                <label class="settings-label" for="tts-tencent-secret-key">SecretKey</label>
                <input class="settings-input" type="password" id="tts-tencent-secret-key" placeholder="鑵捐浜?API 瀵嗛挜 SecretKey">
              </div>
              <p class="settings-hint">鍦?a href="https://console.cloud.tencent.com/cam/capi" target="_blank" style="color:var(--cool)">鑵捐浜?API 瀵嗛挜绠＄悊</a>鑾峰彇銆傛瘡鏈?100 涓囧瓧绗﹀厤璐广€?/p>
            </div>
<div id="tts-creds-doubao" style="display:none;">
              <div class="settings-row">
                <label class="settings-label" for="tts-doubao-key">API Key</label>
                <input class="settings-input" type="password" id="tts-doubao-key" placeholder="鐣欑┖鍒欎笉淇敼">
              </div>
              <div class="settings-row">
                <label class="settings-label" for="tts-doubao-resource">Resource ID</label>
                <input class="settings-input" type="text" id="tts-doubao-resource" placeholder="鑷姩鍖归厤锛屾垨濉?seed-tts-2.0 / seed-tts-1.0">
              </div>
              <div class="settings-row">
                <label class="settings-label" for="tts-doubao-appid">AppId</label>
                <input class="settings-input" type="text" id="tts-doubao-appid" placeholder="鏃х増鎺у埗鍙伴壌鏉冮€夊～">
              </div>
              <div class="settings-row">
                <label class="settings-label" for="tts-doubao-access-key">Access Key</label>
                <input class="settings-input" type="password" id="tts-doubao-access-key" placeholder="鏃х増鎺у埗鍙?Access Token锛岀暀绌哄垯涓嶄慨鏀?>
              </div>
              <div class="settings-row">
                <label class="settings-label" for="tts-doubao-style">鎯呮劅椋庢牸</label>
                <input class="settings-input" type="text" id="tts-doubao-style" placeholder="鍙┖銆備緥锛氱敤浣庢矇娌夌ǔ銆佹儏缁ケ婊″甫閲戝睘鎰熺殑浜哄伐鏅鸿兘绠″澹伴煶">
              </div>
              <div class="tts-fx-srow" style="margin-bottom:8px;">
                <label for="tts-doubao-rate">璇€?/label>
                <input type="range" id="tts-doubao-rate" min="-50" max="100" step="5">
                <span id="tts-doubao-rate-val"></span>
              </div>
              <p class="settings-hint">鍦?a href="https://console.volcengine.com/speech/new/" target="_blank" style="color:var(--cool)">璞嗗寘璇煶鍚堟垚鎺у埗鍙?/a>鑾峰彇 API Key銆?.0 闊宠壊浣跨敤 seed-tts-2.0锛?.0/moon/BV 闊宠壊浣跨敤 seed-tts-1.0 鎴栨帶鍒跺彴瀵瑰簲璧勬簮銆?br>銆屾儏鎰熼鏍笺€嶇敤鑷劧璇█鎻忚堪璇皵锛堣秺鍏蜂綋瓒婂ソ锛岀煭璇嶆棤鏁堬級锛岀暀绌猴紳涓€с€傝璐剧淮鏂劅寤鸿閰嶇敺澹帮紙浜戣垷 zh_male_m191_uranus_bigtts锛夈€?/p>
            </div>

            <div id="tts-creds-minimax" style="display:none;">
              <div class="settings-row">
                <label class="settings-label" for="tts-minimax-key">MiniMax API Key</label>
                <input class="settings-input" type="password" id="tts-minimax-key" placeholder="鐣欑┖鍒欎笉淇敼锛堝彲涓?LLM 鍏辩敤锛?>
              </div>
              <p class="settings-hint">鍙敤澹伴煶锛歮ale-qn-qingse 路 male-qn-jingying 路 female-shaonv 路 female-yujie 路 presenter_female 绛夈€?/p>
            </div>

            <div id="tts-creds-openai">
              <div class="settings-row">
                <label class="settings-label" for="tts-openai-key">OpenAI API Key</label>
                <input class="settings-input" type="password" id="tts-openai-key" placeholder="鐣欑┖鍒欎笉淇敼锛堝彲涓?LLM 鍏辩敤锛?>
              </div>
              <div class="settings-row">
                <label class="settings-label" for="tts-openai-baseurl">Base URL锛堥€夊～锛?/label>
                <input class="settings-input" type="text" id="tts-openai-baseurl" placeholder="鑷畾涔夌鐐癸紝濡?https://api.deepseek.com">
              </div>
              <p class="settings-hint">鍙敤澹伴煶锛歯ova 路 shimmer 路 alloy 路 echo 路 fable 路 onyx</p>
            </div>

            <div id="tts-creds-elevenlabs" style="display:none;">
              <div class="settings-row">
                <label class="settings-label" for="tts-elevenlabs-key">ElevenLabs API Key</label>
                <input class="settings-input" type="password" id="tts-elevenlabs-key" placeholder="鐣欑┖鍒欎笉淇敼">
              </div>
              <p class="settings-hint">鍏嶈垂濂楅姣忔湀 10,000 瀛楃銆傚０闊?ID 鍦?ElevenLabs 鎺у埗鍙拌幏鍙栥€?/p>
            </div>

            <div id="tts-creds-volcano" style="display:none;">
              <div class="settings-row">
                <label class="settings-label" for="tts-volcano-appid">AppId</label>
                <input class="settings-input" type="text" id="tts-volcano-appid" placeholder="鐏北寮曟搸 TTS AppId">
              </div>
              <div class="settings-row">
                <label class="settings-label" for="tts-volcano-token">Access Token</label>
                <input class="settings-input" type="password" id="tts-volcano-token" placeholder="鐣欑┖鍒欎笉淇敼">
              </div>
              <p class="settings-hint">鍙敤澹伴煶锛欱V001_streaming锛堥€氱敤濂冲０锛壜?BV002_streaming锛堥€氱敤鐢峰０锛夌瓑锛屽湪鐏北寮曟搸鎺у埗鍙版煡鐪嬪叏閮ㄣ€?/p>
            </div>

            <div class="settings-row" style="margin-top:8px;">
              <button class="settings-save-btn" id="tts-test-btn" type="button" style="padding:4px 12px;font-size:12px;">璇曞惉</button>
              <span id="tts-test-status" style="color:var(--ink2);font-size:12px;margin-left:8px;"></span>
            </div>
          </div>

          <div class="settings-section settings-section-action">
            <button class="settings-save-btn" id="settings-save-voice" type="button">淇濆瓨</button>
            <span class="settings-feedback" id="settings-voice-feedback"></span>
          </div>
        </div>

        <!-- 鈹€鈹€ 涓婄綉鎼滅储 tab 鈹€鈹€ -->
        <div class="settings-tab" data-tab="web-search">
          <div class="settings-section">
            <div class="settings-section-label">鎼滅储寮曟搸</div>
            <p class="settings-hint">Agent 璋冪敤 web_search 鏃跺垎涓ゆ闃燂細绗竴姊槦锛堝甫 key 鐨?API锛歋erper 鈫?Brave 鈫?Tavily 鈫?SearXNG锛夋寜浼樺厛绾у皾璇曪紱閮芥病缁撴灉鏃讹紝绗簩姊槦锛圔ing / Jina / DuckDuckGo锛屾棤闇€閰嶇疆锛夊苟琛屽厹搴曘€傞厤浠绘剰涓€涓?key 閮借兘鏄捐憲鎻愬崌璐ㄩ噺鍜岀ǔ瀹氭€э紝澶氶厤鍑犱釜鍙伩鍏嶅崟涓€棰濆害鐢ㄥ敖鏃舵悳绱㈠け璐ャ€?/p>

            <div class="settings-row">
              <label class="settings-label" for="websearch-serper-key">Serper API Key</label>
              <input class="settings-input" type="password" id="websearch-serper-key" placeholder="鐣欑┖鍒欎笉淇敼">
            </div>
            <p class="settings-hint">鍦?<a href="https://serper.dev" target="_blank" style="color:var(--cool)">serper.dev</a> 娉ㄥ唽鍚庤幏鍙栵紙姣忔湀 2500 娆″厤璐癸級銆侴oogle SERP JSON 鎺ュ彛锛屾渶绋冲畾銆?/p>

            <div class="settings-row">
              <label class="settings-label" for="websearch-brave-key">Brave API Key</label>
              <input class="settings-input" type="password" id="websearch-brave-key" placeholder="鐣欑┖鍒欎笉淇敼">
            </div>
            <p class="settings-hint">鍦?<a href="https://brave.com/search/api" target="_blank" style="color:var(--cool)">brave.com/search/api</a> 鑾峰彇锛堟瘡鏈?2000 娆″厤璐癸級銆傜嫭绔嬬储寮曪紝Serper 鐨勫彲闈犲厹搴曘€?/p>

            <div class="settings-row">
              <label class="settings-label" for="websearch-tavily-key">Tavily API Key</label>
              <input class="settings-input" type="password" id="websearch-tavily-key" placeholder="鐣欑┖鍒欎笉淇敼">
            </div>
            <p class="settings-hint">鍦?<a href="https://tavily.com" target="_blank" style="color:var(--cool)">tavily.com</a> 鑾峰彇锛堟瘡鏈?1000 娆″厤璐癸級銆傞潰鍚?LLM 鐨勬悳绱㈡帴鍙ｃ€?/p>

            <div class="settings-row">
              <label class="settings-label" for="websearch-jina-key">Jina API Key</label>
              <input class="settings-input" type="password" id="websearch-jina-key" placeholder="鐣欑┖鍒欎笉淇敼">
            </div>
            <p class="settings-hint">鍦?<a href="https://jina.ai" target="_blank" style="color:var(--cool)">jina.ai</a> 鑾峰彇锛堟湁鍏嶈垂棰濆害锛夈€俿.jina.ai 鎼滅储鎺ュ彛锛岀浜屾闃熷厹搴曚箣涓€銆?/p>

            <div class="settings-row">
              <label class="settings-label" for="websearch-searxng-url">SearXNG URL</label>
              <input class="settings-input" type="text" id="websearch-searxng-url" placeholder="https://your-searxng-instance.com">
            </div>
            <p class="settings-hint">閫夊～銆傝嚜鎵樼 SearXNG 瀹炰緥鍦板潃锛堝幓闅愮鐨勫厓鎼滅储寮曟搸锛夈€傝甯?http:// 鎴?https://銆?/p>
          </div>

          <div class="settings-section">
            <div class="settings-section-label">褰撳墠鐘舵€?/div>
            <div class="settings-config-row">
              <span class="settings-config-type">Serper</span>
              <span class="settings-config-info" id="websearch-status-serper">鈥?/span>
            </div>
            <div class="settings-config-row">
              <span class="settings-config-type">Brave</span>
              <span class="settings-config-info" id="websearch-status-brave">鈥?/span>
            </div>
            <div class="settings-config-row">
              <span class="settings-config-type">Tavily</span>
              <span class="settings-config-info" id="websearch-status-tavily">鈥?/span>
            </div>
            <div class="settings-config-row">
              <span class="settings-config-type">Jina</span>
              <span class="settings-config-info" id="websearch-status-jina">鈥?/span>
            </div>
            <div class="settings-config-row">
              <span class="settings-config-type">SearXNG</span>
              <span class="settings-config-info" id="websearch-status-searxng">鈥?/span>
            </div>
          </div>

          <div class="settings-section settings-section-action">
            <button class="settings-save-btn" id="settings-save-web-search" type="button">淇濆瓨</button>
            <span class="settings-feedback" id="settings-web-search-feedback"></span>
          </div>
        </div>

        <!-- 鈹€鈹€ 瀹夊叏娌欑 tab 鈹€鈹€ -->
        <div class="settings-tab" data-tab="security">
          <div class="settings-section">
            <div class="settings-section-label">鏂囦欢娌欑</div>
            <p class="settings-hint">寮€鍚悗鏂囦欢璇诲啓鍙厑璁稿湪 sandbox/ 鐩綍鍐呫€傚叧闂悗 Agent 鍙搷浣滅郴缁熶换鎰忎綅缃殑鏂囦欢锛岃璋ㄦ厧浣跨敤銆?/p>
            <div class="settings-row">
              <label class="settings-label" for="security-file-sandbox">鍚敤鏂囦欢娌欑</label>
              <label class="settings-toggle">
                <input type="checkbox" id="security-file-sandbox" checked>
                <span class="settings-toggle-track"></span>
              </label>
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">鍛戒护鎵ц娌欑</div>
            <p class="settings-hint">寮€鍚悗 exec_command 宸ヤ綔鐩綍閿佸畾鍦?sandbox/锛屼笖绂佹浣跨敤缁濆璺緞鍜岀埗鐩綍寮曠敤銆傚叧闂悗鍛戒护鍙闂郴缁熶换鎰忕洰褰曘€?/p>
            <div class="settings-row">
              <label class="settings-label" for="security-exec-sandbox">鍚敤鎵ц娌欑</label>
              <label class="settings-toggle">
                <input type="checkbox" id="security-exec-sandbox" checked>
                <span class="settings-toggle-track"></span>
              </label>
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">灞€鍩熺綉璁块棶</div>
            <p class="settings-hint">鍏佽鍚屼竴灞€鍩熺綉鍐呯殑璁惧璁块棶鏈満鐧介緳椹?API锛岀敤浜庡鍙扮櫧榫欓┈浜掔浉閫氫俊銆傚紑鍚垨鍏抽棴鍚庨渶瑕侀噸鍚簲鐢ㄧ敓鏁堛€?/p>
            <div class="settings-row">
              <label class="settings-label" for="security-lan-access">鍏佽灞€鍩熺綉璁块棶</label>
              <label class="settings-toggle">
                <input type="checkbox" id="security-lan-access">
                <span class="settings-toggle-track"></span>
              </label>
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">宸ュ叿榛戝悕鍗?/div>
            <p class="settings-hint">鍕鹃€夊悗璇ュ伐鍏峰皢琚嫆缁濇墽琛岋紝瀵硅瘽涓?Agent 璋冪敤鏃朵細鏀跺埌"宸茶瀹夊叏绛栫暐绂佺敤"閿欒銆?/p>
            <div class="settings-row"><label class="settings-label"><input type="checkbox" class="security-blocked-tool" value="exec_command"> exec_command &nbsp;<span style="color:var(--ink2);font-size:12px;">锛堟墽琛?shell 鍛戒护锛?/span></label></div>
            <div class="settings-row"><label class="settings-label"><input type="checkbox" class="security-blocked-tool" value="browser_read"> browser_read &nbsp;<span style="color:var(--ink2);font-size:12px;">锛堟祻瑙堝櫒娓叉煋璁块棶锛?/span></label></div>
            <div class="settings-row"><label class="settings-label"><input type="checkbox" class="security-blocked-tool" value="fetch_url"> fetch_url &nbsp;<span style="color:var(--ink2);font-size:12px;">锛圚TTP 璇锋眰锛?/span></label></div>
            <div class="settings-row"><label class="settings-label"><input type="checkbox" class="security-blocked-tool" value="web_search"> web_search &nbsp;<span style="color:var(--ink2);font-size:12px;">锛堢綉椤垫悳绱級</span></label></div>
            <div class="settings-row"><label class="settings-label"><input type="checkbox" class="security-blocked-tool" value="ui_show"> ui_show &nbsp;<span style="color:var(--ink2);font-size:12px;">锛堟帹閫?UI 鍗＄墖 / 鍔ㄦ€佷唬鐮佹敞鍏ワ級</span></label></div>
            <div class="settings-row"><label class="settings-label"><input type="checkbox" class="security-blocked-tool" value="ui_register"> ui_register &nbsp;<span style="color:var(--ink2);font-size:12px;">锛堟敞鍐屾柊 UI 缁勪欢锛?/span></label></div>
          </div>
          <div class="settings-section settings-section-action">
            <button class="settings-save-btn" id="settings-save-security" type="button">淇濆瓨</button>
            <button class="settings-save-btn hidden" id="settings-restart-security" type="button" style="width:auto;padding:0 14px;">绔嬪嵆閲嶅惎</button>
            <span class="settings-feedback" id="settings-security-feedback"></span>
          </div>
        </div>

        <!-- 鈹€鈹€ 鏇存柊 tab 鈹€鈹€ -->
        <div class="settings-tab" data-tab="update">
          <div class="settings-section">
            <div class="settings-section-label">鐗堟湰淇℃伅</div>
            <div class="settings-config-row">
              <span class="settings-config-type">褰撳墠鐗堟湰</span>
              <span class="settings-config-info" id="settings-current-version">鈥?/span>
            </div>
            <div class="settings-config-row">
              <span class="settings-config-type">鐘舵€?/span>
              <span class="settings-config-info" id="settings-update-status">鏈鏌?/span>
            </div>
            <div class="settings-row-action" style="margin-top:12px;gap:8px;flex-wrap:wrap;">
              <button class="settings-save-btn" id="settings-check-update-btn" type="button" style="width:auto;padding:0 14px;">妫€鏌ユ洿鏂?/button>
              <button class="settings-save-btn hidden" id="settings-download-update-btn" type="button" style="width:auto;padding:0 14px;">绔嬪嵆涓嬭浇</button>
              <button class="settings-save-btn hidden" id="settings-install-update-btn" type="button" style="width:auto;padding:0 14px;">绔嬪嵆閲嶅惎瀹夎</button>
              <button class="settings-save-btn hidden" id="settings-ignore-update-btn" type="button" style="width:auto;padding:0 14px;background:transparent;border:1px solid var(--line);color:var(--ink2);">蹇界暐姝ょ増鏈?/button>
              <span class="settings-feedback" id="settings-update-feedback"></span>
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">閫氱煡鍋忓ソ</div>
            <div class="settings-row">
              <label class="settings-label" for="settings-suppress-updates">涓嶅啀鎻愰啋鏇存柊</label>
              <label class="settings-toggle">
                <input type="checkbox" id="settings-suppress-updates">
                <span class="settings-toggle-track"></span>
              </label>
            </div>
            <p class="settings-hint">寮€鍚悗鍙戠幇鏂扮増鏈椂涓嶄細寮瑰嚭鎻愮ず鍗＄墖锛屼粛鍙湪姝ゅ鎵嬪姩妫€鏌ャ€?/p>
          </div>
          <div class="settings-section" id="settings-ignored-section" style="display:none;">
            <div class="settings-section-label">宸插拷鐣ョ殑鐗堟湰</div>
            <div class="settings-row">
              <span class="settings-config-info" id="settings-ignored-version-val">鈥?/span>
              <button class="settings-save-btn" id="settings-clear-ignored-btn" type="button" style="width:auto;padding:0 12px;margin-left:auto;">娓呴櫎蹇界暐</button>
            </div>
          </div>
        </div>

      </div><!-- /settings-content -->
    </div><!-- /settings-body -->
  </div>
</div>
`;

const createVoicePanel = () => `
<div class="voice-panel" id="voice-panel">
  <canvas id="voice-canvas" width="160" height="160"></canvas>
  <div class="voice-transcript" id="voice-transcript"></div>
</div>
`;

const createVideoPanel = () => `
<div class="video-panel" id="video-panel">
  <div class="media-stage-head">
    <div class="media-stage-title" id="video-title">瑙嗛</div>
    <button class="video-exit-btn" id="video-exit-btn" type="button" title="鍏抽棴瑙嗛">x</button>
  </div>
  <div class="video-surface" id="video-surface">
    <div class="video-backdrop" id="video-backdrop"></div>
    <video id="video-feed" playsinline controls></video>
    <iframe id="video-frame" title="瑙嗛鎾斁鍣? allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen hidden></iframe>
    <div class="video-empty" id="video-empty">鏃犺棰戞簮</div>
  </div>
</div>
`;

const createAIVideoPanel = () => `
<div class="aivideo-panel" id="aivideo-panel">
  <div class="media-stage-head">
    <div class="media-stage-title">AI 瑙嗛鐢熸垚</div>
    <div class="aivideo-head-spacer"></div>
    <button class="aivideo-new-btn" id="aivideo-new-btn" type="button" title="娓呯┖杈撳叆">+ 鏂拌棰?/button>
    <button class="aivideo-exit-btn" id="aivideo-exit-btn" type="button" title="鍏抽棴 (Esc)">脳</button>
  </div>

  <!-- 鍖? 鐢熸垚鏍?-->
  <div class="aivideo-queue-wrap">
    <div class="aivideo-queue-cap">鐢熸垚鏍?路 QUEUE</div>
    <div class="aivideo-queue" id="aivideo-queue"></div>
  </div>

  <!-- 鍖? 鎾斁鍖?-->
  <div class="aivideo-player">
    <div class="aivideo-stage is-empty" id="aivideo-stage">
      <video id="aivideo-feed" class="aivideo-feed" playsinline controls hidden></video>
      <button class="aivideo-dl" id="aivideo-dl" type="button" hidden>鈫?涓嬭浇</button>
      <div class="aivideo-stage-empty" id="aivideo-stage-empty">
        <svg class="aivideo-empty-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <rect x="6" y="9" width="36" height="30" rx="4" stroke="currentColor" stroke-width="2"/>
          <circle cx="16.5" cy="19" r="3.5" stroke="currentColor" stroke-width="2"/>
          <path d="M9 33l9-9 7 7 6-5 8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div class="aivideo-empty-text">鏆傛棤璧勬簮</div>
        <div class="aivideo-empty-sub">鍦ㄤ笅鏂硅緭鍏ユ彁绀鸿瘝鎴栧姞鍥撅紝鐐光€滅敓鎴愨€?/div>
      </div>
    </div>
    <div class="aivideo-player-meta" id="aivideo-player-meta"></div>
  </div>

  <!-- 鍖? 杈撳叆鍖?-->
  <div class="aivideo-composer">
    <div class="aivideo-dropzone" id="aivideo-dropzone"></div>
    <div class="aivideo-modebar">
      <span class="aivideo-modetag" id="aivideo-modetag">鏂囩敓瑙嗛</span>
      <span class="aivideo-modehint" id="aivideo-modehint">涓嶅姞鍥?= 鏂囩敓瑙嗛 路 1 寮?= 鍥剧敓瑙嗛 路 2 寮?= 棣栧熬甯?/span>
    </div>
    <textarea id="aivideo-prompt-input" class="aivideo-prompt-input" rows="1"
      placeholder="鎻忚堪浣犳兂瑕佺殑鐢婚潰銆佸姩浣溿€侀暅澶磋繍鍔ㄣ€佸厜绾裤€侀鏍尖€︼紙Ctrl+Enter 鐢熸垚锛?></textarea>
    <div class="aivideo-controls">
      <select id="aivideo-ratio" title="鐢婚潰姣斾緥">
        <option value="adaptive">閫傞厤鍥剧墖</option>
        <option value="16:9" selected>16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option>
        <option value="4:3">4:3</option><option value="3:4">3:4</option><option value="21:9">21:9</option>
      </select>
      <select id="aivideo-resolution" title="鍒嗚鲸鐜?>
        <option value="480p">480p</option><option value="720p" selected>720p</option><option value="1080p">1080p</option>
      </select>
      <select id="aivideo-duration" title="鏃堕暱锛堢锛?>
        <option value="5" selected>5s</option><option value="10">10s</option><option value="15">15s</option>
      </select>
      <button type="button" class="aivideo-submit" id="aivideo-submit">鐢熸垚</button>
    </div>
    <div class="aivideo-compose-err" id="aivideo-compose-err" hidden></div>
  </div>

  <input type="file" id="aivideo-file-input" accept="image/*" hidden>
</div>
`;

const createMusicPanel = () => `
<div class="music-panel" id="music-panel">
  <div class="media-stage-head">
    <div class="media-stage-title" id="music-panel-title">闊充箰</div>
    <button class="music-exit-btn" id="music-exit-btn" type="button" title="閫€鍑洪煶涔愭ā寮?>脳</button>
  </div>
  <div class="music-stage">
    <div class="music-turntable">
      <div class="music-vinyl" id="music-vinyl">
        <div class="music-groove music-groove-1"></div>
        <div class="music-groove music-groove-2"></div>
        <div class="music-groove music-groove-3"></div>
        <div class="music-groove music-groove-4"></div>
        <div class="music-cover" id="music-cover">
          <div class="music-cover-title" id="music-cover-title">鈾?/div>
          <div class="music-cover-artist" id="music-cover-artist"></div>
        </div>
        <div class="music-spindle"></div>
      </div>
      <div class="music-tonearm-group" id="music-tonearm-group">
        <div class="music-tonearm-pivot"></div>
        <div class="music-arm-shaft"></div>
        <div class="music-headshell">
          <div class="music-stylus"></div>
        </div>
      </div>
    </div>
    <div class="music-lyrics-pane" id="music-lyrics-pane">
      <div class="music-lyrics-scroll" id="music-lyrics-scroll"></div>
      <div class="music-no-lyrics" id="music-no-lyrics" hidden>鈥?鏃犳瓕璇?鈥?/div>
    </div>
  </div>
  <div class="music-footer">
    <div class="music-meta">
      <div class="music-meta-title" id="music-meta-title">鈥?/div>
      <div class="music-meta-artist" id="music-meta-artist">鈥?/div>
    </div>
    <div class="music-progress-row">
      <span class="music-time" id="music-time-cur">0:00</span>
      <input class="music-seek" id="music-seek" type="range" min="0" max="100" step="0.1" value="0">
      <span class="music-time" id="music-time-total">0:00</span>
    </div>
    <div class="music-controls-row">
      <button class="music-ctrl" id="music-prev" type="button" title="涓婁竴棣?>鈴?/button>
      <button class="music-ctrl music-ctrl-play" id="music-play" type="button" title="鎾斁/鏆傚仠">鈻?/button>
      <button class="music-ctrl" id="music-next" type="button" title="涓嬩竴棣?>鈴?/button>
      <input class="music-vol" id="music-vol" type="range" min="0" max="1" step="0.01" value="0.8" title="闊抽噺">
    </div>
  </div>
  <audio id="music-audio" preload="auto"></audio>
</div>
`;

const createImagePanel = () => `
<div class="image-panel" id="image-panel">
  <div class="media-stage-head">
    <div class="media-stage-title" id="image-title">鍥剧墖</div>
    <button class="image-exit-btn" id="image-exit-btn" type="button" title="鍏抽棴鍥剧墖">x</button>
  </div>
  <div class="image-surface" id="image-surface">
    <img id="image-display" alt="" />
    <div class="image-empty" id="image-empty">鏃犲浘鐗囨簮</div>
  </div>
</div>
`;

const createPanelTabs = () => `
<button id="panel-l1-tab" class="panel-tab panel-tab-left" aria-label="鍒囨崲宸﹂潰鏉? title="鍒囨崲宸﹂潰鏉?[ "></button>
<button id="panel-l2-tab" class="panel-tab panel-tab-right" aria-label="鍒囨崲鍙抽潰鏉? title="鍒囨崲鍙抽潰鏉?] "></button>
`;

export function createBrainUiMarkup() {
  return [
    createGraphStage(),
    createPrimaryPanel(),
    createSecondaryPanel(),
    createConsole(),
    createTooltip(),
    createSettingsModal(),
    createVideoPanel(),
    createAIVideoPanel(),
    createMusicPanel(),
    createImagePanel(),
    createHotspotPanel(),
    createWorldcupPanel(),
    createPersonCardPanel(),
    createDocPanel(),
    createPanelTabs(),
  ].join("\n\n");
}

export function renderBrainUiApp(root = document.body) {
  root.dataset.theme = "midnight";
  root.innerHTML = createBrainUiMarkup();
}
        

