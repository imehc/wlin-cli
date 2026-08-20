import {execFile} from 'node:child_process'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'

import {compareVersions} from './version.js'

const execFileAsync = promisify(execFile)

/**
 * registry 查询超时。宁可跳过提示，也不拖慢启动。
 *
 * 实测 registry 的 `/latest` 端点约 700ms–1s，1.5s 只留了很窄的余量，网络稍慢
 * 就会静默失效。启动检查是并发发起、不阻塞主流程的，所以放宽到 3s 不影响体感；
 * `wlin-cli update` 会等这个请求，3s 也仍在可接受范围。
 */
const FETCH_TIMEOUT_MS = 3000

/** 缓存有效期：24 小时 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

const PACKAGE_NAME = 'wlin-cli'

type Cache = {
  checkedAt: number
  latest: string
}

/**
 * 缓存文件位置。
 *
 * `WLIN_CLI_CACHE_DIR` 是给测试用的：`os.homedir()` 在 Bun 下取的是进程启动时的
 * `$HOME` 快照，测试里改 `process.env.HOME` 不生效，缓存会被写进真实家目录 ——
 * 那会让本机 CLI 在之后 24 小时里提示一个测试编造的版本号。
 */
function cachePath(): string {
  return path.join(process.env.WLIN_CLI_CACHE_DIR ?? path.join(homedir(), '.wlin-cli'), 'update-check.json')
}

async function readCache(): Promise<Cache | undefined> {
  try {
    const raw = await readFile(cachePath(), 'utf8')
    const parsed = JSON.parse(raw) as Cache
    if (typeof parsed.checkedAt === 'number' && typeof parsed.latest === 'string') {
      return parsed
    }
  } catch {
    // 缓存缺失或损坏都不是错误
  }
}

async function writeCache(latest: string): Promise<void> {
  try {
    const file = cachePath()
    await mkdir(path.dirname(file), {recursive: true})
    await writeFile(file, JSON.stringify({checkedAt: Date.now(), latest} satisfies Cache), 'utf8')
  } catch {
    // 写不了缓存无所谓，下次重新查
  }
}

/** registry 上单个版本的元数据地址 */
function latestUrl(): string {
  return `https://registry.npmjs.org/${PACKAGE_NAME}/latest`
}

/**
 * 从 npm registry 查询最新版本号。
 *
 * **不要加 `accept: application/vnd.npm.install-v1+json`**：那个 abbreviated
 * metadata 类型只对完整 packument（`/wlin-cli`）有效，对 `/latest` 这种单版本
 * 端点 registry 会回 406 且响应体为空。而本函数把任何失败都当作「无更新」静默
 * 跳过，所以这个错误不会报出来 —— 更新检查会永远静默失效。实测：
 *
 * ```
 * /latest + abbreviated      → 406, 0 字节
 * /latest 默认 accept        → 200, 4.1 KB
 * /wlin-cli + abbreviated    → 200, 23 KB
 * ```
 *
 * 取默认 accept 的 `/latest`：4.1 KB 已经是三者里最小的。
 */
async function fetchLatest(): Promise<string | undefined> {
  try {
    const response = await fetch(latestUrl(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    if (!response.ok) return undefined

    const body = (await response.json()) as {version?: string}
    return body.version
  } catch {
    // 离线、超时、DNS 失败 —— 全部静默跳过
    return undefined
  }
}

/**
 * 检查是否有新版本，返回新版本号（无更新或检查失败时返回 undefined）。
 *
 * 取代 @oclif/plugin-warn-if-update-available。永不抛错、永不阻塞主流程：
 * 结果缓存 24 小时，请求 1.5s 超时，任何失败都当作「无更新」。
 *
 * @param force 跳过缓存强制查询。`wlin-cli update` 必须用它 —— 否则命中一条
 *   「无更新」的缓存后，即便 registry 上已有新版也会报告已是最新。
 */
export async function checkForUpdate(currentVersion: string, force = false): Promise<string | undefined> {
  // 明确关闭，或在 CI 里，就完全不查（force 时例外：那是用户显式要求的）
  if (!force && (process.env.WLIN_CLI_SKIP_UPDATE_CHECK || process.env.CI)) return undefined

  const cached = force ? undefined : await readCache()
  const fresh = cached && Date.now() - cached.checkedAt < CACHE_TTL_MS

  const latest = fresh ? cached.latest : await fetchLatest()
  if (!latest) return undefined

  if (!fresh) await writeCache(latest)

  return compareVersions(latest, currentVersion) > 0 ? latest : undefined
}

/** 支持的全局安装方式 */
type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn'

/** 各包管理器的全局升级命令 */
const UPGRADE_COMMANDS: Record<PackageManager, string[]> = {
  bun: ['add', '--global', `${PACKAGE_NAME}@latest`],
  npm: ['install', '--global', `${PACKAGE_NAME}@latest`],
  pnpm: ['add', '--global', `${PACKAGE_NAME}@latest`],
  yarn: ['global', 'add', `${PACKAGE_NAME}@latest`],
}

/**
 * 从自身安装路径推断是被哪个包管理器装的。
 *
 * 依据各家全局目录的路径特征：
 *   pnpm → .../pnpm/global/... 或 .../pnpm-global/...
 *   yarn → .../yarn/global/... 或 .../Yarn/Data/global/...
 *   bun  → .../.bun/install/global/...
 *   npm  → 其余（node_modules 下的默认情况）
 *
 * 探测不到时返回 undefined —— 此时打印手动命令，而不是猜一个乱执行。
 */
export function detectPackageManager(modulePath: string = fileURLToPath(import.meta.url)): PackageManager | undefined {
  const normalized = modulePath.replaceAll('\\', '/').toLowerCase()

  if (normalized.includes('/pnpm/') || normalized.includes('/pnpm-global/')) return 'pnpm'
  if (normalized.includes('/.bun/')) return 'bun'
  if (normalized.includes('/yarn/') || normalized.includes('/yarn/data/')) return 'yarn'
  if (normalized.includes('/node_modules/')) return 'npm'

  return undefined
}

/**
 * 执行自我升级。
 *
 * 取代 @oclif/plugin-update。原插件走的是 oclif 的 S3 tarball 自更新机制，
 * 而本项目从未配置 `oclif.update`，那条路实际不可用。这里改为调用包管理器升级，
 * 与 npm 分发方式一致。
 *
 * @returns 实际执行的命令描述，供调用方展示
 */
export async function runUpdate(): Promise<{command: string; ran: boolean}> {
  const pm = detectPackageManager()

  if (!pm) {
    return {command: `npm install --global ${PACKAGE_NAME}@latest`, ran: false}
  }

  const args = UPGRADE_COMMANDS[pm]
  const command = `${pm} ${args.join(' ')}`

  try {
    await execFileAsync(pm, args, {timeout: 120_000})
    return {command, ran: true}
  } catch (error) {
    const err = error as {code?: string; stderr?: string}
    if (err.code === 'ENOENT') {
      throw new Error(`${pm} not found on PATH. Run manually: ${command}`, {cause: error})
    }

    const detail = err.stderr?.trim()
    throw new Error(detail ? `${command} failed:\n${detail}` : `${command} failed`, {cause: error})
  }
}
