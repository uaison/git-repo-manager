// 生成 THIRD-PARTY-NOTICES.md：
// 收集“会随应用一起分发”的生产依赖（package.json dependencies 及其传递闭包），
// 提取每个包的 名称/版本/许可类型/版权行/许可全文，汇总成一个 NOTICE 文件。
// 注意：devDependencies（electron、vite 等）不随应用分发，故不纳入。
// 用法：node scripts/generate-notice.js
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const nm = path.join(root, 'node_modules')

function readPkg (dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) } catch { return null }
}

function findLicenseFile (dir) {
  let files = []
  try { files = fs.readdirSync(dir) } catch { return null }
  // 优先 LICENSE / LICENCE / COPYING，其次带扩展名的变体
  const f = files.find(x => /^(license|licence|copying|notice)(\.(md|txt|markdown))?$/i.test(x)) ||
            files.find(x => /^(license|licence)/i.test(x))
  return f ? path.join(dir, f) : null
}

function licenseText (pkg) {
  const l = pkg.license
  if (!l) return (pkg.licenses && '见 package.json licenses 字段') || '未声明'
  if (typeof l === 'string') return l
  if (Array.isArray(l)) return l.map(x => (x && (x.type || x.name)) || String(x)).join(' OR ')
  if (typeof l === 'object') return l.type || JSON.stringify(l)
  return String(l)
}

function extractCopyright (text) {
  if (!text) return ''
  const lines = text.split(/\r?\n/).slice(0, 12)
  const hit = lines.find(l => /copyright|\(c\)|©/i.test(l))
  return hit ? hit.trim() : ''
}

const seen = new Map() // name@version -> { pkg, dir }

function walk (dir) {
  const pkg = readPkg(dir)
  if (!pkg || !pkg.name) return
  const key = pkg.name + '@' + pkg.version
  if (seen.has(key)) return
  seen.set(key, { pkg, dir })
  const deps = pkg.dependencies || {}
  for (const d of Object.keys(deps)) {
    const nested = path.join(dir, 'node_modules', d)
    const top = path.join(nm, d)
    if (fs.existsSync(nested)) walk(nested)
    else if (fs.existsSync(top)) walk(top)
  }
}

const rootPkg = readPkg(root)
const prodDeps = Object.keys((rootPkg && rootPkg.dependencies) || {})
for (const d of prodDeps) {
  const top = path.join(nm, d)
  if (fs.existsSync(top)) walk(top)
}

const entries = [...seen.values()].sort((a, b) =>
  a.pkg.name.localeCompare(b.pkg.name))

let md = `# Third-Party Notices / 第三方许可声明

本应用（Git Repo Manager）包含下列第三方开源组件。这些组件**随应用一起分发**（生产依赖及其传递依赖），
各自受其原始许可条款约束。以下列出每个组件的名称、版本、许可类型与许可全文。

Electron / Chromium / Node.js 的许可文本见安装目录中的 \`LICENSES.chromium.html\` 与
\`LICENSE.electron.txt\`；本文件覆盖打包进应用的 npm 生产依赖。

生成方式：\`node scripts/generate-notice.js\`（共 ${entries.length} 个组件）。

---

`

for (const { pkg, dir } of entries) {
  const lic = licenseText(pkg)
  const lf = findLicenseFile(dir)
  let body = ''
  let copyright = ''
  if (lf) {
    try {
      body = fs.readFileSync(lf, 'utf8').trim()
      copyright = extractCopyright(body)
    } catch { /* ignore */ }
  }
  // 兜底：包内未附许可文件但声明为 MIT（如 type-fest 这类纯类型包）时，
  // 嵌入标准 MIT 全文，版权行取 package.json author，保证 MIT“须附全文”的要求仍满足。
  if (!body && /\bMIT\b/i.test(lic)) {
    const a = pkg.author
    const name = (typeof a === 'string' ? a : (a && a.name)) || ''
    copyright = name ? `Copyright (c) ${name}` : 'Copyright (c) the respective authors'
    body = [
      'MIT License', '', copyright, '',
      'Permission is hereby granted, free of charge, to any person obtaining a copy',
      'of this software and associated documentation files (the "Software"), to deal',
      'in the Software without restriction, including without limitation the rights',
      'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell',
      'copies of the Software, and to permit persons to whom the Software is',
      'furnished to do so, subject to the following conditions:', '',
      'The above copyright notice and this permission notice shall be included in all',
      'copies or substantial portions of the Software.', '',
      'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
      'IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,',
      'FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE',
      'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER',
      'LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,',
      'OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE',
      'SOFTWARE.'
    ].join('\n')
  }
  md += `## ${pkg.name}@${pkg.version}\n\n`
  md += `- 许可：${lic}\n`
  if (pkg.homepage) md += `- 主页：${pkg.homepage}\n`
  else if (pkg.repository) {
    const r = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository.url
    if (r) md += `- 仓库：${r}\n`
  }
  if (copyright) md += `- 版权：${copyright}\n`
  md += '\n'
  if (body) {
    md += '```text\n' + body + '\n```\n\n'
  } else {
    md += `> 未在包内找到许可全文文件，许可类型为 ${lic}；请参见其仓库获取许可文本。\n\n`
  }
  md += '---\n\n'
}

const out = path.join(root, 'THIRD-PARTY-NOTICES.md')
fs.writeFileSync(out, md, 'utf8')
console.log(`OK: ${entries.length} 个生产依赖组件 -> ${path.relative(root, out)}`)
const noFull = entries.filter(({ pkg, dir }) => {
  if (findLicenseFile(dir)) return false
  return !/\bMIT\b/i.test(licenseText(pkg)) // 无文件且非 MIT（兜底无法覆盖）才算缺全文
}).map(({ pkg }) => pkg.name)
if (noFull.length) console.log('未找到许可全文的包：', noFull.join(', '))
else console.log('全部组件均已包含许可全文')
