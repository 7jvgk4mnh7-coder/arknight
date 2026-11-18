/**
 * timeline.mjs —— 从全剧情里抽时间信息，拼一条跨剧情的时间轴
 *
 * 三类条目：
 *   1. 日期事件：1098年12月21日 / 1098年12月 / 1098年
 *      带「大概/据说」这类词的算「存疑」，不放进严格年份轴
 *   2. 时刻：同一段里有 4:15 P.M. 就一起带上
 *   3. 年代概念：远古 / 上古 / 太古 / 亘古 / 千年前 / 百年前 / 数十年前 / 多年前
 *      —— 这些没有具体年份，单独归「远古与年代不明」
 *
 * 结果懒算并缓存到索引上。
 */

const 日期式 = /\d{3,4}\s*年(?:\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*[日号])?)?/g
const 时刻式 = /\d{1,2}\s*[:：]\s*\d{2}\s*(?:[AaPp]\.?\s*[Mm]\.?)?/
const 约数式 = /(大概|大约|约莫|约|左右|可能|据说|也许|将近|至少|不到)[是为在于]?\s*$/

const 年代式 = [
  { re: /(太古|上古|远古|亘古|古早)/g, 桶: '远古', 序: 0 },
  { re: /(数千年前|千年前|千年以前|万年)/g, 桶: '千年之前', 序: 1 },
  { re: /(数百年前|百年前)/g, 桶: '数百年前', 序: 2 },
  { re: /(数十年前|几十年前|多年前)/g, 桶: '数十年前', 序: 3 },
]

// 只有月日、没写年份（「12月23日」）——单独归「年份不详」
const 月日式 = /\d{1,2}\s*月\s*\d{1,2}\s*[日号]/g

function 拆日期(原文) {
  const m = /(\d{3,4})\s*年(?:\s*(\d{1,2})\s*月(?:\s*(\d{1,2})\s*[日号])?)?/.exec(原文)
  if (!m) return null
  return { 年: Number(m[1]), 月: m[2] ? Number(m[2]) : 0, 日: m[3] ? Number(m[3]) : 0, 原文: 原文.replace(/\s+/g, '') }
}

function 截(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

export function 提取时间轴(索引) {
  if (索引._时间轴) return 索引._时间轴

  const 日期事件 = []
  const 年代事件 = []
  const 去重 = new Set()
  const 年去重 = new Set()

  for (let i = 0; i < 索引.episodes.length; i++) {
    const 集 = 索引.episodes[i]
    for (let ci = 0; ci < (集.chunks || []).length; ci++) {
      const 块 = 集.chunks[ci]
      for (const 段落 of 块.text.split(/\n{2,}/)) {
        const 段 = 段落.trim()
        if (!段) continue
        const 基础 = {
          episodeId: 集.id,
          chunkId: 集.id + '#' + ci,
          category: 集.category,
          story: 集.story,
          title: 集.title,
          meta: 集.meta,
          label: 集.label,
          text: 截(段, 90),
          order: i,
        }

        // 1) 日期
        日期式.lastIndex = 0
        let m
        while ((m = 日期式.exec(段)) !== null) {
          const 日 = 拆日期(m[0])
          if (!日) continue
          const key = 集.id + '#' + ci + '|' + 日.原文
          if (去重.has(key)) continue
          去重.add(key)
          const 位置 = 段.indexOf(m[0])
          const 时刻 = 时刻式.exec(段)
          日期事件.push(Object.assign({}, 基础, {
            年: 日.年,
            月: 日.月,
            日: 日.日,
            原文: 日.原文,
            时刻: 时刻 ? 时刻[0].replace(/\s+/g, '') : '',
            场景: 位置 <= 2,
            约: 约数式.test(段.slice(Math.max(0, 位置 - 12), 位置)),
          }))
        }

        // 2) 年代概念（每个小节每种说法只收一条）
        for (const 组 of 年代式) {
          组.re.lastIndex = 0
          let k
          while ((k = 组.re.exec(段)) !== null) {
            const key = 集.id + '|' + k[1]
            if (年去重.has(key)) continue
            年去重.add(key)
            年代事件.push(Object.assign({}, 基础, {
              桶: 组.桶,
              序: 组.序,
              词: k[1],
              场景: 0,
              约: false,
            }))
          }
        }
      }
    }
  }

  日期事件.sort((a, b) => {
    const ka = a.年 * 10000 + a.月 * 100 + a.日
    const kb = b.年 * 10000 + b.月 * 100 + b.日
    return ka !== kb ? ka - kb : a.order - b.order
  })

  // 严格年份轴（不含存疑）
  const 年表 = []
  for (const e of 日期事件) {
    if (e.约) continue
    let g = 年表[年表.length - 1]
    if (!g || g.年 !== e.年) {
      g = { 年: e.年, 条数: 0, 事件: [] }
      年表.push(g)
    }
    g.条数 += 1
    g.事件.push(e)
  }

  // 存疑：带「大概/据说」，或年份太小又出自转述（比如「大概是150年」）
  const 存疑 = []
  for (const e of 日期事件) {
    if (!(e.约 || (e.年 < 300 && !e.场景))) continue
    存疑.push(Object.assign({}, e, { 存疑: true }))
  }

  // 年代概念分组
  const 桶序 = ['远古', '千年之前', '数百年前', '数十年前']
  const 年代表 = 桶序
    .map((桶) => {
      const 事件 = 年代事件.filter((e) => e.桶 === 桶).sort((a, b) => a.order - b.order)
      return { 桶, 条数: 事件.length, 事件 }
    })
    .filter((g) => g.条数 > 0)

  const 覆盖剧情 = new Set([...日期事件, ...年代事件].map((e) => e.category + '/' + e.story)).size
  const 年份们 = [...new Set(年表.map((g) => g.年))].sort((a, b) => a - b)

  const 结果 = {
    总数: 年表.reduce((a, g) => a + g.条数, 0),
    场景数: 日期事件.filter((e) => e.场景 && !e.约).length,
    存疑数: 存疑.length,
    年代数: 年代事件.length,
    全部数: 日期事件.length + 年代事件.length,
    覆盖剧情,
    覆盖小节: new Set([...日期事件, ...年代事件].map((e) => e.episodeId)).size,
    起: 年份们[0] ?? null,
    止: 年份们[年份们.length - 1] ?? null,
    年份们,
    年表,
    存疑,
    年代表,
  }
  索引._时间轴 = 结果
  return 结果
}
