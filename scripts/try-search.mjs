import { readFileSync } from 'node:fs'
import { 建索引, 检索, 检索提及 } from '../lib/search.mjs'

const t0 = Date.now()
const 数据 = JSON.parse(readFileSync(new URL('../data/lore.json', import.meta.url), 'utf8'))
const 索引 = 建索引(数据)
console.log(`载入+建索引 ${Date.now() - t0}ms · 块 ${索引.块文本.length} · 平均 ${索引.平均长.toFixed(0)} 字`)

for (const q of process.argv.slice(2)) {
  const r = 检索(索引, q, { limit: 3 })
  console.log(`\n=== 「${q}」 ${r.用时}ms · ${r.hits.length} 条 ===`)
  for (const h of r.hits) {
    console.log(`  [${h.score}] ${h.chunkId} ${h.label}  (cover ${h.coverage}, 命中「${h.命中词}」)`)
    console.log('    ' + h.snippet.replace(/\n+/g, ' ').slice(0, 150))
  }
}

const a = 检索提及(索引, '凯尔希')
console.log(`\n=== 提及 凯尔希：${a.total} 次 / ${a.episodes.length} 集 ===`)
for (const e of a.episodes.slice(0, 5)) console.log(`  ${e.count}× ${e.label}`)
