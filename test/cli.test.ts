import {describe, expect, test} from 'bun:test'

import {detectInvokingPackageManager} from '../src/cli.ts'

describe('detectInvokingPackageManager', () => {
  test('reads the name out of npm_config_user_agent', () => {
    expect(detectInvokingPackageManager('pnpm/9.0.0 npm/? node/v22.0.0 darwin arm64')).toBe('pnpm')
    expect(detectInvokingPackageManager('npm/10.8.2 node/v22.0.0 darwin arm64')).toBe('npm')
    expect(detectInvokingPackageManager('yarn/4.1.0 npm/? node/v22.0.0 darwin arm64')).toBe('yarn')
    expect(detectInvokingPackageManager('bun/1.3.14 npm/? node/v22.0.0 darwin arm64')).toBe('bun')
  })

  test('returns undefined when the variable is absent', () => {
    // 全局安装后直接调用（不经包管理器）就没有这个变量，此时回退到列出全部选项
    expect(detectInvokingPackageManager(undefined)).toBeUndefined()
    expect(detectInvokingPackageManager('')).toBeUndefined()
  })

  test('returns undefined for an unrecognised agent rather than echoing it', () => {
    // 直接把未知名字拼进 `<name> install` 就等于让 UA 决定我们建议用户跑什么命令
    expect(detectInvokingPackageManager('deno/2.0.0 node/v22.0.0')).toBeUndefined()
    expect(detectInvokingPackageManager('rm -rf //1.0.0')).toBeUndefined()
  })
})
