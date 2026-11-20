#!/usr/bin/env node
/**
 * 把 PRIVACY.md / EULA.md 生成为可公开托管的静态 HTML（deploy/git-repo-manager/）。
 *
 * 特性：
 * - 零依赖：仅支持文档实际用到的 Markdown 子集（标题 / 段落 / 有序无序列表 / 嵌套列表 / 引用块 / 粗体 / 行内代码 / 链接）
 * - 幂等：不使用时间戳，重复执行输出一致
 *
 * 用法：node scripts/build-legal-site.js  或  npm run build:legal
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'deploy', 'git-repo-manager')

const DOCS = [
  {
    src: 'PRIVACY.md',
    file: 'privacy.html',
    title: 'Git Repo Manager 隐私政策',
    description: 'Git Repo Manager 隐私政策：纯客户端桌面工具，不收集、不上传用户数据。'
  },
  {
    src: 'EULA.md',
    file: 'eula.html',
    title: 'Git Repo Manager 最终用户许可协议',
    description: 'Git Repo Manager 最终用户许可协议：安装与使用本软件所适用的许可条款。'
  }
]

const PAGE_CSS = `
  :root {
    --fg: #1f2328;
    --muted: #59636e;
    --line: #d1d9e0;
    --link: #0969da;
    --accent: #1f883d;
    --bg: #f6f8fa;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 32px 16px 64px;
    background: var(--bg);
    color: var(--fg);
    font: 15px/1.75 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main {
    max-width: 820px;
    margin: 0 auto;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 40px 44px 48px;
    box-shadow: 0 1px 3px rgba(31, 35, 40, .04);
  }
  h1 {
    margin: 0 0 20px;
    font-size: 26px;
    line-height: 1.3;
    letter-spacing: .2px;
  }
  .meta {
    margin: 0 0 28px;
    padding: 14px 18px;
    background: var(--bg);
    border-left: 4px solid var(--accent);
    border-radius: 6px;
    color: var(--muted);
    font-size: 14px;
    line-height: 1.9;
  }
  h2 {
    margin: 36px 0 14px;
    padding-bottom: 8px;
    font-size: 18px;
    line-height: 1.4;
    border-bottom: 1px solid var(--line);
  }
  p { margin: 0 0 14px; }
  ol, ul { margin: 0 0 16px; padding-left: 24px; }
  li { margin: 6px 0; }
  li > ul, li > ol { margin: 6px 0; }
  code {
    padding: 2px 6px;
    background: #eff1f3;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
    font-size: 13px;
  }
  a { color: var(--link); text-decoration: none; }
  a:hover { text-decoration: underline; }
  nav.top {
    max-width: 820px;
    margin: 0 auto 14px;
    font-size: 14px;
    color: var(--muted);
  }
  nav.top a { margin-right: 16px; }
  footer {
    max-width: 820px;
    margin: 22px auto 0;
    text-align: center;
    color: var(--muted);
    font-size: 13px;
  }
  @media (max-width: 640px) {
    body { padding: 16px 10px 40px; }
    main { padding: 26px 20px 32px; border-radius: 10px; }
    h1 { font-size: 22px; }
    h2 { font-size: 17px; }
  }
`

function escapeHtml (s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// 中文换行直接拼接，西文之间补空格
function joinText (a, b) {
  if (!a) return b
  if (!b) return a
  const asciiEnd = /[A-Za-z0-9,.;:!?)\]}]$/.test(a)
  const asciiStart = /^[A-Za-z0-9([{<`"']/.test(b)
  return asciiEnd || asciiStart ? a + ' ' + b : a + b
}

function inline (text) {
  let s = escapeHtml(text)
  const codes = []
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c)
    return `\u0000C${codes.length - 1}\u0000`
  })
  const links = []
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
    links.push([t, u])
    return `\u0000L${links.length - 1}\u0000`
  })
  s = s.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, m => `<a href="mailto:${m}">${m}</a>`)
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/\u0000L(\d+)\u0000/g, (_, n) => `<a href="${links[n][1]}">${links[n][0]}</a>`)
  s = s.replace(/\u0000C(\d+)\u0000/g, (_, n) => `<code>${codes[n]}</code>`)
  return s
}

const LIST_RE = /^(\s*)([-*]|\d+\.)\s+(.*)$/
const BLOCK_START_RE = /^(#{2,3}\s|>\s?|\s*([-*]|\d+\.)\s+)/

function parseList (lines, start) {
  const first = lines[start].match(LIST_RE)
  const baseIndent = first[1].length
  const ordered = /^\d+\./.test(first[2])
  const items = []
  let i = start

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) break

    const m = line.match(LIST_RE)
    if (m) {
      const indent = m[1].length
      if (indent < baseIndent) break
      if (indent >= baseIndent + 2 && items.length) {
        const sub = parseList(lines, i)
        items[items.length - 1].push({ type: 'list', html: sub.html })
        i = sub.next
        continue
      }
      items.push([{ type: 'text', value: m[3] }])
      i++
      continue
    }

    // 列表项的续行（缩进或无标记的懒续行）
    if (items.length) {
      const parts = items[items.length - 1]
      const tail = parts[parts.length - 1]
      if (tail.type === 'text') tail.value = joinText(tail.value, line.trim())
      else parts.push({ type: 'text', value: line.trim() })
      i++
      continue
    }
    break
  }

  const tag = ordered ? 'ol' : 'ul'
  const html = `<${tag}>\n` + items
    .map(parts => '    <li>' + parts
      .map(p => (p.type === 'text' ? inline(p.value) : p.html))
      .join('\n      ') + '</li>')
    .join('\n') + `\n  </${tag}>`

  return { html, next: i }
}

function parseMarkdown (md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  let i = 0
  let title = ''
  let meta = ''

  while (i < lines.length && !lines[i].trim()) i++
  if (/^#\s+/.test(lines[i] || '')) {
    title = lines[i].replace(/^#\s+/, '').trim()
    i++
  }

  while (i < lines.length && !lines[i].trim()) i++
  if (/^>\s?/.test(lines[i] || '')) {
    const metaLines = []
    while (i < lines.length && /^>\s?/.test(lines[i])) {
      metaLines.push(lines[i].replace(/^>\s?/, '').trim())
      i++
    }
    meta = `<div class="meta">\n    ${metaLines.map(inline).join('<br>\n    ')}\n  </div>`
  }

  const body = []
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }

    if (/^##\s+/.test(line)) {
      body.push(`<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`)
      i++
      continue
    }
    if (/^###\s+/.test(line)) {
      body.push(`<h3>${inline(line.replace(/^###\s+/, ''))}</h3>`)
      i++
      continue
    }
    if (/^>\s?/.test(line)) {
      const quoted = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^>\s?/, '').trim())
        i++
      }
      body.push(`<div class="meta">\n    ${quoted.map(inline).join('<br>\n    ')}\n  </div>`)
      continue
    }
    if (/^([-*]|\d+\.)\s+/.test(line)) {
      const r = parseList(lines, i)
      body.push(r.html)
      i = r.next
      continue
    }

    const buf = []
    while (i < lines.length && lines[i].trim() && !BLOCK_START_RE.test(lines[i])) {
      buf.push(lines[i].trim())
      i++
    }
    if (buf.length) {
      body.push(`<p>${inline(buf.reduce(joinText, ''))}</p>`)
    } else {
      // 兜底：匹配到块起始但无对应处理器时，按段落输出，保证循环推进
      body.push(`<p>${inline(line.trim())}</p>`)
      i++
    }
  }

  return { title, meta, body: body.join('\n\n  ') }
}

function docPage ({ title, description, docTitle, meta, body }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<style>${PAGE_CSS}</style>
</head>
<body>
<nav class="top">
  <a href="./index.html">首页</a>
  <a href="./privacy.html">隐私政策</a>
  <a href="./eula.html">用户许可协议</a>
</nav>

<main>
  <h1>${escapeHtml(docTitle)}</h1>

  ${meta}

  ${body}
</main>

<footer>Git Repo Manager ｜ 本页面为 ${escapeHtml(docTitle)} 的公开发布版本</footer>
</body>
</html>
`
}

function indexPage (effectiveDate) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Git Repo Manager 法律文档</title>
<meta name="description" content="Git Repo Manager 隐私政策与最终用户许可协议。">
<style>
  :root {
    --fg: #1f2328;
    --muted: #59636e;
    --line: #d1d9e0;
    --link: #0969da;
    --bg: #f6f8fa;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    padding: 64px 16px;
    background: var(--bg);
    color: var(--fg);
    font: 15px/1.75 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 720px; margin: 0 auto; }
  h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: .2px; }
  .sub { margin: 0 0 36px; color: var(--muted); font-size: 14px; }
  .cards { display: grid; gap: 14px; grid-template-columns: 1fr 1fr; }
  a.card {
    display: block;
    padding: 22px 24px;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 12px;
    color: inherit;
    text-decoration: none;
    transition: border-color .15s, box-shadow .15s, transform .15s;
  }
  a.card:hover {
    border-color: var(--link);
    box-shadow: 0 4px 14px rgba(31, 35, 40, .08);
    transform: translateY(-1px);
  }
  .card h2 { margin: 0 0 6px; font-size: 17px; color: var(--link); }
  .card p { margin: 0; color: var(--muted); font-size: 14px; }
  footer { margin-top: 36px; color: var(--muted); font-size: 13px; }
  @media (max-width: 560px) {
    body { padding: 40px 14px; }
    .cards { grid-template-columns: 1fr; }
    h1 { font-size: 24px; }
  }
</style>
</head>
<body>
<div class="wrap">
  <h1>Git Repo Manager 法律文档</h1>
  <p class="sub">开发者/运营方：Uaison（王淮森） ｜ 联系：<a href="mailto:752546024@qq.com">752546024@qq.com</a></p>

  <div class="cards">
    <a class="card" href="./privacy.html">
      <h2>隐私政策</h2>
      <p>说明本应用如何收集、使用、存储和保护信息。</p>
    </a>
    <a class="card" href="./eula.html">
      <h2>最终用户许可协议</h2>
      <p>安装与使用本软件所适用的许可条款。</p>
    </a>
  </div>

  <footer>生效日期：${escapeHtml(effectiveDate)}</footer>
</div>
</body>
</html>
`
}

function main () {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  let effectiveDate = ''
  for (const doc of DOCS) {
    const srcPath = path.join(ROOT, doc.src)
    if (!fs.existsSync(srcPath)) {
      console.error(`缺少源文件：${doc.src}`)
      process.exit(1)
    }
    const parsed = parseMarkdown(fs.readFileSync(srcPath, 'utf8'))
    const dateLine = parsed.meta.match(/生效日期：([^<\n]+)/)
    if (dateLine) effectiveDate = dateLine[1].trim()

    const html = docPage({
      title: doc.title,
      description: doc.description,
      docTitle: parsed.title || doc.title,
      meta: parsed.meta,
      body: parsed.body
    })
    fs.writeFileSync(path.join(OUT_DIR, doc.file), html, 'utf8')
    console.log(`生成 deploy/git-repo-manager/${doc.file}`)
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), indexPage(effectiveDate || ''), 'utf8')
  console.log('生成 deploy/git-repo-manager/index.html')
}

main()
