#!/usr/bin/env node
/**
 * build-corpus.mjs — 把「泰拉文库」导出的方舟剧情 txt 编成插件用的 lore.json
 *
 * 用法：
 *   node scripts/build-corpus.mjs "<txt 根目录>" [输出文件]
 *
 * 源目录结构（泰拉文库导出）：
 *   <根>/<分类>/<序号-剧情名>.txt
 * 每个 txt：
 *   ... 正文 / Story
 *   ================================================   ← 48 个 '='
 *   <小节标题>
 *   <编号 · 幕间/行动前/行动后>
 *   ================================================
 *   正文段落（空行分段）
 *
 * 输出：data/lore.json
 *   { version, builtAt, source, stats, categories, episodes:[{ id, category, story,
 *     storyNo, title, meta, label, chunks:[{ text }] }] }
 * 检索单位是「场景块」（约 1100 字，不跨剧集、不切段），比整集更适合喂模型。
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const 包根 = dirname(dirname(fileURLToPath(import.meta.url)))
const 默认源 = process.env.ARK_CORPUS_DIR || join(包根, '..', 'ark-corpus', 'txt', '单语', '简体中文')
const 源目录 = process.argv[2] || 默认源
const 输出 = process.argv[3] || join(包根, 'data', 'lore.json')

const 分类顺序 = ['主线剧情', '活动剧情', '故事集', '干员密录']
const 目标块长 = 1100
const 分隔行 = /^={20,}\s*$/

function 读文本(p) {
  let 原文 = readFileSync(p, 'utf8')
  if (原文.charCodeAt(0) === 0xfeff) 原文 = 原文.slice(1)
  return 原文.replace(/\r\n?/g, '\n')
}

function 切段落(文本) {
  return 文本
    .split(/\n[ \t]*\n/)
    .map((x) => x.replace(/[ \t]+$/gm, '').trim())
    .filter((x) => x.length > 0)
}

/** 一个 txt → 若干「小节」{ title, meta, paragraphs } */
function 解析文件(文本) {
  const 行 = 文本.split('\n')
  let 起点 = 行.findIndex((l) => /^正文\s*\/\s*Story\s*$/i.test(l.trim()))
  if (起点 < 0) 起点 = 0
  const 小节 = []
  let i = 起点
  while (i < 行.length) {
    if (!分隔行.test(行[i])) {
      i += 1
      continue
    }
    // [分隔行][标题][编号·阶段][分隔行]
    const 标题 = (行[i + 1] ?? '').trim()
    const 阶段 = (行[i + 2] ?? '').trim()
    if (!分隔行.test(行[i + 3] ?? '')) {
      i += 1
      continue
    }
    let j = i + 4
    while (j < 行.length && !分隔行.test(行[j])) j += 1
    const 正文 = 行.slice(i + 4, j).join('\n')
    const 段落 = 切段落(正文)
    if (段落.length > 0) 小节.push({ title: 标题, meta: 阶段, paragraphs: 段落 })
    i = j
  }
  return 小节
}

/** 段落 → 场景块（累计到 1100 字就收一块，不跨集） */
function 切块(段落) {
  const 块 = []
  let 当前 = []
  let 字数 = 0
  for (const p of 段落) {
    if (当前.length > 0 && 字数 + p.length > 目标块长) {
      块.push(当前.join('\n\n'))
      当前 = []
      字数 = 0
    }
    当前.push(p)
    字数 += p.length
  }
  if (当前.length > 0) 块.push(当前.join('\n\n'))
  return 块
}

function 剧情名(文件名) {
  return basename(文件名, '.txt').replace(/^\d+[-_.、\s]*/, '').trim() || basename(文件名, '.txt')
}

// ---------------- 主流程 ----------------

const 分类们 = readdirSync(源目录)
  .filter((n) => {
    try { return statSync(join(源目录, n)).isDirectory() }
    catch { return false }
  })
  .sort((a, b) => {
    const ia = 分类顺序.indexOf(a)
    const ib = 分类顺序.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'zh')
  })

const episodes = []
const categories = []
let 总字数 = 0

for (const 分类 of 分类们) {
  const 目录 = join(源目录, 分类)
  const 文件们 = readdirSync(目录).filter((n) => n.toLowerCase().endsWith('.txt')).sort()
  const stories = []
  for (const 文件 of 文件们) {
    const 文本 = 读文本(join(目录, 文件))
    const 小节们 = 解析文件(文本)
    if (小节们.length === 0) continue
    const 名 = 剧情名(文件)
    const storyNo = Number((文件.match(/^(\d+)/) || [])[1]) || stories.length + 1
    const story = { name: 名, no: storyNo, episodes: [] }
    for (const 小节 of 小节们) {
      const id = 'E' + String(episodes.length + 1).padStart(4, '0')
      const 块们 = 切块(小节.paragraphs)
      const 集 = {
        id,
        category: 分类,
        story: 名,
        storyNo,
        title: 小节.title || 名,
        meta: 小节.meta || '',
        label: [分类, 名, 小节.title || '', 小节.meta ? `（${小节.meta}）` : ''].join(' / ').replace(/ \/ $/, ''),
        chunks: 块们.map((t) => ({ text: t })),
      }
      总字数 += 小节.paragraphs.reduce((a, p) => a + p.length, 0)
      episodes.push(集)
      story.episodes.push({ id, title: 集.title, meta: 集.meta })
    }
    if (story.episodes.length > 0) stories.push(story)
  }
  categories.push({ name: 分类, stories })
}

const 块数 = episodes.reduce((a, e) => a + e.chunks.length, 0)
const 数据 = {
  version: 1,
  builtAt: new Date().toISOString(),
  source: 源目录,
  stats: { episodes: episodes.length, chunks: 块数, chars: 总字数, stories: categories.reduce((a, c) => a + c.stories.length, 0) },
  categories,
  episodes,
}

mkdirSync(dirname(输出), { recursive: true })
writeFileSync(输出, JSON.stringify(数据), 'utf8')

const 平均块 = 总字数 / Math.max(1, 块数)
console.log(`[ark-lore] 分类 ${categories.length} · 剧情 ${数据.stats.stories} · 小节 ${episodes.length} · 场景块 ${块数}`)
console.log(`[ark-lore] 正文 ${(总字数 / 1e6).toFixed(2)}M 字 · 平均每块 ${平均块.toFixed(0)} 字`)
console.log(`[ark-lore] 写出 ${输出}`)
