#!/usr/bin/env node
/**
 * build-android.mjs —— 用最小工具链把独立版打进 APK（不装 Android Studio / 不用 Gradle）
 *
 *   node scripts/fetch-toolchain.mjs     # 第一次：下 JDK + SDK 组件（约 300MB）
 *   node scripts/build-android.mjs       # 之后每次：dist/方舟剧情库.html → dist/方舟剧情库.apk
 *
 * 流程：aapt2 编译资源 → javac 编 MainActivity → aapt2 link 出壳 → d8 出 dex
 *      → 塞进 dex + 15MB 网页 → zipalign → apksigner 签名（debug key）。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync, rmSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const 包根 = dirname(dirname(fileURLToPath(import.meta.url)))
const 工具 = join(包根, '.toolchain')
const JAVA = join(工具, 'jdk-17.0.2', 'bin', 'java.exe')
const JAVAC = join(工具, 'jdk-17.0.2', 'bin', 'javac.exe')
const KEYTOOL = join(工具, 'jdk-17.0.2', 'bin', 'keytool.exe')
const BT = join(工具, 'sdk', 'build-tools', '34.0.0')
const AAPT2 = join(BT, 'aapt2.exe')
const ZIPALIGN = join(BT, 'zipalign.exe')
const APKSIGNER_JAR = join(BT, 'lib', 'apksigner.jar')
const D8_JAR = join(BT, 'lib', 'd8.jar')
const ANDROID_JAR = join(工具, 'sdk', 'platforms', 'android-34', 'android.jar')
const PYTHON = process.env.DSH_PYTHON || 'python'

const 工程 = join(包根, 'android')
const 构建 = join(包根, '.build', 'android')
const 源网页 = join(包根, 'dist', '方舟剧情库.html')
const 产物 = join(包根, 'dist', '方舟剧情库.apk')
const 密钥库 = join(构建, 'debug.keystore')

for (const [名字, p] of [['JDK', JAVA], ['aapt2', AAPT2], ['android.jar', ANDROID_JAR]]) {
  if (!existsSync(p)) {
    console.error(`缺少 ${名字}：${p}\n先跑一次：node scripts/fetch-toolchain.mjs`)
    process.exit(1)
  }
}
if (!existsSync(源网页)) {
  console.error('缺少 dist/方舟剧情库.html，先跑：node scripts/build-standalone.mjs')
  process.exit(1)
}

function 跑(cmd, args, 说明) {
  const t0 = Date.now()
  try {
    // 沙箱里用管道 stdio 起子进程会 EPERM，按规矩用 inherit，输出直接落到终端
    execFileSync(cmd, args, { stdio: 'inherit' })
    console.log(`  ✓ ${说明} (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  } catch (e) {
    console.error(`  ✗ ${说明}（exit=${e.status}）`)
    process.exit(1)
  }
}

const 版本 = (() => {
  try { return JSON.parse(readFileSync(join(包根, 'package.json'), 'utf8')).version || '1.0.0' } catch { return '1.0.0' }
})()

rmSync(构建, { recursive: true, force: true })
mkdirSync(构建, { recursive: true })

// 1) 网页进 assets
const assets = join(工程, 'assets')
mkdirSync(assets, { recursive: true })
copyFileSync(源网页, join(assets, 'lore.html'))
console.log(`[1/8] assets/lore.html ${(statSync(join(assets, 'lore.html')).size / 1048576).toFixed(1)} MB`)

// 2) 编译资源
跑(AAPT2, ['compile', '--dir', join(工程, 'res'), '-o', join(构建, 'res.zip')], 'aapt2 compile 资源')

// 3) javac 编 Java（用 android.jar 当 bootclasspath）
//    先把 update.json 的仓库/版本注入进 MainActivity（源码保持占位符，便于换仓库）
const 更新配置 = (() => {
  try { return JSON.parse(readFileSync(join(包根, 'update.json'), 'utf8')) } catch { return { repo: 'OWNER/REPO', branch: 'main', version: '0.0.0' } }
})()
const 源码镜像 = join(构建, 'src')
const 源根 = join(工程, 'src')
const javaFiles = []
;(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    const st = statSync(p)
    if (st.isDirectory()) walk(p)
    else if (n.endsWith('.java')) {
      const 目标 = join(源码镜像, p.slice(源根.length + 1))
      mkdirSync(dirname(目标), { recursive: true })
      const 源 = readFileSync(p, 'utf8')
        .replace(/__REPO__/g, 更新配置.repo)
        .replace(/__BRANCH__/g, 更新配置.branch || 'main')
        .replace(/__VERSION__/g, 更新配置.version || '0.0.0')
      writeFileSync(目标, 源, 'utf8')
      javaFiles.push(目标)
    }
  }
})(源根)
console.log(`   更新源：github.com/${更新配置.repo} · v${更新配置.version}`)
mkdirSync(join(构建, 'classes'), { recursive: true })
跑(JAVAC, ['-source', '8', '-target', '8', '-nowarn', '-encoding', 'UTF-8',
  '-bootclasspath', ANDROID_JAR, '-d', join(构建, 'classes'), ...javaFiles], 'javac 编译 MainActivity')

// 4) link 出 APK 壳
跑(AAPT2, ['link', '-o', join(构建, 'base.apk'),
  '-I', ANDROID_JAR,
  '--manifest', join(工程, 'AndroidManifest.xml'),
  '-A', assets,
  '--min-sdk-version', '24',
  '--target-sdk-version', '34',
  '--version-code', '4',
  '--version-name', 版本,
  join(构建, 'res.zip')], 'aapt2 link 出 APK 壳')

// 5) d8 编 dex
const classFiles = []
;(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    const st = statSync(p)
    if (st.isDirectory()) walk(p)
    else if (n.endsWith('.class')) classFiles.push(p)
  }
})(join(构建, 'classes'))
mkdirSync(join(构建, 'dex'), { recursive: true })
跑(JAVA, ['-cp', D8_JAR, 'com.android.tools.r8.D8', '--release', '--min-api', '24',
  '--lib', ANDROID_JAR, '--output', join(构建, 'dex'), ...classFiles], 'd8 生成 classes.dex')

// 6) 把 dex 追加进 APK（用 Python zipfile 追加，保留原有条目压缩方式）
跑(PYTHON, ['-c',
  'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1],"a",zipfile.ZIP_DEFLATED);z.write(sys.argv[2],"classes.dex",compress_type=zipfile.ZIP_DEFLATED);z.close()',
  join(构建, 'base.apk'), join(构建, 'dex', 'classes.dex')], '把 classes.dex 塞进 APK')

// 7) 对齐
跑(ZIPALIGN, ['-f', '4', join(构建, 'base.apk'), join(构建, 'aligned.apk')], 'zipalign 4 字节对齐')

// 8) 签名（debug key，第一次自动生成）
if (!existsSync(密钥库)) {
  跑(KEYTOOL, ['-genkeypair', '-keystore', 密钥库, '-alias', 'androiddebugkey',
    '-storepass', 'android', '-keypass', 'android', '-keyalg', 'RSA', '-keysize', '2048',
    '-validity', '10000', '-dname', 'CN=Android Debug,O=Android,C=US'], '生成调试签名证书')
}
mkdirSync(dirname(产物), { recursive: true })
// apksigner 是 Java 程序，中文路径会被它按 ANSI 解码写歪；先签成 ASCII 名再改名
const 临时apk = join(构建, 'signed.apk')
rmSync(临时apk, { force: true })
跑(JAVA, ['-jar', APKSIGNER_JAR, 'sign',
  '--ks', 密钥库, '--ks-pass', 'pass:android', '--key-pass', 'pass:android',
  '--ks-key-alias', 'androiddebugkey',
  '--min-sdk-version', '24',
  '--out', 临时apk, join(构建, 'aligned.apk')], 'apksigner 签名')

rmSync(产物, { force: true })
copyFileSync(临时apk, 产物)
const 多余 = 产物 + '.idsig'
if (existsSync(多余)) rmSync(多余, { force: true })

const 大小 = statSync(产物).size
console.log(`\n✅ ${产物}`)
console.log(`   大小 ${(大小 / 1048576).toFixed(1)} MB · 版本 ${版本} · minSdk 24 · 无权限`)
