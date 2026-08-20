import {afterAll, afterEach, beforeAll, describe, expect, test} from 'bun:test'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {checkForUpdate, detectPackageManager} from '../src/update.ts'

describe('detectPackageManager', () => {
  test('detects pnpm global installs', () => {
    expect(detectPackageManager('/Users/me/Library/pnpm/global/5/node_modules/wlin-cli/dist/cli.js')).toBe('pnpm')
    expect(detectPackageManager('/home/me/.local/share/pnpm-global/5/node_modules/wlin-cli/dist/cli.js')).toBe('pnpm')
  })

  test('detects bun global installs', () => {
    expect(detectPackageManager('/Users/me/.bun/install/global/node_modules/wlin-cli/dist/cli.js')).toBe('bun')
  })

  test('detects yarn global installs', () => {
    expect(detectPackageManager('/Users/me/.config/yarn/global/node_modules/wlin-cli/dist/cli.js')).toBe('yarn')
  })

  test('falls back to npm for a plain node_modules path', () => {
    expect(detectPackageManager('/usr/local/lib/node_modules/wlin-cli/dist/cli.js')).toBe('npm')
  })

  test('handles Windows-style separators', () => {
    expect(detectPackageManager(String.raw`C:\Users\me\AppData\Local\pnpm\global\5\node_modules\wlin-cli\cli.js`)).toBe(
      'pnpm',
    )
    expect(detectPackageManager(String.raw`C:\Program Files\nodejs\node_modules\wlin-cli\dist\cli.js`)).toBe('npm')
  })

  test('returns undefined when the path matches nothing known', () => {
    // 探测不到时调用方会打印手动升级命令，而不是猜一个包管理器乱执行
    expect(detectPackageManager('/opt/custom/wlin-cli/cli.js')).toBeUndefined()
  })
})

describe('checkForUpdate', () => {
  const originalFetch = globalThis.fetch
  const originalSkip = process.env.WLIN_CLI_SKIP_UPDATE_CHECK
  const originalCi = process.env.CI
  const originalCacheDir = process.env.WLIN_CLI_CACHE_DIR

  /**
   * 缓存重定向到临时目录。
   *
   * 不做的话这些测试会把 `9.9.9` 之类的假版本号写进 `~/.wlin-cli/update-check.json`，
   * 让本机的 wlin-cli 在之后 24 小时里一直提示一个不存在的新版本。（改 `HOME` 不管用：
   * Bun 的 `os.homedir()` 读的是进程启动时的快照。）
   */
  let cacheDir: string

  beforeAll(async () => {
    cacheDir = await mkdtemp(path.join(tmpdir(), 'wlin-update-test-'))
    process.env.WLIN_CLI_CACHE_DIR = cacheDir
  })

  afterAll(async () => {
    if (originalCacheDir === undefined) delete process.env.WLIN_CLI_CACHE_DIR
    else process.env.WLIN_CLI_CACHE_DIR = originalCacheDir
    await rm(cacheDir, {force: true, recursive: true})
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    if (originalSkip === undefined) delete process.env.WLIN_CLI_SKIP_UPDATE_CHECK
    else process.env.WLIN_CLI_SKIP_UPDATE_CHECK = originalSkip
    if (originalCi === undefined) delete process.env.CI
    else process.env.CI = originalCi
  })

  /** 把 fetch 替换掉，同时记录它是否真的被调用 */
  function stubFetch(response: Partial<Response> & {json?: () => Promise<unknown>}) {
    const calls: string[] = []
    globalThis.fetch = ((url: string | URL) => {
      calls.push(String(url))
      return Promise.resolve({ok: true, ...response} as Response)
    }) as typeof fetch
    return calls
  }

  test('reports a newer version', async () => {
    stubFetch({json: () => Promise.resolve({version: '9.9.9'})})
    expect(await checkForUpdate('1.0.0', true)).toBe('9.9.9')
  })

  test('reports nothing when already current or ahead', async () => {
    stubFetch({json: () => Promise.resolve({version: '1.0.0'})})
    expect(await checkForUpdate('1.0.0', true)).toBeUndefined()
    expect(await checkForUpdate('2.0.0', true)).toBeUndefined()
  })

  /**
   * 这条锁住的是一个真实踩过的坑：给 `/latest` 端点加
   * `accept: application/vnd.npm.install-v1+json` 会让 registry 回 406 空响应，
   * 而本模块把任何失败都静默当作「无更新」，于是更新检查会永远静默失效。
   */
  test('does not send the abbreviated-metadata accept header', async () => {
    const headers: Array<RequestInit['headers']> = []
    globalThis.fetch = ((_url: string | URL, init?: RequestInit) => {
      headers.push(init?.headers)
      return Promise.resolve({json: () => Promise.resolve({version: '9.9.9'}), ok: true} as Response)
    }) as unknown as typeof fetch

    await checkForUpdate('1.0.0', true)

    const sent = JSON.stringify(headers)
    expect(sent).not.toContain('install-v1')
  })

  test('treats a non-ok response as no update', async () => {
    stubFetch({json: () => Promise.resolve({version: '9.9.9'}), ok: false})
    expect(await checkForUpdate('1.0.0', true)).toBeUndefined()
  })

  test('treats a network failure as no update', async () => {
    globalThis.fetch = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch
    expect(await checkForUpdate('1.0.0', true)).toBeUndefined()
  })

  test('skips the check entirely when opted out', async () => {
    const calls = stubFetch({json: () => Promise.resolve({version: '9.9.9'})})
    process.env.WLIN_CLI_SKIP_UPDATE_CHECK = '1'

    expect(await checkForUpdate('1.0.0')).toBeUndefined()
    expect(calls).toHaveLength(0)
  })

  test('skips the check in CI', async () => {
    const calls = stubFetch({json: () => Promise.resolve({version: '9.9.9'})})
    delete process.env.WLIN_CLI_SKIP_UPDATE_CHECK
    process.env.CI = 'true'

    expect(await checkForUpdate('1.0.0')).toBeUndefined()
    expect(calls).toHaveLength(0)
  })

  test('force overrides the opt-out, since the user asked explicitly', async () => {
    const calls = stubFetch({json: () => Promise.resolve({version: '9.9.9'})})
    process.env.WLIN_CLI_SKIP_UPDATE_CHECK = '1'
    process.env.CI = 'true'

    expect(await checkForUpdate('1.0.0', true)).toBe('9.9.9')
    expect(calls).toHaveLength(1)
  })

  /**
   * `wlin-cli update` 必须绕过缓存：否则命中一条「无更新」的缓存后，即便 registry
   * 上已经有新版，也会报告已是最新。
   */
  test('caches the result, and force bypasses that cache', async () => {
    delete process.env.WLIN_CLI_SKIP_UPDATE_CHECK
    delete process.env.CI
    await rm(path.join(cacheDir, 'update-check.json'), {force: true})

    const first = stubFetch({json: () => Promise.resolve({version: '9.9.9'})})
    expect(await checkForUpdate('1.0.0')).toBe('9.9.9')
    expect(first).toHaveLength(1)

    // 第二次走缓存，不再发请求，但结论一致
    const cached = stubFetch({json: () => Promise.resolve({version: '9.9.9'})})
    expect(await checkForUpdate('1.0.0')).toBe('9.9.9')
    expect(cached).toHaveLength(0)

    // force 无视缓存，重新查
    const forced = stubFetch({json: () => Promise.resolve({version: '9.9.9'})})
    expect(await checkForUpdate('1.0.0', true)).toBe('9.9.9')
    expect(forced).toHaveLength(1)
  })
})
