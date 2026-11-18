#!/usr/bin/env node
/**
 * fetch-toolchain.mjs —— 只为打 APK 用的最小安卓工具链（不装 Android Studio）
 *
 * 下载：JDK 17、platform-tools、build-tools 34、platform 34(android.jar)
 * 落到 .toolchain/ 下，可重复执行（已存在且完整就跳过）。
 *
 *   node scripts/fetch-toolchain.mjs
 */
import { createWriteStream, existsSync, mkdirSync, statSync, renameSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const 包根 = dirname(dirname(fileURLToPath(import.meta.url)))
const 根 = join(包根, '.toolchain')
mkdirSync(根, { recursive: true })

const 清单 = [
  { name: 'jdk17.zip', url: 'https://mirrors.huaweicloud.com/openjdk/17.0.2/openjdk-17.0.2_windows-x64_bin.zip', size: 178 },
  { name: 'platform-tools.zip', url: 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip', size: 8 },
  { name: 'build-tools-34.zip', url: 'https://dl.google.com/android/repository/build-tools_r34-windows.zip', size: 55 },
  { name: 'platform-34.zip', url: 'https://dl.google.com/android/repository/platform-34-ext7_r03.zip', size: 60 },
]

const MB = (n) => (n / 1048576).toFixed(1)

async function 下载(item) {
  const 目标 = join(根, item.name)
  if (existsSync(目标) && statSync(目标).size > 1024 * 1024) {
    console.log(`[skip] ${item.name} 已存在 ${MB(statSync(目标).size)}MB`)
    return 目标
  }
  const 临时 = 目标 + '.part'
  console.log(`[get ] ${item.name} ← ${item.url}`)
  const 起 = Date.now()
  const res = await fetch(item.url, { signal: AbortSignal.timeout(600000) })
  if (!res.ok || !res.body) throw new Error(`${item.name} 下载失败 HTTP ${res.status}`)
  const 总 = Number(res.headers.get('content-length') || 0)
  let 已 = 0
  let 上次 = 0
  const 进度 = new TransformStream({
    transform(chunk, ctl) {
      已 += chunk.byteLength
      if (已 - 上次 > 8 * 1048576) {
        上次 = 已
        const pct = 总 ? ((已 / 总) * 100).toFixed(0) + '%' : ''
        const 速度 = 已 / ((Date.now() - 起) / 1000) / 1048576
        console.log(`       ${MB(已)}MB / ${总 ? MB(总) : '?'}MB ${pct} (${速度.toFixed(1)} MB/s)`)
      }
      ctl.enqueue(chunk)
    },
  })
  await pipeline(Readable.fromWeb(res.body), 进度, createWriteStream(临时))
  const 大小 = statSync(临时).size
  const 压缩过 = (res.headers.get('content-encoding') || 'identity') !== 'identity'
  if (总 > 0 && !压缩过 && Math.abs(大小 - 总) > 1024) {
    rmSync(临时, { force: true })
    throw new Error(`${item.name} 大小不对：${大小} vs ${总}`)
  }
  renameSync(临时, 目标)
  console.log(`[ok  ] ${item.name} ${MB(大小)}MB 用时 ${((Date.now() - 起) / 1000).toFixed(1)}s`)
  return 目标
}

for (const item of 清单) {
  await 下载(item)
}
console.log('\n工具链下载完成：' + 根)
