function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/`/g, "&#96;");
}

function safeHref(rawUrl) {
  const url = String(rawUrl ?? "").trim();
  if (!url) return "";
  if (/^(https?:|mailto:)/i.test(url)) return url;
  if (url.startsWith("/") || url.startsWith("#")) return url;
  return "";
}

// 图片 src 白名单：http(s)、data:image、以及站内绝对路径（如内容寻址的 /media/chat/...）。
// 比 safeHref 多放行 data:image、少放行 mailto/#，避免把不可渲染的目标塞进 <img src>。
function safeImageSrc(rawUrl) {
  const url = String(rawUrl ?? "").trim();
  if (!url) return "";
  if (/^https?:/i.test(url)) return url;
  if (/^data:image\//i.test(url)) return url;
  if (url.startsWith("/")) return url;
  return "";
}

function renderInlineMarkdown(text) {
  const codeTokens = [];
  let html = String(text ?? "").replace(/`([^`]+)`/g, (_, code) => {
    const token = `%%CODETOKEN${codeTokens.length}%%`;
    codeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  html = escapeHtml(html);
  // 图片 ![alt](src) 必须在链接规则之前处理，否则链接规则会先吃掉 [alt](src) 而漏掉前导的 "!"。
  // 渲染成可点开原图的缩略图（外层 <a> 在新标签打开，src 不安全时退化为 alt 文本）。
  html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt, src) => {
    const safeUrl = safeImageSrc(src);
    if (!safeUrl) return alt;
    const altAttr = escapeAttr(alt);
    return `<a href="${escapeAttr(safeUrl)}" target="_blank" rel="noopener noreferrer" class="msg-image-link">` +
      `<img src="${escapeAttr(safeUrl)}" alt="${altAttr}" title="${altAttr}" class="msg-image" loading="lazy"></a>`;
  });
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label, href) => {
    const safeUrl = safeHref(href);
    if (!safeUrl) return label;
    return `<a href="${escapeAttr(safeUrl)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  html = html.replace(/(\*\*|__)(.+?)\1/g, "<strong>$2</strong>");
  html = html.replace(/(\*|_)(.+?)\1/g, "<em>$2</em>");

  codeTokens.forEach((token, index) => {
    html = html.replaceAll(`%%CODETOKEN${index}%%`, token);
  });

  return html;
}

export function renderMarkdown(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const parts = [];
  let paragraph = [];
  let listType = null;
  let listItems = [];
  let quoteLines = [];
  let codeFence = null;
  let codeLines = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    parts.push(`<p>${paragraph.map(renderInlineMarkdown).join("<br>")}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!listType || !listItems.length) return;
    const tag = listType === "ol" ? "ol" : "ul";
    parts.push(`<${tag}>${listItems.map(item => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</${tag}>`);
    listType = null;
    listItems = [];
  }

  function flushQuote() {
    if (!quoteLines.length) return;
    parts.push(`<blockquote>${quoteLines.map(line => renderInlineMarkdown(line)).join("<br>")}</blockquote>`);
    quoteLines = [];
  }

  function isDiffCode(lang, lines) {
    if (lang === 'diff') return true;
    // 启发式检测：超过 30% 的行以 +- 或 @@ 开头
    let diffCount = 0;
    const total = Math.min(lines.length, 50);
    for (let i = 0; i < total; i++) {
      const t = lines[i].trim();
      if (t.startsWith('+') || t.startsWith('-') || t.startsWith('@@') || t.startsWith('diff ')) diffCount++;
    }
    return diffCount > 0 && diffCount / total >= 0.30;
  }

  function renderDiffBlock(lines) {
    const diffLines = [];
    let added = 0, removed = 0;
    for (const line of lines) {
      const t = line.trimEnd();
      if (!t) { diffLines.push({ type: 'context', text: ' ' }); continue; }
      const ch = t[0];
      if (ch === '+') { diffLines.push({ type: 'add', text: escapeHtml(t) }); added++; }
      else if (ch === '-') { diffLines.push({ type: 'del', text: escapeHtml(t) }); removed++; }
      else if (t.startsWith('@@')) { diffLines.push({ type: 'hunk', text: escapeHtml(t) }); }
      else if (t.startsWith('diff ')) { diffLines.push({ type: 'hdr', text: escapeHtml(t) }); }
      else { diffLines.push({ type: 'context', text: escapeHtml(t) }); }
    }

    const collapsed = diffLines.length > 20;
    const stats = `+${added} −${removed}`;
    let html = '<div class="diff-view">';

    if (collapsed) {
      html += '<div class="diff-collapse-bar">';
      html += '<span class="diff-stats">' + escapeHtml(stats) + ' 行</span>';
      html += '<button class="diff-expand-btn" onclick="this.closest(\'.diff-view\').classList.toggle(\'expanded\');this.textContent=this.closest(\'.diff-view\').classList.contains(\'expanded\')?\'收起\':\'展开\';return false">展开 ' + diffLines.length + ' 行</button>';
      html += '</div>';
    }

    html += '<div class="diff-lines' + (collapsed ? ' diff-collapsed' : '') + '">';
    html += '<pre><code class="diff-code">';
    for (const dl of diffLines) {
      const cls = dl.type === 'add' ? 'diff-add' : dl.type === 'del' ? 'diff-del' : dl.type === 'hunk' ? 'diff-hunk' : dl.type === 'hdr' ? 'diff-header' : 'diff-ctx';
      html += '<span class="' + cls + '">' + dl.text + '</span>\n';
    }
    html += '</code></pre></div>';
    html += '</div>';
    return html;
  }

  function flushCode() {
    if (codeFence === null) return;
    if (isDiffCode(codeFence, codeLines)) {
      parts.push(renderDiffBlock(codeLines));
    } else {
      const langClass = codeFence ? ` class="language-${escapeAttr(codeFence)}"` : "";
      parts.push(`<pre><code${langClass}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    }
    codeFence = null;
    codeLines = [];
  }

  for (const line of lines) {
    const fenceMatch = line.match(/^```([\w-]+)?\s*$/);
    if (fenceMatch) {
      flushParagraph();
      flushList();
      flushQuote();
      if (codeFence !== null) flushCode();
      else codeFence = fenceMatch[1] || "";
      continue;
    }

    if (codeFence !== null) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      flushQuote();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      flushQuote();
      const level = headingMatch[1].length;
      parts.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      quoteLines.push(quoteMatch[1]);
      continue;
    }
    flushQuote();

    const ulMatch = line.match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      flushParagraph();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(ulMatch[1]);
      continue;
    }

    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      flushParagraph();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(olMatch[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  flushQuote();
  flushCode();

  return parts.join("");
}

export function createMarkdownBody(text) {
  const body = document.createElement("div");
  body.className = "msg-body";
  body.innerHTML = renderMarkdown(text);

  // 视频链接 → 内联 video 元素（/media/chat/*.mp4/.webm/.mov 等）
  const links = body.querySelectorAll('a[href]');
  for (const a of links) {
    const href = a.getAttribute('href');
    if (/\.(mp4|webm|mov|avi)(\?|$)/i.test(href)) {
      const video = document.createElement('video');
      video.src = href;
      video.controls = true;
      video.preload = 'metadata';
      video.className = 'msg-video';
      video.style.maxWidth = 'min(400px, 100%)';
      video.style.maxHeight = '360px';
      video.style.borderRadius = '10px';
      a.replaceWith(video);
    }
  }

  return body;
}

