# GitHub 仓库描述（可直接复制）

## 1. About 短描述（仓库页右上角那个框，限 350 字符）

```
《明日方舟》全剧情离线检索与阅读工具：491 个剧情、2061 小节、约 1029 万字，中文 BM25 全文搜索、别名检索、角色/势力/地名档案、跨剧情时间轴。含 DSH 插件、Windows 桌面版与安卓版，支持从 GitHub 在线更新。
```

英文版（想面向国际可以切这个）：

```
An offline full-text search & reader for all Arknights story text — 491 stories, 2,061 episodes, ~10.3M characters. Chinese BM25 search, alias-aware queries, character/faction/location profiles, and a cross-story timeline. Ships as a DSH plugin, a Windows desktop app, and an Android APK, with GitHub-based updates.
```

## 2. Topics（标签，逗号分隔）

```
arknights, full-text-search, bm25, offline, chinese, webview2, android, cordis-plugin, dsh-plugin, timeline, single-file-html
```

## 3. README 开头的描述段

````markdown
# 方舟剧情库 · Arknights Lore Library

把《明日方舟》的全部剧情文本，变成一个**能离线检索的知识库**。

不是 wiki，不是剧情站——是一个把 1000 万字原文装进口袋、随手能搜的东西：
搜「霜星 死亡」能直接定位到那一幕，搜「兔兔」会告诉你那是阿米娅，
搜「切尔诺伯格」能看到这座城在哪些剧情里出现过、和谁一起出现，
点开时间轴能看到从 507 年到 1103 年的整条泰拉历。

## 里面有什么

| | |
| --- | --- |
| 语料 | 491 个剧情 · 2061 小节 · 10459 个场景块 · 约 1029 万字 |
| 检索 | 中文二元切分 + BM25，带覆盖面加权与短语加权，毫秒级 |
| 别名 | 兔兔→阿米娅、大尉/博卓卡斯替→爱国者、陈sir→陈、摄政王→特雷西斯… |
| 档案 | 角色 / 国家 / 地区 / 组织：提及次数、剧情分布、常同场、代表片段 |
| 时间轴 | 泰拉历年份 + 「远古 / 千年前 / 数百年前」这类模糊年代，可搜年份 |
| 收藏 | 断点续读、字号调节、复制原文 |

## 四种形态，同一套数据

| 形态 | 文件 | 说明 |
| --- | --- | --- |
| **DSH 插件** | `arknights-lore/` | 装进 DeepSeek Harness，模型可以直接调 `ark_lore_search` / `ark_lore_read` / `ark_lore_who` 等工具查剧情 |
| **单文件网页** | `dist/release/lore.html` | 15MB 一个文件，双击就能用，离线、无依赖 |
| **Windows 桌面版** | `dist/pc/方舟剧情库.exe` | .NET Framework + WebView2 外壳，图标和安卓版同款 |
| **安卓版** | `dist/方舟剧情库.apk` | 11.5MB，minSdk 24，无广告无分析 |

程序里带**在线更新**：剧情更新时只拉内容包，不用重装。

## 为什么做这个

写同人、考据、或者只是想确认某句台词到底是谁说的——翻 wiki 要一层层点开，
翻录屏要拖进度条。这个项目的目标很简单：

> 输入任何一个名字、地名、台词片段，两秒内看到它在原文里出现的每一处。

## 构建

```bash
node scripts/build-corpus.mjs      # 从文本导出语料（需自备源目录）
node scripts/build-standalone.mjs  # 生成单文件网页
node scripts/build-pc.mjs          # 打 Windows exe（需 WebView2 SDK）
node scripts/build-android.mjs     # 打 APK（需 aapt2/d8/apksigner）
node scripts/publish.mjs           # 生成在线更新用的 version.json + lore.html
```

## 数据来源与版权

剧情文本版权归**鹰角网络（Hypergryph）/ 蒙塔山工作室**所有。
本仓库只包含**检索工具本身**，不附带游戏资源；语料由使用者从自己拥有的游戏文本中导出。

> ⚠️ 如果是公开仓库，请不要提交 `data/` 和 `dist/release/`（那里有全文），否则可能因版权被下架。
> 想用在线更新，把仓库设为 **Private**，或只发布工具、让每个使用者自己导出一份语料。
````

## 3b. README（English）

````markdown
# Arknights Lore Library

Turn the entire story text of *Arknights* into an **offline, searchable knowledge base**.

Not a wiki, not a story site — a pocket-sized 10-million-character archive you can query in a couple of seconds:

- search `霜星 死亡` and land directly on that scene;
- search `兔兔` and it tells you that's Amiya;
- search `切尔诺伯格` and see every story the city appears in, and who's on stage with it;
- open the timeline and follow the whole Terran calendar from year 507 to 1103.

## What's inside

| | |
| --- | --- |
| Corpus | 491 stories · 2,061 episodes · 10,459 scene chunks · ~10.3M characters |
| Search | Chinese bigram tokenization + BM25, with coverage and phrase boosts — millisecond latency |
| Aliases | 兔兔→阿米娅, 大尉/博卓卡斯替→爱国者, 陈sir→陈, 摄政王→特雷西斯, and more |
| Profiles | Characters, nations, regions, factions: mention counts, story distribution, co-speakers, sample passages |
| Timeline | Terran years (1098年12月21日) plus fuzzy eras (「远古」「千年前」「数百年前」), with year search |
| Reader | Resume where you left off, adjustable font size, copy raw text |

## Four forms, one dataset

| Form | Artifact | Notes |
| --- | --- | --- |
| **DSH plugin** | `arknights-lore/` | Installs into DeepSeek Harness; the model can call `ark_lore_search` / `ark_lore_read` / `ark_lore_who` directly |
| **Single-file web app** | `dist/release/lore.html` | One 15 MB file. Double-click, works offline, zero dependencies |
| **Windows desktop** | `dist/pc/方舟剧情库.exe` | .NET Framework + WebView2 shell; same icon as the Android build |
| **Android** | `dist/方舟剧情库.apk` | 11.5 MB, minSdk 24, no ads, no analytics |

Both native builds ship with **in-app updates**: when the story corpus changes, the app pulls a content bundle instead of a reinstall.

## Why

For fic writers, lore nerds, or anyone who just wants to check who actually said that line — a wiki means clicking through pages, a VOD means scrubbing a timeline.

> Type any name, place, or line fragment. See every occurrence in the raw text within two seconds.

## Build

```bash
node scripts/build-corpus.mjs      # export the corpus from source text (bring your own)
node scripts/build-standalone.mjs  # single-file web app
node scripts/build-pc.mjs          # Windows exe (needs WebView2 SDK)
node scripts/build-android.mjs     # APK (needs aapt2/d8/apksigner)
node scripts/publish.mjs           # version.json + lore.html for in-app updates
```

## Data & copyright

The story text is © Hypergryph / Studio Montagne. This repository contains **the tooling only** — no game assets.
The corpus is exported by each user from game text they own.

> ⚠️ For a **public** repository, do not commit `data/` or `dist/release/` — those contain the full text and are likely to be taken down.
> In-app updates require the raw files to be reachable: use a **private** repo, or publish the tool only and let users build their own corpus.
````

## 4. 发布时的仓库结构建议

```
arknights-lore/
├── index.js              # DSH 插件宿主端
├── client.js             # DSH 面板
├── lib/                  # 检索/别名/世界/档案/时间轴
├── web/                  # 独立版前端
├── pc/                   # Windows 外壳（C#）
├── android/              # 安卓外壳（Java）
├── scripts/              # 构建与发布
├── data/                 # ❌ 不进库（语料）
└── dist/release/         # ⚠️ 公开仓库别进库（全文）
```
