/**
 * make-release.mjs —— 在 GitHub 上建一个 Release 并挂上 exe / apk
 *   node --use-system-ca scripts/make-release.mjs
 */
import { readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const 包根 = dirname(dirname(fileURLToPath(import.meta.url)))
const 配置 = JSON.parse(readFileSync(join(包根, 'update.json'), 'utf8'))
const [OWNER, REPO] = 配置.repo.split('/')
const TOKEN = readFileSync(join(包根, '.pcbuild', 'gh-token'), 'utf8').trim()
const TAG = 'v' + 配置.version

const 头 = {
  Authorization: 'Bearer ' + TOKEN,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'arknights-lore-release',
  'Content-Type': 'application/json',
}

async function 调(method, url, body) {
  const r = await fetch(url, { method, headers: 头, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(180000) })
  const t = await r.text()
  let d = null
  try { d = JSON.parse(t) } catch { d = { raw: t.slice(0, 300) } }
  if (!r.ok && r.status !== 422) throw new Error(`${method} ${url} → ${r.status} ${d.message || t.slice(0, 200)}`)
  return d
}

// 已存在就先删掉同名 release
try {
  const 旧 = await 调('GET', `https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${TAG}`)
  if (旧 && 旧.id) {
    await 调('DELETE', `https://api.github.com/repos/${OWNER}/${REPO}/releases/${旧.id}`)
    console.log('删掉旧的 ' + TAG)
  }
} catch { /* 没有就算了 */ }

const 说明 = [
  '## 方舟剧情库 ' + 配置.version,
  '',
  配置.notes || '',
  '',
  '### 下载',
  '',
  '- **Windows**：`方舟剧情库-PC.zip`，解压后双击 `方舟剧情库.exe`（需要 Win10/11，自带 WebView2）',
  '- **安卓**：`方舟剧情库.apk`，允许安装未知来源即可（minSdk 24）',
  '',
  '### 关于更新',
  '',
  '程序里点「检查更新」会从本仓库拉内容包，不用重装。',
  '',
  '> 剧情文本版权归鹰角网络所有，仅供个人查阅，请勿商用。',
].join('\n')

const rel = await 调('POST', `https://api.github.com/repos/${OWNER}/${REPO}/releases`, {
  tag_name: TAG,
  name: '方舟剧情库 ' + 配置.version,
  body: 说明,
  draft: false,
  prerelease: false,
})
console.log('release:', rel.html_url)

// GitHub 会把非 ASCII 附件名吃掉，所以用英文名
const 附件 = [
  { 文件: join(包根, 'dist', '方舟剧情库-PC.zip'), 名: `ArknightsLore-PC-v${配置.version}.zip`, 类型: 'application/zip' },
  { 文件: join(包根, 'dist', '方舟剧情库.apk'), 名: `ArknightsLore-v${配置.version}.apk`, 类型: 'application/vnd.android.package-archive' },
]

for (const a of 附件) {
  const 数据 = readFileSync(a.文件)
  const r = await fetch(`https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${rel.id}/assets?name=${encodeURIComponent(a.名)}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'arknights-lore-release',
      'Content-Type': a.类型,
      'Content-Length': String(数据.length),
    },
    body: 数据,
    signal: AbortSignal.timeout(600000),
  })
  const j = await r.json()
  if (!r.ok) throw new Error('上传失败 ' + a.名 + ' → ' + r.status + ' ' + (j.message || ''))
  console.log('  上传', a.名, (statSync(a.文件).size / 1048576).toFixed(2), 'MB →', j.browser_download_url)
}

console.log('\n✅ https://github.com/' + OWNER + '/' + REPO + '/releases/latest')
