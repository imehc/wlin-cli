/**
 * 校验发布 tarball 的内容。
 *
 * 防两类回归：
 * 1. `prepack` 的精简没生效 —— devDependencies 等开发期字段泄漏到 registry；
 * 2. 精简过头 —— 删掉了 `bin` / `engines` / `files` 这类安装期必需字段，
 *    或 `files` 被删导致 npm 回退成「打包所有文件」，把源码一起发出去。
 *
 * 用法：node scripts/verify-tarball.js
 */
import {execFileSync} from 'node:child_process'
import {existsSync, mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'

/** 纯开发期字段，不该出现在发布产物里 */
const DEV_ONLY = ['devDependencies', 'scripts', 'lint-staged', 'config', 'packageManager']

/** 删掉就会破坏安装的字段 */
const REQUIRED = ['name', 'version', 'bin', 'type', 'engines', 'files', 'dependencies']

/** tarball 里允许出现的文件。README/package.json 由 npm 强制加入 */
const ALLOWED = new Set(['package/README.md', 'package/package.json', 'package/bin/run.js', 'package/dist/cli.js'])

const workDir = mkdtempSync(path.join(tmpdir(), 'wlin-verify-'))
const failures = []

try {
  const packOutput = execFileSync('npm', ['pack', '--pack-destination', workDir], {encoding: 'utf8'})
  const tarball = path.join(workDir, packOutput.trim().split('\n').at(-1).trim())

  const entries = execFileSync('tar', ['-tzf', tarball], {encoding: 'utf8'})
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    // tar 会把目录本身也列出来，只关心文件
    .filter((entry) => !entry.endsWith('/'))

  process.stdout.write(`tarball contents:\n${entries.map((e) => `  ${e}`).join('\n')}\n\n`)

  for (const entry of entries) {
    if (!ALLOWED.has(entry)) failures.push(`unexpected file in tarball: ${entry}`)
  }

  const manifest = execFileSync('tar', ['-xzOf', tarball, 'package/package.json'], {encoding: 'utf8'})
  const pkg = JSON.parse(manifest)

  for (const field of DEV_ONLY) {
    if (field in pkg) failures.push(`dev-only field leaked into the tarball: ${field}`)
  }

  for (const field of REQUIRED) {
    if (!(field in pkg)) failures.push(`the trim removed a required field: ${field}`)
  }

  // postpack 必须把工作区还原干净，否则 publish 失败会留下一个残缺的 package.json
  if (existsSync('.package.json.bak')) {
    failures.push('.package.json.bak still exists — postpack did not run')
  }

  const diff = execFileSync('git', ['diff', '--name-only', '--', 'package.json'], {encoding: 'utf8'}).trim()
  if (diff) failures.push('package.json was left modified after packing — postpack did not restore it')

  process.stdout.write(`published package.json (${manifest.length} bytes):\n${manifest}\n`)
} finally {
  rmSync(workDir, {force: true, recursive: true})
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`✖ ${failure}\n`)
  process.exit(1)
}

process.stdout.write('✔ tarball looks correct\n')
