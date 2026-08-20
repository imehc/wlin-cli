/**
 * 发布前精简 package.json，发布后还原。
 *
 * npm 总是把 package.json 原样塞进 tarball（`files` 管不到它），所以 devDependencies、
 * lint-staged、commitizen 配置这些纯开发期字段会一并发到 registry 上，被所有用户下载。
 * 这里在 prepack 阶段裁掉它们，postpack 再从备份还原工作区。
 *
 * 用法：node scripts/pack-json.js trim | restore
 *
 * 注意事项：
 * - **不能删 `files`**：实测删掉后 npm 回退为「打包目录下所有文件」，反而会把源码、
 *   脚本一起发出去。
 * - **不能删 `bin` / `type` / `engines` / `dependencies`**：这些是安装期语义，删了包就坏。
 * - `scripts` 里只保留空对象都不行 —— 直接整个删。npm 已经在 prepack 时读完脚本了，
 *   tarball 里的 scripts 只对下游的 `npm install` 生效，而我们没有任何安装期脚本。
 * - 用备份文件而不是「删完再写回」：npm version / publish 中途失败时，工作区的
 *   package.json 必须能原样恢复，否则会丢掉整个 devDependencies。
 */
import {existsSync, readFileSync, rmSync, writeFileSync} from 'node:fs'

/** 备份文件名。以点开头 + 写进 .gitignore，避免误提交 */
const BACKUP = '.package.json.bak'

/** 发布产物里没有意义的字段 */
const DEV_ONLY_FIELDS = ['scripts', 'devDependencies', 'lint-staged', 'config', 'packageManager']

function trim() {
  const raw = readFileSync('package.json', 'utf8')

  // 已有备份说明上次 postpack 没跑成（比如 publish 中途失败），
  // 此时 package.json 可能已是裁剪过的版本，再备份就会把精简版当成原件
  if (existsSync(BACKUP)) {
    throw new Error(`${BACKUP} already exists — run "node scripts/pack-json.js restore" first`)
  }

  writeFileSync(BACKUP, raw)

  const pkg = JSON.parse(raw)
  const removed = DEV_ONLY_FIELDS.filter((field) => field in pkg)
  for (const field of removed) delete pkg[field]

  writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`)
  process.stdout.write(`package.json trimmed for publish (removed: ${removed.join(', ')})\n`)
}

function restore() {
  if (!existsSync(BACKUP)) {
    process.stdout.write('no package.json backup to restore\n')
    return
  }

  writeFileSync('package.json', readFileSync(BACKUP, 'utf8'))
  rmSync(BACKUP)
  process.stdout.write('package.json restored\n')
}

const action = process.argv[2]

if (action === 'trim') trim()
else if (action === 'restore') restore()
else {
  process.stderr.write('usage: node scripts/pack-json.js trim|restore\n')
  process.exit(1)
}
