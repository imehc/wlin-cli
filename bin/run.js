#!/usr/bin/env node

// 版本检查必须在这里、且必须早于 dist/cli.js 的载入。
//
// dist/cli.js 里内联了 @clack/prompts，它 `import {styleText} from 'node:util'`，
// 而 styleText 是 Node 20.12 才有的导出。ESM 的命名导入在**链接期**校验，缺失即
// SyntaxError —— 比任何模块顶层代码都早，所以 cli.ts 内的检查在旧 Node 上根本来
// 不及执行，用户看到的会是一段 minify 后的堆栈。
//
// 故此文件只用 Node 18 也能解析的语法，并改用动态 import 推迟链接。
const MIN_NODE = [20, 12, 0]

const current = process.versions.node.split('.').map((part) => Number.parseInt(part, 10))

for (let i = 0; i < MIN_NODE.length; i++) {
  const actual = current[i] ?? 0
  const required = MIN_NODE[i]
  if (actual > required) break
  if (actual < required) {
    process.stderr.write(
      '[31m✖ Node version error[39m\n' +
        `Your Node version: ${process.version}\n` +
        `Required version: >=${MIN_NODE.join('.')}\n` +
        'Please upgrade to continue: https://nodejs.org/\n',
    )
    process.exit(1)
  }
}

const {run} = await import('../dist/cli.js')

await run()
