/**
 * 不装插件也能验的冒烟测试：拿假 ctx 跑 apply，再直接调工具和 HTTP 处理函数。
 * 用法：node scripts/smoke.mjs
 */
import { apply } from '../index.js'

const tools = new Map()
const routes = new Map()
const sections = []

const ctx = {
  effect(fn) { return fn() },
  get(name) {
    if (name === 'webServer') {
      return { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } }
    }
    if (name === 'systemPrompt') {
      return { section(s) { sections.push(s); return () => {} } }
    }
    return undefined
  },
  inject(deps, cb) {
    const scope = {
      effect: ctx.effect,
      get: ctx.get,
      tools: ctx.tools,
      logger: ctx.logger,
      systemPrompt: ctx.get('systemPrompt'),
      webServer: ctx.get('webServer'),
    }
    return cb(scope)
  },
  tools: { register(def) { tools.set(def.name, def); return () => tools.delete(def.name) } },
  logger: { info: (m) => console.log('  ·', m) },
}

const t0 = Date.now()
apply(ctx, {})
console.log(`apply 完成 ${Date.now() - t0}ms · 工具 ${[...tools.keys()].join(', ')} · 路由 ${[...routes.keys()].join(', ')} · 提示段 ${sections.length}`)

function 假res() {
  return {
    code: 0, body: '',
    writeHead(code) { this.code = code },
    end(t) { this.body = t },
  }
}
async function 取(url) {
  const res = 假res()
  await routes.get('/api/arknights-lore').handler({ url, method: 'GET' }, res)
  if (res.code !== 200) throw new Error(`HTTP ${res.code}: ${res.body}`)
  return JSON.parse(res.body)
}

// 1) 工具
for (const [name, args] of [
  ['ark_lore_index', {}],
  ['ark_lore_who', { name: '霜星', samples: 1 }],
  ['ark_lore_digest', { target: '局部坏死', limit: 3 }],
  ['ark_lore_search', { query: '巴别塔 特蕾西娅', limit: 3 }],
  ['ark_lore_search', { query: '凯尔希 +巴别塔', limit: 2 }],
]) {
  const 起 = Date.now()
  const out = await tools.get(name).execute(args)
  console.log(`\n[${name}] ${JSON.stringify(args)} → ${out.length} 字 ${Date.now() - 起}ms`)
  console.log(out.split('\n').slice(0, 9).map((l) => '   ' + l).join('\n'))
}

// 2) 从检索结果读整集
const 搜 = await 取('/api/arknights-lore/search?q=' + encodeURIComponent('霜星 博士') + '&limit=1')
const chunkId = 搜.hits[0].chunkId
console.log(`\n[read] chunkId=${chunkId}`)
const 读 = await tools.get('ark_lore_read').execute({ episode: chunkId, limit: 4 })
console.log(读.split('\n').slice(0, 10).map((l) => '   ' + l).join('\n'))

// 3) HTTP
const stats = await 取('/api/arknights-lore/stats')
console.log(`\n[stats] ${JSON.stringify(stats.stats)}`)
const cat = await 取('/api/arknights-lore/catalog')
console.log(`[catalog] ${cat.categories.length} 分类 / ${cat.categories.reduce((a, c) => a + c.stories.length, 0)} 剧情`)
const ep = await 取('/api/arknights-lore/episode?id=' + encodeURIComponent(chunkId))
console.log(`[episode] ${ep.episode.label} · 段 ${ep.offset + 1}-${ep.offset + ep.paragraphs.length}/${ep.totalParagraphs} · hasMore=${ep.hasMore}`)
const who = await 取('/api/arknights-lore/who?name=' + encodeURIComponent('凯尔希') + '&samples=1')
console.log(`[who] 凯尔希 ${who.total} 次 / ${who.episodeCount} 集 · 同场首位 ${who.coSpeakers[0]?.name}`)
const dig = await 取('/api/arknights-lore/digest?target=' + encodeURIComponent('冬逝'))
console.log(`[digest] ${dig.kind} ${dig.title ?? dig.story} · ${dig.paragraphs ?? dig.episodeCount}`)
