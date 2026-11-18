# 方舟剧情库 · Arknights Lore Library

把《明日方舟》的全部剧情文本，变成一个**能离线检索的知识库**。

不是 wiki，不是剧情站 —— 是一个把 1000 万字原文装进口袋、随手能搜的工具：
搜「霜星 死亡」直接定位到那一幕，搜「兔兔」会告诉你那是阿米娅，
搜「切尔诺伯格」能看到这座城在哪些剧情里出现、和谁同场，
点开时间轴能看到从 507 年到 1103 年的整条泰拉历。

| | |
| --- | --- |
| 语料 | 491 个剧情 · 2061 小节 · 10459 个场景块 · 约 1029 万字 |
| 检索 | 中文二元切分 + BM25（覆盖面 / 短语加权），毫秒级 |
| 别名 | 兔兔→阿米娅、大尉/博卓卡斯替→爱国者、陈sir→陈、摄政王→特雷西斯… |
| 档案 | 角色 / 国家 / 地区 / 组织：提及次数、剧情分布、常同场、代表片段 |
| 时间轴 | 泰拉历年份 + 「远古 / 千年前 / 数百年前」模糊年代，可按年份精确搜索 |
| 四种形态 | DSH 插件 · 单文件网页 · Windows 桌面版 · 安卓 APK，带在线更新 |

> 剧情文本版权归鹰角网络（Hypergryph）所有，仅供个人查阅，请勿商用或二次分发。

## 下载（不用编译）

- **Windows**：[Releases](https://github.com/7jvgk4mnh7-coder/arknight/releases/latest) 里的 `ArknightsLore-PC-*.zip`，解压后双击 `方舟剧情库.exe`（Win10/11 自带 WebView2）
- **安卓**：同一个页面里的 `ArknightsLore-*.apk`，允许安装未知来源即可（minSdk 24）
- **网页版**：下载仓库里的 `dist/release/lore.html`，双击用浏览器打开，离线可用

程序里点「检查更新」会从本仓库拉内容包，不用重装。

---

## 作为 DSH 插件

把本机的《明日方舟》全剧情文本（主线 / 活动 / 故事集 / 干员密录）变成 DSH 里**能搜、能读、能查档案**的剧情库：

- **模型侧**：五个工具 ——
  - `ark_lore_search`：检索原文（支持 `"整句"`、`+必须`、`-排除` 操作符）
  - `ark_lore_read`：读整集 / 从命中处开始读
  - `ark_lore_who`：某人 / 势力 / 地名的档案 —— 出场次数、涉及剧情、首次与最近、常同场的人、代表片段
  - `ark_lore_digest`：剧情速览 —— 一个剧情里每小节的人物和开场句，或单集的首尾与说话人
  - `ark_lore_index`：目录
- **人侧**：侧边栏「方舟剧情库」面板 —— 目录 + 检索 + 阅读器，命中词高亮，另有：
  - 检索范围（按分类 / 只看当前剧情）
  - 收藏（★，存本地，侧栏计数）
  - 字号 A- / A+、一键复制本页原文

## 怎么用

装好插件后：

1. 侧边栏 → 书本图标 → 左侧挑剧情 / 右上角搜一句话（人名、地名、组织、台词都行）。
2. 检索结果点开直接跳到命中场景，往下滚继续读，还能翻上一小节 / 下一小节。
3. 对话框里直接问「凯尔希在切尔诺伯格都做了什么」「整合运动是怎么起来的」，模型会自己调工具查。
4. 想快速摸清一个大剧情：「局部坏死讲了什么」→ 模型会用 `ark_lore_digest` 拉每小节的人物和开场，再挑重点读。

## 语料从哪来

`data/lore.json` 是用「泰拉文库 / Terra Library」导出的 txt 编出来的：

```
<txt 根目录>/<分类>/<序号-剧情名>.txt
```

每个 txt 的正文用 48 个 `=` 包住小节标题，空行分段。构建脚本把 491 个 txt 切成
**2061 个小节 → 10459 个场景块**（约 1000 字一块，不跨集、不切段）。

重新生成（换了剧情包就用它）：

```powershell
node scripts/build-corpus.mjs "C:\path\to\txt\单语\简体中文"
# 或把源目录写进环境变量 ARK_CORPUS_DIR
```

也可以不改包，直接在 profile 里把 `corpusFile` 指到别处：

```yaml
- id: arknights-lore
  config:
    corpusFile: 'D:\lore\lore.json'
    announce: true
```

## 检索是怎么做的

中文不切词，按**相邻两字（bigram）**建检索单位，一次扫全库算出每个块的词频和全库文档频率，
再按 BM25 打分；整句命中额外加权，多词查询按覆盖率提升——所以「凯尔希 罗德岛」会优先出
两个词都出现的场景。1 万个块，单次查询几十毫秒，纯本地，不联网。

## 文件

| 文件 | 作用 |
| --- | --- |
| `index.js` | 宿主：工具注册、`/api/arknights-lore/*`、系统提示一句话 |
| `client.js` | 浏览器：`sidebar.panellist` 图标 + `main` 面板（目录 / 检索 / 阅读器） |
| `lib/search.mjs` | 检索核心（建索引、BM25、提及统计、剧集定位） |
| `web/` | 独立版前端（`index.html` / `app.css` / `app.js`） |
| `scripts/build-corpus.mjs` | txt → `data/lore.json` |
| `scripts/build-standalone.mjs` | 打成单文件 `dist/方舟剧情库.html` |
| `scripts/verify-standalone.mjs` | 验产物里的数据管线与检索（不依赖浏览器） |
| `scripts/verify-ui.mjs` | 最小 DOM 里跑真实前端 JS，验渲染与交互 |
| `scripts/try-search.mjs` | 命令行试检索，调参用 |
| `cordis.patch.yml` | bundle 挂载声明（含 `announce` / `corpusFile` 配置说明） |

## 发给朋友的独立版

`npm run build:standalone` 会把插件用的同一份语料和检索算法，打成一个 **单文件 HTML**：

```
dist/方舟剧情库.html    约 15 MB
```

- 双击就用，不用装 Node、不用开服务、不联网；数据、样式、脚本全在文件里。
- 够发给朋友：微信/QQ 传文件、网盘、U 盘都行（对方打开后浏览器可能要问"是否信任"）。
- 支持深链：`...html#q=霜星` 直接出检索结果，`...html#ep=E0125` 直接打开某一集。
- 换语料后重新执行 `npm run build:corpus && npm run build:standalone` 即可；`npm run verify:standalone` 会验数据管线和 UI 交互。

内置数据的格式：正文按场景块用 `\u0000` 拼接后 gzip，base64 塞进 `<script id="lore-data">`；
元数据（分类/剧情/小节/chunk 数）单独放 `<script id="lore-meta">`。打开时先用
`DecompressionStream('gzip')` 解压，再按块数切回来——所以不需要任何后端。

## 安卓版（APK）

```
dist/方舟剧情库.apk    约 11.4 MB
```

原生外壳 + WebView，把同一份离线页面装进 `assets/lore.html`：

- **不申请任何权限**（没有 INTERNET，完全离线），`aapt2 dump permissions` 里只有包名
- minSdk 24（Android 7.0+），targetSdk 34，包名 `com.arktios.lore`
- 返回键先退网页历史，再退 App；旋转屏幕不重建

构建（不装 Android Studio、不用 Gradle，直接调 aapt2 / javac / d8 / zipalign / apksigner）：

```bash
node scripts/fetch-toolchain.mjs   # 第一次：下 JDK17 + platform-tools + build-tools34 + platform34（约 300MB）
node scripts/build-android.mjs     # 之后每次：dist/方舟剧情库.html → dist/方舟剧情库.apk
```

工具链落在 `.toolchain/`（可以删，删了下次重新下）。APK 用自动生成的 debug 证书签名——
自己装、发给朋友侧载都没问题；要上架商店得换成你自己的 release keystore。

> 手机装 APK 需要允许「安装未知来源应用」；如果朋友嫌麻烦，直接把 `方舟剧情库.html`
> 发过去、用 Chrome 打开也一样能用（功能完全相同）。

## Windows 桌面版

`dist/pc/` 里是一个 15.5MB 的 exe（图标和安卓版同一张封面）：

- 外壳是 **.NET Framework 4.8 + WebView2**：整页 HTML 内嵌在 exe 里，首次运行释放到
  `%LOCALAPPDATA%\ArknightsLore\lore.html`，之后交给 WebView2 显示。
- 需要 Edge WebView2 运行时（Win10/11 基本自带；缺了会弹提示并给下载链接）。
- 发布目录 **4 个文件要放一起**：`方舟剧情库.exe` + `WebView2Loader.dll` +
  `Microsoft.Web.WebView2.Core.dll` + `Microsoft.Web.WebView2.WinForms.dll`。
- 程序未签名，首次运行若弹「打开文件 - 安全警告」，点「运行」即可。

构建（依赖装好后）：`node scripts/build-pc.mjs`。
依赖是一次性的：WebView2 的 NuGet 包（取 `lib/net462/*.dll` 和 `runtimes/win-x64/native/WebView2Loader.dll`）
和 `app.ico`（`python scripts/make-icon.py` 会顺带生成），放在 `.pcbuild/` 下，说明见脚本头部。

## 在线更新（GitHub）

程序里带了「检查更新」：桌面版启动时会静默查一次，安卓版在首页点按钮。

**原理**：更新的是**内容包**（一个 15MB 的 `lore.html`，里面装着全部剧情 + 界面），
不是重装 exe/apk。所以剧情库加了新活动，用户点一下就能拉到新版，不用重新下载安装包。

### 发布流程

1. 改 `update.json`：

```json
{ "repo": "你的用户名/仓库名", "branch": "main", "version": "0.4.1", "notes": "新增《时间啊，向前！》" }
```

2. 重新打包（仓库地址是编译进二进制的，换仓库必须重打）：

```bash
node scripts/build-standalone.mjs   # 生成 dist/方舟剧情库.html
node scripts/publish.mjs            # 生成 dist/release/{lore.html, version.json}
node scripts/build-pc.mjs           # exe
node scripts/build-android.mjs      # apk
```

3. 把 `dist/release/` 提交到仓库（`.gitignore` 已经放行这个目录），要求路径正好是：

```
dist/release/version.json
dist/release/lore.html
```

4. 用户端的更新流程：
   - 拉 `https://raw.githubusercontent.com/<repo>/<branch>/dist/release/version.json`
   - 版本号不同 → 弹窗确认 → 下载 `lore.html` → 覆盖本地缓存 → 重新加载页面
   - 桌面版缓存在 `%LOCALAPPDATA%\ArknightsLore\lore.html`；安卓版在应用私有目录

### 注意

- raw.githubusercontent.com 有缓存，脚本里带了 `?t=` 时间戳；但 CDN 仍可能延迟几分钟。
- 仓库可以是公开的（推荐，免 token）；私有仓库需要 token，当前实现没做鉴权。
- 新版 `version.json` 的 `version` 必须比用户手上的大（字符串比较，语义上按版本号写就行）。
- 换仓库 = 重新打包；只改内容 = 只跑 publish 那步。

## 版权

剧情文本版权归鹰角网络（Hypergryph）/ 蒙塔山工作室所有。`data/lore.json` 与
`dist/方舟剧情库.html` 都是**本地生成**的检索副本，只给亲友私下查阅，不要商用或公开二次分发；
插件代码（MIT）本身不含剧情原文。
