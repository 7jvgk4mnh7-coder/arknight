/**
 * dsh-arknights-lore —— 浏览器侧（手写 __ModuleLoader__ bundle，无构建工具）
 *
 * 注册两块 UI：
 *   1. sidebar.panellist 里的「方舟剧情库」图标
 *   2. main 面板：左侧目录 / 人物，右侧检索结果、阅读器、角色档案
 *
 * 与宿主只走同源 HTTP（/api/arknights-lore/*）。
 * 样式只用 --dsw-alias-* token，文字走 ctx.locale。
 */

window.__ModuleLoader__.load({
  id: 'dsh-arknights-lore',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports

    var React = require('react')
    var h = React.createElement
    var useState = React.useState
    var useEffect = React.useEffect
    var useMemo = React.useMemo
    var useRef = React.useRef

    var API = '/api/arknights-lore'
    var NS = 'arknightsLore'
    var 分类表 = ['主线剧情', '活动剧情', '故事集', '干员密录']
    var FAV_KEY = 'akl-favs'
    var FONT_KEY = 'akl-font'

    // ---------------- 文案 ----------------

    var ZH = {
      title: '方舟剧情库',
      searchPlaceholder: '搜人物、势力、地点、台词…（支持 +必须 -排除 "整句"）',
      filterPlaceholder: '筛选剧情…',
      castPlaceholder: '筛选人物…',
      tabCatalog: '目录',
      tabCast: '人物',
      tabWorld: '世界',
      stats: '共 {episodes} 小节 · {chunks} 个场景 · {chars} 万字',
      searching: '检索中…',
      hits: '{n} 处场景 · {ms}ms',
      noHits: '没找到。换个词试试：人名、地名、组织名，或台词里的词。',
      emptyHint: '左边挑一个剧情或人物，或者直接搜一句话。',
      back: '返回结果',
      backToStory: '返回目录',
      loadMore: '继续读',
      reading: '读取中…',
      total: '第 {from}–{to} 段 / 共 {n} 段',
      end: '（完）',
      episodes: '{n} 小节',
      noCatalog: '目录还没加载出来，宿主那边的语料可能没生成。',
      error: '出错了：{msg}',
      prevEp: '上一小节',
      nextEp: '下一小节',
      jumpHint: '点检索结果跳到命中处，再往下读整段。',
      favs: '收藏',
      favEmpty: '还没有收藏。读到想留的地方，点「☆ 收藏」。',
      profile: '档案',
      firstSeen: '首次出现',
      lastSeen: '最近出现',
      mentions: '次提及',
      episodesN: '个小节',
      storiesN: '个剧情',
      distribution: '剧情分布',
      coSpeakers: '常同场',
      samples: '代表片段',
      reading_btn: '阅读',
    }
    var EN = {
      title: 'Arknights Lore',
      searchPlaceholder: 'Search characters, factions, places, lines…',
      filterPlaceholder: 'Filter stories…',
      castPlaceholder: 'Filter characters…',
      tabCatalog: 'Stories',
      tabCast: 'Cast',
      tabWorld: 'World',
      stats: '{episodes} episodes · {chunks} scenes · {chars}0k chars',
      searching: 'Searching…',
      hits: '{n} scenes · {ms}ms',
      noHits: 'Nothing found. Try a name, a place, a faction, or a word from the line.',
      emptyHint: 'Pick a story or a character on the left, or search a phrase.',
      back: 'Back to results',
      backToStory: 'Back to stories',
      loadMore: 'Keep reading',
      reading: 'Loading…',
      total: 'Paragraphs {from}–{to} of {n}',
      end: '(end)',
      episodes: '{n} episodes',
      noCatalog: 'Catalog not loaded — the host corpus may be missing.',
      error: 'Failed: {msg}',
      prevEp: 'Previous',
      nextEp: 'Next',
      jumpHint: 'Open a hit to jump to it, then keep reading.',
      favs: 'Saved',
      favEmpty: 'Nothing saved yet. Tap ☆ in the reader to keep a scene.',
      digest: 'Digest',
      profile: 'Profile',
      firstSeen: 'First seen',
      lastSeen: 'Last seen',
      mentions: 'mentions',
      episodesN: 'episodes',
      storiesN: 'stories',
      distribution: 'By story',
      coSpeakers: 'Appears with',
      samples: 'Sample scenes',
      reading_btn: 'Read',
    }

    function 替换(模板, 参数) {
      return String(模板).replace(/\{(\w+)\}/g, function (m, k) {
        return 参数 && 参数[k] != null ? String(参数[k]) : m
      })
    }
    function 翻译(字典) {
      return function (key, 参数) {
        var t = 字典[key]
        return t == null ? key : 替换(t, 参数)
      }
    }

    // ---------------- 请求 ----------------

    function 读JSON(res) {
      return res.text().then(function (text) {
        var data = null
        try { data = text === '' ? null : JSON.parse(text) } catch (e) { data = null }
        if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status))
        return data
      })
    }

    function 请求(path, 参数, signal) {
      var q = []
      if (参数) {
        Object.keys(参数).forEach(function (k) {
          var v = 参数[k]
          if (v == null || v === '') return
          q.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)))
        })
      }
      var url = API + path + (q.length > 0 ? '?' + q.join('&') : '')
      return fetch(url, { cache: 'no-store', signal: signal }).then(读JSON)
    }

    // ---------------- 工具 ----------------

    function 转义(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

    function 造正则(units) {
      var 词 = (units || []).filter(function (u) { return u && u.length > 0 })
      if (词.length === 0) return null
      词 = 词.slice().sort(function (a, b) { return b.length - a.length })
      try { return new RegExp('(' + 词.map(转义).join('|') + ')', 'gi') } catch (e) { return null }
    }

    function 高亮(text, re) {
      if (!re || !text) return text
      var parts = String(text).split(re)
      if (parts.length === 1) return text
      var out = []
      for (var i = 0; i < parts.length; i++) {
        if (i % 2 === 1) out.push(h('mark', { key: i, className: 'akl-mark' }, parts[i]))
        else if (parts[i] !== '') out.push(parts[i])
      }
      return out
    }

    function 是匿名(s) { return /^[？?…—\-·\s]+$/.test(String(s || '')) }
    function 可点人物(s) { return !是匿名(s) && String(s).length >= 1 && String(s).length <= 14 }

    function 读收藏() {
      try {
        var v = JSON.parse(localStorage.getItem(FAV_KEY) || '[]')
        return Array.isArray(v) ? v : []
      } catch (e) { return [] }
    }
    function 存收藏(list) {
      try { localStorage.setItem(FAV_KEY, JSON.stringify(list.slice(0, 300))) } catch (e) { /* ignore */ }
    }
    function 读字号() {
      var n = Number(localStorage.getItem(FONT_KEY))
      return Number.isFinite(n) && n >= 12 && n <= 24 ? n : 16
    }

    // ---------------- 样式 ----------------

    var CSS = [
      '.akl-root,.akl-root *{box-sizing:border-box}',
      '.akl-root{display:flex;flex-direction:column;height:100%;min-height:460px;min-width:0;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.6}',
      '.akl-head{display:flex;align-items:center;gap:14px;padding:16px 22px;border-bottom:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap;background:linear-gradient(180deg,color-mix(in srgb,var(--dsw-alias-bg-layer-1) 70%,transparent),transparent)}',
      '.akl-brand{display:flex;align-items:center;gap:10px;min-width:0;flex:0 0 auto}',
      '.akl-logo{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-brand-primary);flex:0 0 auto}',
      '.akl-titles{display:flex;flex-direction:column;gap:0;min-width:0}',
      '.akl-title{font-size:15px;font-weight:650;letter-spacing:.01em;line-height:1.25}',
      '.akl-meta{font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.akl-search{flex:1;min-width:200px;position:relative;display:flex;align-items:center}',
      '.akl-input{width:100%;padding:9px 36px 9px 34px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;outline:none;transition:border-color .15s,box-shadow .15s}',
      '.akl-clear{position:absolute;right:7px;width:24px;height:24px;border-radius:50%;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:16px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}',
      '.akl-clear:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.akl-input:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent)}',
      '.akl-input::placeholder{color:var(--dsw-alias-label-secondary);opacity:.8}',
      '.akl-sicon{position:absolute;left:11px;display:flex;color:var(--dsw-alias-label-secondary);pointer-events:none}',
      '.akl-scope-row{flex-basis:100%;display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px}',
      '.akl-scope-row.is-hidden{display:none}',
      '.akl-scope-label{font-size:11px;color:var(--dsw-alias-label-secondary);letter-spacing:.04em;margin-right:2px}',
      '.akl-body{display:flex;flex:1;min-height:0}',
      '.akl-side{width:262px;flex:0 0 262px;border-right:1px solid var(--dsw-alias-border-l1);display:flex;flex-direction:column;min-height:0;background:var(--dsw-alias-bg-layer-1)}',
      '.akl-tabs{display:flex;gap:4px;padding:12px 12px 0}',
      '.akl-tab{flex:1;padding:7px 0;border-radius:9px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;cursor:pointer}',
      '.akl-tab:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.akl-tab.on{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1);font-weight:600}',
      '.akl-side-tools{padding:10px 12px 8px;display:flex;flex-direction:column;gap:8px}',
      '.akl-side-search{position:relative;display:flex;align-items:center}',
      '.akl-side-search .akl-input{padding-right:32px}',
      '.akl-scope{display:flex;gap:5px;flex-wrap:wrap}',
      '.akl-chip{border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;padding:3px 9px;border-radius:999px;cursor:pointer;white-space:nowrap;transition:all .12s}',
      '.akl-chip:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}',
      '.akl-chip.on{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff}',
      '.akl-tog{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none}',
      '.akl-tog input{accent-color:var(--dsw-alias-brand-primary)}',
      '.akl-fav-row{display:flex;align-items:center;gap:6px;border:1px dashed var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;padding:6px 10px;border-radius:9px;cursor:pointer;text-align:left}',
      '.akl-fav-row:hover,.akl-fav-row.on{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-brand-primary);border-style:solid}',
      '.akl-side-scroll{flex:1;overflow:auto;padding:2px 8px 20px}',
      '.akl-cat{display:flex;align-items:center;gap:6px;width:100%;text-align:left;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;font-weight:650;letter-spacing:.08em;padding:12px 8px 6px;cursor:pointer;border-radius:7px}',
      '.akl-cat:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.akl-caret{display:inline-block;width:9px;font-size:9px;opacity:.75;transition:transform .15s}',
      '.akl-cat.open .akl-caret{transform:rotate(90deg)}',
      '.akl-cat-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.akl-cat-n{font-size:10.5px;font-weight:400;letter-spacing:0;opacity:.65;font-variant-numeric:tabular-nums}',
      '.akl-story{display:flex;align-items:baseline;gap:8px;width:100%;text-align:left;border:0;background:transparent;color:inherit;font:inherit;padding:6px 9px;border-radius:8px;cursor:pointer}',
      '.akl-story:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.akl-story[data-on="1"]{background:var(--dsw-alias-bg-layer-2);box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary)}',
      '.akl-story-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.akl-story-n{font-size:11px;color:var(--dsw-alias-label-secondary);flex:0 0 auto;font-variant-numeric:tabular-nums}',
      '.akl-cast-row{display:flex;align-items:center;gap:9px;width:100%;text-align:left;border:0;background:transparent;color:inherit;font:inherit;padding:6px 9px;border-radius:8px;cursor:pointer}',
      '.akl-cast-row:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.akl-rank{width:20px;flex:0 0 20px;font-size:10.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right}',
      '.akl-cast-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.akl-cast-n{font-size:10.5px;color:var(--dsw-alias-label-secondary);flex:0 0 auto;font-variant-numeric:tabular-nums}',
      '.akl-main{flex:1;min-width:0;overflow:auto;padding:22px 26px 64px}',
      '.akl-inner{max-width:880px;margin:0 auto}',
      '.akl-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:16px}',
      '.akl-crumb{font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.akl-crumb b{color:var(--dsw-alias-label-primary);font-weight:600}',
      '.akl-spacer{flex:1}',
      '.akl-btn{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;cursor:pointer;transition:all .12s}',
      '.akl-btn:hover{border-color:var(--dsw-alias-border-l2);transform:translateY(-1px)}',
      '.akl-btn:disabled{opacity:.45;cursor:default;transform:none}',
      '.akl-btn.solid{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff}',
      '.akl-btn.ghost{background:transparent;border-color:transparent;color:var(--dsw-alias-label-secondary);padding:5px 8px}',
      '.akl-btn.ghost:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.akl-sec{font-size:10.5px;font-weight:650;letter-spacing:.1em;text-transform:uppercase;color:var(--dsw-alias-label-secondary);margin:26px 0 10px}',
      '.akl-hit{display:block;width:100%;text-align:left;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;padding:13px 15px;border-radius:12px;cursor:pointer;margin-bottom:9px;transition:all .12s}',
      '.akl-hit:hover{border-color:var(--dsw-alias-border-l2);transform:translateY(-1px);box-shadow:0 6px 18px rgba(0,0,0,.06)}',
      '.akl-hit-path{font-size:11.5px;color:var(--dsw-alias-label-secondary);display:flex;gap:7px;align-items:baseline;flex-wrap:wrap}',
      '.akl-hit-title{color:var(--dsw-alias-label-primary);font-weight:600;font-size:13px}',
      '.akl-hit-passage{margin-top:6px;white-space:pre-wrap;word-break:break-word;line-height:1.75}',
      '.akl-hit-score{font-variant-numeric:tabular-nums;opacity:.5;margin-left:auto}',
      '.akl-mark{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,transparent);color:inherit;border-radius:3px;padding:0 1px}',
      '.akl-alias{font-size:11.5px;color:var(--dsw-alias-brand-primary);border:1px solid var(--dsw-alias-brand-primary);border-radius:999px;padding:2px 9px;opacity:.9}',
      '.akl-kind{font-size:11px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:1px 9px;white-space:nowrap}',
      '.akl-tl-search{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:10px 0 6px}',
      '.akl-tl{display:flex;flex-direction:column;padding-left:2px}',
      '.akl-tl-row{display:flex;align-items:flex-start;gap:10px;width:100%;text-align:left;border:0;background:transparent;color:inherit;font:inherit;padding:8px 10px;border-radius:9px;cursor:pointer;border-left:1px solid var(--dsw-alias-border-l1);margin-left:6px}',
      '.akl-tl-row:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.akl-tl-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-brand-primary);flex:0 0 7px;margin-top:7px;margin-left:-14px;box-shadow:0 0 0 2px var(--dsw-alias-bg-base)}',
      '.akl-tl-date{flex:0 0 62px;font-size:12px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}',
      '.akl-tl-clock{flex:0 0 62px;font-size:11.5px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}',
      '.akl-tl-main{flex:1;min-width:0}',
      '.akl-tl-t{font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.akl-tl-t span{font-weight:400;color:var(--dsw-alias-label-secondary)}',
      '.akl-tl-o{margin-top:2px;font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.55;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
      '.akl-tl-tag{font-size:10px;font-weight:400;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);border-radius:4px;padding:0 4px;margin-left:6px;vertical-align:1px}',
      '.akl-empty{padding:56px 10px;color:var(--dsw-alias-label-secondary);text-align:center;line-height:1.9}',
      '.akl-empty .big{display:block;font-size:15px;color:var(--dsw-alias-label-primary);margin-bottom:6px;font-weight:600}',
      '.akl-err{color:var(--dsw-alias-state-error-primary);padding:16px 4px}',
      '.akl-hero{padding:10px 0 4px}',
      '.akl-hero h2{margin:0 0 6px;font-size:22px;letter-spacing:.01em}',
      '.akl-hero p{margin:0;color:var(--dsw-alias-label-secondary);max-width:62ch;line-height:1.8}',
      '.akl-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:20px}',
      '.akl-card{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:12px;padding:13px 15px}',
      '.akl-card .k{font-size:11.5px;color:var(--dsw-alias-label-secondary)}',
      '.akl-card .v{font-size:21px;font-weight:650;margin-top:2px;font-variant-numeric:tabular-nums}',
      '.akl-card .u{font-size:11.5px;font-weight:400;color:var(--dsw-alias-label-secondary);margin-left:3px}',
      '.akl-cta{display:inline-flex;align-items:center;gap:7px;margin-top:18px;padding:9px 15px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer}',
      '.akl-cta:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.akl-cta+.akl-cta{margin-left:8px}',
      '.akl-tip{margin-top:26px;padding:14px 16px;border-radius:12px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1.85}',
      '.akl-tip b{color:var(--dsw-alias-label-primary)}',
      '.akl-ep-title{font-size:21px;font-weight:650;margin:2px 0 3px;letter-spacing:.01em}',
      '.akl-ep-meta{font-size:12px;color:var(--dsw-alias-label-secondary);margin-bottom:18px}',
      '.akl-story-body{max-width:72ch}',
      '.akl-para{margin:0 0 13px;white-space:pre-wrap;word-break:break-word;line-height:1.95}',
      '.akl-spk{color:var(--dsw-alias-brand-primary);font-weight:600;cursor:pointer;border-radius:4px;padding:0 1px}',
      '.akl-spk:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent)}',
      '.akl-tail{display:flex;gap:10px;align-items:center;margin-top:22px;flex-wrap:wrap}',
      '.akl-row{display:flex;align-items:baseline;gap:10px;width:100%;text-align:left;border:0;background:transparent;color:inherit;font:inherit;padding:8px 10px;border-radius:9px;cursor:pointer}',
      '.akl-row:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.akl-row .id{font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;flex:0 0 54px}',
      '.akl-row .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.akl-row .ph{font-size:11.5px;color:var(--dsw-alias-label-secondary);flex:0 0 auto;max-width:42%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.akl-fav-item{display:flex;align-items:center;gap:4px}',
      '.akl-fav-item .akl-row{flex:1;min-width:0}',
      '.akl-del{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font-size:16px;line-height:1;padding:5px 9px;border-radius:7px;cursor:pointer}',
      '.akl-del:hover{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.akl-name{font-size:26px;font-weight:700;letter-spacing:.01em;line-height:1.2}',
      '.akl-sub{color:var(--dsw-alias-label-secondary);font-size:12.5px;margin-top:4px}',
      '.akl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:16px}',
      '.akl-stat{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:12px;padding:11px 14px;min-width:0}',
      '.akl-stat .k{font-size:11px;color:var(--dsw-alias-label-secondary);letter-spacing:.04em}',
      '.akl-stat .v{font-size:19px;font-weight:650;margin-top:1px;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.akl-stat .m{font-size:11.5px;color:var(--dsw-alias-label-secondary);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.akl-bars{display:flex;flex-direction:column;gap:7px}',
      '.akl-bar-row{display:flex;align-items:center;gap:10px;cursor:pointer;border-radius:7px;padding:2px 4px}',
      '.akl-bar-row:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.akl-bar-name{flex:0 0 34%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}',
      '.akl-bar-track{flex:1;height:8px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden;min-width:40px}',
      '.akl-bar-fill{height:100%;border-radius:999px;background:var(--dsw-alias-brand-primary);opacity:.85}',
      '.akl-bar-n{flex:0 0 auto;font-size:11.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;min-width:52px;text-align:right}',
      '.akl-pills{display:flex;gap:6px;flex-wrap:wrap}',
      '.akl-pill{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;padding:5px 11px;border-radius:999px;cursor:pointer;display:inline-flex;gap:6px;align-items:baseline}',
      '.akl-pill:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.akl-pill i{font-style:normal;font-size:10.5px;color:var(--dsw-alias-label-secondary)}',
      '.akl-sample{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:12px;padding:12px 15px;margin-bottom:9px;cursor:pointer;transition:all .12s}',
      '.akl-sample:hover{border-color:var(--dsw-alias-border-l2);transform:translateY(-1px)}',
      '.akl-sample .p{font-size:11.5px;color:var(--dsw-alias-label-secondary);display:flex;gap:7px;flex-wrap:wrap}',
      '.akl-sample .q{margin-top:6px;line-height:1.75;color:var(--dsw-alias-label-primary);opacity:.92}',
      '.akl-dig{display:flex;flex-direction:column;gap:2px}',
      '.akl-dig-row{display:flex;gap:12px;align-items:baseline;padding:9px 10px;border-radius:9px;cursor:pointer;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.akl-dig-row:last-child{border-bottom:0}',
      '.akl-dig-row:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.akl-dig-id{flex:0 0 58px;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.akl-dig-main{flex:1;min-width:0}',
      '.akl-dig-t{font-size:13.5px;font-weight:600}',
      '.akl-dig-t span{font-weight:400;color:var(--dsw-alias-label-secondary);font-size:11.5px;margin-left:6px}',
      '.akl-dig-o{margin-top:3px;font-size:12.5px;color:var(--dsw-alias-label-secondary);line-height:1.6;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
      '@media (max-width:900px){.akl-side{display:none}.akl-main{padding:16px}}',
    ].join('')

    // ---------------- 小图标 ----------------

    function svg(d, extra) {
      return h('svg', Object.assign({
        width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round',
      }, extra || {}), d)
    }

    var ICON = {
      search: svg([h('circle', { key: 1, cx: 11, cy: 11, r: 7 }), h('path', { key: 2, d: 'M20 20l-3.2-3.2' })]),
      book: svg([
        h('path', { key: 1, d: 'M4 5c2.4-.9 5-.9 8 .8v12c-3-1.7-5.6-1.7-8-.8z' }),
        h('path', { key: 2, d: 'M20 5c-2.4-.9-5-.9-8 .8v12c3-1.7 5.6-1.7 8-.8z' }),
      ], { width: 17, height: 17, strokeWidth: 1.7 }),
      back: svg(h('path', { d: 'M15 5l-7 7 7 7' }), { width: 13, height: 13, strokeWidth: 2.2 }),
      list: svg(h('path', { d: 'M4 7h16M4 12h16M4 17h10' })),
      user: svg([h('circle', { key: 1, cx: 12, cy: 8, r: 3.6 }), h('path', { key: 2, d: 'M5 20c1.2-3.6 3.7-5.4 7-5.4S17.8 16.4 19 20' })]),
      clock: svg([h('circle', { key: 1, cx: 12, cy: 12, r: 8 }), h('path', { key: 2, d: 'M12 7.5V12l3 2' })]),
    }

    // ---------------- 小组件 ----------------

    function 说话人(文本, re, onWho) {
      var m = /^([^\s：:]{1,14})([：:])([\s\S]*)$/.exec(文本)
      if (!m) return 高亮(文本, re)
      var 名 = m[1]
      var 头 = 可点人物(名) && onWho
        ? h('span', { key: 's', className: 'akl-spk', onClick: function () { onWho(名) }, title: '看「' + 名 + '」的档案' }, 名 + m[2])
        : h('span', { key: 's', className: 'akl-spk' }, 名 + m[2])
      return [头, 高亮(m[3], re)]
    }

    function 结果卡(props) {
      var hit = props.hit
      return h('button', {
        className: 'akl-hit', type: 'button', onClick: function () { props.onOpen(hit) }, title: hit.chunkId,
      },
        h('div', { className: 'akl-hit-path' },
          h('span', null, hit.episodeId),
          h('span', { className: 'akl-hit-title' }, hit.title + (hit.meta ? '（' + hit.meta + '）' : '')),
          h('span', null, hit.category + ' / ' + hit.story),
          h('span', { className: 'akl-hit-score' }, String(hit.score)),
        ),
        h('div', { className: 'akl-hit-passage' },
          (hit.前缀 ? '…' : ''), 高亮(hit.snippet, props.re), (hit.后缀 ? '…' : '')),
      )
    }

    // ---------------- 侧栏 ----------------

    function 侧栏(props) {
      var t = props.t
      var 当前过滤 = props.mode === 'cast' ? props.castFilter : (props.mode === 'world' ? props.worldFilter : props.filter)
      var 过滤 = 当前过滤.trim()
      var 节点 = []

      if (props.mode === 'cast') {
        var 名单 = (props.cast || []).filter(function (x) { return !过滤 || x.name.indexOf(过滤) >= 0 })
        if (!props.cast) {
          节点.push(h('div', { key: 'ld', className: 'akl-empty', style: { padding: '36px 4px' } }, t('reading')))
        } else if (名单.length === 0) {
          节点.push(h('div', { key: 'none', className: 'akl-empty', style: { padding: '36px 4px' } }, '—'))
        } else {
          名单.forEach(function (x, i) {
            节点.push(h('button', {
              key: 'c-' + x.name, type: 'button', className: 'akl-cast-row',
              onClick: function () { props.onWho(x.name) },
              title: x.name + ' · ' + x.lines + ' 句',
            },
              h('span', { className: 'akl-rank' }, String(i + 1)),
              h('span', { className: 'akl-cast-name' }, x.name),
              h('span', { className: 'akl-cast-n' }, x.episodes + ' 集'),
            ))
          })
        }
      } else if (props.mode === 'world') {
        if (!props.world) {
          节点.push(h('div', { key: 'wld', className: 'akl-empty', style: { padding: '36px 4px' } }, t('reading')))
        } else {
          props.world.forEach(function (g) {
            var 项 = g.items.filter(function (n) { return !过滤 || n.indexOf(过滤) >= 0 })
            if (项.length === 0) return
            var 开 = 过滤.length > 0 || props.展开世界[g.类] !== false
            节点.push(h('button', {
              key: 'wg-' + g.类,
              type: 'button',
              className: 'akl-cat' + (开 ? ' open' : ''),
              onClick: function () { props.onWorldToggle(g.类) },
              'aria-expanded': 开 ? 'true' : 'false',
            },
              h('span', { className: 'akl-caret' }, '▸'),
              h('span', { className: 'akl-cat-name' }, g.类),
              h('span', { className: 'akl-cat-n' }, 项.length),
            ))
            if (!开) return
            项.forEach(function (名) {
              节点.push(h('button', {
                key: 'w-' + 名, type: 'button', className: 'akl-story',
                onClick: function () { props.onWorld(名, g.类) },
                title: 名,
              },
                h('span', { className: 'akl-story-name' }, 名),
              ))
            })
          })
        }
      } else if (props.catalog) {
        props.catalog.categories.forEach(function (cat) {
          var 剧情们 = cat.stories.filter(function (s) { return !过滤 || s.name.indexOf(过滤) >= 0 })
          if (剧情们.length === 0) return
          var 在找 = 过滤.length > 0 || !!(props.current && props.current.category === cat.name)
          var 开 = 在找 || !!(props.展开 && props.展开[cat.name])
          节点.push(h('button', {
            key: 'cat-' + cat.name,
            type: 'button',
            className: 'akl-cat' + (开 ? ' open' : ''),
            onClick: function () { props.onToggle(cat.name) },
            'aria-expanded': 开 ? 'true' : 'false',
            title: 开 ? '收起' : '展开',
          },
            h('span', { className: 'akl-caret' }, '▸'),
            h('span', { className: 'akl-cat-name' }, cat.name),
            h('span', { className: 'akl-cat-n' }, 剧情们.length),
          ))
          if (!开) return
          剧情们.forEach(function (s) {
            var on = props.current && props.current.story && props.current.story.name === s.name && props.current.category === cat.name
            节点.push(h('button', {
              key: 's-' + cat.name + '-' + s.no, type: 'button', className: 'akl-story',
              'data-on': on ? '1' : '0',
              onClick: function () { props.onStory(cat.name, s) },
              title: s.name,
            },
              h('span', { className: 'akl-story-name' }, s.name),
              h('span', { className: 'akl-story-n' }, s.episodes.length),
            ))
          })
        })
      }

      return h('div', { className: 'akl-side' },
        h('div', { className: 'akl-tabs' },
          h('button', { type: 'button', className: 'akl-tab' + (props.mode === 'catalog' ? ' on' : ''), onClick: function () { props.onMode('catalog') } }, t('tabCatalog')),
          h('button', { type: 'button', className: 'akl-tab' + (props.mode === 'cast' ? ' on' : ''), onClick: function () { props.onMode('cast') } }, t('tabCast')),
          h('button', { type: 'button', className: 'akl-tab' + (props.mode === 'world' ? ' on' : ''), onClick: function () { props.onMode('world') } }, t('tabWorld')),
        ),
        h('div', { className: 'akl-side-tools' },
          h('div', { className: 'akl-side-search' },
            h('input', {
              className: 'akl-input', style: { paddingLeft: '11px' },
              value: 当前过滤,
              placeholder: props.mode === 'cast' ? t('castPlaceholder') : (props.mode === 'world' ? '筛选国家 / 地区 / 组织…' : t('filterPlaceholder')),
              onChange: function (e) { props.on过滤(e.target.value) },
            }),
            当前过滤 ? h('button', {
              className: 'akl-clear', type: 'button', title: '清空',
              onClick: function () { props.on过滤('') },
            }, '×') : null,
          ),
          props.mode === 'catalog'
            ? h('button', { type: 'button', className: 'akl-fav-row', onClick: props.onFavs },
              '★ ' + t('favs') + ' · ' + props.收藏数)
            : (props.mode === 'cast'
              ? h('div', { className: 'akl-crumb', style: { padding: '2px 2px' } }, '按台词多少排序，点开看档案')
              : h('div', { className: 'akl-crumb', style: { padding: '2px 2px' } }, '国家 / 地区 / 组织，点开看档案')),
        ),
        h('div', { className: 'akl-side-scroll' }, 节点.length > 0 ? 节点 : h('div', { className: 'akl-empty' }, '—')),
      )
    }

    // ---------------- 阅读器 ----------------

    function 阅读器(props) {
      var t = props.t
      var [数据, set数据] = useState(null)
      var [错误, set错误] = useState('')
      var [加载中, set加载中] = useState(true)
      var [追加中, set追加中] = useState(false)

      useEffect(function () {
        var stop = false
        var ac = new AbortController()
        set加载中(true); set错误(''); set数据(null)
        请求('/episode', { id: props.episodeId, chunk: props.chunk, limit: props.chunk != null ? 40 : 400 }, ac.signal)
          .then(function (d) { if (!stop) { set数据(d); set加载中(false) } })
          .catch(function (e) { if (!stop && e.name !== 'AbortError') { set错误(e.message); set加载中(false) } })
        return function () { stop = true; ac.abort() }
      }, [props.episodeId, props.chunk])

      function 续读() {
        if (!数据) return
        set追加中(true)
        请求('/episode', { id: 数据.episode.id, offset: 数据.offset + 数据.paragraphs.length, limit: 120 })
          .then(function (d) {
            set数据(function (old) {
              if (!old) return d
              return Object.assign({}, d, { offset: old.offset, paragraphs: old.paragraphs.concat(d.paragraphs) })
            })
            set追加中(false)
          })
          .catch(function () { set追加中(false) })
      }

      function 复制本页() {
        var 文本 = [数据.episode.label, '', ...数据.paragraphs].join('\n\n')
        var 兜底 = function () {
          try {
            var ta = document.createElement('textarea')
            ta.value = 文本
            ta.style.position = 'fixed'; ta.style.opacity = '0'
            document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
          } catch (e) { /* ignore */ }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(文本).catch(兜底)
        else 兜底()
      }

      if (加载中) return h('div', { className: 'akl-empty' }, t('reading'))
      if (错误) return h('div', { className: 'akl-err' }, t('error', { msg: 错误 }))
      if (!数据) return null

      var 集 = 数据.episode
      var 首 = 数据.offset + 1
      var 末 = 数据.offset + 数据.paragraphs.length
      var 节点 = []
      if (数据.offset > 0) 节点.push(h('div', { key: 'top', className: 'akl-empty', style: { padding: '6px' } }, '…'))
      数据.paragraphs.forEach(function (p, i) {
        节点.push(h('p', { key: 'p' + (数据.offset + i), className: 'akl-para' }, 说话人(p, props.re, props.onWho)))
      })
      节点.push(h('div', { key: 'tail', className: 'akl-tail' },
        数据.hasMore
          ? h('button', { className: 'akl-btn solid', type: 'button', onClick: 续读, disabled: 追加中 }, 追加中 ? t('reading') : t('loadMore'))
          : h('span', { className: 'akl-crumb' }, t('end')),
        h('span', { className: 'akl-crumb' }, t('total', { from: 首, to: 末, n: 数据.totalParagraphs })),
      ))

      return h('div', { className: 'akl-inner' },
        h('div', { className: 'akl-toolbar' },
          h('button', { className: 'akl-btn', type: 'button', onClick: props.onBack }, ICON.back, props.backLabel),
          h('span', { className: 'akl-spacer' }),
          h('button', { className: 'akl-btn' + (props.isFav ? ' solid' : ''), type: 'button', onClick: props.onFav, title: '收藏' }, props.isFav ? '★' : '☆'),
          h('button', { className: 'akl-btn', type: 'button', onClick: 复制本页, title: '复制本页' }, '复制'),
          h('button', { className: 'akl-btn ghost', type: 'button', onClick: function () { props.onFont(-1) }, title: '缩小字号' }, 'A-'),
          h('button', { className: 'akl-btn ghost', type: 'button', onClick: function () { props.onFont(1) }, title: '放大字号' }, 'A+'),
          props.prevId ? h('button', { className: 'akl-btn', type: 'button', onClick: function () { props.onStep(props.prevId) }, title: t('prevEp') }, '‹') : null,
          props.nextId ? h('button', { className: 'akl-btn', type: 'button', onClick: function () { props.onStep(props.nextId) }, title: t('nextEp') }, '›') : null,
        ),
        h('div', { className: 'akl-crumb', style: { marginBottom: '8px' } },
          集.category, ' / ', h('b', null, 集.story), ' / ', 集.id),
        h('div', { className: 'akl-ep-title' }, 集.title),
        h('div', { className: 'akl-ep-meta' }, (集.meta ? 集.meta + ' · ' : '') + (props.chunk != null ? '命中场景 ' + props.chunk + ' · ' : '') + '共 ' + 数据.totalParagraphs + ' 段'),
        h('div', { className: 'akl-story-body', style: { fontSize: (props.字号 || 16) + 'px' } }, 节点),
      )
    }

    // ---------------- 档案 ----------------

    function 档案视图(props) {
      var t = props.t
      var 档 = props.data
      if (props.loading) return h('div', { className: 'akl-empty' }, t('reading'))
      if (props.error) return h('div', { className: 'akl-err' }, t('error', { msg: props.error }))
      if (!档) return null
      if (!档.total) {
        return h('div', { className: 'akl-inner' },
          h('div', { className: 'akl-toolbar' }, h('button', { className: 'akl-btn', type: 'button', onClick: props.onBack }, ICON.back, '返回')),
          h('div', { className: 'akl-empty' },
            h('span', { className: 'big' }, '剧情库里没有「' + 档.name + '」'),
            '换个写法试试：全名、代号、组织名或地名。'),
        )
      }
      var 最多 = 档.stories.length > 0 ? 档.stories[0].mentions : 1
      return h('div', { className: 'akl-inner' },
        h('div', { className: 'akl-toolbar' },
          h('button', { className: 'akl-btn', type: 'button', onClick: props.onBack }, ICON.back, '返回'),
          h('span', { className: 'akl-spacer' }),
          h('button', { className: 'akl-btn', type: 'button', onClick: function () { props.onSearch(档.name) } }, '搜原文'),
        ),
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' } },
          h('div', { className: 'akl-name' }, 档.name),
          props.kind ? h('span', { className: 'akl-kind' }, props.kind) : null,
        ),
        h('div', { className: 'akl-sub' }, 档.total + ' ' + t('mentions') + ' · ' + 档.episodeCount + ' ' + t('episodesN') + ' · ' + 档.stories.length + ' ' + t('storiesN')),
        档.aliasText ? h('div', { className: 'akl-sub', style: { color: 'var(--dsw-alias-brand-primary)' } }, '别名：' + 档.aliasText) : null,

        h('div', { className: 'akl-grid' },
          h('div', { className: 'akl-stat' },
            h('div', { className: 'k' }, t('firstSeen')),
            h('div', { className: 'v', style: { fontSize: '13.5px', fontWeight: 600 } }, 档.first ? 档.first.story : '—'),
            h('div', { className: 'm' }, 档.first ? 档.first.title : '')),
          h('div', { className: 'akl-stat' },
            h('div', { className: 'k' }, t('lastSeen')),
            h('div', { className: 'v', style: { fontSize: '13.5px', fontWeight: 600 } }, 档.last ? 档.last.story : '—'),
            h('div', { className: 'm' }, 档.last ? 档.last.title : '')),
          h('div', { className: 'akl-stat' },
            h('div', { className: 'k' }, t('episodesN')),
            h('div', { className: 'v' }, String(档.episodeCount)),
            h('div', { className: 'm' }, 档.stories.length + ' ' + t('storiesN'))),
        ),

        档.affiliations && 档.affiliations.length > 0
          ? h('div', null,
            h('div', { className: 'akl-sec' }, '所属'),
            h('div', { className: 'akl-pills' },
              档.affiliations.map(function (a) {
                var 名 = typeof a === 'string' ? a : a.name
                var 类 = typeof a === 'string' ? '' : a.kind
                return h('button', {
                  key: 名, type: 'button', className: 'akl-pill',
                  onClick: function () { props.onAffil(名, 类) },
                  title: '看「' + 名 + '」的档案',
                }, 名)
              })),
          )
          : null,

        档.stories.length > 0
          ? h('div', null,
            h('div', { className: 'akl-sec' }, t('distribution')),
            h('div', { className: 'akl-bars' },
              档.stories.slice(0, 10).map(function (s) {
                return h('div', {
                  key: s.category + '/' + s.story, className: 'akl-bar-row',
                  onClick: function () { props.onStory(s.category, s.story) },
                  title: s.category + ' / ' + s.story,
                },
                  h('span', { className: 'akl-bar-name' }, s.story),
                  h('span', { className: 'akl-bar-track' },
                    h('span', { className: 'akl-bar-fill', style: { width: Math.max(3, Math.round((s.mentions / 最多) * 100)) + '%' } })),
                  h('span', { className: 'akl-bar-n' }, s.mentions + ' 次'),
                )
              }),
            ))
          : null,

        档.coSpeakers.length > 0
          ? h('div', null,
            h('div', { className: 'akl-sec' }, t('coSpeakers')),
            h('div', { className: 'akl-pills' },
              档.coSpeakers.map(function (c) {
                return h('button', {
                  key: c.name, type: 'button', className: 'akl-pill',
                  onClick: function () { props.onWho(c.name) },
                }, c.name, h('i', null, c.episodes + ' 集'))
              })),
          )
          : null,

        档.samples.length > 0
          ? h('div', null,
            h('div', { className: 'akl-sec' }, t('samples')),
            档.samples.map(function (s) {
              return h('div', {
                key: s.chunkId, className: 'akl-sample',
                onClick: function () { props.onOpenChunk(s.episodeId, Number(String(s.chunkId).split('#')[1])) },
              },
                h('div', { className: 'p' }, h('span', null, s.chunkId), h('span', null, s.label)),
                h('div', { className: 'q' }, s.snippet),
              )
            }))
          : null,
      )
    }

    // ---------------- 时间轴 ----------------

    var 时间分类 = ['主线剧情', '活动剧情', '故事集', '干员密录']

    function 时间轴视图(props) {
      var t = props.t
      var 数 = props.data
      if (!数) return h('div', { className: 'akl-empty' }, t('reading'))
      var 类 = props.分类
      var 年表 = 数.年表
        .map(function (g) {
          var 事件 = 类 ? g.事件.filter(function (e) { return e.category === 类 }) : g.事件
          return { 年: g.年, 事件: 事件 }
        })
        .filter(function (g) { return g.事件.length > 0 })

      // 年份搜索：只认精确年份；没命中就退回「离它最近的两个年份」
      var 查 = String(props.年查 || '').trim().replace(/[年\s]/g, '')
      var 显示年表 = 年表
      var 提示 = ''
      if (查) {
        var 命中 = 年表.filter(function (g) { return String(g.年) === 查 })
        if (命中.length > 0) {
          显示年表 = 命中
        } else if (/^\d{1,4}$/.test(查) && 年表.length > 0) {
          var 基准 = Number(查)
          var 最近 = 年表.slice()
            .sort(function (a, b) { return Math.abs(a.年 - 基准) - Math.abs(b.年 - 基准) })
            .slice(0, 2)
            .sort(function (a, b) { return a.年 - b.年 })
          显示年表 = 最近
          提示 = '没有「' + 查 + '」年，最接近的是 ' + 最近.map(function (g) { return g.年 + ' 年' }).join(' 和 ')
        } else {
          显示年表 = []
          提示 = '请输入年份数字，例如 1098'
        }
      }

      return h('div', { className: 'akl-inner' },
        h('div', { className: 'akl-toolbar' },
          h('button', { className: 'akl-btn', type: 'button', onClick: props.onBack }, ICON.back, '返回'),
          h('span', { className: 'akl-spacer' }),
          h('label', { className: 'akl-tog' },
            h('input', {
              type: 'checkbox', checked: props.含提及,
              onChange: function (e) { props.on含提及(e.target.checked) },
            }),
            '含旁述提及（' + 数.全部数 + '）'),
        ),
        h('div', { style: { marginBottom: '4px' } },
          h('div', { className: 'akl-name', style: { fontSize: '22px' } }, '剧情时间轴'),
          h('div', { className: 'akl-sub' },
            数.总数 + ' 个时间点'
            + (数.总数 > 数.场景数 ? '（含 ' + (数.总数 - 数.场景数) + ' 条出自对话与旁述）' : '')
            + ' · ' + 数.覆盖剧情 + ' 个剧情 · ' + 数.覆盖小节 + ' 小节 · ' + 数.起 + ' – ' + 数.止 + ' 年'),
        ),
        h('div', { className: 'akl-scope', style: { margin: '12px 0 6px' } },
          h('button', {
            type: 'button', className: 'akl-chip' + (类 ? '' : ' on'),
            onClick: function () { props.on分类('') },
          }, '全部'),
          时间分类.map(function (c) {
            return h('button', {
              key: c, type: 'button', className: 'akl-chip' + (类 === c ? ' on' : ''),
              onClick: function () { props.on分类(类 === c ? '' : c) },
            }, c.replace('剧情', ''))
          }),
        ),

        // —— 年份搜索 ——
        h('div', { className: 'akl-tl-search' },
          h('div', { className: 'akl-side-search', style: { flex: '0 0 auto', width: '180px' } },
            h('input', {
              className: 'akl-input',
              placeholder: '输入年份，精确匹配（如 1098）',
              value: props.年查,
              onChange: function (e) { props.on年查(e.target.value) },
            }),
            props.年查 ? h('button', {
              className: 'akl-clear', type: 'button', title: '清空',
              onClick: function () { props.on年查('') },
            }, '×') : null,
          ),
          h('span', { className: 'akl-crumb' },
            查 ? (提示 || ('命中 ' + 显示年表.length + ' 个年份')) : ('共 ' + 年表.length + ' 个年份 · ' + 数.起 + '–' + 数.止)),
        ),

        // —— 远古与年代不明（没有具体年份的说法）——
        (function () {
          var 组 = (数.年代 || []).filter(function (g) { return 类 ? g.事件.some(function (e) { return e.category === 类 }) : true })
          var 疑 = (数.存疑 || []).filter(function (e) { return !类 || e.category === 类 })
          if (组.length === 0 && 疑.length === 0) return null
          var 总 = 组.reduce(function (a, g) { return a + g.事件.length }, 0) + 疑.length
          var 开 = props.展开年代 !== false
          return h('div', { key: 'eras', style: { marginTop: '16px' } },
            h('button', {
              type: 'button', className: 'akl-cat' + (开 ? ' open' : ''),
              onClick: function () { props.on展开年代(!开) },
            },
              h('span', { className: 'akl-caret' }, '▸'),
              h('span', { className: 'akl-cat-name' }, '远古与年代不明'),
              h('span', { className: 'akl-cat-n' }, 总),
            ),
            !开 ? null : h('div', null,
              组.map(function (g) {
                var 本事 = g.事件.filter(function (e) { return !类 || e.category === 类 })
                if (本事.length === 0) return null
                var 桶开 = props.展开桶[g.桶] === undefined ? (g.桶 === '远古') : props.展开桶[g.桶]
                return h('div', { key: 'era-' + g.桶, style: { marginTop: '8px' } },
                  h('button', {
                    type: 'button', className: 'akl-cat' + (桶开 ? ' open' : ''),
                    onClick: function () { props.on展开桶(g.桶) },
                  },
                    h('span', { className: 'akl-caret' }, '▸'),
                    h('span', { className: 'akl-cat-name' }, ' ' + g.桶),
                    h('span', { className: 'akl-cat-n' }, 本事.length),
                  ),
                  !桶开 ? null : h('div', { className: 'akl-tl' },
                    本事.map(function (e, i) {
                      return h('button', {
                        key: 'era-' + e.chunkId + '|' + e.词 + '|' + i,
                        type: 'button', className: 'akl-tl-row',
                        onClick: function () { props.onOpen(e.episodeId, Number(String(e.chunkId).split('#')[1])) },
                        title: e.label,
                      },
                        h('span', { className: 'akl-tl-dot' }),
                        h('span', { className: 'akl-tl-date' }, e.词),
                        h('span', { className: 'akl-tl-clock' }, ''),
                        h('div', { className: 'akl-tl-main' },
                          h('div', { className: 'akl-tl-t' }, e.story, h('span', null, ' / ' + e.title + (e.meta ? '（' + e.meta + '）' : ''))),
                          h('div', { className: 'akl-tl-o' }, e.text),
                        ),
                      )
                    })),
                )
              }),
              疑.length === 0 ? null : h('div', { key: 'era-doubt', style: { marginTop: '8px' } },
                h('button', {
                  type: 'button', className: 'akl-cat' + (props.展开桶['存疑'] === undefined ? ' open' : (props.展开桶['存疑'] ? ' open' : '')),
                  onClick: function () { props.on展开桶('存疑') },
                },
                  h('span', { className: 'akl-caret' }, '▸'),
                  h('span', { className: 'akl-cat-name' }, ' 年份存疑'),
                  h('span', { className: 'akl-cat-n' }, 疑.length),
                ),
                (props.展开桶['存疑'] === undefined || props.展开桶['存疑']) ? h('div', { className: 'akl-tl' },
                  疑.map(function (e, i) {
                    return h('button', {
                      key: 'doubt-' + e.chunkId + '|' + e.原文 + '|' + i,
                      type: 'button', className: 'akl-tl-row',
                      onClick: function () { props.onOpen(e.episodeId, Number(String(e.chunkId).split('#')[1])) },
                      title: e.label,
                    },
                      h('span', { className: 'akl-tl-dot' }),
                      h('span', { className: 'akl-tl-date' }, (e.约 ? '约' : '') + e.原文),
                      h('span', { className: 'akl-tl-clock' }, ''),
                      h('div', { className: 'akl-tl-main' },
                        h('div', { className: 'akl-tl-t' },
                          e.story,
                          h('span', null, ' / ' + e.title + (e.meta ? '（' + e.meta + '）' : '')),
                          h('span', { className: 'akl-tl-tag', title: '原文是「大概是150年」这类说法，年份不可靠' }, '存疑'),
                        ),
                        h('div', { className: 'akl-tl-o' }, e.text),
                      ),
                    )
                  })) : null,
              ),
            ),
          )
        })(),

        显示年表.length === 0
          ? h('div', { className: 'akl-empty' },
            查 ? '没有「' + 查 + '」这个年份。' : '这个范围内没有带日期的时间点。')
          : 显示年表.map(function (g) {
            var 开 = props.展开年[g.年] !== false
            return h('div', { key: 'y' + g.年, style: { marginTop: '14px' } },
              h('button', {
                type: 'button', className: 'akl-cat' + (开 ? ' open' : ''),
                onClick: function () { props.on展开年(g.年) },
              },
                h('span', { className: 'akl-caret' }, '▸'),
                h('span', { className: 'akl-cat-name' }, g.年 + ' 年'),
                h('span', { className: 'akl-cat-n' }, g.事件.length),
              ),
              !开 ? null : h('div', { className: 'akl-tl' },
                g.事件.map(function (e, i) {
                  return h('button', {
                    key: e.chunkId + '|' + e.原文 + '|' + i,
                    type: 'button', className: 'akl-tl-row',
                    onClick: function () { props.onOpen(e.episodeId, Number(String(e.chunkId).split('#')[1])) },
                    title: e.label,
                  },
                    h('span', { className: 'akl-tl-dot' }),
                    h('span', { className: 'akl-tl-date' },
                      (e.约 ? '约' : '') + (e.月 ? (e.月 + '月' + (e.日 ? e.日 + '日' : '')) : '—')),
                    e.时刻 ? h('span', { className: 'akl-tl-clock' }, e.时刻) : h('span', { className: 'akl-tl-clock' }, ''),
                    h('div', { className: 'akl-tl-main' },
                      h('div', { className: 'akl-tl-t' },
                        e.story,
                        h('span', null, ' / ' + e.title + (e.meta ? '（' + e.meta + '）' : '')),
                        e.场景 ? null : h('span', { className: 'akl-tl-tag', title: '这句时间出自对话或旁述，不是场景时间戳' }, '旁述'),
                      ),
                      h('div', { className: 'akl-tl-o' }, e.text),
                    ),
                  )
                })),
            )
          }),
      )
    }

    // ---------------- 面板 ----------------

    function 面板(props) {
      var t = props.t
      var [catalog, setCatalog] = useState(null)
      var [catalogErr, setCatalogErr] = useState('')
      var [stats, setStats] = useState(null)
      var [侧栏模式, set侧栏模式] = useState('catalog')
      var [侧栏过滤, set侧栏过滤] = useState('')
      var [人物过滤, set人物过滤] = useState('')
      var [人物榜, set人物榜] = useState(null)
      var [输入, set输入] = useState('')
      var [检索焦点, set检索焦点] = useState(false)
      var [已搜, set已搜] = useState('')
      var [结果, set结果] = useState(null)
      var [检索中, set检索中] = useState(false)
      var [分类, set分类] = useState('')
      var [仅本剧情, set仅本剧情] = useState(false)
      var [浏览, set浏览] = useState(null)
      var [阅读, set阅读] = useState(null)
      var [档案, set档案] = useState(null)
      var [档案数据, set档案数据] = useState(null)
      var [展开, set展开] = useState(function () { return { '主线剧情': true } })
      var [收藏, set收藏] = useState(读收藏)
      var [看收藏, set看收藏] = useState(false)
      var [字号, set字号] = useState(读字号)
      var [世界过滤, set世界过滤] = useState('')
      var [世界表, set世界表] = useState(null)
      var [档案类, set档案类] = useState('')
      var [展开世界, set展开世界] = useState({})
      var [时间轴, set时间轴] = useState(false)
      var [时间轴数据, set时间轴数据] = useState(null)
      var [时间轴含提及, set时间轴含提及] = useState(true)
      var [时间轴分类, set时间轴分类] = useState('')
      var [展开年, set展开年] = useState({})
      var [展开年代, set展开年代] = useState(true)
      var [展开桶, set展开桶] = useState({})
      var [年查, set年查] = useState('')

      var 主区ref = useRef(null)
      var 搜索ref = useRef(null)

      function 清空搜索() {
        set输入('')
        set结果(null)
        set已搜('')
        set检索中(false)
        set阅读(null)
        set看收藏(false)
        set档案(null)
        if (搜索ref.current) {
          try { 搜索ref.current.focus() } catch (e) { /* ignore */ }
        }
      }

      useEffect(function () {
        请求('/catalog').then(function (d) { setCatalog(d); setStats(d.stats) })
          .catch(function (e) { setCatalogErr(e.message) })
      }, [])

      useEffect(function () {
        if (侧栏模式 !== 'cast' || 人物榜) return
        请求('/cast', { limit: 160 }).then(function (d) { set人物榜(d.cast || []) }).catch(function () { set人物榜([]) })
      }, [侧栏模式, 人物榜])

      useEffect(function () {
        if (侧栏模式 !== 'world' || 世界表) return
        请求('/world').then(function (d) { set世界表(d.groups || []) }).catch(function () { set世界表([]) })
      }, [侧栏模式, 世界表])

      // 时间轴（第一次打开才拉；勾「含旁述提及」会重拉）
      useEffect(function () {
        if (!时间轴) return
        var ac = new AbortController()
        set时间轴数据(null)
        请求('/timeline', { all: 时间轴含提及 ? 1 : 0 }, ac.signal)
          .then(function (d) { set时间轴数据(d) })
          .catch(function (e) {
            if (e.name === 'AbortError') return
            set时间轴数据({ 总数: 0, 全部数: 0, 覆盖剧情: 0, 覆盖小节: 0, 起: '—', 止: '—', 年表: [] })
          })
        return function () { ac.abort() }
      }, [时间轴, 时间轴含提及])

      useEffect(function () {
        var q = 输入.trim()
        if (q === '') { set结果(null); set已搜(''); set检索中(false); return }
        var ac = new AbortController()
        var timer = setTimeout(function () {
          set检索中(true)
          请求('/search', { q: q, limit: 12, category: 分类 || '', story: 仅本剧情 && 浏览 ? 浏览.story.name : '' }, ac.signal)
            .then(function (d) { set结果(d); set已搜(q); set检索中(false) })
            .catch(function (e) {
              if (e.name === 'AbortError') return
              set结果({ hits: [], units: [], ms: 0, query: q })
              set检索中(false)
            })
        }, 240)
        return function () { clearTimeout(timer); ac.abort() }
      }, [输入, 分类, 仅本剧情, 浏览])

      useEffect(function () {
        if (!档案) { set档案数据(null); return }
        var ac = new AbortController()
        set档案数据(null)
        请求('/who', { name: 档案, samples: 4, co: 14 }, ac.signal)
          .then(function (d) { set档案数据(d) })
          .catch(function (e) { if (e.name !== 'AbortError') set档案数据({ name: 档案, total: 0, error: e.message }) })
        return function () { ac.abort() }
      }, [档案])

      useEffect(function () {
        var el = 主区ref.current
        if (el) el.scrollTop = 0
      }, [阅读, 浏览, 结果, 档案, 看收藏, 时间轴])

      var re = useMemo(function () { return 结果 ? 造正则(结果.units) : null }, [结果])

      var 序列 = useMemo(function () {
        if (!catalog || !阅读) return []
        for (var i = 0; i < catalog.categories.length; i++) {
          var c = catalog.categories[i]
          for (var j = 0; j < c.stories.length; j++) {
            var s = c.stories[j]
            if (s.episodes.some(function (e) { return e.id === 阅读.episodeId })) return s.episodes
          }
        }
        return []
      }, [catalog, 阅读])

      var 序 = 序列.findIndex ? 序列.findIndex(function (e) { return e.id === (阅读 && 阅读.episodeId) }) : -1
      var 上一集 = 序 > 0 ? 序列[序 - 1].id : null
      var 下一集 = 序 >= 0 && 序 < 序列.length - 1 ? 序列[序 + 1].id : null

      function 集信息(id) {
        if (catalog) {
          for (var i = 0; i < catalog.categories.length; i++) {
            var c = catalog.categories[i]
            for (var j = 0; j < c.stories.length; j++) {
              var s = c.stories[j]
              for (var k = 0; k < s.episodes.length; k++) {
                if (s.episodes[k].id === id) {
                  return { id: id, title: s.episodes[k].title, label: c.name + ' / ' + s.name + ' / ' + s.episodes[k].title }
                }
              }
            }
          }
        }
        return { id: id, title: id, label: id }
      }

      function 打开档案(名, 类) {
        set档案(名)
        set档案类(类 || '人物')
      }

      function 切换展开(name) {
        set展开(function (old) {
          var n = Object.assign({}, old)
          n[name] = !n[name]
          return n
        })
      }

      function 打开集(id, chunk) {
        set档案(null); set看收藏(false); set时间轴(false)
        set阅读({ episodeId: id, chunk: chunk == null ? null : chunk })
      }

      function 打开剧情(category, story) {
        set阅读(null); set档案(null); set看收藏(false); set输入('')
        set浏览({ category: category, story: story })
      }

      function 打开剧情档(category, name) {
        if (catalog) {
          for (var i = 0; i < catalog.categories.length; i++) {
            var c = catalog.categories[i]
            for (var j = 0; j < c.stories.length; j++) {
              if (c.stories[j].name === name && (!category || c.name === category)) {
                打开剧情(c.name, c.stories[j])
                return
              }
            }
          }
        }
        set输入(name)
      }

      function 改字号(d) {
        set字号(function (old) {
          var next = Math.min(22, Math.max(13, old + d))
          try { localStorage.setItem(FONT_KEY, String(next)) } catch (e) { /* ignore */ }
          return next
        })
      }

      function 切换收藏(ep, chunk) {
        set收藏(function (old) {
          var idx = old.findIndex(function (x) { return x.id === ep.id })
          var next = idx >= 0
            ? old.filter(function (x) { return x.id !== ep.id })
            : [{ id: ep.id, chunk: chunk == null ? null : chunk, title: ep.title || ep.id, label: ep.label || '', at: Date.now() }].concat(old)
          存收藏(next)
          return next
        })
      }

      // ---------- 主区 ----------
      var 主区 = null
      if (档案) {
        主区 = h(档案视图, {
          t: t,
          data: 档案数据,
          loading: !档案数据,
          error: 档案数据 && 档案数据.error ? 档案数据.error : '',
          kind: 档案类,
          onBack: function () { set档案(null) },
          onWho: function (n) { 打开档案(n, '人物') },
          onAffil: function (n, 类) { 打开档案(n, 类 || '人物') },
          onSearch: function (n) { set档案(null); set输入(n) },
          onStory: function (c, s) { set档案(null); 打开剧情档(c, s) },
          onOpenChunk: function (id, chunk) { 打开集(id, chunk) },
        })
      } else if (时间轴) {
        主区 = h(时间轴视图, {
          t: t,
          data: 时间轴数据,
          含提及: 时间轴含提及,
          on含提及: set时间轴含提及,
          分类: 时间轴分类,
          on分类: set时间轴分类,
          展开年: 展开年,
          展开年代: 展开年代,
          on展开年代: set展开年代,
          年查: 年查,
          on年查: set年查,
          展开桶: 展开桶,
          on展开桶: function (桶) {
            set展开桶(function (old) {
              var n = Object.assign({}, old)
              var 当前 = old[桶] === undefined ? (桶 === '远古' || 桶 === '存疑') : old[桶]
              n[桶] = !当前
              return n
            })
          },
          on展开年: function (y) {
            set展开年(function (old) {
              var n = Object.assign({}, old)
              n[y] = old[y] === false ? true : false
              return n
            })
          },
          onBack: function () { set时间轴(false) },
          onOpen: function (id, chunk) {
            set时间轴(false)
            打开集(id, chunk)
          },
        })
      } else if (阅读) {
        主区 = h(阅读器, {
          t: t,
          episodeId: 阅读.episodeId,
          chunk: 阅读.chunk,
          re: re,
          prevId: 上一集,
          nextId: 下一集,
          onStep: function (id) { 打开集(id, null) },
          onBack: function () { set阅读(null) },
          backLabel: 浏览 && !已搜 ? t('backToStory') : t('back'),
          字号: 字号,
          onFont: 改字号,
          onWho: function (n) { 打开档案(n, '人物') },
          isFav: 收藏.some(function (x) { return x.id === 阅读.episodeId }),
          onFav: function () { 切换收藏(集信息(阅读.episodeId), 阅读.chunk) },
        })
      } else if (看收藏) {
        主区 = h('div', { className: 'akl-inner' },
          h('div', { className: 'akl-toolbar' },
            h('span', { className: 'akl-crumb' }, t('favs') + ' · ' + 收藏.length),
            h('span', { className: 'akl-spacer' }),
            h('button', { className: 'akl-btn', type: 'button', onClick: function () { set看收藏(false) } }, '返回'),
          ),
          收藏.length === 0
            ? h('div', { className: 'akl-empty' }, t('favEmpty'))
            : 收藏.map(function (f) {
              return h('div', { key: f.id, className: 'akl-fav-item' },
                h('button', {
                  type: 'button', className: 'akl-row', title: f.label,
                  onClick: function () { 打开集(f.id, f.chunk) },
                },
                  h('span', { className: 'id' }, f.id),
                  h('span', { className: 'nm' }, f.title),
                  h('span', { className: 'ph' }, (f.label || '').split(' / ')[1] || ''),
                ),
                h('button', {
                  type: 'button', className: 'akl-del',
                  onClick: function () { 切换收藏({ id: f.id }, null) }, title: '移除',
                }, '×'),
              )
            }),
        )
      } else if (浏览) {
        var 剧 = 浏览.story
        主区 = h('div', { className: 'akl-inner' },
          h('div', { className: 'akl-toolbar' },
            h('button', { className: 'akl-btn', type: 'button', onClick: function () { set浏览(null) } }, ICON.back, t('backToStory')),
            h('span', { className: 'akl-spacer' }),
          ),
          h('div', { className: 'akl-crumb' }, 浏览.category),
          h('div', { className: 'akl-ep-title' }, 剧.name),
          h('div', { className: 'akl-ep-meta' }, t('episodes', { n: 剧.episodes.length })),
          剧.episodes.map(function (e) {
            return h('button', {
              key: e.id, type: 'button', className: 'akl-row',
              onClick: function () { 打开集(e.id, null) },
            },
              h('span', { className: 'id' }, e.id),
              h('span', { className: 'nm' }, e.title),
              h('span', { className: 'ph' }, e.meta || ''),
            )
          }),
        )
      } else if (结果) {
        // 只有宿主判定「这是个人物」时才给档案入口
        var 角色 = 结果.character || null
        var 地点 = 结果.place || null
        var 可建档 = 角色 || 地点
        主区 = h('div', { className: 'akl-inner' },
          h('div', { className: 'akl-toolbar' },
            h('span', { className: 'akl-crumb' }, 检索中 ? t('searching') : t('hits', { n: 结果.hits.length, ms: 结果.ms })),
            结果.aliasText ? h('span', { className: 'akl-alias', title: '别名与正名都搜了' }, '别名 ' + 结果.aliasText) : null,
            h('span', { className: 'akl-spacer' }),
            可建档 ? h('button', {
              className: 'akl-btn', type: 'button',
              onClick: function () {
                if (角色) 打开档案(角色.name, '人物')
                else 打开档案(地点.name, 地点.kind)
              },
              title: '看「' + (角色 ? 角色.name : 地点.name) + '」的出场档案',
            }, '档案「' + (角色 ? 角色.name : 地点.name) + '」') : null,
          ),
          结果.hits.length === 0
            ? h('div', { className: 'akl-empty' }, h('span', { className: 'big' }, t('noHits')))
            : 结果.hits.map(function (hit) {
              return h(结果卡, {
                key: hit.chunkId, hit: hit, re: re,
                onOpen: function (x) { 打开集(x.episodeId, Number(x.chunkId.split('#')[1])) },
              })
            }),
        )
      } else {
        var 卡 = (catalog ? catalog.categories : []).map(function (c) {
          return h('div', { key: c.name, className: 'akl-card' },
            h('div', { className: 'k' }, c.name),
            h('div', { className: 'v' }, c.stories.length, h('span', { className: 'u' }, '个剧情')),
          )
        })
        主区 = h('div', { className: 'akl-inner' },
          h('div', { className: 'akl-hero' },
            h('h2', null, t('title')),
            h('p', null, '本机离线剧情库：全部原文都在里面，按人名、台词、势力都能搜到。左边挑一段读，或直接搜一句话。'),
            h('div', { className: 'akl-cards' }, 卡),
            h('button', {
              className: 'akl-cta', type: 'button',
              onClick: function () { set侧栏模式('cast') },
            }, ICON.user, '浏览人物'),
            h('button', {
              className: 'akl-cta', type: 'button',
              onClick: function () {
                set档案(null); set阅读(null); set看收藏(false); set输入('')
                set时间轴(true)
              },
            }, ICON.clock, '时间轴'),
            h('div', { className: 'akl-tip' },
              h('div', null, '共 ', h('b', null, stats ? stats.episodes : '—'), ' 小节 / ', h('b', null, stats ? stats.chunks : '—'), ' 个场景，覆盖 主线 · 活动 · 故事集 · 干员密录。'),
              h('div', null, '搜索技巧：多个词空格分隔 = 同时出现；', h('b', null, '+词'), ' 必须包含、', h('b', null, '-词'), ' 排除、', h('b', null, '"整句"'), ' 必须原样出现。'),
              h('div', null, '阅读时点说话人名字，可以直接看这个角色的档案。'),
              h('div', { style: { opacity: .75 } }, '剧情文本版权归鹰角网络所有，仅供个人查阅。'),
            ),
          ),
        )
      }

      var 统计 = stats ? t('stats', {
        episodes: stats.episodes, chunks: stats.chunks, chars: Math.round(stats.chars / 10000),
      }) : ''

      // 检索范围只在「正在搜」时露出来：聚焦搜索框、有输入、或已经选了分类
      var 显示范围 = 检索焦点 || 输入.trim() !== '' || 分类 !== ''

      return h('div', { className: 'akl-root' },
        h('div', { className: 'akl-head' },
          h('div', { className: 'akl-brand' },
            h('div', { className: 'akl-logo' }, ICON.book),
            h('div', { className: 'akl-titles' },
              h('div', { className: 'akl-title' }, t('title')),
              h('div', { className: 'akl-meta' }, 统计),
            ),
          ),
          h('div', { className: 'akl-search' },
            h('span', { className: 'akl-sicon' }, ICON.search),
            h('input', {
              className: 'akl-input',
              ref: 搜索ref,
              value: 输入,
              placeholder: t('searchPlaceholder'),
              onChange: function (e) {
                set输入(e.target.value)
                set看收藏(false)
                set档案(null)
                if (e.target.value.trim() === '') set阅读(null)
              },
              onFocus: function () { set检索焦点(true) },
              onBlur: function () { set检索焦点(false) },
              onKeyDown: function (e) {
                if (e.key === 'Escape') 清空搜索()
              },
              'aria-label': t('searchPlaceholder'),
            }),
            输入 ? h('button', {
              className: 'akl-clear', type: 'button', title: '清空搜索（Esc）', onClick: 清空搜索,
            }, '×') : null,
          ),
          h('div', {
            className: 'akl-scope-row' + (显示范围 ? '' : ' is-hidden'),
            onMouseDown: function (e) { e.preventDefault() },
          },
            h('span', { className: 'akl-scope-label' }, '检索范围'),
            h('button', {
              type: 'button', className: 'akl-chip' + (分类 ? '' : ' on'),
              onClick: function () { set分类('') },
            }, '全部'),
            分类表.map(function (c) {
              return h('button', {
                key: c, type: 'button', className: 'akl-chip' + (分类 === c ? ' on' : ''),
                onClick: function () { set分类(分类 === c ? '' : c) },
              }, c.replace('剧情', ''))
            }),
            浏览 ? h('label', { className: 'akl-tog', style: { marginLeft: '6px' } },
              h('input', {
                type: 'checkbox', checked: 仅本剧情,
                onChange: function (e) { set仅本剧情(e.target.checked) },
              }),
              '只搜「' + 浏览.story.name + '」') : null,
          ),
        ),
        h('div', { className: 'akl-body' },
          catalogErr
            ? h('div', { className: 'akl-empty' }, t('noCatalog') + ' ' + catalogErr)
            : h(侧栏, {
              t: t,
              mode: 侧栏模式,
              onMode: set侧栏模式,
              catalog: catalog,
              filter: 侧栏过滤,
              onFilter: set侧栏过滤,
              cast: 人物榜,
              castFilter: 人物过滤,
              onCastFilter: set人物过滤,
              on过滤: function (v) {
                if (侧栏模式 === 'cast') set人物过滤(v)
                else if (侧栏模式 === 'world') set世界过滤(v)
                else set侧栏过滤(v)
              },
              current: 浏览,
              展开: 展开,
              onToggle: 切换展开,
              onStory: 打开剧情,
              onWho: function (n) { set侧栏模式('cast'); 打开档案(n, '人物') },
              world: 世界表,
              worldFilter: 世界过滤,
              onWorldFilter: set世界过滤,
              onWorld: function (名, 类) { 打开档案(名, 类) },
              展开世界: 展开世界,
              onWorldToggle: function (类) {
                set展开世界(function (old) {
                  var n = Object.assign({}, old)
                  n[类] = old[类] === false ? true : false
                  return n
                })
              },
              分类表: 分类表,
              分类: 分类,
              on分类: function (c) { set分类(c); set看收藏(false) },
              仅本剧情: 仅本剧情,
              on仅本剧情: set仅本剧情,
              收藏数: 收藏.length,
              onFavs: function () {
                set输入(''); set阅读(null); set档案(null)
                set看收藏(function (v) { return !v })
              },
            }),
          h('div', { className: 'akl-main', ref: 主区ref }, 主区),
        ),
      )
    }

    // ---------------- 侧边栏图标 ----------------

    function 图标(props) {
      var size = (props && props.size) || 20
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true', style: { display: 'block', opacity: props && props.active ? 1 : 0.85 },
      },
        h('path', { d: 'M4 5.2c2.4-.9 5-.9 8 .8v12c-3-1.7-5.6-1.7-8-.8z' }),
        h('path', { d: 'M20 5.2c-2.4-.9-5-.9-8 .8v12c3-1.7 5.6-1.7 8-.8z' }),
        h('path', { d: 'M9.2 9.6h1.6M13.2 9.6h1.6M9.2 12.6h1.6M13.2 12.6h1.6' }),
      )
    }

    // ---------------- 注册 ----------------

    function apply(ctx) {
      ctx.effect(function () {
        var id = 'dsh-arknights-lore-styles'
        if (document.getElementById(id) === null) {
          var style = document.createElement('style')
          style.id = id
          style.textContent = CSS
          document.head.appendChild(style)
        }
        return function () {
          var el = document.getElementById(id)
          if (el !== null && el.parentNode !== null) el.parentNode.removeChild(el)
        }
      }, 'dsh-arknights-lore: styles')

      var locale = ctx.get ? ctx.get('locale') : null
      var t = 翻译(ZH)
      if (locale) {
        try {
          ctx.effect(function () {
            var d1 = locale.register(NS, 'zh', ZH)
            var d2 = locale.register(NS, 'en', EN)
            return function () { d1 && d1(); d2 && d2() }
          }, 'dsh-arknights-lore: locale')
          var bound = locale.bind(NS)
          t = function (key, 参数) { return bound(key, 参数) }
        } catch (e) { /* 语言包注册失败就用内置中文 */ }
      }

      var 组件 = function () { return h(面板, { t: t }) }

      ctx.slots.inject('sidebar.panellist', function () {
        return ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'arknights-lore',
          order: 20,
          label: function () { return t('title') },
        }, function (props) { return h(图标, props || {}) })
      })

      ctx.slots.inject('main', function () {
        return ctx.slots.register({ name: 'main', key: 'arknights-lore' }, 组件)
      })
    }

    module.exports = { name: 'arknights-lore', inject: ['slots'], apply: apply }
    return module.exports
  },
})
