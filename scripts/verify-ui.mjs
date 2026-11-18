#!/usr/bin/env node
/**
 * verify-ui.mjs —— 不靠浏览器，把产物里的真实 JS 放进最小 DOM 里跑一遍：
 * 启动 → 首页渲染 → 输入检索 → 点结果进阅读器 → 继续读。
 *
 *   node scripts/verify-ui.mjs [dist/方舟剧情库.html]
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const 包根 = dirname(dirname(fileURLToPath(import.meta.url)))
const 文件 = resolve(process.argv[2] || join(包根, 'dist', '方舟剧情库.html'))
const html = readFileSync(文件, 'utf8')

function 取(label) {
  const re = new RegExp(`<script id="${label}"[^>]*>([\\s\\S]*?)<\\/script>`)
  const m = re.exec(html)
  return m ? m[1] : ''
}
function 取无标签() {
  const all = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  if (all.length < 2) throw new Error('找不到内联的检索/应用脚本')
  return all
}

// ---------------- 最小 DOM ----------------

const els = new Map()
function mkEl(id) {
  const classes = new Set()
  const el = {
    id,
    _html: '',
    _text: '',
    _ev: {},
    dataset: {},
    style: {},
    value: '',
    tagName: 'DIV',
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, on) => { if (on === undefined) { classes.has(c) ? classes.delete(c) : classes.add(c) } else if (on) classes.add(c); else classes.delete(c) },
      contains: (c) => classes.has(c),
    },
    addEventListener(t, f) { (el._ev[t] || (el._ev[t] = [])).push(f) },
    removeEventListener() {},
    focus() {}, blur() {}, select() {},
    closest() { return null },
    querySelector() { return null },
    appendChild() {}, removeChild() {},
  }
  Object.defineProperty(el, 'innerHTML', {
    get: () => el._html,
    set: (v) => {
      el._html = String(v)
      // 简易：把新出现的 id 登记进去，让后续 getElementById 能拿到
      for (const m of el._html.matchAll(/id="([\w-]+)"/g)) {
        if (!els.has(m[1])) els.set(m[1], mkEl(m[1]))
      }
    },
  })
  Object.defineProperty(el, 'textContent', {
    get: () => el._text,
    set: (v) => { el._text = String(v) },
  })
  return el
}
for (const id of ['app', 'boot-text', 'q', 'clear', 'theme', 'menu', 'filter', 'side', 'side-scroll', 'main', 'scrim', 'searchbox', 'lore-meta', 'lore-data']) {
  els.set(id, mkEl(id))
}
els.get('lore-meta')._text = 取('lore-meta')
els.get('lore-data')._text = 取('lore-data').replace(/\s+/g, '')
els.get('app')._html = '<div class="loading"><div id="boot-text"></div></div>'

const body = mkEl('body')
const documentStub = {
  documentElement: mkEl('html'),
  body,
  title: '',
  activeElement: { tagName: 'BODY' },
  getElementById: (id) => els.get(id) || null,
  querySelector: (sel) => (sel.startsWith('#') ? els.get(sel.slice(1)) || null : null),
  createElement: (tag) => mkEl('new-' + tag),
  addEventListener() {},
  head: mkEl('head'),
}

const store = new Map()
const localStorageStub = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}

const ctx = {
  document: documentStub,
  window: {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    scrollTo() {},
    addEventListener() {},
  },
  localStorage: localStorageStub,
  navigator: { clipboard: { writeText: () => Promise.resolve() } },
  history: { replaceState() {} },
  location: { hash: '' },
  setTimeout, clearTimeout, setInterval, clearInterval,
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  Blob, Response, DecompressionStream, Uint8Array, TextDecoder,
  console, JSON, Math, Date, RegExp, String, Number, Object, Array, Error, Promise, Map, Set, Intl,
  encodeURIComponent, decodeURIComponent,
}
ctx.globalThis = ctx
vm.createContext(ctx)

const scripts = 取无标签()
vm.runInContext(scripts[0], ctx, { filename: 'search.inline.js' })
vm.runInContext(scripts[1], ctx, { filename: 'app.inline.js' })

// ---------------- 等待与断言 ----------------

const 等 = (条件, 说明, ms = 15000) => new Promise((ok, bad) => {
  const t0 = Date.now()
  const tick = () => {
    let v = false
    try { v = 条件() } catch (e) { /* 继续等 */ }
    if (v) return ok()
    if (Date.now() - t0 > ms) return bad(new Error('超时：' + 说明))
    setTimeout(tick, 50)
  }
  tick()
})

const main = () => els.get('main')._html
const side = () => els.get('side-scroll')._html
const 含 = (s, 说明) => { if (!s.includes(说明)) throw new Error('未找到「' + 说明 + '」') }

let 步 = 0
const 记 = (t) => console.log(`  ${++步}. ${t}`)

try {
  await 等(() => main().length > 0, '首页渲染')
  含(main(), '方舟剧情库')
  含(side(), '主线剧情')
  记('启动完成，首页 + 目录已渲染')

  const q = els.get('q')
  q.value = '霜星 死亡'
  q._ev.input[0]()
  记('输入检索词「霜星 死亡」')

  await 等(() => main().includes('处场景'), '检索结果渲染', 8000)
  含(main(), '<mark>')
  含(main(), '局部坏死')
  记('结果列表含高亮与剧情路径')

  // 点第一条结果
  const click = els.get('main')._ev.click[0]
  click({ target: { closest: () => ({ dataset: { act: 'hit', id: 'E0121', chunk: '4' } }) } })
  记('点击第一条结果')

  await 等(() => main().includes('class="story"'), '阅读器渲染', 8000)
  含(main(), '霜星')
  含(main(), '返回')
  记('阅读器打开，正文已渲染')

  const before = main().length
  const more = els.get('main')._ev.click[0]
  more({ target: { closest: () => ({ dataset: { act: 'more' } }) } })
  await 等(() => main().length > before, '继续读', 5000)
  记('「继续读」追加成功')

  // 收藏
  const click2 = els.get('main')._ev.click[0]
  click2({ target: { closest: () => ({ dataset: { act: 'fav' } }) } })
  含(main(), '★ 已收藏')
  const 侧 = els.get('side-filter')._html
  含(侧, '收藏 · 1')
  记('收藏成功，侧栏计数 1')

  // 字号
  const 前字号 = main().match(/font-size:(\d+)px/)
  click2({ target: { closest: () => ({ dataset: { act: 'font+' } }) } })
  const 后字号 = main().match(/font-size:(\d+)px/)
  if (!前字号 || !后字号 || Number(后字号[1]) !== Number(前字号[1]) + 1) throw new Error('字号没变：' + 前字号 + ' → ' + 后字号)
  记(`字号 ${前字号[1]}px → ${后字号[1]}px`)

  // 复制（不应抛错）
  click2({ target: { closest: () => ({ dataset: { act: 'copy' } }) } })
  记('复制按钮无异常')

  // 分类筛选
  const 侧2 = els.get('side')._ev.click[0]
  侧2({ target: { closest: () => ({ dataset: { act: 'cat', cat: '活动剧情' } }) } })
  含(els.get('side-filter')._html, 'chip on')
  记('分类筛选切换正常')

  // 收藏列表
  const 侧3 = els.get('side')._ev.click[0]
  侧3({ target: { closest: () => ({ dataset: { act: 'favs' } }) } })
  含(main(), '收藏 1 条')
  记('收藏列表打开')

  // 回首页 + 深链
  const back = els.get('main')._ev.click[0]
  back({ target: { closest: () => ({ dataset: { act: 'back' } }) } })
  back({ target: { closest: () => ({ dataset: { act: 'home' } }) } })
  含(main(), '继续上次')
  记('回到首页，出现「继续上次」')

  // 别名检索：兔兔 → 阿米娅
  q.value = '兔兔'
  q._ev.input[0]()
  await 等(() => main().includes('处场景'), '别名检索', 8000)
  含(main(), '别名')
  含(main(), '阿米娅')
  记('别名检索：兔兔 → 阿米娅')

  // 14. 人物页签 → 人物档案
  const 侧栏 = els.get('side')._ev.click[0]
  侧栏({ target: { closest: () => ({ dataset: { act: 'mode', mode: 'cast' } }) } })
  await 等(() => side().includes('阿米娅'), '人物列表')
  侧栏({ target: { closest: () => ({ dataset: { act: 'profile', name: '霜星' } }) } })
  await 等(() => main().includes('次提及'), '档案渲染')
  含(main(), '所属')
  含(main(), '整合运动')
  记('人物档案：霜星 → 所属 整合运动')

  // 15. 世界页签 → 国家档案
  侧栏({ target: { closest: () => ({ dataset: { act: 'mode', mode: 'world' } }) } })
  await 等(() => side().includes('乌萨斯'), '世界列表')
  侧栏({ target: { closest: () => ({ dataset: { act: 'place', name: '乌萨斯', kind: '国家' } }) } })
  await 等(() => main().includes('国家'), '国家档案')
  记('世界档案：乌萨斯')

  // 16. 时间轴 + 年份精确搜索
  侧栏({ target: { closest: () => ({ dataset: { act: 'timeline' } }) } })
  await 等(() => main().includes('个时间点'), '时间轴渲染')
  含(main(), '远古与年代不明')
  含(main(), '1098 年')
  const yq = els.get('yearq')
  yq.value = '1098'
  yq._ev.input[0]()
  await 等(() => main().includes('1098 年') && !main().includes('1097 年'), '年份搜索')
  记('时间轴：远古组 + 年份精确搜索 1098')

  console.log('\nOK：独立版 UI 全链路通过')
} catch (e) {
  console.error('\nFAIL：' + e.message)
  console.error('当前主区内容片段：', main().slice(0, 400))
  process.exitCode = 1
}
