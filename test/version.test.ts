import {describe, expect, test} from 'bun:test'

import {compareVersions, satisfiesMinimum} from '../src/version.ts'

describe('compareVersions', () => {
  test('compares numeric segments', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1)
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1)
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1)
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
  })

  test('tolerates a v prefix', () => {
    expect(compareVersions('v22.0.0', '22.0.0')).toBe(0)
    expect(compareVersions('v22.1.0', 'v22.0.0')).toBe(1)
  })

  test('treats missing segments as zero', () => {
    expect(compareVersions('18', '18.0.0')).toBe(0)
    expect(compareVersions('18.1', '18.0.0')).toBe(1)
  })

  test('orders prereleases below their release', () => {
    // 这是原实现失败的场景：Number('0-nightly') === NaN，比较结果不可预期
    expect(compareVersions('23.0.0-nightly', '23.0.0')).toBe(-1)
    expect(compareVersions('23.0.0', '23.0.0-nightly')).toBe(1)
    expect(compareVersions('1.0.0-beta', '1.0.0-beta')).toBe(0)
  })

  test('orders prerelease identifiers', () => {
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1)
    expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha')).toBe(1)
    expect(compareVersions('1.0.0-alpha.2', '1.0.0-alpha.10')).toBe(-1)
    // 数字标识符优先级低于字母标识符
    expect(compareVersions('1.0.0-1', '1.0.0-alpha')).toBe(-1)
  })

  test('ignores build metadata', () => {
    expect(compareVersions('1.0.0+build1', '1.0.0+build2')).toBe(0)
    expect(compareVersions('1.0.0-beta+x', '1.0.0-beta')).toBe(0)
  })
})

describe('satisfiesMinimum', () => {
  test('accepts equal and newer versions', () => {
    expect(satisfiesMinimum('20.12.0', '20.12.0')).toBe(true)
    expect(satisfiesMinimum('v22.22.3', '20.12.0')).toBe(true)
    expect(satisfiesMinimum('20.13.0', '20.12.0')).toBe(true)
  })

  test('rejects older versions', () => {
    // 20.11 → 20.12 是真实的下限边界：styleText 在 20.12 才成为 node:util 的导出
    expect(satisfiesMinimum('20.11.1', '20.12.0')).toBe(false)
    expect(satisfiesMinimum('18.20.8', '20.12.0')).toBe(false)
    expect(satisfiesMinimum('16.20.0', '20.12.0')).toBe(false)
  })

  test('rejects a prerelease of the minimum version', () => {
    expect(satisfiesMinimum('20.12.0-nightly', '20.12.0')).toBe(false)
  })
})
