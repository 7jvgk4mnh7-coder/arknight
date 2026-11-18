#!/usr/bin/env node
/**
 * verify-client.mjs —— 不用浏览器，用「假 React + 钩子队列」把 client.js 的面板真跑一遍。
 * 目的是抓引用错误 / 结构错误（不是验样式）。
 *
 *   node scripts/verify-client.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const 包根 = dirname(dirname(fileURLToPath(import.meta.url)))
const 源码 = readFileSync(join(包根, 'client.js'), 'utf8')

let 队列 = []
let 钩子数 = 0

function 收集(node, out = []) {
  if (node == null || node === false || node === true) return out
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
  if (Array.isArray(node)) { for (const x of node) 收集(x, out); return out }
  if (node.props) {
    if (node.props.className) out.push('[' + node.props.className + ']')
    收集(node.props.children, out)
  }
  return out
}

function 造React() {
  return {
    createElement(type, props, ...children) {
      const p = Object.assign({}, props, { children })
      if (typeof type === 'function') return type(p)
      return { type: typeof type === 'string' ? type : String(type), props: p }
    },
    useState(init) {
      钩子数 += 1
      const v = 队列.length > 0 ? 队列.shift() : (typeof init === 'function' ? init() : init)
      return [v, function () {}]
    },
    useEffect() {},
    useMemo(fn) { return fn() },
    useRef() { return { current: null } },
    Component: class {},
  }
}

const 文档 = {
  getElementById: () => null,
  createElement: () => ({ style: {}, select() {}, value: '' }),
  head: { appendChild() {} },
  body: { appendChild() {}, removeChild() {} },
  execCommand() {},
}

let factory = null
const 上下文全局 = {
  window: { __ModuleLoader__: { load(o) { factory = o.factory } } },
  document: 文档,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  navigator: { clipboard: { writeText: () => Promise.resolve() } },
  fetch: () => Promise.reject(new Error('不该发请求')),
  console,
  setTimeout, clearTimeout,
  JSON, Math, Number, String, Object, Array, Error, Promise, Date, RegExp,
}
上下文全局.globalThis = 上下文全局
vm.createContext(上下文全局)
vm.runInContext(源码, 上下文全局, { filename: 'client.js' })

if (!factory) throw new Error('没抓到 __ModuleLoader__ 注册')
const mod = factory((name) => (name === 'react' ? 造React() : {}))

const 注册 = []
const 上下文 = {
  effect(fn) { return fn() },
  get() { return undefined },
  slots: { inject(_k, cb) { return cb() }, register(opts, comp) { 注册.push({ opts, comp }); return () => {} } },
}
mod.apply(上下文)

const 主面板 = 注册.find((r) => r.opts.name === 'main')
const 图标位 = 注册.find((r) => r.opts.name === 'sidebar.panellist')
if (!主面板) throw new Error('没注册 main 面板')
console.log(`注册：${注册.map((r) => r.opts.name + '/' + (r.opts.id || r.opts.key)).join(' · ')}`)

const 目录 = {
  stats: { episodes: 2061, chunks: 10459, chars: 10289589 },
  categories: [{
    name: '主线剧情',
    stories: [{ name: '局部坏死', no: 7, episodes: [{ id: 'E0125', title: '冬逝', meta: '6-17' }] }],
  }],
}
const 档案数据 = {
  name: '凯尔希', total: 7746, episodeCount: 396,
  first: { id: 'E0001', story: '黑暗时代·上', title: '序章·上' },
  last: { id: 'E2000', story: '亚叶 · 明日之前', title: '明日之前' },
  stories: [{ category: '主线剧情', story: '苦难摇篮', episodes: 17, mentions: 916 }],
  coSpeakers: [{ name: '阿米娅', episodes: 167, lines: 3000 }],
  affiliations: [{ name: '罗德岛', kind: '组织' }, { name: '巴别塔', kind: '组织' }],
  samples: [{ chunkId: 'E0169#1', episodeId: 'E0169', label: '怒号光明 / 恶言，报应不爽', snippet: '……' }],
}
const 速览数据 = {
  kind: 'story', category: '主线剧情', story: '局部坏死', episodeCount: 2, chars: 59000,
  episodes: [
    { id: 'E0100', title: '僵局', meta: '6-1 · 行动前', chars: 2100, speakers: ['煌'], opening: '埃里克勋爵…' },
    { id: 'E0101', title: '僵局', meta: '6-1 · 行动后', chars: 3800, speakers: ['阿米娅'], opening: '煌：还好…' },
  ],
}
const 读数 = {
  episode: { id: 'E0125', title: '冬逝', meta: '6-17 · 行动后', category: '主线剧情', story: '局部坏死', label: '主线剧情 / 局部坏死 / 冬逝' },
  offset: 0, paragraphs: ['霜星：碎了……吗。', '霜星：老爷子从某个巫师那里求得这样东西……'], totalParagraphs: 2, hasMore: false, chunk: null,
}

// 面板 21 个 useState 的初值顺序：
// catalog / catalogErr / stats / 侧栏模式 / 侧栏过滤 / 人物过滤 / 人物榜 / 输入 / 已搜 /
// 结果 / 检索中 / 分类 / 仅本剧情 / 浏览 / 阅读 / 档案 / 档案数据 / 展开 / 收藏 / 看收藏 / 字号
function 基() {
  return [目录, '', 目录.stats, 'catalog', '', '', null, '', false, '', null, false, '', false, null, null, null, null, { '主线剧情': true }, [], false, 16, '', null, '', {}, false, null, false, '', {}, true, {}, '']
}

function 渲染(标签, 队列值) {
  队列 = 队列值.slice()
  钩子数 = 0
  const 文本 = 收集(主面板.comp({})).join(' ')
  console.log(`\n[${标签}] ${文本.length} 字 · 钩子 ${钩子数}`)
  return 文本
}
const 要 = (文本, 关键字) => {
  for (const k of [].concat(关键字)) if (!文本.includes(k)) throw new Error('缺少「' + k + '」')
}

// 1 首页
let t = 渲染('首页', 基())
要(t, ['akl-hero', 'akl-card', '主线剧情', '浏览人物'])
console.log('  ✓ 首页卡片 / 入口')

// 1b 分类折叠：展开=主线时应有剧情行；全收起时不该有
if (!t.includes('akl-story')) throw new Error('主线默认展开，应该有剧情行')
const p = 基(); p[18] = {}
const 折叠文本 = 渲染('折叠', p)
要(折叠文本, ['akl-cat', '主线剧情', '▸'])
if (折叠文本.includes('akl-story')) throw new Error('全部收起时不该出现剧情行')
console.log('  ✓ 分类可折叠（默认展开主线）')

// 1c 检索范围条：默认藏着，聚焦搜索框才出现
if (!t.includes('akl-scope-row is-hidden')) throw new Error('默认应隐藏检索范围条')
const 焦点q = 基(); 焦点q[8] = true
const 焦点文本 = 渲染('搜索聚焦', 焦点q)
要(焦点文本, ['检索范围', '全部'])
if (焦点文本.includes('is-hidden')) throw new Error('聚焦后不该隐藏范围条')
console.log('  ✓ 检索范围条只在聚焦时出现')

// 1d 侧栏筛选框也有清空按钮
const 筛q = 基(); 筛q[4] = '局部'
const 筛文本 = 渲染('侧栏筛选', 筛q)
要(筛文本, ['akl-side-search', 'akl-clear'])
console.log('  ✓ 侧栏筛选框有 × 清空')

// 2 人物侧栏
let q = 基(); q[3] = 'cast'; q[6] = [{ name: '阿米娅', lines: 6883, episodes: 310 }, { name: '凯尔希', lines: 5936, episodes: 196 }]
t = 渲染('人物页', q)
要(t, ['akl-cast-row', '阿米娅', '凯尔希', 'akl-tab on'])
console.log('  ✓ 人物榜列表')

// 2b 世界页（国家/地区/组织）
const 世界q = 基(); 世界q[3] = 'world'; 世界q[23] = [{ 类: '国家', items: ['乌萨斯', '维多利亚'] }, { 类: '组织', items: ['罗德岛'] }]
const 世界文本 = 渲染('世界页', 世界q)
要(世界文本, ['akl-cat-name', '国家', '乌萨斯', '罗德岛', 'akl-tab on'])
console.log('  ✓ 世界页：国家/组织分组')

// 3 档案
q = 基(); q[16] = '凯尔希'; q[17] = 档案数据; q[24] = '人物'
t = 渲染('档案', q)
要(t, ['akl-name', 'akl-kind', '7746', '苦难摇篮', '阿米娅', '所属', '罗德岛', 'E0169#1', 'akl-bar-fill', 'akl-pill', 'akl-sample'])
console.log('  ✓ 档案：统计 / 分布条 / 同场 / 片段')

// 3b 时间轴
const 轴q = 基()
轴q[26] = true
轴q[28] = true
轴q[27] = {
  总数: 128, 全部数: 128, 场景数: 127, 覆盖剧情: 48, 覆盖小节: 157, 起: 150, 止: 1103,
  年表: [
    { 年: 1097, 条数: 1, 事件: [{ 年: 1097, 月: 11, 日: 28, 原文: '1097年11月28日', 时刻: '4:15P.M.', 场景: true, episodeId: 'E0100', chunkId: 'E0100#1', category: '主线剧情', story: '局部坏死', title: '僵局', meta: '6-1', label: 'x', text: '1097年11月28日 4:15 P.M.' }] },
    { 年: 1100, 条数: 1, 事件: [{ 年: 1100, 月: 11, 日: 8, 原文: '1100年11月8日', 时刻: '', 场景: true, episodeId: 'E0200', chunkId: 'E0200#0', category: '活动剧情', story: '揭幕者们', title: '无私铁棘', meta: 'L-1', label: 'y', text: '1100年11月8日' }] },
    { 年: 1038, 条数: 1, 事件: [{ 年: 1038, 月: 0, 日: 0, 原文: '1038年', 时刻: '', 场景: false, episodeId: 'E0300', chunkId: 'E0300#2', category: '活动剧情', story: '愚人号', title: '古井', meta: '', label: 'z', text: '阿玛雅：大静谧发生在1038年' }] },
  ],
   年代: [{ 桶: '远古', 条数: 1, 事件: [{ 桶: '远古', 词: '远古', 场景: 0, 约: false, episodeId: 'E0500', chunkId: 'E0500#0', category: '主线剧情', story: '怒号光明', title: '恶兆湍流', meta: '', label: 'w', text: '远古的传说' }] }],
   存疑: [{ 年: 150, 月: 0, 日: 0, 原文: '150年', 约: true, 存疑: true, 场景: false, episodeId: 'E0400', chunkId: 'E0400#0', category: '活动剧情', story: '反常光谱', title: '唯有坦途', meta: '', label: 'v', text: '尼克托：大概是150年' }],
}
const 轴文本 = 渲染('时间轴', 轴q)
要(轴文本, ['剧情时间轴', '1097 年', '1100 年', '11月28日', '4:15P.M.', '局部坏死', '含旁述提及', '旁述', '出自对话与旁述', '远古与年代不明', '远古的传说', '年份存疑', '约150年'])
console.log('  ✓ 时间轴：按年分组 + 日期/时刻/剧情')

// 3c 年份搜索 + 相近年份
const 年查q = 基(); 年查q[26] = true; 年查q[28] = true; 年查q[33] = '1100'
年查q[27] = 轴q[27]
const 年查文本 = 渲染('年份搜索', 年查q)
要(年查文本, ['1100'])
if (年查文本.includes('1038')) throw new Error('命中 1100 时不该显示 1038')
console.log('  ✓ 年份搜索：精确命中 1100')

// 3c2 精确匹配：搜「100」绝不能出 1100
const 部分q = 基(); 部分q[26] = true; 部分q[28] = true; 部分q[33] = '100'
部分q[27] = 轴q[27]
const 部分文本 = 渲染('前缀不该命中', 部分q)
if (部分文本.includes('1100')) throw new Error('搜 100 不该出现 1100')
要(部分文本, ['最接近的是'])
console.log('  ✓ 精确匹配：搜 100 不会命中 1100')

// 3d 搜不到年份 → 退回最近的两个
const 无q = 基(); 无q[26] = true; 无q[28] = true; 无q[33] = '1050'
无q[27] = 轴q[27]
const 无文本 = 渲染('无命中年份', 无q)
要(无文本, ['最接近的是', '1038', '1097'])
console.log('  ✓ 无命中：显示最接近的 1038 / 1097')

// 4 阅读器
q = 基(); q[15] = { episodeId: 'E0125', chunk: null }
q.push(读数, '', false, false)
t = 渲染('阅读器', q)
要(t, ['akl-story-body', '碎了……吗', '☆', '复制', 'A-', 'akl-spk'])
console.log('  ✓ 阅读器：正文 / 说话人可点 / 工具条')

// 6 检索结果
q = 基()
q[7] = '霜星'
q[9] = '霜星'
q[10] = { query: '霜星', units: ['霜星'], ms: 9, aliasText: '兔兔 → 阿米娅', character: { name: '阿米娅', query: '霜星', aliasText: '' }, hits: [{ chunkId: 'E0125#0', episodeId: 'E0125', label: 'x', category: '主线剧情', story: '局部坏死', title: '冬逝', meta: '6-17', score: 9.9, coverage: 1, snippet: '霜星：碎了……吗。', 前缀: false, 后缀: false }] }
t = 渲染('检索结果', q)
要(t, ['akl-hit', '档案「阿米娅」', '霜星', 'akl-alias', '兔兔 → 阿米娅', 'akl-clear'])
console.log('  ✓ 结果卡 + 别名标签 + 清空按钮')

// 6b 非人物查询（如「源石」）不该出现档案入口
const 非人 = 基()
非人[7] = '源石'
非人[9] = '源石'
非人[10] = { query: '源石', units: ['源石'], ms: 5, aliasText: '', character: null, hits: [{ chunkId: 'E0001#0', episodeId: 'E0001', label: 'x', category: '主线剧情', story: '黑暗时代·上', title: '序章·上', meta: '', score: 9, coverage: 1, snippet: '源石……', 前缀: false, 后缀: false }] }
const 非人文本 = 渲染('非人物检索', 非人)
if (非人文本.includes('档案「')) throw new Error('非人物查询不该有档案按钮')
console.log('  ✓ 非人物查询不显示档案')

// 6c 地名查询（如「切尔诺伯格」）应该给档案入口
const 地q = 基()
地q[7] = '切尔诺伯格'
地q[9] = '切尔诺伯格'
地q[10] = { query: '切尔诺伯格', units: ['切尔诺'], ms: 6, aliasText: '', character: null, place: { name: '切尔诺伯格', kind: '地区' }, hits: [{ chunkId: 'E0001#0', episodeId: 'E0001', label: 'x', category: '主线剧情', story: '黑暗时代·上', title: '序章·上', meta: '', score: 9, coverage: 1, snippet: '切尔诺伯格……', 前缀: false, 后缀: false }] }
const 地文本 = 渲染('地名检索', 地q)
要(地文本, ['档案「切尔诺伯格」'])
console.log('  ✓ 地名/国名/组织也能开档案')

// 7 收藏
q = 基(); q[19] = [{ id: 'E0125', chunk: null, title: '冬逝', label: '主线剧情 / 局部坏死 / 冬逝' }]; q[20] = true
t = 渲染('收藏', q)
要(t, ['akl-fav-item', '冬逝', '×'])
console.log('  ✓ 收藏列表')

// 8 剧情小节列表
q = 基(); q[14] = { category: '主线剧情', story: 目录.categories[0].stories[0] }
t = 渲染('小节列表', q)
要(t, ['akl-row', '冬逝', 'E0125'])
console.log('  ✓ 小节列表')

// 9 图标
const 图标树 = 图标位.comp({ size: 20, active: true })
if (!图标树) throw new Error('图标没渲染')
console.log('\n[图标] 渲染 OK（svg）')

console.log('\nOK：client.js 面板渲染无引用错误（9 个场景）')
