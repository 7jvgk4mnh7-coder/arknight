/**
 * search.mjs —— 方舟剧情语料的检索核心（宿主与构建/测试共用）
 *
 * 语料单位是「场景块」（约 1000 字，不跨集）。检索用「中文二元组 + BM25」：
 *   - 中文不切词，按相邻两字切 bigram；英文/数字按空白与标点切 token
 *   - 一次扫描算出每个块的 tf 与全库 df，再按 BM25 打分
 *   - 整句命中（query 去掉分隔符）额外加权，让「原句」优先
 * 1 万多个块，单次查询几十毫秒。
 */

const 分隔符 = /[\s,，、;；:：/\\|!！?？·・.。…"'“”‘’()（）\[\]【】<>《》{}「」『』~—\-_+=*&^%$#@`]+/
const 停用单位 = new Set(['的了', '是了', '我们', '你们', '他们', '这个', '那个', '什么', '一个', '不是', '没有', '就是', '可以', '这样', '那样', '自己', '现在'])

export function 建索引(数据, 选项 = {}) {
  const 块文本 = []
  const 块小写 = []
  const 块所属集 = []
  const 块序 = []
  let 总长 = 0
  const episodes = 数据.episodes || []
  for (let i = 0; i < episodes.length; i++) {
    const 集 = episodes[i]
    let ord = 0
    for (const 块 of 集.chunks || []) {
      const t = 块.text || ''
      const low = /[A-Z]/.test(t) ? t.toLowerCase() : t
      块文本.push(t)
      块小写.push(low)
      块所属集.push(i)
      块序.push(ord++)
      总长 += t.length
    }
  }
  const 平均长 = 块文本.length > 0 ? 总长 / 块文本.length : 1
  const 剧集表 = new Map()
  episodes.forEach((e, i) => 剧集表.set(e.id, i))
  return {
    episodes,
    categories: 数据.categories || [],
    stats: 数据.stats || {},
    builtAt: 数据.builtAt || '',
    块文本, 块小写, 块所属集, 块序, 平均长,
    剧集表,
    ...选项,
  }
}

/**
 * 解析查询串，支持三种操作符：
 *   "整句短语"  必须原样出现（也参与排序加权）
 *   +词         必须包含（AND）
 *   -词         必须不含（排除）
 * 其余词照常参与 BM25。
 */
export function 解析查询(query) {
  let 原文 = String(query || '').toLowerCase().trim()
  const 短语 = []
  原文 = 原文.replace(/"([^"]{1,})"/g, (_m, p) => {
    const t = p.trim()
    if (t) 短语.push(t)
    return ' '
  })
  const tokens = 原文.split(分隔符).filter((x) => x.length > 0)
  const 必须 = []
  const 排除 = []
  const 普通 = []
  for (const tk of tokens) {
    if (tk.length > 1 && tk.startsWith('+')) { 必须.push(tk.slice(1)); continue }
    if (tk.length > 1 && (tk.startsWith('-') || tk.startsWith('−'))) { 排除.push(tk.slice(1)); continue }
    普通.push(tk)
  }
  const 单位集 = new Set()
  for (const tk of [...普通, ...必须, ...短语]) {
    if (tk.length === 1) { 单位集.add(tk); continue }
    for (let i = 0; i + 2 <= tk.length; i++) 单位集.add(tk.slice(i, i + 2))
  }
  const 单位 = [...单位集].filter((u) => !停用单位.has(u))
  return {
    单位: 单位.length > 0 ? 单位 : [...单位集],
    整句: [...普通, ...短语].join(''),
    必须: [...必须, ...短语],
    排除,
    原文: String(query || '').trim(),
  }
}

function 查询单位(query) {
  return 解析查询(query)
}

function 计数(text, unit, 上限 = 30) {
  let n = 0
  let at = text.indexOf(unit)
  while (at >= 0 && n < 上限) {
    n += 1
    at = text.indexOf(unit, at + unit.length)
  }
  return n
}

/** 全库检索：返回 { hits: [...], 单位, 用时 } */
export function 检索(索引, query, 选项 = {}) {
  const 起 = Date.now()
  const { 单位, 整句, 必须, 排除 } = 查询单位(query)
  if (单位.length === 0) return { hits: [], 单位: [], 用时: 0 }

  const 分类 = 选项.category || ''
  const 剧情 = 选项.story || ''
  const 限制集 = new Set()
  if (分类 || 剧情) {
    索引.episodes.forEach((e, i) => {
      if (分类 && e.category !== 分类) return
      if (剧情 && !e.story.includes(剧情)) return
      限制集.add(i)
    })
  }

  const N = 索引.块文本.length
  const 命中块 = []
  const df = new Map()
  for (const u of 单位) df.set(u, 0)

  // 第一遍：逐块算 tf，顺带统计 df
  const 块单元 = 索引.块小写
  const 上限 = 选项.maxScan ?? Infinity
  for (let i = 0; i < N && i < 上限; i++) {
    if (限制集.size > 0 && !限制集.has(索引.块所属集[i])) continue
    const text = 块单元[i]
    if (text.length === 0) continue
    // 操作符过滤放在打分之前，省得白算
    if (必须.length > 0 && !必须.every((t) => text.includes(t))) continue
    if (排除.length > 0 && 排除.some((t) => text.includes(t))) continue
    let 有 = false
    const tf = new Map()
    for (const u of 单位) {
      const n = 计数(text, u)
      if (n > 0) {
        tf.set(u, n)
        有 = true
      }
    }
    if (!有) continue
    for (const u of tf.keys()) df.set(u, (df.get(u) || 0) + 1)
    命中块.push({ i, tf })
  }

  if (命中块.length === 0) return { hits: [], 单位, 用时: Date.now() - 起 }

  // 第二遍：BM25 + 整句加权
  const k1 = 1.2
  const b = 0.75
  const idf = new Map()
  for (const [u, d] of df) idf.set(u, Math.log(1 + (N - d + 0.5) / (d + 0.5)))

  const 结果 = []
  for (const 命 of 命中块) {
    const len = 索引.块文本[命.i].length
    let score = 0
    for (const [u, tf] of 命.tf) {
      const w = idf.get(u) || 0
      score += w * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * len) / 索引.平均长)))
    }
    if (score <= 0) continue
    const 覆盖率 = 命.tf.size / 单位.length
    score *= 0.45 + 0.55 * 覆盖率
    if (整句.length >= 3 && 索引.块小写[命.i].includes(整句)) score *= 1.7
    结果.push({ ...命, score, 覆盖率 })
  }
  结果.sort((a, x) => x.score - a.score)

  // 同集相邻块合并提示：保留原样，但同集最多取 maxPerEpisode 条
  const 每集上限 = 选项.maxPerEpisode ?? 2
  const 已用 = new Map()
  const hits = []
  const 目标条数 = 选项.limit ?? 6
  for (const r of 结果) {
    const 集 = 索引.块所属集[r.i]
    const n = 已用.get(集) || 0
    if (n >= 每集上限) continue
    已用.set(集, n + 1)
    hits.push(包装命中(索引, r, 单位, 整句))
    if (hits.length >= 目标条数) break
  }
  return { hits, 单位, 用时: Date.now() - 起 }
}

function 取片段(text, 单位, 整句, 半径 = 130) {
  const low = text.toLowerCase()
  let at = -1
  let 命中词 = ''
  if (整句.length >= 3) {
    const p = low.indexOf(整句)
    if (p >= 0) { at = p; 命中词 = 整句 }
  }
  if (at < 0) {
    for (const u of 单位) {
      const p = low.indexOf(u)
      if (p >= 0 && (at < 0 || p < at)) { at = p; 命中词 = u }
    }
  }
  if (at < 0) return { 片段: text.slice(0, 半径 * 2), 前缀: false, 后缀: text.length > 半径 * 2, 命中词 }
  const 起 = Math.max(0, at - 半径)
  const 止 = Math.min(text.length, at + 半径)
  return {
    片段: text.slice(起, 止),
    前缀: 起 > 0,
    后缀: 止 < text.length,
    命中词,
  }
}

function 包装命中(索引, r, 单位, 整句) {
  const 集Idx = 索引.块所属集[r.i]
  const 集 = 索引.episodes[集Idx]
  const text = 索引.块文本[r.i]
  const 段 = 取片段(text, 单位, 整句)
  return {
    chunkId: `${集.id}#${索引.块序[r.i]}`,
    episodeId: 集.id,
    label: 集.label,
    category: 集.category,
    story: 集.story,
    title: 集.title,
    meta: 集.meta,
    score: Math.round(r.score * 100) / 100,
    coverage: Math.round(r.覆盖率 * 100) / 100,
    snippet: 段.片段,
    前缀: 段.前缀,
    后缀: 段.后缀,
    命中词: 段.命中词,
  }
}

/** 某个人名/名词的分布：哪些集提到、各提几次 */
export function 检索提及(索引, 名字, 选项 = {}) {
  const 名 = String(名字 || '').trim()
  if (名.length === 0) return { name: 名, total: 0, episodes: [] }
  const 结果 = []
  let 总 = 0
  索引.episodes.forEach((集, i) => {
    let n = 0
    for (const 块 of 集.chunks || []) {
      const p = 块.text.toLowerCase()
      const q = 名.toLowerCase()
      let at = p.indexOf(q)
      while (at >= 0) {
        n += 1
        at = p.indexOf(q, at + q.length)
      }
    }
    if (n > 0) {
      总 += n
      结果.push({ episodeId: 集.id, label: 集.label, category: 集.category, story: 集.story, title: 集.title, meta: 集.meta, count: n })
    }
  })
  结果.sort((a, b) => b.count - a.count)
  return { name: 名, total: 总, episodeCount: 结果.length, episodes: 结果.slice(0, 选项.limit ?? 24) }
}

/** 按 id 或文字找一集 */
export function 找剧集(索引, 标识) {
  const 原 = String(标识 || '').trim()
  if (原.length === 0) return { 匹配: [], 精确: null }
  const m = 原.match(/^#?[Ee]?(\d{1,5})$/)
  if (m) {
    const i = Number(m[1]) - 1
    if (i >= 0 && i < 索引.episodes.length) return { 匹配: [], 精确: 索引.episodes[i] }
  }
  const 命中 = 索引.episodes.filter((e) => {
    const 标签 = `${e.category} / ${e.story} / ${e.title}（${e.meta}）`.toLowerCase()
    return 标签.includes(原.toLowerCase()) || e.id.toLowerCase() === 原.toLowerCase()
  })
  if (命中.length === 1) return { 匹配: [], 精确: 命中[0] }
  // 退一步：按词分片全部命中
  const 词 = 原.split(分隔符).filter(Boolean)
  if (词.length > 1) {
    const 二轮 = 索引.episodes.filter((e) => {
      const 标签 = `${e.category} / ${e.story} / ${e.title}（${e.meta}）`.toLowerCase()
      return 词.every((w) => 标签.includes(w.toLowerCase()))
    })
    if (二轮.length === 1) return { 匹配: [], 精确: 二轮[0] }
    return { 匹配: 二轮.slice(0, 12), 精确: null }
  }
  return { 匹配: 命中.slice(0, 12), 精确: null }
}

/** 某集的正文（可按块/段截取） */
export function 读剧集(索引, 集, 选项 = {}) {
  const 全 = (集.chunks || []).map((c) => c.text).join('\n\n')
  const 段落 = 全.split(/\n{2,}/).filter((x) => x.trim().length > 0)
  const 起 = Math.max(0, Number(选项.offset) || 0)
  const 数 = Math.min(段落.length - 起, Math.max(1, Number(选项.limit) || 段落.length))
  const 选中 = 段落.slice(起, 起 + 数)
  return {
    episodeId: 集.id,
    label: 集.label,
    totalParagraphs: 段落.length,
    offset: 起,
    paragraphs: 选中,
    hasMore: 起 + 数 < 段落.length,
  }
}

export function 目录(索引) {
  return {
    stats: 索引.stats,
    builtAt: 索引.builtAt,
    categories: 索引.categories.map((c) => ({
      name: c.name,
      stories: c.stories.map((s) => ({
        name: s.name,
        no: s.no,
        episodes: s.episodes.map((e) => ({ id: e.id, title: e.title, meta: e.meta })),
      })),
    })),
  }
}

// ---------------- 角色档案 ----------------

/** 一集里每个说话人说了多少句（按 `名字：` 行首识别），懒算并缓存 */
function 集说话人(索引, i) {
  if (!索引._说话人) 索引._说话人 = new Array(索引.episodes.length)
  let m = 索引._说话人[i]
  if (m) return m
  m = new Map()
  const 集 = 索引.episodes[i]
  for (const 块 of 集.chunks || []) {
    for (const 行 of 块.text.split('\n')) {
      const mm = /^([^\s：:]{1,12})[：:]/.exec(行)
      if (mm) m.set(mm[1], (m.get(mm[1]) || 0) + 1)
    }
  }
  索引._说话人[i] = m
  return m
}

/** 全库说话人统计：名字 → { lines, episodes }（懒算并缓存） */
export function 人物统计(索引) {
  if (索引._人物统计) return 索引._人物统计
  const 表 = new Map()
  for (let i = 0; i < 索引.episodes.length; i++) {
    for (const [n, c] of 集说话人(索引, i)) {
      if (/^[？?…—\-·\s]+$/.test(n)) continue
      const cur = 表.get(n) || { name: n, lines: 0, episodes: 0 }
      cur.lines += c
      cur.episodes += 1
      表.set(n, cur)
    }
  }
  索引._人物统计 = 表
  return 表
}

// 「医疗干员」「整合运动成员」这类喊法不是角色
const 通用称呼 = /(干员|成员|士兵|卫兵|佣兵|军官|守卫|警卫|村民|居民|市民|学生|商人|工人|矿工|记者|研究员|学者|医生|护士|术师|术士|狙击手|狙击|近卫|重装|先锋|辅助|特种|队长|领队|干部|信徒|教徒|刺客|杀手|弩手|盾卫|幻影|拾荒者|走私犯|赏金|猎人|骑士|斗士|囚犯|犯人|难民|老人|女人|男人|孩子|少女|少年|男子|女子|路人|人群|声音|众人|敌人|敌军|匪徒|强盗|帮凶|打手|混混|小弟|店主|老板|店员|服务员|司机|感染者|病人|伤员|平民|战士|卫队|部队|军队|运动|军团|教会|议会|委员会|商队|商会|公会|组织)$/

/** 这个查询是不是在问一个「角色」：说话人名（且不是群体称呼），或者别名指向角色 */
export function 是否人物(索引, 词, 解) {
  const 原 = String(词 || '').trim()
  if (!原 || /\s/.test(原)) return false
  if (解 && 解.命中) return true // 别名表里的都是明确的人物/阵营指向，按人物处理
  const 统计 = 人物统计(索引)
  const x = 统计.get(原)
  if (!x) return false
  if (x.lines < 3) return false // 只喊过一两句的路人
  if (通用称呼.test(原)) return false
  return true
}

/** 全库说话人排行（按台词句数），给面板做「人物」入口；滤掉「医疗干员」这类群体称呼 */
export function 人物榜(索引, 选项 = {}) {
  return [...人物统计(索引).values()]
    .filter((x) => x.lines >= 3 && !通用称呼.test(x.name))
    .sort((a, b) => b.lines - a.lines)
    .slice(0, Math.min(500, 选项.limit ?? 80))
}

/** 某集出场最多的说话人 */
export function 集人物(索引, 集Idx, 选项 = {}) {
  const m = 集说话人(索引, 集Idx)
  return [...m.entries()]
    .filter(([n]) => !/^[？?…—\-·\s]+$/.test(n)) // 过滤「？？？」这类匿名说话人
    .sort((a, b) => b[1] - a[1])
    .slice(0, 选项.limit ?? 3)
    .map(([name, lines]) => ({ name, lines }))
}

/**
 * 人物/名词档案：出场次数、跨哪些剧情、首次与最近、常同场的人、代表片段。
 * 名字可以是干员名、组织名、地名，纯文本匹配。
 */
export function 人物档案(索引, 名字, 选项 = {}) {
  const 名 = String(名字 || '').trim()
  const 空 = { name: 名, total: 0, episodeCount: 0, first: null, last: null, stories: [], coSpeakers: [], samples: [] }
  if (!名) return 空
  const 小写 = 名.toLowerCase()

  const 集们 = []
  let 总 = 0
  for (let i = 0; i < 索引.episodes.length; i++) {
    const 集 = 索引.episodes[i]
    let n = 0
    for (const 块 of 集.chunks || []) {
      n += 计数(块.text.toLowerCase(), 小写, 400)
      if (n > 4000) break
    }
    if (n > 0) {
      总 += n
      集们.push({ i, 集, n })
    }
  }
  if (集们.length === 0) return 空

  // 按剧情聚合
  const 剧情表 = new Map()
  for (const x of 集们) {
    const key = x.集.category + '\u0001' + x.集.story
    const cur = 剧情表.get(key) || { category: x.集.category, story: x.集.story, episodes: 0, mentions: 0 }
    cur.episodes += 1
    cur.mentions += x.n
    剧情表.set(key, cur)
  }

  // 同场：这些集里说得最多的其他人（按共同出现的集数排）
  const 同场 = new Map()
  for (const x of 集们) {
    for (const [sp, 句数] of 集说话人(索引, x.i)) {
      if (句数 < 2) continue
      if (/^[？?…—\-·\s]+$/.test(sp)) continue
      if (sp.includes(名) || 名.includes(sp)) continue
      const cur = 同场.get(sp) || { name: sp, episodes: 0, lines: 0 }
      cur.episodes += 1
      cur.lines += 句数
      同场.set(sp, cur)
    }
  }

  // 代表片段：提及最多的小节，各取第一处
  const 样本 = [...集们]
    .sort((a, b) => b.n - a.n)
    .slice(0, 选项.samples ?? 3)
    .map((x) => {
      for (let ci = 0; ci < (x.集.chunks || []).length; ci++) {
        const t = x.集.chunks[ci].text
        const at = t.toLowerCase().indexOf(小写)
        if (at < 0) continue
        const 起 = Math.max(0, at - 100)
        const 止 = Math.min(t.length, at + 170)
        return {
          chunkId: x.集.id + '#' + ci,
          episodeId: x.集.id,
          label: x.集.label,
          snippet: (起 > 0 ? '…' : '') + t.slice(起, 止).replace(/\n+/g, ' ') + (止 < t.length ? '…' : ''),
        }
      }
      return null
    })
    .filter(Boolean)

  return {
    name: 名,
    total: 总,
    episodeCount: 集们.length,
    first: 集们[0].集,
    last: 集们[集们.length - 1].集,
    stories: [...剧情表.values()].sort((a, b) => b.mentions - a.mentions),
    coSpeakers: [...同场.values()].sort((a, b) => b.episodes - a.episodes).slice(0, 选项.co ?? 10),
    samples: 样本,
  }
}

// ---------------- 剧情速览 ----------------

/** 按名字找剧情（返回可能多条） */
export function 找剧情(索引, 名) {
  const 原 = String(名 || '').trim()
  if (!原) return []
  const 命中 = []
  for (const c of 索引.categories || []) {
    for (const s of c.stories || []) {
      if (s.name.includes(原)) 命中.push({ category: c.name, story: s })
    }
  }
  return 命中
}

function 截(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

/** 一集里最适合当「开场梗概」的一句：跳过「937年」这种标题行和短促的惊叹 */
function 首句(集) {
  const 段 = (集.chunks?.[0]?.text || '').split(/\n{2,}/).map((x) => x.trim()).filter(Boolean)
  const 长 = 段.find((x) => x.length >= 14)
  const 中 = 段.find((x) => x.length >= 8)
  return 截(长 || 中 || 段[0] || '', 48)
}

/** 一集的速览：首尾段落 + 主要说话人 */
export function 集速览(索引, 集, 选项 = {}) {
  const 全 = (集.chunks || []).map((c) => c.text).join('\n\n')
  const 段 = 全.split(/\n{2,}/).filter((x) => x.trim().length > 0)
  const 集Idx = 索引.剧集表.get(集.id)
  return {
    kind: 'episode',
    id: 集.id,
    label: 集.label,
    category: 集.category,
    story: 集.story,
    title: 集.title,
    meta: 集.meta,
    paragraphs: 段.length,
    chars: 全.length,
    speakers: 集Idx == null ? [] : 集人物(索引, 集Idx, { limit: 选项.speakers ?? 6 }),
    opening: 段.slice(0, 2).map((x) => 截(x, 90)),
    ending: 段.slice(-2).map((x) => 截(x, 90)),
  }
}

/** 一个剧情的速览：每小节一行（说话人 + 开场句） */
export function 剧情速览(索引, 剧情, 选项 = {}) {
  const { category, story } = 剧情
  const eps = []
  for (const e of story.episodes) {
    const idx = 索引.剧集表.get(e.id)
    if (idx == null) continue
    const 集 = 索引.episodes[idx]
    eps.push({
      id: 集.id,
      title: 集.title,
      meta: 集.meta,
      chars: (集.chunks || []).reduce((a, c) => a + c.text.length, 0),
      speakers: 集人物(索引, idx, { limit: 3 }).map((x) => x.name),
      opening: 首句(集),
    })
  }
  return {
    kind: 'story',
    category,
    story: story.name,
    episodeCount: eps.length,
    chars: eps.reduce((a, e) => a + e.chars, 0),
    episodes: eps.slice(0, 选项.limit ?? 80),
  }
}

/** 统一入口：传剧集 ID / 剧集名 / 剧情名 → 对应的速览 */
export function 速览(索引, 目标, 选项 = {}) {
  const 原 = String(目标 || '').trim()
  if (!原) return { kind: 'none', candidates: [] }
  const { 精确, 匹配 } = 找剧集(索引, 原)
  if (精确) return 集速览(索引, 精确, 选项)
  const 剧情 = 找剧情(索引, 原)
  if (剧情.length === 1) return 剧情速览(索引, 剧情[0], 选项)
  return {
    kind: 'none',
    candidates: [
      ...剧情.slice(0, 8).map((x) => `${x.category} / ${x.story}`),
      ...匹配.slice(0, 8).map((e) => `${e.id}  ${e.label}`),
    ],
  }
}
