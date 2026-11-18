#!/usr/bin/env node
/**
 * verify-standalone.mjs —— 不解压整个页面，只按浏览器的方式验产物：
 * 取出内嵌的 base64 → gunzip → split → 重建索引 → 跑一次检索。
 *
 *   node scripts/verify-standalone.mjs [dist/方舟剧情库.html]
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { 建索引, 检索, 读剧集 } from '../lib/search.mjs'

const 包根 = dirname(dirname(fileURLToPath(import.meta.url)))
const 文件 = resolve(process.argv[2] || join(包根, 'dist', '方舟剧情库.html'))
const html = readFileSync(文件, 'utf8')
console.log(`文件 ${(html.length / 1048576).toFixed(2)} MB`)

const metaM = /<script id="lore-meta" type="application\/json">([\s\S]*?)<\/script>/.exec(html)
const dataM = /<script id="lore-data" type="application\/octet-stream">([\s\S]*?)<\/script>/.exec(html)
if (!metaM || !dataM) throw new Error('页面里找不到数据块')
const meta = JSON.parse(metaM[1].replace(/\\u003c/g, '<'))
console.log(`元数据：${meta.eps.length} 小节 · stats=${JSON.stringify(meta.stats)}`)

const t0 = Date.now()
const text = gunzipSync(Buffer.from(dataM[1].replace(/\s+/g, ''), 'base64')).toString('utf8')
const pieces = text.split('\u0000')
console.log(`解压 ${Date.now() - t0}ms · ${(text.length / 1048576).toFixed(1)}M 字 · ${pieces.length} 个场景块`)

// 和浏览器端 rebuild() 一样的重建
const episodes = []
let p = 0
for (let i = 0; i < meta.eps.length; i++) {
  const e = meta.eps[i]
  const chunks = []
  for (let k = 0; k < e[4]; k++) chunks.push({ text: pieces[p++] })
  episodes.push({
    id: 'E' + String(i + 1).padStart(4, '0'),
    category: e[0], story: e[1], title: e[2], meta: e[3],
    label: `${e[0]} / ${e[1]} / ${e[2]}（${e[3]}）`,
    chunks,
  })
}
if (p !== pieces.length) throw new Error(`块数对不上：重建用了 ${p}，实际 ${pieces.length}`)

const 索引 = 建索引({ episodes, categories: [], stats: meta.stats, builtAt: meta.builtAt })
console.log(`索引 ${Date.now() - t0}ms`)

for (const q of ['霜星 死亡', '巴别塔', '凯尔希 罗德岛']) {
  const r = 检索(索引, q, { limit: 3 })
  console.log(`\n「${q}」→ ${r.hits.length} 条 ${r.用时}ms`)
  for (const h of r.hits) console.log(`  ${h.chunkId} ${h.label}  ${h.snippet.replace(/\n+/g, ' ').slice(0, 70)}…`)
}

const ep = episodes.find((x) => x.id === 'E0125')
const 读数 = 读剧集(索引, ep, { offset: 0, limit: 3 })
console.log(`\nE0125 ${ep.label} → ${读数.totalParagraphs} 段，首段：${读数.paragraphs[0].slice(0, 40)}`)
console.log('\nOK：产物数据与检索链路正常')
