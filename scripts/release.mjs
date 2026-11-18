#!/usr/bin/env node
/**
 * release.mjs —— 一条命令发版
 *
 *   node scripts/release.mjs                    # 补丁号 +1（0.4.1 → 0.4.2），重建页面并发布
 *   node scripts/release.mjs --version 0.5.0    # 指定版本
 *   node scripts/release.mjs --notes "新增XX活动" # 写更新说明
 *   node scripts/release.mjs --skip-build        # 不改页面，只重出发布物
 *
 * 做的事：build-standalone → 改 update.json → publish → git add/commit
 * 推送不在这里做（脚本后面会打印命令，或者用根目录的「发版.bat」）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const 包根 = dirname(dirname(fileURLToPath(import.meta.url)))
const 参数 = process.argv.slice(2)
const 取值 = (名, 默认) => {
  const i = 参数.indexOf(名)
  return i >= 0 && 参数[i + 1] ? 参数[i + 1] : 默认
}

const 配置路径 = join(包根, 'update.json')
const 配置 = JSON.parse(readFileSync(配置路径, 'utf8'))
const 旧版本 = 配置.version
const 新版本 = 取值('--version', (() => {
  const p = 旧版本.split('.').map(Number)
  p[2] = (p[2] || 0) + 1
  return p.join('.')
})())
const 说明 = 取值('--notes', 配置.notes || '内容更新')
const 跳过构建 = 参数.includes('--skip-build')

function 跑(命令, 参数们, 提示) {
  process.stdout.write(`\n▸ ${提示}\n`)
  execFileSync(命令, 参数们, { cwd: 包根, stdio: 'inherit' })
}

if (!existsSync(join(包根, 'dist', '方舟剧情库.html')) || !跳过构建) {
  跑(process.execPath, [join(包根, 'scripts', 'build-standalone.mjs')], '重建单文件页面')
} else {
  console.log('▸ 跳过页面构建（--skip-build）')
}

配置.version = 新版本
配置.notes = 说明
writeFileSync(配置路径, JSON.stringify(配置, null, 2) + '\n', 'utf8')
console.log(`\n▸ 版本 ${旧版本} → ${新版本}`)
console.log(`  说明：${说明}`)

跑(process.execPath, [join(包根, 'scripts', 'publish.mjs')], '生成 dist/release（在线更新用）')

// 提交
跑('git', ['add', '-A'], '暂存改动')
try {
  跑('git', ['-c', 'core.safecrlf=false', 'commit', '-m', `发布 v${新版本}：${说明}`], '提交')
} catch {
  console.log('（没有改动可提交，跳过）')
}

// 桌面安装包也顺手重打（可选，失败不影响发布）
try {
  跑(process.execPath, [join(包根, 'scripts', 'build-pc.mjs')], '重打 Windows 桌面包')
} catch {
  console.log('（桌面包构建失败，跳过；不影响在线更新）')
}
try {
  跑(process.execPath, [join(包根, 'scripts', 'build-android.mjs')], '重打安卓包')
} catch {
  console.log('（安卓包构建失败，跳过；不影响在线更新）')
}

console.log('\n' + '─'.repeat(52))
console.log(`✅ v${新版本} 已就绪，剩最后一步：推上去\n`)
console.log('   git push --force origin main\n')
console.log('   （或者直接双击根目录的「发版.bat」，它会连推一起做）')
console.log('─'.repeat(52))
