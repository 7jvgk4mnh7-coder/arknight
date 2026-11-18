/**
 * push-github.mjs —— 用 GitHub Git Data API 把本地提交推上去
 *
 * 为什么不用 git push：这台机器的 git 走 schannel，在沙箱里拿不到 TLS 凭据。
 * node 的 fetch 正常，所以直接调 REST API。
 *
 * 用法：GH_TOKEN=xxx node scripts/push-github.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const 包根 = dirname(dirname(fileURLToPath(import.meta.url)))
const 配置 = JSON.parse(readFileSync(join(包根, 'update.json'), 'utf8'))
const [OWNER, REPO] = 配置.repo.split('/')
// token 来源：环境变量 GH_TOKEN，或本地 .pcbuild/gh-token（该目录已被 .gitignore 排除）
const TOKEN = process.env.GH_TOKEN || (() => {
  try { return readFileSync(join(包根, '.pcbuild', 'gh-token'), 'utf8').trim() } catch { return '' }
})()
if (!TOKEN) {
  console.error('缺少 GitHub token：设置 GH_TOKEN，或写入 .pcbuild/gh-token')
  process.exit(1)
}

const API = 'https://api.github.com'
const 头 = {
  Authorization: 'Bearer ' + TOKEN,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'arknights-lore-push',
  'Content-Type': 'application/json',
}

async function 调(method, path, body) {
  const r = await fetch(API + path, {
    method,
    headers: 头,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(180000),
  })
  const text = await r.text()
  let data = null
  try { data = JSON.parse(text) } catch { data = { raw: text.slice(0, 300) } }
  if (!r.ok) {
    const msg = data && data.message ? data.message : text.slice(0, 200)
    throw new Error(`${method} ${path} → ${r.status} ${msg}`)
  }
  return data
}

// 1) 仓库信息
const 仓库 = await 调('GET', `/repos/${OWNER}/${REPO}`)
console.log(`仓库 ${仓库.full_name} · 默认分支 ${仓库.default_branch} · 私有 ${仓库.private}`)

const 分支 = 配置.branch || 仓库.default_branch || 'main'
let 父提交 = null
try {
  const ref = await 调('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${分支}`)
  父提交 = ref.object.sha
  console.log('已有提交：', 父提交.slice(0, 8))
} catch (e) {
  console.log('分支还不存在（空仓库），先 bootstrap 一个占位提交')
  // GitHub 不允许在完全空的仓库里建 blob，必须先有提交
  await 调('PUT', `/repos/${OWNER}/${REPO}/contents/.bootstrap`, {
    message: 'bootstrap',
    content: Buffer.from('bootstrap\n').toString('base64'),
  })
  const ref = await 调('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${分支}`)
  父提交 = null // 稍后用根提交覆盖，让历史只留一条
  console.log('  占位提交', ref.object.sha.slice(0, 8), '（会被覆盖）')
}

// 2) 文件清单（用本地 git 的索引，跟着 .gitignore 走）
// 沙箱里不能 spawn 子进程，文件清单由外部生成：git ls-files > .pcbuild/files.json
const 清单 = join(包根, '.pcbuild', 'files.json')
if (!existsSync(清单)) {
  console.error('缺少 .pcbuild/files.json（先跑：git ls-files | python 转成 JSON）')
  process.exit(1)
}
const 文件们 = JSON.parse(readFileSync(清单, 'utf8'))
console.log(`要上传 ${文件们.length} 个文件`)

const entries = []
let 已上传 = 0
for (const 相对 of 文件们) {
  const 绝对 = join(包根, 相对)
  const 内容 = readFileSync(绝对)
  const blob = await 调('POST', `/repos/${OWNER}/${REPO}/git/blobs`, {
    content: 内容.toString('base64'),
    encoding: 'base64',
  })
  entries.push({ path: 相对.split('\\').join('/'), mode: '100644', type: 'blob', sha: blob.sha })
  已上传 += 1
  if (已上传 % 10 === 0 || 内容.length > 5 * 1048576) {
    console.log(`  ${已上传}/${文件们.length}  ${相对}  ${(内容.length / 1048576).toFixed(1)}MB`)
  }
}

// 3) 建 tree（不用 base_tree：这是一个完整快照）
const tree = await 调('POST', `/repos/${OWNER}/${REPO}/git/trees`, { tree: entries })
console.log('tree:', tree.sha.slice(0, 8), '条目', entries.length)

// 4) 建 commit
const commit = await 调('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
  message: '方舟剧情库 v' + 配置.version + '：离线全文检索 + 人物/世界档案 + 跨剧情时间轴\n\n' +
    '- 491 个剧情 / 2061 小节 / 10459 场景块，中文 BM25 检索\n' +
    '- 别名检索、角色与国家/地区/组织档案、泰拉历时间轴\n' +
    '- 四种形态：DSH 插件、单文件网页、Windows exe、安卓 APK\n' +
    '- 桌面版与安卓版支持从 GitHub 拉内容更新',
  tree: tree.sha,
  parents: 父提交 ? [父提交] : [],
})
console.log('commit:', commit.sha.slice(0, 8))

// 5) 更新/创建分支引用
if (父提交) {
  await 调('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/${分支}`, { sha: commit.sha, force: true })
} else {
  await 调('POST', `/repos/${OWNER}/${REPO}/git/refs`, { ref: `refs/heads/${分支}`, sha: commit.sha })
}
console.log(`\n✅ 已推送 → https://github.com/${OWNER}/${REPO}/tree/${分支}`)
