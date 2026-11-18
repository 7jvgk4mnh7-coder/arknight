/**
 * 方舟剧情库 · 独立版前端
 *
 * 数据内嵌在页面里（#lore-data 是 gzip+base64 的正文流，#lore-meta 是目录元数据），
 * 检索/阅读全部在本地完成：双击 HTML 就能用，不联网、不装东西。
 *
 * 检索算法来自 ../lib/search.mjs（构建时内联，函数在全局作用域）。
 */
(function () {
  'use strict'

  var $ = function (s, r) { return (r || document).querySelector(s) }
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  // ---------------- 状态 ----------------

  var FAV_KEY = 'akl-favs'
  var FONT_KEY = 'akl-font'

  var S = {
    view: 'home',          // home | results | reader | episodes | favs
    q: '',
    hits: null,
    units: [],
    ms: 0,
    alias: '',
    story: null,           // { cat, name, episodes }
    read: null,            // { id, start, shown }
    filter: '',
    theme: localStorage.getItem('akl-theme') || 'auto',
    cat: '',               // 检索范围：分类
    onlyStory: false,      // 检索范围：只看当前剧情
    favs: 读收藏(),
    font: 读字号(),
    mode: 'catalog',       // catalog | cast | world
    cast: null,            // 人物榜
    castFilter: '',
    worldFilter: '',
    profile: null,         // 档案：人物/地名
    profileKind: '',
    timeline: false,
    yearQ: '',
    eraOpen: true,
    bucket: {},
    yearOpen: {},
  }
  var DATA = null          // { index, episodes, categories }
  var EP = {}              // id -> episode

  // ---------------- 收藏 / 字号 ----------------

  function 读收藏() {
    try {
      var v = JSON.parse(localStorage.getItem(FAV_KEY) || '[]')
      return Array.isArray(v) ? v : []
    } catch (e) { return [] }
  }
  function 存收藏(list) {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(list.slice(0, 300))) } catch (e) { /* 无痕模式 */ }
  }
  function 读字号() {
    var n = Number(localStorage.getItem(FONT_KEY))
    return Number.isFinite(n) && n >= 12 && n <= 24 ? n : 16
  }
  function 记字号(n) {
    S.font = Math.min(22, Math.max(13, n))
    try { localStorage.setItem(FONT_KEY, String(S.font)) } catch (e) { /* ignore */ }
  }
  function 是收藏(id) {
    return S.favs.some(function (x) { return x.id === id })
  }
  function 切换收藏(ep, chunk) {
    if (是收藏(ep.id)) {
      S.favs = S.favs.filter(function (x) { return x.id !== ep.id })
    } else {
      S.favs = [{
        id: ep.id,
        chunk: chunk == null ? null : chunk,
        title: ep.title,
        label: ep.label || (ep.category + ' / ' + ep.story + ' / ' + ep.title),
        at: Date.now(),
      }].concat(S.favs)
    }
    存收藏(S.favs)
  }

  // ---------------- 主题 ----------------

  var mq = window.matchMedia('(prefers-color-scheme: dark)')
  function resolveTheme() {
    if (S.theme === 'light' || S.theme === 'dark') return S.theme
    return mq.matches ? 'dark' : 'light'
  }
  function applyTheme() {
    document.documentElement.dataset.theme = resolveTheme()
    var btn = $('#theme')
    if (btn) {
      btn.title = S.theme === 'auto' ? '跟随系统（点击切换）' : (S.theme === 'dark' ? '深色（点击切换）' : '浅色（点击切换）')
      btn.innerHTML = S.theme === 'auto' ? ICON.auto : (S.theme === 'dark' ? ICON.moon : ICON.sun)
    }
  }
  function cycleTheme() {
    S.theme = S.theme === 'auto' ? 'light' : S.theme === 'light' ? 'dark' : 'auto'
    localStorage.setItem('akl-theme', S.theme)
    applyTheme()
  }
  mq.addEventListener('change', function () { if (S.theme === 'auto') applyTheme() })

  // ---------------- 图标 ----------------

  var ICON = {
    search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.2-3.2"/></svg>',
    close: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    moon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.7 6.7 0 0 0 10.5 10.5z"/></svg>',
    sun: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>',
    auto: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/></svg>',
    menu: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    back: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    book: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 5c2.4-.9 5-.9 8 .8v12c-3-1.7-5.6-1.7-8-.8z"/><path d="M20 5c-2.4-.9-5-.9-8 .8v12c3-1.7 5.6-1.7 8-.8z"/></svg>',
    clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/></svg>',
  }

  // ---------------- 高亮 ----------------

  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

  function makeRe(units) {
    var w = (units || []).filter(function (u) { return u && u.length > 0 })
    if (w.length === 0) return null
    w = w.slice().sort(function (a, b) { return b.length - a.length })
    try { return new RegExp('(' + w.map(escRe).join('|') + ')', 'gi') } catch (e) { return null }
  }

  function hl(text, re) {
    if (!re) return esc(text)
    var parts = String(text).split(re)
    if (parts.length === 1) return esc(text)
    var out = ''
    for (var i = 0; i < parts.length; i++) {
      out += i % 2 === 1 ? '<mark>' + esc(parts[i]) + '</mark>' : esc(parts[i])
    }
    return out
  }

  function para(text, re) {
    var m = /^([^\s：:]{1,16})([：:])([\s\S]*)$/.exec(text)
    if (!m) return hl(text, re)
    return '<span class="spk">' + esc(m[1] + m[2]) + '</span>' + hl(m[3], re)
  }

  // ---------------- 数据加载 ----------------

  function progress(t) {
    var e = $('#boot-text')
    if (e) e.textContent = t
  }

  function b64ToBytes(b64) {
    var bin = atob(b64)
    var out = new Uint8Array(bin.length)
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }

  function gunzip(bytes) {
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('这个浏览器不支持 DecompressionStream，请用较新的 Chrome / Edge / Firefox'))
    }
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
    return new Response(stream).text()
  }

  function rebuild(meta, text) {
    var pieces = text.split('\u0000')
    var episodes = []
    var p = 0
    for (var i = 0; i < meta.eps.length; i++) {
      var e = meta.eps[i]
      var chunks = []
      for (var k = 0; k < e[4]; k++) chunks.push({ text: pieces[p++] })
      var id = 'E' + String(i + 1).padStart(4, '0')
      var ep = {
        id: id, category: e[0], story: e[1], storyNo: 0, title: e[2], meta: e[3],
        label: e[0] + ' / ' + e[1] + ' / ' + e[2] + (e[3] ? '（' + e[3] + '）' : ''),
        chunks: chunks,
      }
      episodes.push(ep)
      EP[id] = ep
    }
    // 语料是按分类、剧情顺序写的，顺序扫描即得目录
    var categories = []
    for (var j = 0; j < episodes.length; j++) {
      var ep = episodes[j]
      var cat = categories[categories.length - 1]
      if (!cat || cat.name !== ep.category) {
        cat = { name: ep.category, stories: [] }
        categories.push(cat)
      }
      var st = cat.stories[cat.stories.length - 1]
      if (!st || st.name !== ep.story) {
        st = { name: ep.story, no: cat.stories.length + 1, episodes: [] }
        cat.stories.push(st)
      }
      st.episodes.push({ id: ep.id, title: ep.title, meta: ep.meta })
    }
    return {
      meta: meta,
      episodes: episodes,
      categories: categories,
      index: 建索引({ episodes: episodes, categories: categories, stats: meta.stats, builtAt: meta.builtAt }),
    }
  }

  function boot() {
    var metaEl = document.getElementById('lore-meta')
    var dataEl = document.getElementById('lore-data')
    if (!metaEl || !dataEl) throw new Error('页面缺少数据块')
    var meta
    try { meta = JSON.parse(metaEl.textContent) } catch (e) { throw new Error('元数据解析失败：' + e.message) }
    var b64 = dataEl.textContent.replace(/\s+/g, '')
    progress('正在解压剧情文本…')
    setTimeout(function () {
      var bytes
      try { bytes = b64ToBytes(b64) } catch (e) { return fail('数据解码失败：' + e.message) }
      gunzip(bytes).then(function (text) {
        progress('正在建立检索索引…')
        setTimeout(function () {
          try {
            DATA = rebuild(meta, text)
          } catch (e) {
            return fail('索引构建失败：' + e.message)
          }
          document.title = '方舟剧情库'
          mount()
        }, 16)
      }).catch(function (e) { fail('解压失败：' + e.message) })
    }, 30)
  }

  function fail(msg) {
    var app = $('#app')
    if (!app) return
    app.innerHTML = '<div class="err"><b>没能打开剧情库</b><p>' + esc(msg) + '</p>'
      + '<p style="color:var(--dim)">如果文件下载不完整，重新拷一份完整的 HTML 再试。</p></div>'
  }

  // ---------------- 骨架 ----------------

  function mount() {
    var app = $('#app')
    app.innerHTML =
      '<div class="top">'
      + '<button class="iconbtn menu-btn" id="menu" title="目录">' + ICON.menu + '</button>'
      + '<div class="brand"><h1>方舟剧情库</h1><div class="stat">' + statText() + '</div></div>'
      + '<div class="search" id="searchbox">'
      + '<span class="ico">' + ICON.search + '</span>'
      + '<input id="q" type="search" autocomplete="off" spellcheck="false" placeholder="搜人名、势力、地点，或台词里的一句话…（按 / 聚焦）">'
      + '<button class="clear" id="clear" title="清空">' + ICON.close + '</button>'
      + '</div>'
      + '<button class="iconbtn" id="theme" title="主题"></button>'
      + '</div>'
      + '<div class="wrap">'
      + '<aside class="side" id="side">'
      + '<div class="tabs" id="side-tabs">'
      + '<button class="tab" id="tab-catalog" data-act="mode" data-mode="catalog">目录</button>'
      + '<button class="tab" id="tab-cast" data-act="mode" data-mode="cast">人物</button>'
      + '<button class="tab" id="tab-world" data-act="mode" data-mode="world">世界</button>'
      + '</div>'
      + '<div class="filter"><div class="fwrap">'
      + '<input id="filter" placeholder="筛选剧情…" autocomplete="off">'
      + '<button class="fclear" id="fclear" type="button" title="清空筛选">×</button>'
      + '</div></div>'
      + '<div class="side-tools" id="side-filter"></div>'
      + '<div class="scroll" id="side-scroll"></div>'
      + '</aside>'
      + '<main class="main" id="main"></main>'
      + '</div>'
      + '<div class="scrim" id="scrim"></div>'
      + '<div class="toast" id="toast"></div>'
      + '<div class="updbar" id="updbar">'
      + '<div class="updlbl" id="updlbl">正在下载…</div>'
      + '<div class="updtrack"><div class="updfill" id="updfill"></div></div>'
      + '</div>'

    applyTheme()
    bind()
    renderSide()
    renderMain()

    // 深链：#ep=E0123 打开某一集；#q=霜星 直接出检索结果
    var deep = readHash()
    if (deep && deep.ep && EP[deep.ep]) {
      openEp(deep.ep, null)
    } else if (deep && deep.q) {
      var box = $('#q')
      box.value = deep.q
      $('#searchbox').classList.add('has-value')
      runSearch(deep.q)
    }
  }

  function statText() {
    var st = DATA.meta.stats || {}
    return st.episodes + ' 小节 · ' + st.chunks + ' 个场景 · ' + Math.round((st.chars || 0) / 10000) + ' 万字'
  }

  // ---------------- 在线更新 ----------------

  function 当前版本() {
    var m = /[?&]ver=([^&]*)/.exec(location.search || '')
    return m ? decodeURIComponent(m[1]) : '网页版'
  }

  function toast(文字, 毫秒) {
    var el = $('#toast')
    if (!el) return
    el.textContent = 文字
    el.style.display = 'block'
    clearTimeout(el._t)
    el._t = setTimeout(function () { el.style.display = 'none' }, 毫秒 || 4000)
  }

  // ---- 下载进度条 ----
  var 进度定时 = null

  function 显示进度(文字) {
    var bar = $('#updbar')
    if (!bar) return
    bar.style.display = 'block'
    $('#updlbl').textContent = 文字 || '正在下载…'
    $('#updfill').style.width = '0%'
    clearTimeout(进度定时)
  }

  function 设置进度(已收, 总数) {
    var bar = $('#updbar')
    if (!bar) return
    bar.style.display = 'block'
    var 百分比 = 总数 > 0 ? Math.min(100, Math.round((已收 / 总数) * 100)) : 0
    $('#updfill').style.width = 百分比 + '%'
    var 已 = (已收 / 1048576).toFixed(1)
    var 总 = 总数 > 0 ? (总数 / 1048576).toFixed(1) + ' MB' : '? MB'
    $('#updlbl').textContent = '正在下载 ' + 已 + ' / ' + 总 + ' · ' + 百分比 + '%'
  }

  function 结束进度(文字, 毫秒) {
    var bar = $('#updbar')
    if (!bar) return
    if (文字) $('#updlbl').textContent = 文字
    $('#updfill').style.width = '100%'
    clearTimeout(进度定时)
    进度定时 = setTimeout(function () { bar.style.display = 'none' }, 毫秒 || 2500)
  }

  function 更新通道() {
    if (window.arkUpdate) return 'android'
    if (window.chrome && window.chrome.webview) return 'pc'
    return null
  }

  function 处理更新结果(r) {
    if (!r || !r.ok) { toast('检查失败：' + ((r && r.error) || '网络不通')); return }
    if (!r.newer) { toast('已是最新版本（' + r.current + '）'); return }
    var 大小 = r.size ? '（' + (r.size / 1048576).toFixed(1) + ' MB）' : ''
    if (!window.confirm('发现新版本 ' + r.latest + 大小 + '\n' + (r.notes || '') + '\n\n现在下载并更新？')) return
    显示进度('准备下载 ' + r.latest + '…')
    var ch = 更新通道()
    if (ch === 'android') window.arkUpdate.apply()
    else window.chrome.webview.postMessage(JSON.stringify({ type: 'do-update' }))
  }

  function 检查更新() {
    var ch = 更新通道()
    if (!ch) {
      toast('网页版请重新下载 HTML；桌面版和安卓版支持在线更新', 6000)
      return
    }
    toast('检查更新中…', 15000)
    if (ch === 'android') {
      window.__arkUpdate = {
        result: function (r) { 处理更新结果(r) },
        progress: function (p) { 设置进度((p && p.received) || 0, (p && p.total) || 0) },
        done: function (r) {
          if (r && r.ok) {
            结束进度('更新完成，正在重新加载…', 4000)
          } else {
            结束进度('')
            $('#updbar').style.display = 'none'
            toast('更新失败：' + ((r && r.error) || '未知错误'), 8000)
          }
        },
      }
      try { window.arkUpdate.check() } catch (e) { toast('更新通道不可用') }
    } else {
      window.chrome.webview.postMessage(JSON.stringify({ type: 'check-update' }))
    }
  }

  function bindUpdate() {
    if (!(window.chrome && window.chrome.webview && window.chrome.webview.addEventListener)) return
    window.chrome.webview.addEventListener('message', function (e) {
      var r = e && e.data
      if (typeof r === 'string') { try { r = JSON.parse(r) } catch (err) { return } }
      if (!r || !r.type) return
      if (r.type === 'update-result') {
        if (r.silent) {
          if (r.ok && r.newer) toast('有新版本 ' + r.latest + '，可在首页点「检查更新」', 6000)
          return
        }
        处理更新结果(r)
      } else if (r.type === 'update-progress') {
        设置进度(r.received || 0, r.total || 0)
      } else if (r.type === 'update-done') {
        if (r.ok) {
          结束进度('更新完成，正在重新加载…', 4000)
        } else {
          var bar = $('#updbar')
          if (bar) bar.style.display = 'none'
          toast('更新失败：' + (r.error || '未知错误'), 8000)
        }
      }
    })
  }

  function bind() {
    bindUpdate()
    var q = $('#q')
    var timer = null
    q.addEventListener('input', function () {
      var v = q.value
      $('#searchbox').classList.toggle('has-value', v.length > 0)
      clearTimeout(timer)
      timer = setTimeout(function () { runSearch(v) }, 130)
    })
    q.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { q.value = ''; $('#searchbox').classList.remove('has-value'); runSearch(''); q.blur() }
      if (e.key === 'Enter') { clearTimeout(timer); runSearch(q.value) }
    })
    $('#clear').addEventListener('click', function () {
      q.value = ''
      $('#searchbox').classList.remove('has-value')
      runSearch('')
      q.focus()
    })
    $('#theme').addEventListener('click', cycleTheme)
    $('#menu').addEventListener('click', function () { document.body.classList.toggle('side-open') })
    $('#scrim').addEventListener('click', function () { document.body.classList.remove('side-open') })

    var f = $('#filter')
    var fc = $('#fclear')
    function 刷新清空() {
      if (fc) fc.style.display = f.value ? 'flex' : 'none'
    }
    f.addEventListener('input', function () {
      if (S.mode === 'cast') S.castFilter = f.value
      else if (S.mode === 'world') S.worldFilter = f.value
      else S.filter = f.value
      刷新清空()
      renderSide()
    })
    if (fc) {
      fc.addEventListener('click', function () {
        f.value = ''
        if (S.mode === 'cast') S.castFilter = ''
        else if (S.mode === 'world') S.worldFilter = ''
        else S.filter = ''
        刷新清空()
        renderSide()
        f.focus()
      })
      刷新清空()
    }

    bindYearQ()

    $('#side').addEventListener('click', onClick)
    $('#main').addEventListener('click', onClick)

    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && document.activeElement !== q && !/input|textarea/i.test(document.activeElement.tagName)) {
        e.preventDefault(); q.focus(); q.select()
      }
    })
  }

  // ---------------- 路由 ----------------

  function go(next) {
    for (var k in next) S[k] = next[k]
    renderMain()
    window.scrollTo(0, 0)
    document.body.classList.remove('side-open')
  }

  function onClick(e) {
    var t = e.target.closest('[data-act]')
    if (!t) return
    var act = t.dataset.act
    if (act === 'story') {
      var cat = t.dataset.cat
      var name = t.dataset.story
      var found = null
      DATA.categories.forEach(function (c) {
        if (c.name !== cat) return
        c.stories.forEach(function (s) { if (s.name === name) found = s })
      })
      if (found) go({ view: 'episodes', story: { cat: cat, name: name, episodes: found.episodes }, hits: null })
    } else if (act === 'ep') {
      openEp(t.dataset.id, t.dataset.chunk ? Number(t.dataset.chunk) : null)
    } else if (act === 'hit') {
      openEp(t.dataset.id, Number(t.dataset.chunk))
    } else if (act === 'mode') {
      S.mode = t.dataset.mode
      if (S.mode === 'cast' && !S.cast) S.cast = 人物榜(DATA.index, { limit: 200 })
      renderSide()
    } else if (act === 'profile') {
      go({ view: 'profile', profile: t.dataset.name, profileKind: '' })
    } else if (act === 'place') {
      go({ view: 'profile', profile: t.dataset.name, profileKind: t.dataset.kind || '' })
    } else if (act === 'timeline') {
      go({ view: 'timeline' })
    } else if (act === 'back2') {
      go({ view: 'home' })
    } else if (act === 'wbucket') {
      var wk = 'w-' + t.dataset.k
      S.bucket[wk] = S.bucket[wk] === false ? true : false
      renderSide()
    } else if (act === 'era') {
      S.eraOpen = S.eraOpen === false ? true : false
      renderMain()
    } else if (act === 'bucket') {
      var bk = t.dataset.k
      var 原先 = S.bucket[bk] === undefined ? (bk === '远古' || bk === '存疑') : S.bucket[bk]
      S.bucket[bk] = !原先
      renderMain()
    } else if (act === 'yearopen') {
      var yy = t.dataset.y
      S.yearOpen[yy] = S.yearOpen[yy] === false ? true : false
      renderMain()
    } else if (act === 'yearclear') {
      S.yearQ = ''
      renderMain()
    } else if (act === 'update') {
      检查更新()
    } else if (act === 'home') {
      go({ view: 'home', hits: null, story: null, read: null })
      setHash('#')
    } else if (act === 'back') {
      if (S.view === 'favs') { go({ view: 'home', read: null }); return }
      go({ view: S.q ? 'results' : (S.story ? 'episodes' : 'home'), read: null })
    } else if (act === 'more') {
      S.read.shown += 80
      renderMain()
    } else if (act === 'prev' || act === 'next') {
      openEp(t.dataset.id, null)
    } else if (act === 'resume') {
      var last = lastRead()
      if (last) openEp(last.id, null)
    } else if (act === 'random') {
      var i = Math.floor(Math.random() * DATA.episodes.length)
      openEp(DATA.episodes[i].id, null)
    } else if (act === 'cat') {
      var c = t.dataset.cat || ''
      S.cat = S.cat === c ? '' : c
      renderSide()
      if (S.q) runSearch(S.q)
    } else if (act === 'only') {
      S.onlyStory = !S.onlyStory
      renderSide()
      if (S.q) runSearch(S.q)
    } else if (act === 'favs') {
      var q0 = $('#q')
      if (q0) { q0.value = ''; $('#searchbox').classList.remove('has-value') }
      S.q = ''
      S.hits = null
      go({ view: S.view === 'favs' ? 'home' : 'favs', read: null })
    } else if (act === 'fav') {
      var ep = EP[S.read.id]
      if (ep) { 切换收藏(ep, S.read.chunk); renderMain(); renderSide() }
    } else if (act === 'fav-del') {
      S.favs = S.favs.filter(function (x) { return x.id !== t.dataset.id })
      存收藏(S.favs)
      renderMain()
      renderSide()
    } else if (act === 'font+') {
      记字号(S.font + 1)
      renderMain()
    } else if (act === 'font-') {
      记字号(S.font - 1)
      renderMain()
    } else if (act === 'copy') {
      copyReader()
    }
  }

  function copyReader() {
    var ep = EP[S.read.id]
    if (!ep) return
    var read = 读剧集(DATA.index, ep, { offset: S.read.start, limit: S.read.shown })
    var text = ep.label + '\n\n' + read.paragraphs.join('\n\n')
    var done = function () {
      var bar = $('#copy-tip')
      if (bar) {
        bar.textContent = '已复制本页 ' + read.paragraphs.length + ' 段'
        setTimeout(function () { if (bar.textContent) bar.textContent = '' }, 1800)
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text); done() })
    } else {
      fallbackCopy(text)
      done()
    }
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    } catch (e) { /* ignore */ }
  }

  function lastRead() {
    try {
      var raw = localStorage.getItem('akl-last')
      if (!raw) return null
      var v = JSON.parse(raw)
      if (!v || !EP[v.id]) return null
      return v
    } catch (e) { return null }
  }

  function openEp(id, chunk) {
    var ep = EP[id]
    if (!ep) return
    var start = 0
    if (chunk != null) {
      for (var i = 0; i < chunk && i < ep.chunks.length; i++) {
        start += ep.chunks[i].text.split(/\n{2,}/).filter(function (x) { return x.trim() }).length
      }
      start = Math.max(0, start - 1)
    }
    S.read = { id: id, start: start, shown: 70, chunk: chunk == null ? null : chunk }
    S.view = 'reader'
    try { localStorage.setItem('akl-last', JSON.stringify({ id: id, at: Date.now() })) } catch (e) { /* 无痕模式 */ }
    renderMain()
    window.scrollTo(0, 0)
    document.body.classList.remove('side-open')
    setHash('#ep=' + id)
  }

  // ---------------- 深链 ----------------
  // #q=关键词 直接出检索结果；#ep=E0123 直接打开某一集。方便分享「就这段」。

  function setHash(h) {
    try { history.replaceState(null, '', h) } catch (e) { /* file:// 下个别浏览器不给改，忽略 */ }
  }

  function readHash() {
    var raw = String(location.hash || '')
    var mq = /[#&]q=([^&]*)/.exec(raw)
    if (mq) {
      try { return { q: decodeURIComponent(mq[1]) } } catch (e) { return { q: mq[1] } }
    }
    var me = /[#&]ep=(E\d{1,5})/i.exec(raw)
    if (me) return { ep: me[1].toUpperCase() }
    return null
  }

  // ---------------- 检索 ----------------

  function runSearch(raw) {
    var q = String(raw || '').trim()
    S.q = q
    if (q === '') {
      S.hits = null; S.units = []
      if (S.view === 'results') S.view = S.story ? 'episodes' : 'home'
      renderMain()
      return
    }
    var 选项 = {
      limit: 20,
      category: S.cat || '',
      story: S.onlyStory && S.story ? S.story.name : '',
    }
    var 解 = 解析别名(q)
    var r
    if (解.命中) {
      // 别名：正名和原名各搜一次，同块取高分
      var a = 检索(DATA.index, 解.正式, 选项)
      var b = 检索(DATA.index, q, 选项)
      var 表 = {}
      a.hits.concat(b.hits).forEach(function (h) {
        if (!表[h.chunkId] || h.score > 表[h.chunkId].score) 表[h.chunkId] = h
      })
      r = {
        hits: Object.keys(表).map(function (k) { return 表[k] })
          .sort(function (x, y) { return y.score - x.score })
          .slice(0, 选项.limit),
        单位: a.单位,
        用时: a.用时 + b.用时,
      }
      S.alias = 别名说明(解.列表)
    } else {
      r = 检索(DATA.index, q, 选项)
      S.alias = ''
    }
    S.hits = r.hits
    S.units = r.单位
    S.ms = r.用时
    S.view = 'results'
    renderMain()
    setHash('#q=' + encodeURIComponent(q))
  }

  // ---------------- 渲染：左侧目录 ----------------

  var 分类表 = ['主线剧情', '活动剧情', '故事集', '干员密录']

  function 当前过滤() {
    return S.mode === 'cast' ? S.castFilter : (S.mode === 'world' ? S.worldFilter : S.filter)
  }

  function renderSide() {
    var box = $('#side-scroll')
    if (!box) return
    var 顶部 = $('#side-filter')
    var input = $('#filter')
    var filter = 当前过滤().trim()
    var cur = S.story && S.story.name
    var html = ''

    ;['catalog', 'cast', 'world'].forEach(function (m) {
      var b = $('#tab-' + m)
      if (b) b.className = 'tab' + (S.mode === m ? ' on' : '')
    })
    if (input) {
      input.placeholder = S.mode === 'cast' ? '筛选人物…' : (S.mode === 'world' ? '筛选国家 / 地区 / 组织…' : '筛选剧情…')
      input.value = 当前过滤()
    }

    if (S.mode === 'cast') {
      if (!S.cast) {
        box.innerHTML = '<div class="empty" style="padding:30px 0">正在统计人物…</div>'
        return
      }
      var 名单 = S.cast.filter(function (x) { return !filter || x.name.indexOf(filter) >= 0 })
      html = 名单.map(function (x, i) {
        return '<button class="row" data-act="profile" data-name="' + esc(x.name) + '">'
          + '<span class="rank">' + (i + 1) + '</span>'
          + '<span class="nm">' + esc(x.name) + '</span><span class="n">' + x.episodes + ' 集</span></button>'
      }).join('')
      box.innerHTML = html || '<div class="empty" style="padding:30px 0">—</div>'
      return
    }

    if (S.mode === 'world') {
      var 组 = 世界分组()
      html = 组.map(function (g) {
        var 项 = g.items.filter(function (n) { return !filter || n.indexOf(filter) >= 0 })
        if (项.length === 0) return ''
        var 开 = filter.length > 0 || S.bucket['w-' + g.类] !== false
        var s = '<button class="catbtn' + (开 ? ' open' : '') + '" data-act="wbucket" data-k="' + esc(g.类) + '">'
          + '<span class="caret">▸</span><span class="cn">' + esc(g.类) + '</span><span class="num">' + 项.length + '</span></button>'
        if (开) {
          s += 项.map(function (n) {
            return '<button class="row" data-act="place" data-name="' + esc(n) + '" data-kind="' + esc(g.类) + '">'
              + '<span class="nm">' + esc(n) + '</span></button>'
          }).join('')
        }
        return s
      }).join('')
      box.innerHTML = html || '<div class="empty" style="padding:30px 0">—</div>'
      return
    }

    // 目录
    var scope = ''
    if (顶部) {
      scope = '<div class="scope">'
      scope += '<button class="chip' + (S.cat === '' ? ' on' : '') + '" data-act="cat" data-cat="">全部</button>'
      分类表.forEach(function (c) {
        scope += '<button class="chip' + (S.cat === c ? ' on' : '') + '" data-act="cat" data-cat="' + esc(c) + '" title="只搜「' + esc(c) + '」">' + esc(c.replace('剧情', '')) + '</button>'
      })
      scope += '</div>'
      if (S.story) {
        scope += '<label class="tog"><input type="checkbox" data-act="only"' + (S.onlyStory ? ' checked' : '') + '> 只搜「' + esc(S.story.name) + '」</label>'
      }
      scope += '<button class="favrow' + (S.view === 'favs' ? ' on' : '') + '" data-act="favs">★ 收藏 · ' + S.favs.length + '</button>'
      顶部.innerHTML = scope
    }

    DATA.categories.forEach(function (cat) {
      var list = cat.stories.filter(function (s) { return !filter || s.name.indexOf(filter) >= 0 })
      if (list.length === 0) return
      html += '<div class="cat">' + esc(cat.name) + ' · ' + list.length + '</div>'
      list.forEach(function (s) {
        var on = s.name === cur && S.story.cat === cat.name
        html += '<button class="row' + (on ? ' on' : '') + '" data-act="story" data-cat="' + esc(cat.name) + '" data-story="' + esc(s.name) + '">'
          + '<span class="nm">' + esc(s.name) + '</span><span class="n">' + s.episodes.length + '</span></button>'
      })
    })
    box.innerHTML = html || '<div class="empty" style="padding:30px 0">没有匹配的剧情</div>'
  }

  // ---------------- 渲染：正文区 ----------------

  function renderMain() {
    var main = $('#main')
    if (!main) return
    if (S.view === 'reader') main.innerHTML = viewReader()
    else if (S.view === 'profile') main.innerHTML = viewProfile()
    else if (S.view === 'timeline') main.innerHTML = viewTimeline()
    else if (S.view === 'episodes') main.innerHTML = viewEpisodes()
    else if (S.view === 'results') main.innerHTML = viewResults()
    else if (S.view === 'favs') main.innerHTML = viewFavs()
    else main.innerHTML = viewHome()
    bindYearQ()
  }

  // 年份搜索框每次渲染都会重建，渲染完挂一次监听
  function bindYearQ() {
    var yq = $('#yearq')
    if (!yq) return
    yq.addEventListener('input', function () {
      S.yearQ = yq.value
      renderMain()
      var n = $('#yearq')
      if (n) {
        n.focus()
        try { n.setSelectionRange(n.value.length, n.value.length) } catch (e) { }
      }
    })
  }

  // ---------------- 档案 ----------------

  function viewProfile() {
    var 名 = S.profile
    var 档 = 人物档案(DATA.index, 名)
    var 类 = S.profileKind || 查地点(名) || ''
    if (!档.total) {
      return '<div class="bar"><button class="btn" data-act="back2">返回</button></div>'
        + '<div class="empty">剧情库里没有「' + esc(名) + '」。</div>'
    }
    var 最多 = 档.stories.length > 0 ? 档.stories[0].mentions : 1
    var 所 = 查所属(名)

    var html = '<div class="bar"><button class="btn" data-act="back2">返回</button>'
      + '<span style="opacity:.7">' + 档.total + ' 次提及 · ' + 档.episodeCount + ' 小节 · ' + 档.stories.length + ' 个剧情</span></div>'
    html += '<div class="pname">' + esc(档.name) + (类 ? '<span class="kind">' + esc(类) + '</span>' : '') + '</div>'

    if (所.length > 0) {
      html += '<div class="sec">所属</div><div class="pills">'
      html += 所.map(function (n) {
        var k = 查地点(n) || ''
        return '<button class="pill" data-act="place" data-name="' + esc(n) + '" data-kind="' + esc(k) + '">' + esc(n) + '</button>'
      }).join('')
      html += '</div>'
    }

    if (档.stories.length > 0) {
      html += '<div class="sec">剧情分布</div>'
      html += 档.stories.slice(0, 10).map(function (s) {
        var w = Math.max(3, Math.round((s.mentions / 最多) * 100))
        return '<div class="brow" data-act="story" data-cat="' + esc(s.category) + '" data-story="' + esc(s.story) + '">'
          + '<span class="bn">' + esc(s.story) + '</span>'
          + '<span class="bt"><span class="bf" style="width:' + w + '%"></span></span>'
          + '<span class="bv">' + s.mentions + ' 次</span></div>'
      }).join('')
    }

    if (档.coSpeakers.length > 0) {
      html += '<div class="sec">常同场</div><div class="pills">'
      html += 档.coSpeakers.map(function (c) {
        return '<button class="pill" data-act="profile" data-name="' + esc(c.name) + '">' + esc(c.name) + '<i>' + c.episodes + ' 集</i></button>'
      }).join('')
      html += '</div>'
    }

    if (档.samples.length > 0) {
      html += '<div class="sec">代表片段</div>'
      html += 档.samples.map(function (s) {
        return '<button class="sample" data-act="ep" data-id="' + esc(s.episodeId) + '">'
          + '<div class="sp">' + esc(s.chunkId) + ' · ' + esc(s.label) + '</div>'
          + '<div class="sq">' + esc(s.snippet) + '</div></button>'
      }).join('')
    }
    return html
  }

  // ---------------- 时间轴 ----------------

  function viewTimeline() {
    var 轴 = 提取时间轴(DATA.index)
    var 查 = String(S.yearQ || '').trim().replace(/[年\s]/g, '')
    var 年表 = 轴.年表.map(function (g) {
      var evs = S.cat ? g.事件.filter(function (e) { return e.category === S.cat }) : g.事件
      return { 年: g.年, 事件: evs }
    }).filter(function (g) { return g.事件.length > 0 })

    var 显示 = 年表
    var 提示 = ''
    if (查) {
      var 命中 = 年表.filter(function (g) { return String(g.年) === 查 })
      if (命中.length > 0) 显示 = 命中
      else if (/^\d{1,4}$/.test(查) && 年表.length > 0) {
        var 基准 = Number(查)
        var 最近 = 年表.slice().sort(function (a, b) { return Math.abs(a.年 - 基准) - Math.abs(b.年 - 基准) }).slice(0, 2)
          .sort(function (a, b) { return a.年 - b.年 })
        显示 = 最近
        提示 = '没有「' + 查 + '」年，最接近的是 ' + 最近.map(function (g) { return g.年 + ' 年' }).join(' 和 ')
      } else 显示 = []
    }

    var html = '<div class="bar"><button class="btn" data-act="home">返回</button>'
      + '<span class="tlstat">' + 轴.总数 + ' 个时间点' + (轴.总数 > 轴.场景数 ? '（含 ' + (轴.总数 - 轴.场景数) + ' 条出自对话与旁述）' : '')
      + ' · ' + 轴.覆盖剧情 + ' 个剧情 · ' + 轴.起 + '–' + 轴.止 + ' 年</span></div>'

    html += '<div class="tlsearch">'
      + '<div class="fwrap" style="width:180px"><input id="yearq" value="' + esc(S.yearQ) + '" placeholder="输入年份，精确匹配（如 1098）">'
      + (S.yearQ ? '<button class="fclear" data-act="yearclear" style="display:flex">×</button>' : '')
      + '</div>'
      + '<span class="tlhint">' + (查 ? (提示 || ('命中 ' + 显示.length + ' 个年份')) : ('共 ' + 年表.length + ' 个年份 · ' + 轴.起 + '–' + 轴.止)) + '</span></div>'

    // 远古与年代不明
    if (!查) {
      var 组 = 轴.年代表
      var 疑 = 轴.存疑
      if (组.length > 0 || 疑.length > 0) {
        var 开 = S.eraOpen !== false
        html += '<button class="catbtn' + (开 ? ' open' : '') + '" data-act="era">'
          + '<span class="caret">▸</span><span class="cn">远古与年代不明</span>'
          + '<span class="num">' + (组.reduce(function (a, g) { return a + g.条数 }, 0) + 疑.length) + '</span></button>'
        if (开) {
          html += '<div class="tl">'
          组.forEach(function (g) {
            var 桶开 = S.bucket[g.桶] === undefined ? (g.桶 === '远古') : S.bucket[g.桶]
            html += '<button class="catbtn sub' + (桶开 ? ' open' : '') + '" data-act="bucket" data-k="' + esc(g.桶) + '">'
              + '<span class="caret">▸</span><span class="cn">' + esc(g.桶) + '</span><span class="num">' + g.条数 + '</span></button>'
            if (桶开) {
              html += g.事件.slice(0, 120).map(function (e) {
                return tlRow(e, e.词, '')
              }).join('')
            }
          })
          if (疑.length > 0) {
            html += '<button class="catbtn sub open" data-act="bucket" data-k="存疑"><span class="caret">▸</span><span class="cn">年份存疑</span><span class="num">' + 疑.length + '</span></button>'
            html += 疑.map(function (e) { return tlRow(e, (e.约 ? '约' : '') + e.原文, '存疑') }).join('')
          }
          html += '</div>'
        }
      }
    }

    if (显示.length === 0) {
      html += '<div class="empty">' + (查 ? '没有「' + esc(查) + '」这个年份。' : '这个范围内没有带日期的时间点。') + '</div>'
    } else {
      显示.forEach(function (g) {
        var 开 = S.yearOpen[g.年] !== false
        html += '<button class="catbtn' + (开 ? ' open' : '') + '" data-act="yearopen" data-y="' + g.年 + '">'
          + '<span class="caret">▸</span><span class="cn">' + g.年 + ' 年</span><span class="num">' + g.事件.length + '</span></button>'
        if (开) {
          html += '<div class="tl">' + g.事件.map(function (e) {
            var 月日 = e.月 ? (e.月 + '月' + (e.日 ? e.日 + '日' : '')) : '—'
            return tlRow(e, 月日, e.场景 ? '' : '旁述', e.时刻)
          }).join('') + '</div>'
        }
      })
    }
    return html
  }

  function tlRow(e, 日期, 标签, 时刻) {
    return '<button class="tlrow" data-act="ep" data-id="' + esc(e.episodeId) + '" data-chunk="' + esc(String(e.chunkId || '').split('#')[1] || '') + '" title="' + esc(e.label || '') + '">'
      + '<span class="dot"></span>'
      + '<span class="td">' + esc(日期) + '</span>'
      + '<span class="tc">' + esc(时刻 || '') + '</span>'
      + '<span class="tm"><span class="tt">' + esc(e.story) + '<span class="sub"> / ' + esc(e.title) + (e.meta ? '（' + esc(e.meta) + '）' : '') + '</span>'
      + (标签 ? '<span class="tag">' + esc(标签) + '</span>' : '') + '</span>'
      + '<span class="to">' + esc(e.text) + '</span></span></button>'
  }

  function viewHome() {
    var st = DATA.meta.stats || {}
    var cards = DATA.categories.map(function (c) {
      return '<div class="card"><div class="k">' + esc(c.name) + '</div><div class="v">' + c.stories.length + ' <span style="font-size:12px;font-weight:400;color:var(--dim)">个剧情</span></div></div>'
    }).join('')
    var last = lastRead()
    var resume = last
      ? '<button class="resume" data-act="resume">' + ICON.book + ' 继续上次：' + esc(EP[last.id].title) + '</button>'
      : ''
    return '<div class="hero">'
      + '<h2>方舟剧情库</h2>'
      + '<p>全部剧情原文都在这个文件里，离线检索、离线阅读。左边挑一段读，或者在上面的搜索框里搜人名、势力、地名、台词。</p>'
      + '<div class="cards">' + cards + '</div>'
      + resume
      + '<button class="resume" data-act="random" style="margin-left:8px">随便翻一段</button>'
      + '<button class="resume" data-act="timeline" style="margin-left:8px">' + ICON.clock + ' 时间轴</button>'
      + '<button class="resume" data-act="mode" data-mode="cast" style="margin-left:8px">人物档案</button>'
      + '<button class="resume" data-act="mode" data-mode="world" style="margin-left:8px">国家 / 地区 / 组织</button>'
      + '<button class="resume" data-act="update" style="margin-left:8px">检查更新</button>'
      + '<div class="tip">共 <b>' + st.episodes + '</b> 小节、<b>' + st.chunks + '</b> 个场景、约 <b>' + Math.round((st.chars || 0) / 10000) + '</b> 万字，覆盖主线、活动、故事集、干员密录。<br>'
      + '检索是本地算的（中文按两字切分 + BM25），搜「霜星 死亡」「巴别塔 特蕾西娅」这种两个词一起出现的场景最准。<br>'
      + '<span style="opacity:.75">剧情文本版权归鹰角网络（Hypergryph）所有，仅供个人查阅，请勿商用或二次传播。</span></div>'
      + '</div>'
  }

  function viewResults() {
    if (!S.hits) return ''
    if (S.hits.length === 0) {
      return '<div class="bar">0 处场景 · ' + S.ms + 'ms</div>'
        + '<div class="empty">没找到「' + esc(S.q) + '」。<br>换个说法试试：人名、地名、组织名，或者台词里出现过的词。</div>'
    }
    var re = makeRe(S.units)
    var html = '<div class="bar"><span>' + S.hits.length + ' 处场景 · ' + S.ms + 'ms</span>'
      + (S.alias ? '<span class="alias" title="别名和正名都搜了">别名 ' + esc(S.alias) + '</span>' : '')
      + '<span style="opacity:.7">点开跳到命中处，再往下读整段</span></div>'
    S.hits.forEach(function (h) {
      html += '<button class="hit" data-act="hit" data-id="' + esc(h.episodeId) + '" data-chunk="' + esc(String(h.chunkId).split('#')[1]) + '">'
        + '<div class="path"><b>' + esc(h.title) + '</b>'
        + (h.meta ? '<span>' + esc(h.meta) + '</span>' : '')
        + '<span>·</span><span>' + esc(h.category) + ' / ' + esc(h.story) + '</span>'
        + '<span>·</span><span>' + esc(h.episodeId) + '</span></div>'
        + '<div class="txt">' + (h.前缀 ? '…' : '') + hl(h.snippet, re) + (h.后缀 ? '…' : '') + '</div>'
        + '</button>'
    })
    return html
  }

  function viewEpisodes() {
    var st = S.story
    var rows = st.episodes.map(function (e) {
      return '<button class="row" data-act="ep" data-id="' + esc(e.id) + '">'
        + '<span class="id">' + esc(e.id) + '</span>'
        + '<span class="nm">' + esc(e.title) + '</span>'
        + '<span class="ph">' + esc(e.meta || '') + '</span></button>'
    }).join('')
    return '<div class="bar"><button class="btn" data-act="home">' + ICON.back + ' 回到首页</button>'
      + '<span>' + esc(st.cat) + '</span></div>'
      + '<div class="ep-head"><h2>' + esc(st.name) + '</h2><div class="m">' + st.episodes.length + ' 小节</div></div>'
      + '<div class="ep-list">' + rows + '</div>'
  }

  function viewReader() {
    var ep = EP[S.read.id]
    if (!ep) return ''
    var read = 读剧集(DATA.index, ep, { offset: S.read.start, limit: S.read.shown })
    var seq = null
    DATA.categories.forEach(function (c) {
      c.stories.forEach(function (s) {
        if (s.episodes.some(function (x) { return x.id === ep.id })) seq = { cat: c.name, name: s.name, episodes: s.episodes }
      })
    })
    var idx = -1
    if (seq) idx = seq.episodes.findIndex(function (x) { return x.id === ep.id })
    var prev = idx > 0 ? seq.episodes[idx - 1].id : null
    var next = idx >= 0 && idx < seq.episodes.length - 1 ? seq.episodes[idx + 1].id : null

    var re = makeRe(S.units)
    var body = read.paragraphs.map(function (p) { return '<p>' + para(p, re) + '</p>' }).join('')

    var 藏 = 是收藏(ep.id)
    var tool = '<div class="toolbar">'
      + '<button class="btn" data-act="back">' + ICON.back + ' 返回</button>'
      + '<button class="btn' + (藏 ? ' solid' : '') + '" data-act="fav" title="收藏这一集">' + (藏 ? '★ 已收藏' : '☆ 收藏') + '</button>'
      + '<button class="btn" data-act="copy" title="复制本页原文">复制</button>'
      + '<button class="btn" data-act="font-" title="缩小字号">A-</button>'
      + '<button class="btn" data-act="font+" title="放大字号">A+</button>'
      + (prev ? '<button class="btn" data-act="prev" data-id="' + esc(prev) + '">上一小节</button>' : '')
      + (next ? '<button class="btn" data-act="next" data-id="' + esc(next) + '">下一小节</button>' : '')
      + '<span class="copy-tip" id="copy-tip"></span>'
      + '</div>'

    var tail = read.hasMore
      ? '<div class="tail"><button class="btn solid" data-act="more">继续读</button>'
        + '<span>第 ' + (read.offset + 1) + '–' + (read.offset + read.paragraphs.length) + ' 段 / 共 ' + read.totalParagraphs + ' 段</span></div>'
      : '<div class="tail"><span>（完）· 共 ' + read.totalParagraphs + ' 段</span></div>'

    return tool
      + '<div class="crumbs"><span>' + esc(ep.category) + '</span><span class="sep">/</span>'
      + '<span>' + (seq ? '<button class="btn" style="padding:0;border:0;background:none;color:var(--dim)" data-act="story" data-cat="' + esc(seq.cat) + '" data-story="' + esc(seq.name) + '">' + esc(ep.story) + '</button>' : esc(ep.story)) + '</span>'
      + '<span class="sep">/</span><span>' + esc(ep.id) + '</span></div>'
      + '<div class="ep-head"><h2>' + esc(ep.title) + '</h2>'
      + '<div class="m">' + (ep.meta ? esc(ep.meta) + ' · ' : '') + '第 ' + (read.offset + 1) + ' 段起</div></div>'
      + '<div class="story" style="font-size:' + S.font + 'px">' + body + '</div>'
      + tail
  }

  function viewFavs() {
    if (S.favs.length === 0) {
      return '<div class="bar"><button class="btn" data-act="back">' + ICON.back + ' 返回</button><span>收藏</span></div>'
        + '<div class="empty">还没有收藏。读到想留的地方，点「☆ 收藏」。</div>'
    }
    var rows = S.favs.map(function (f) {
      return '<div class="fav-item">'
        + '<button class="row" data-act="ep" data-id="' + esc(f.id) + '" title="' + esc(f.label) + '">'
        + '<span class="id">' + esc(f.id) + '</span>'
        + '<span class="nm">' + esc(f.title) + '</span>'
        + '<span class="ph">' + esc((f.label || '').split(' / ')[1] || '') + '</span>'
        + '</button>'
        + '<button class="fav-del" data-act="fav-del" data-id="' + esc(f.id) + '" title="移除收藏">×</button>'
        + '</div>'
    }).join('')
    return '<div class="bar"><button class="btn" data-act="back">' + ICON.back + ' 返回</button>'
      + '<span>收藏 ' + S.favs.length + ' 条</span>'
      + '<span style="opacity:.7">点开继续读，× 移除</span></div>'
      + '<div class="ep-list">' + rows + '</div>'
  }

  // ---------------- 启动 ----------------

  try {
    boot()
  } catch (e) {
    fail((e && e.message) || String(e))
  }
})()
