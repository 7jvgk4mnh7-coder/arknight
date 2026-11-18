/**
 * dsh-arknights-lore —— 宿主侧
 *
 * 三件事：
 *   1. 把本机「泰拉文库」导出的方舟全剧情（主线/活动/故事集/干员密录）编成可检索语料
 *   2. 给模型五个工具：search / read / who / digest / index
 *   3. 同源 HTTP（/api/arknights-lore/*）给浏览器面板用
 *
 * 语料是 data/lore.json（scripts/build-corpus.mjs 生成），懒加载，只在第一次用到时读盘。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { 建索引, 检索, 检索提及, 找剧集, 读剧集, 目录, 人物档案, 速览, 人物榜, 是否人物 } from './lib/search.mjs'
import { 解析别名, 别名说明 } from './lib/aliases.mjs'
import { 查地点, 世界分组 } from './lib/places.mjs'
import { 查所属 } from './lib/affiliations.mjs'
import { 提取时间轴 } from './lib/timeline.mjs'

/** 带别名展开的检索：正名和原名各搜一次，按块合并（同块取高分） */
function 检索带别名(索引, query, 选项 = {}) {
  const 解 = 解析别名(query)
  if (!解.命中) return Object.assign(检索(索引, query, 选项), { 别名: [], 实际查询: query })
  const a = 检索(索引, 解.正式, 选项)
  const b = 检索(索引, query, 选项)
  const 表 = new Map()
  for (const h of a.hits.concat(b.hits)) {
    const old = 表.get(h.chunkId)
    if (!old || h.score > old.score) 表.set(h.chunkId, h)
  }
  const hits = [...表.values()].sort((x, y) => y.score - x.score).slice(0, 选项.limit ?? 6)
  return { hits, 单位: a.单位, 用时: a.用时 + b.用时, 别名: 解.列表, 实际查询: 解.正式 }
}

export const name = 'arknights-lore'
export const inject = ['tools']

const 插件根 = fileURLToPath(new URL('.', import.meta.url))
const 默认语料 = join(插件根, 'data', 'lore.json')

// ---------------- 语料 ----------------

let 索引 = null
let 加载错误 = null

function 取索引(配置 = {}) {
  if (索引) return 索引
  if (加载错误) throw 加载错误
  const 文件 = 配置?.corpusFile ? String(配置.corpusFile) : 默认语料
  try {
    if (!existsSync(文件)) throw new Error(`语料文件不存在：${文件}（先跑 node scripts/build-corpus.mjs <txt 根目录>）`)
    const 数据 = JSON.parse(readFileSync(文件, 'utf8'))
    索引 = 建索引(数据)
    索引.文件 = 文件
  } catch (e) {
    加载错误 = e
    throw e
  }
  return 索引
}

// ---------------- 文本渲染 ----------------

const 条数上限 = 20

function 渲染命中(h, i) {
  const 行 = []
  行.push(`${i + 1}. ${h.label}`)
  行.push(`   [${h.chunkId}] 相关度 ${h.score}`)
  行.push(`   ${h.前缀 ? '…' : ''}${h.snippet.replace(/\n{2,}/g, ' / ').replace(/\n/g, ' ')}${h.后缀 ? '…' : ''}`)
  return 行.join('\n')
}

function 渲染检索(结果, 查询) {
  const 别名行 = 结果.别名 && 结果.别名.length > 0
    ? `（按别名检索：${别名说明(结果.别名)}，正名与别名都搜了）\n`
    : ''
  if (结果.hits.length === 0) {
    return `${别名行}「${查询}」在方舟剧情库里没有找到。换个关键词（人名、地名、势力名、台词里的词）再试；也可以先用 ark_lore_index 看看有哪些剧情。`
  }
  const 头 = `${别名行}方舟剧情检索「${查询}」：${结果.hits.length} 处场景（共 ${结果.单位.length} 个检索单位，${结果.用时}ms）`
  const 尾 = '\n需要看完整上下文时，用 ark_lore_read 传 chunkId 或 episodeId。'
  return [头, '', ...结果.hits.map(渲染命中), 尾].join('\n')
}

function 渲染读取(集, 读数, 块号) {
  const 头 = [
    `剧集：${集.label}`,
    `ID：${集.id}${块号 == null ? '' : `（从第 ${块号} 号场景开始）`}`,
    `段落：第 ${读数.offset + 1}–${读数.offset + 读数.paragraphs.length} 段 / 共 ${读数.totalParagraphs} 段`,
  ].join('\n')
  const 尾 = 读数.hasMore
    ? `\n⋯ 还有 ${读数.totalParagraphs - 读数.offset - 读数.paragraphs.length} 段。继续读：ark_lore_read episode="${集.id}" offset=${读数.offset + 读数.paragraphs.length}`
    : '\n（完）'
  return [头, '', ...读数.paragraphs, 尾].join('\n\n')
}

const 分类提示 = '主线剧情 / 活动剧情 / 故事集 / 干员密录'

/** 第 k 块之前一共有多少段（用于 chunkId → 段落 offset） */
function 块前段数(集, k) {
  let n = 0
  for (const c of (集.chunks || []).slice(0, Math.max(0, k))) {
    n += c.text.split(/\n{2,}/).filter((x) => x.trim().length > 0).length
  }
  return n
}

function 渲染目录(索, { category, story, limit = 30 }) {
  const 行 = []

  const 分类们 = 索.categories.filter((c) => !category || c.name === category)
  if (分类们.length === 0) return `没有「${category}」这个分类。可选：${分类提示}`
  for (const c of 分类们) {
    const 剧情们 = c.stories.filter((s) => !story || s.name.includes(story))
    if (剧情们.length === 0) continue
    行.push(`# ${c.name}（${剧情们.length} 个剧情）`)
    let 已列 = 0
    for (const s of 剧情们) {
      if (已列 >= limit) break
      行.push(`- ${s.name} — ${s.episodes.length} 小节（${s.episodes[0]?.id} … ${s.episodes[s.episodes.length - 1]?.id}）`)
      已列 += 1
    }
    if (剧情们.length > 已列) 行.push(`  … 还有 ${剧情们.length - 已列} 个剧情，加 story 过滤或调大 limit`)
    行.push('')
  }
  if (story) {
    const 命中集 = []
    for (const c of 索.categories) {
      for (const s of c.stories) {
        if (!s.name.includes(story)) continue
        if (category && c.name !== category) continue
        for (const e of s.episodes) 命中集.push(`${e.id}  ${e.title}${e.meta ? `（${e.meta}）` : ''}`)
      }
    }
    if (命中集.length > 0) {
      行.push(`# 「${story}」的小节（共 ${命中集.length}）`)
      行.push(...命中集.slice(0, limit).map((x) => '  ' + x))
    }
  }
  行.push(`统计：${索.stats.episodes} 小节 · ${索.stats.chunks} 场景块 · ${(索.stats.chars / 1e4).toFixed(0)} 万字 · 构建于 ${索.builtAt}`)
  return 行.join('\n')
}

function 渲染人物(档) {
  if (档.total === 0) {
    return `剧情库里没找到「${档.name}」。\n换个写法试试：全名、代号、组织名或地名（比如「凯尔希」「巴别塔」「切尔诺伯格」）。`
  }
  const 行 = []
  const 剧情数 = new Set(档.stories.map((s) => s.category + '/' + s.story)).size
  行.push(`「${档.name}」：${档.total} 次提及，出现在 ${档.episodeCount} 个小节、${剧情数} 个剧情里。`)
  if (档.别名 && 档.别名.length > 0) 行.push(`（别名：${别名说明(档.别名)}）`)
  const 所 = 查所属(档.name)
  if (所.length > 0) 行.push(`所属：${所.join(' · ')}`)
  行.push(`首次：${档.first?.label ?? '?'}`)
  行.push(`最近：${档.last?.label ?? '?'}`)
  行.push('')
  行.push('出现最多的剧情：')
  for (const s of 档.stories.slice(0, 8)) {
    行.push(`  ${s.story}（${s.category}）— ${s.episodes} 节 / ${s.mentions} 次`)
  }
  if (档.coSpeakers.length > 0) {
    行.push('')
    行.push('常与其同场（按共同出现的集数）：')
    行.push('  ' + 档.coSpeakers.map((c) => `${c.name} ${c.episodes} 集`).join(' · '))
  }
  if (档.samples.length > 0) {
    行.push('')
    行.push('代表片段：')
    for (const s of 档.samples) {
      行.push(`  [${s.chunkId}] ${s.label}`)
      行.push(`  「${s.snippet}」`)
    }
  }
  行.push('')
  行.push(`想看更多原文：ark_lore_search query="${档.name}"；读整集：ark_lore_read episode="${档.samples[0]?.episodeId ?? 档.first?.id}"`)
  return 行.join('\n')
}

function 渲染速览(v) {
  if (v.kind === 'none') {
    if (!v.candidates || v.candidates.length === 0) return '没找到对应的剧情或小节。先用 ark_lore_index 看目录。'
    return '对上了多个目标，用更精确的名字或 ID 再试：\n' + v.candidates.map((x) => '  ' + x).join('\n')
  }
  if (v.kind === 'episode') {
    const 行 = []
    行.push(`《${v.title}》${v.meta ? '（' + v.meta + '）' : ''} — ${v.category} / ${v.story}`)
    行.push(`${v.paragraphs} 段 · 约 ${(v.chars / 1000).toFixed(1)}k 字`)
    if (v.speakers.length > 0) 行.push('主要说话人：' + v.speakers.map((s) => `${s.name} ${s.lines} 句`).join(' · '))
    行.push('')
    行.push('开场：')
    for (const p of v.opening) 行.push('  ' + p)
    行.push('结尾：')
    for (const p of v.ending) 行.push('  ' + p)
    行.push('')
    行.push(`读全文：ark_lore_read episode="${v.id}"`)
    return 行.join('\n')
  }
  // story
  const 行 = []
  行.push(`《${v.story}》（${v.category}）${v.episodeCount} 小节 · 约 ${(v.chars / 1e4).toFixed(1)} 万字`)
  行.push('')
  for (const e of v.episodes) {
    行.push(`${e.id}  ${e.title}${e.meta ? '（' + e.meta + '）' : ''} · ${(e.chars / 1000).toFixed(1)}k字${e.speakers.length ? ' · ' + e.speakers.join('/') : ''}`)
    if (e.opening) 行.push(`    「${e.opening}」`)
  }
  行.push('')
  行.push('这是每小节的开场梗概；要具体情节用 ark_lore_read 读某一集，或 ark_lore_search 搜细节。')
  return 行.join('\n')
}

// ---------------- 组装 ----------------

export function apply(ctx, 配置 = {}) {
  const 日志 = (t) => {
    try { ctx.logger?.info?.('[arknights-lore] ' + t) } catch (e) { /* ignore */ }
  }

  const 读 = () => 取索引(配置)

  // ---- 模型工具 ----

  ctx.effect(() => ctx.tools.register({
    name: 'ark_lore_search',
    description:
      '在《明日方舟》全剧情原文里检索（主线/活动/故事集/干员密录，共 2000 多小节、1000 万字级）。\n'
      + '按场景块返回命中片段 + 位置。问到方舟的人物、势力、事件、台词、结局时先用它找原文，别凭记忆编。\n'
      + '关键词用原文里会出现的词（人名/地名/组织/专有名词），多个词空格分隔=同时提到。\n'
      + '认别名：兔兔=阿米娅、大尉/博卓卡斯替=爱国者、陈sir/陈晖洁=陈、摄政王=特雷西斯 等，正名和别名会一起搜。\n'
      + '支持操作符："整句短语"（必须原样出现）、+词（必须包含）、-词（排除），例如 凯尔希 +巴别塔 -整合运动。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索词，例如「凯尔希 罗德岛」「霜星 死亡」「"我不要"」「凯尔希 +巴别塔」' },
        category: { type: 'string', description: `限定分类，可选：${分类提示}。不填=全部` },
        story: { type: 'string', description: '限定剧情名的一部分，例如「局部坏死」「遗尘漫步」。不填=全部' },
        limit: { type: 'integer', description: '返回几条场景，默认 6，最多 20' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value ?? '') }],
    },
    async execute(args) {
      const q = String(args?.query ?? '').trim()
      if (!q) return '要检索什么？给我关键词。'
      const 索 = 读()
      const 结果 = 检索带别名(索, q, {
        category: String(args?.category ?? '').trim(),
        story: String(args?.story ?? '').trim(),
        limit: Math.min(条数上限, Math.max(1, Number(args?.limit) || 6)),
      })
      return 渲染检索(结果, q)
    },
  }), 'arknights-lore: tool ark_lore_search')

  ctx.effect(() => ctx.tools.register({
    name: 'ark_lore_read',
    description:
      '读取方舟某一小节（整集剧情）的原文，按段落分页。\n'
      + 'episode 传剧集 ID（如 E0123）或 ark_lore_search 返回的 chunkId（如 E0123#2，会从该场景开始读），也可传剧情名+小节名。\n'
      + '理解剧情用这个：先 search 定位，再 read 把整段对话读完，别只看片段下结论。',
    parameters: {
      type: 'object',
      properties: {
        episode: { type: 'string', description: '剧集 ID / chunkId / 剧情名+小节名' },
        offset: { type: 'integer', description: '从第几段开始（0 起），默认 0；上面显示「还有 N 段」时接着传' },
        limit: { type: 'integer', description: '最多返回多少段，默认 40；整集偏长时建议保持默认分几次读完' },
      },
      required: ['episode'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value ?? '') }],
    },
    async execute(args) {
      const 索 = 读()
      const 原文 = String(args?.episode ?? '').trim()
      if (!原文) return '要读哪一集？给我剧集 ID 或名字。'
      let 块号 = null
      let 集标识 = 原文
      const 块匹配 = 原文.match(/^(.+)#(\d+)$/)
      if (块匹配) {
        集标识 = 块匹配[1]
        块号 = Number(块匹配[2])
      }
      const { 精确, 匹配 } = 找剧集(索, 集标识)
      if (!精确) {
        if (匹配.length === 0) return `找不到「${原文}」。先用 ark_lore_search 或 ark_lore_index 确认剧集名。`
        const 候选 = 匹配.map((e) => `${e.id}  ${e.label}`).join('\n')
        return `「${原文}」对上了多集，用 ID 指定：\n${候选}`
      }
      let 起始段 = Math.max(0, Number(args?.offset) || 0)
      if (块号 != null && (args?.offset == null || args.offset === '')) {
        起始段 = Math.max(0, 块前段数(精确, 块号) - 1) // 往前带一段，交代上下文
      }
      const 段数 = Math.min(120, Math.max(1, Number(args?.limit) || 40))
      const 读数 = 读剧集(索, 精确, { offset: 起始段, limit: 段数 })
      return 渲染读取(精确, 读数, 块号)
    },
  }), 'arknights-lore: tool ark_lore_read')

  ctx.effect(() => ctx.tools.register({
    name: 'ark_lore_index',
    description:
      '方舟剧情库的目录：看有哪些分类和剧情，或列出某个剧情下所有小节（带 ID）。\n'
      + '不知道从哪查、或者要拿小节 ID 时用它；查某人出场请用 ark_lore_who。',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: `只看某个分类：${分类提示}` },
        story: { type: 'string', description: '只看剧情名包含该词的；同时会列出它的小节 ID' },
        limit: { type: 'integer', description: '最多列几项，默认 30' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value ?? '') }],
    },
    async execute(args) {
      const 索 = 读()
      return 渲染目录(索, {
        category: String(args?.category ?? '').trim(),
        story: String(args?.story ?? '').trim(),
        limit: Math.min(200, Math.max(1, Number(args?.limit) || 30)),
      })
    },
  }), 'arknights-lore: tool ark_lore_index')

  ctx.effect(() => ctx.tools.register({
    name: 'ark_lore_who',
    description:
      '查一个人 / 势力 / 地名的「剧情档案」：被提到多少次、出现在哪些剧情、第一次和最近一次出现、'
      + '常和谁同场、以及几段代表原文。\n'
      + '问「XX是谁 / XX在剧情里都干了什么 / XX和谁关系近」时先用它，比直接搜省很多 token。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '人名、势力名或地名，纯文本匹配，例如「凯尔希」「巴别塔」「切尔诺伯格」' },
        co: { type: 'integer', description: '列出几个常同场的人，默认 10' },
        samples: { type: 'integer', description: '给几段代表原文，默认 3，最多 8' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value ?? '') }],
    },
    async execute(args) {
      const 名 = String(args?.name ?? '').trim()
      if (!名) return '要查谁？给个人名或势力名。'
      const 索 = 读()
      const 解 = 解析别名(名)
      const 档 = 人物档案(索, 解.命中 ? 解.正式 : 名, {
        co: Math.min(30, Math.max(1, Number(args?.co) || 10)),
        samples: Math.min(8, Math.max(1, Number(args?.samples) || 3)),
      })
      return 渲染人物(Object.assign({}, 档, { 别名: 解.命中 ? 解.列表 : [] }))
    },
  }), 'arknights-lore: tool ark_lore_who')

  ctx.effect(() => ctx.tools.register({
    name: 'ark_lore_digest',
    description:
      '剧情速览：传剧情名（如「局部坏死」）= 每个小节一行（人物 + 开场句）；传小节 ID 或小节名 = 该集的首尾段落与主要说话人。\n'
      + '想快速弄明白一个大剧情讲了什么、或者决定接下来读哪一集时用它，不要一上来把十几集全文读完。',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '剧情名 / 小节 ID（E0123）/ 小节标题' },
        limit: { type: 'integer', description: '剧情速览最多列几小节，默认 80' },
      },
      required: ['target'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value ?? '') }],
    },
    async execute(args) {
      const 目标 = String(args?.target ?? '').trim()
      if (!目标) return '要速览哪个剧情或小节？'
      const 索 = 读()
      return 渲染速览(速览(索, 目标, { limit: Math.min(200, Math.max(1, Number(args?.limit) || 80)) }))
    },
  }), 'arknights-lore: tool ark_lore_digest')

  // ---- 系统提示：让模型知道该查 ----
  //
  // apply 执行时 webServer / systemPrompt 不一定已就绪（装配顺序不固定），
  // 所以这里一律用 ctx.inject 等服务出现再注册，不能 ctx.get 一把梭。

  if (配置?.announce !== false) {
    ctx.inject(['systemPrompt'], (spCtx) => {
      try {
        spCtx.effect(() => spCtx.systemPrompt.section({
          name: 'arknights-lore',
          order: 880,
          text:
            '[方舟剧情库]\n'
            + '本机有一份《明日方舟》全剧情原文（主线/活动/故事集/干员密录，2000+ 小节）：'
            + 'ark_lore_search 检索原文、ark_lore_read 读整集、ark_lore_who 查某人/势力的出场档案、'
            + 'ark_lore_digest 剧情速览、ark_lore_index 看目录。\n'
            + '涉及方舟剧情、人物关系、势力、事件、台词时，先查原文再说；查不到就直说剧情库里没有，不要编。',
        }), 'arknights-lore: prompt section')
        日志('系统提示段已注册')
      } catch (e) {
        日志('注册提示段失败：' + (e && e.message))
      }
    })
  }

  // ---- 浏览器面板的同源 API ----

  const 发JSON = (res, code, body) => {
    const 文本 = JSON.stringify(body)
    res.writeHead(code, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(文本),
    })
    res.end(文本)
  }

  ctx.inject(['webServer'], (webCtx) => {
   try {
    const webServer = webCtx.get('webServer')
    webCtx.effect(() => webServer.register({
      kind: 'prefix',
      path: '/api/arknights-lore',
      handler: async (req, res) => {
        const 前缀 = '/api/arknights-lore'
        const 路径 = (req.url ?? '/').split('?')[0].slice(前缀.length) || '/'
        try {
          const u = new URL(req.url ?? '/', 'http://localhost')
          const 参数 = u.searchParams
          const 索 = 读()

          if (路径 === '/stats' && req.method === 'GET') {
            return 发JSON(res, 200, {
              ok: true,
              stats: 索.stats,
              builtAt: 索.builtAt,
              分类: 索.categories.map((c) => ({ name: c.name, stories: c.stories.length })),
            })
          }

          if (路径 === '/catalog' && req.method === 'GET') {
            return 发JSON(res, 200, { ok: true, ...目录(索) })
          }

          if (路径 === '/search' && req.method === 'GET') {
            const q = 参数.get('q') ?? ''
            if (!q.trim()) return 发JSON(res, 200, { ok: true, query: q, hits: [], units: [], ms: 0 })
            const 结果 = 检索带别名(索, q, {
              category: 参数.get('category') ?? '',
              story: 参数.get('story') ?? '',
              limit: Math.min(条数上限, Math.max(1, Number(参数.get('limit')) || 8)),
            })
            const 词 = q.trim()
            const 解 = 解析别名(词)
            const 单词 = !/\s/.test(词)
            // 只有真在问一个人/一个地方，才返回档案信息，面板据此显示「档案」按钮
            const 角色 = 单词 && 是否人物(索, 词, 解) ? {
              name: 解.命中 ? 解.正式 : 词,
              query: 词,
              aliasText: 解.命中 ? 别名说明(解.列表) : '',
            } : null
            const 地点 = 单词 && !角色 ? (() => {
              const 类 = 查地点(词)
              return 类 ? { name: 词, kind: 类 } : null
            })() : null
            return 发JSON(res, 200, {
              ok: true,
              query: q,
              alias: 结果.别名 || [],
              aliasText: 别名说明(结果.别名),
              actualQuery: 结果.实际查询 || q,
              character: 角色,
              place: 地点,
              hits: 结果.hits,
              units: 结果.单位,
              ms: 结果.用时,
            })
          }

          if (路径 === '/who' && req.method === 'GET') {
            const 名 = 参数.get('name') ?? ''
            const 解 = 解析别名(名)
            return 发JSON(res, 200, {
              ok: true,
              ...人物档案(索, 解.命中 ? 解.正式 : 名, {
                co: Math.min(30, Number(参数.get('co')) || 10),
                samples: Math.min(8, Number(参数.get('samples')) || 3),
              }),
              queryName: 名,
              alias: 解.命中 ? 解.列表 : [],
              aliasText: 别名说明(解.命中 ? 解.列表 : []),
              affiliations: 查所属(解.命中 ? 解.正式 : 名).map((n) => ({ name: n, kind: 查地点(n) || '' })),
              kind: 查地点(解.命中 ? 解.正式 : 名) || '',
            })
          }

          if (路径 === '/timeline' && req.method === 'GET') {
            const 轴 = 提取时间轴(索)
            const 全 = 参数.get('all') === '1'
            // 默认只给「场景时间戳」（日期在段首），勾选后才带旁述里提到的年份
            const 年表 = 轴.年表
              .map((g) => {
                const 事件 = 全 ? g.事件 : g.事件.filter((e) => e.场景)
                return { 年: g.年, 条数: 事件.length, 事件 }
              })
              .filter((g) => g.条数 > 0)
            const 年代表 = 轴.年代表.map((g) => ({ 桶: g.桶, 条数: 全 ? g.条数 : 0, 事件: 全 ? g.事件 : [] }))
            return 发JSON(res, 200, {
              ok: true,
              总数: 全 ? 轴.总数 : 轴.场景数,
              全部数: 轴.全部数,
              场景数: 轴.场景数,
              存疑数: 轴.存疑数,
              年代数: 轴.年代数,
              覆盖剧情: 轴.覆盖剧情,
              覆盖小节: 轴.覆盖小节,
              起: 轴.起,
              止: 轴.止,
              年表,
              年代: 年代表,
              存疑: 全 ? 轴.存疑 : [],
            })
          }

          if (路径 === '/world' && req.method === 'GET') {
            return 发JSON(res, 200, { ok: true, groups: 世界分组() })
          }

          if (路径 === '/cast' && req.method === 'GET') {
            return 发JSON(res, 200, {
              ok: true,
              cast: 人物榜(索, { limit: Math.min(500, Number(参数.get('limit')) || 120) }),
            })
          }

          if (路径 === '/digest' && req.method === 'GET') {
            const 目标 = 参数.get('target') ?? ''
            return 发JSON(res, 200, { ok: true, ...速览(索, 目标, { limit: Math.min(200, Number(参数.get('limit')) || 80) }) })
          }

          if (路径 === '/episode' && req.method === 'GET') {
            const 原标识 = 参数.get('id') ?? ''
            let 标识 = 原标识
            let 块号 = null
            const 块匹配 = 原标识.match(/^(.+)#(\d+)$/)
            if (块匹配) { 标识 = 块匹配[1]; 块号 = Number(块匹配[2]) }
            const { 精确, 匹配 } = 找剧集(索, 标识)
            if (!精确) return 发JSON(res, 404, { ok: false, error: '找不到剧集', candidates: 匹配.map((e) => ({ id: e.id, label: e.label })) })
            const 块参数 = 参数.get('chunk')
            let 起始 = Number(参数.get('offset')) || 0
            if (块号 != null) 起始 = Math.max(0, 块前段数(精确, 块号) - 1)
            else if (块参数 != null && 块参数 !== '') 起始 = Math.max(0, 块前段数(精确, Number(块参数)) - 1)
            const 读数 = 读剧集(索, 精确, { offset: 起始, limit: Number(参数.get('limit')) || 400 })
            return 发JSON(res, 200, {
              ok: true,
              episode: { id: 精确.id, category: 精确.category, story: 精确.story, title: 精确.title, meta: 精确.meta, label: 精确.label, chunks: 精确.chunks.length },
              chunk: 块号,
              ...读数,
            })
          }

          return 发JSON(res, 404, { ok: false, error: '未知接口：' + 路径 })
        } catch (e) {
          return 发JSON(res, 500, { ok: false, error: (e && e.message) || String(e) })
        }
      },
    }), 'arknights-lore: /api/arknights-lore')
    日志('面板 API 已注册：/api/arknights-lore')
   } catch (e) {
    日志('注册 API 失败：' + (e && e.message))
   }
  })
}
