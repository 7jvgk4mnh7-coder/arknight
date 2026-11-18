#!/usr/bin/env node
/**
 * build-standalone.mjs —— 把剧情库打成「一个 HTML 文件」，发给朋友双击就能用
 *
 *   node scripts/build-standalone.mjs [--out dist/方舟剧情库.html]
 *
 * 产物 = web/index.html + app.css + app.js + lib/search.mjs + 内嵌数据（gzip + base64）
 * 单文件、离线、无依赖、不需要服务器。
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const 包根 = dirname(dirname(fileURLToPath(import.meta.url)))
const 参数 = process.argv.slice(2)
const outIdx = 参数.indexOf('--out')
const 输出 = outIdx >= 0 ? resolve(参数[outIdx + 1]) : join(包根, 'dist', '方舟剧情库.html')

const 读 = (p) => readFileSync(join(包根, p), 'utf8')
const MB = (n) => (n / 1048576).toFixed(2) + ' MB'

console.log('[standalone] 读语料…')
const 数据 = JSON.parse(readFileSync(join(包根, 'data', 'lore.json'), 'utf8'))

// 正文流：按顺序把所有场景块拼起来，用 \u0000 分隔（比 JSON 数组省一截）
const 块们 = []
const eps = []
for (const 集 of 数据.episodes) {
  eps.push([集.category, 集.story, 集.title, 集.meta, 集.chunks.length])
  for (const 块 of 集.chunks) 块们.push(块.text)
}
const 正文 = 块们.join('\u0000')
const meta = {
  v: 1,
  builtAt: 数据.builtAt,
  stats: 数据.stats,
  eps,
}

console.log(`[standalone] 正文 ${MB(Buffer.byteLength(正文, 'utf8'))} · ${eps.length} 小节 · ${块们.length} 场景块`)
const gz = gzipSync(Buffer.from(正文, 'utf8'), { level: 9 })
const b64 = gz.toString('base64')
console.log(`[standalone] gzip ${MB(gz.length)} → base64 ${MB(b64.length)}`)

// 检索模块原样内联（去掉 export 关键字，函数变成全局）
const 内联模块 = (文件) => {
  const src = 读(文件).replace(/^export\s+/gm, '')
  if (/^\s*import\s/m.test(src)) {
    throw new Error(文件 + ' 里出现了 import，独立版无法内联（浏览器拿不到模块路径）')
  }
  return src
}
const 检索源码 = [
  内联模块('lib/search.mjs'),
  内联模块('lib/aliases.mjs'),
  内联模块('lib/places.mjs'),
  内联模块('lib/affiliations.mjs'),
  内联模块('lib/timeline.mjs'),
].join('\n')

const css = 读('web/app.css')
const app = 读('web/app.js')
const 模板 = 读('web/index.html')
const favicon = 读('web/favicon.b64').trim()

// 元数据塞进 <script type="application/json">：转义 < 防止意外闭合
const metaText = JSON.stringify(meta).replace(/</g, '\\u003c')

let html = 模板
  .replace('__CSS__', () => css)
  .replace('__FAVICON__', () => favicon)
  .replace('__META__', () => metaText)
  .replace('__DATA__', () => b64)
  .replace('__SEARCH__', () => 检索源码)
  .replace('__APP__', () => app)

mkdirSync(dirname(输出), { recursive: true })
writeFileSync(输出, html, 'utf8')

const size = statSync(输出).size
console.log(`[standalone] 写出 ${输出}`)
console.log(`[standalone] 文件大小 ${MB(size)}`)
