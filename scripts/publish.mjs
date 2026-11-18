#!/usr/bin/env node
/**
 * publish.mjs —— 生成给 GitHub 用的发布物
 *
 *   node scripts/publish.mjs
 *
 * 产出 dist/release/：
 *   lore.html      ← 独立版页面（程序会下载这个）
 *   version.json   ← 版本清单（程序先拉它比对）
 *
 * 仓库里的 update.json 决定「去哪拉」：程序把 repo/branch 写死进二进制，
 * 所以改仓库后要重新打包 exe / apk。
 */
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const 包根 = dirname(dirname(fileURLToPath(import.meta.url)))
const 配置 = JSON.parse(readFileSync(join(包根, 'update.json'), 'utf8'))
const 页面 = join(包根, 'dist', '方舟剧情库.html')
const 出 = join(包根, 'dist', 'release')

if (!existsSync(页面)) {
  console.error('缺少 dist/方舟剧情库.html，先跑 build-standalone.mjs')
  process.exit(1)
}

mkdirSync(出, { recursive: true })
copyFileSync(页面, join(出, 'lore.html'))

const 内容 = readFileSync(join(出, 'lore.html'))
const 清单 = {
  version: 配置.version,
  repo: 配置.repo,
  branch: 配置.branch,
  notes: 配置.notes || '',
  size: 内容.length,
  sha256: createHash('sha256').update(内容).digest('hex').slice(0, 16),
  file: 'lore.html',
  builtAt: new Date().toISOString(),
}
writeFileSync(join(出, 'version.json'), JSON.stringify(清单, null, 2) + '\n', 'utf8')

const 基础 = `https://raw.githubusercontent.com/${配置.repo}/${配置.branch}/dist/release`
console.log('✅ dist/release/')
console.log(`   lore.html    ${(内容.length / 1048576).toFixed(2)} MB  (sha256 ${清单.sha256})`)
console.log(`   version.json ${清单.version}`)
console.log('\n仓库里应该是这两个路径：')
console.log(`   ${基础}/version.json`)
console.log(`   ${基础}/lore.html`)
if (配置.repo === 'OWNER/REPO') {
  console.log('\n⚠️ update.json 里的 repo 还是占位符，先改成你的 GitHub 仓库再打包。')
}
console.log('\n单文件是不是超过 100MB（GitHub 单文件上限）：' + (内容.length > 100 * 1024 * 1024 ? '超了！' : '没有'))
