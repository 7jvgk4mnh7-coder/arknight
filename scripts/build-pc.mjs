#!/usr/bin/env node
/**
 * build-pc.mjs —— 把独立版页面打成 Windows 桌面程序（exe）
 *
 * 原理：.NET Framework + WebView2 的极薄外壳（pc/app.cs），整页 HTML 作为内嵌资源塞进 exe，
 * 首次运行释放到 %LOCALAPPDATA%\ArknightsLore\lore.html 再交给 WebView2 显示。
 *
 *   node scripts/build-pc.mjs
 *
 * 依赖（一次性）：.pcbuild/lib 里的三个 WebView2 文件 + .pcbuild/app.ico
 *   下载 https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/<版本>
 *   取 lib/net462/*.dll、runtimes/win-x64/native/WebView2Loader.dll
 */
import { existsSync, mkdirSync, copyFileSync, statSync, writeFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const 包根 = dirname(dirname(fileURLToPath(import.meta.url)))
const 构建 = join(包根, '.pcbuild')
const 产物目录 = join(包根, 'dist', 'pc')
const CSC = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
const 源页面 = join(包根, 'dist', '方舟剧情库.html')

const 必需 = [
  join(构建, 'lib', 'Microsoft.Web.WebView2.Core.dll'),
  join(构建, 'lib', 'Microsoft.Web.WebView2.WinForms.dll'),
  join(构建, 'lib', 'WebView2Loader.dll'),
  join(构建, 'app.ico'),
]
for (const p of 必需) {
  if (!existsSync(p)) {
    console.error('缺少 ' + p + '\n先准备 WebView2 SDK（见本脚本头部注释）和 app.ico（python scripts/make-icon.py 生成）')
    process.exit(1)
  }
}
if (!existsSync(源页面)) {
  console.error('缺少 dist/方舟剧情库.html，先跑：node scripts/build-standalone.mjs')
  process.exit(1)
}
if (!existsSync(CSC)) {
  console.error('找不到 csc.exe：' + CSC)
  process.exit(1)
}

mkdirSync(产物目录, { recursive: true })
copyFileSync(源页面, join(构建, 'lore.html'))
console.log(`页面 ${(statSync(join(构建, 'lore.html')).size / 1048576).toFixed(2)} MB → 内嵌`)

// 把 update.json 里的仓库/版本编进二进制
const 更新 = JSON.parse(readFileSync(join(包根, 'update.json'), 'utf8'))
const 配置源 = [
  'namespace ArknightsLore',
  '{',
  '    internal static class UpdateCfg',
  '    {',
  `        public const string Repo = ${JSON.stringify(更新.repo)};`,
  `        public const string Branch = ${JSON.stringify(更新.branch || 'main')};`,
  `        public const string Version = ${JSON.stringify(更新.version || '0.0.0')};`,
  '    }',
  '}',
].join('\r\n')
writeFileSync(join(构建, 'UpdateConfig.cs'), 配置源, 'utf8')
console.log(`更新源：github.com/${更新.repo} (${更新.branch || 'main'}) · v${更新.version}`)

const BS = '\\'
const rsp = [
  '/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/codepage:65001',
  `/win32icon:.pcbuild${BS}app.ico`,
  `/win32manifest:pc${BS}app.manifest`,
  '/r:System.dll', '/r:System.Core.dll', '/r:System.Drawing.dll', '/r:System.Windows.Forms.dll',
  '/r:System.Net.Http.dll',
  `/r:.pcbuild${BS}lib${BS}Microsoft.Web.WebView2.Core.dll`,
  `/r:.pcbuild${BS}lib${BS}Microsoft.Web.WebView2.WinForms.dll`,
  `/resource:.pcbuild${BS}lore.html,lore.html`,
  `/resource:.pcbuild${BS}app.ico,app.ico`,
  `/out:.pcbuild${BS}app.exe`,
  `.pcbuild${BS}UpdateConfig.cs`,
  `pc${BS}app.cs`,
].join('\n')
writeFileSync(join(构建, 'build.rsp'), rsp + '\n', 'ascii')

console.log('csc 编译…')
execFileSync(CSC, [`@.pcbuild${BS}build.rsp`], { cwd: 包根, stdio: 'inherit' })

// 组装发布目录：exe + 三个 WebView2 文件（Loader 必须挨着 exe）
copyFileSync(join(构建, 'app.exe'), join(产物目录, '方舟剧情库.exe'))
for (const f of ['Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll', 'WebView2Loader.dll']) {
  copyFileSync(join(构建, 'lib', f), join(产物目录, f))
}

const 说明 = [
  '方舟剧情库 · Windows 版',
  '',
  '双击「方舟剧情库.exe」即可。',
  '四个文件要放在同一个文件夹里，别单独拷 exe。',
  '',
  '需要 Microsoft Edge WebView2 运行时（Win10/11 一般自带；没有的话会弹提示，',
  '装一下 https://go.microsoft.com/fwlink/p/?LinkId=2124703 即可）。',
  '',
  '第一次运行如果 Windows 弹「打开文件 - 安全警告」，点「运行」就行（程序没签名）。',
  '剧情文本版权归鹰角网络所有，仅供个人查阅。',
].join('\r\n')
writeFileSync(join(产物目录, '说明.txt'), 说明, 'utf8')

console.log('\n✅ ' + 产物目录)
for (const f of ['方舟剧情库.exe', 'Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll', 'WebView2Loader.dll']) {
  console.log(`   ${f}  ${(statSync(join(产物目录, f)).size / 1048576).toFixed(2)} MB`)
}
