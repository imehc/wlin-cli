/**
 * 解析后的语义化版本。
 */
type Parsed = {
  numbers: number[]
  prerelease: string[]
}

/**
 * 解析版本号，容忍 `v` 前缀、缺失的段位和预发布后缀。
 *
 * 例：`v23.0.0-nightly20240101` → {numbers: [23,0,0], prerelease: ['nightly20240101']}
 */
function parse(version: string): Parsed {
  const cleaned = version.trim().replace(/^v/, '')
  // 构建元数据（+ 之后）不参与比较，直接丢弃。
  // split 至少返回一个元素，但 noUncheckedIndexedAccess 下要显式兜底
  const withoutBuild = cleaned.split('+', 1)[0] ?? cleaned
  const [core = '', prereleaseRaw] = withoutBuild.split('-', 2)

  const numbers = core.split('.').map((part) => {
    const n = Number.parseInt(part, 10)
    return Number.isNaN(n) ? 0 : n
  })

  return {
    numbers,
    prerelease: prereleaseRaw ? prereleaseRaw.split('.') : [],
  }
}

/**
 * 比较两个版本号。
 *
 * @returns a > b 时为 1，a < b 时为 -1，相等为 0
 *
 * 按 semver 规则处理预发布版本：1.0.0-beta < 1.0.0。原实现直接对每段做
 * Number()，遇到 `23.0.0-nightly` 这类 Node 版本会得到 NaN，比较结果不可预期。
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parse(a)
  const pb = parse(b)

  const len = Math.max(pa.numbers.length, pb.numbers.length)
  for (let i = 0; i < len; i++) {
    const na = pa.numbers[i] ?? 0
    const nb = pb.numbers[i] ?? 0
    if (na > nb) return 1
    if (na < nb) return -1
  }

  // 数字段相同：有预发布后缀的一方更小
  const hasPreA = pa.prerelease.length > 0
  const hasPreB = pb.prerelease.length > 0
  if (hasPreA && !hasPreB) return -1
  if (!hasPreA && hasPreB) return 1
  if (!hasPreA && !hasPreB) return 0

  const preLen = Math.max(pa.prerelease.length, pb.prerelease.length)
  for (let i = 0; i < preLen; i++) {
    const ia = pa.prerelease[i]
    const ib = pb.prerelease[i]
    if (ia === undefined) return -1
    if (ib === undefined) return 1
    if (ia === ib) continue

    const numA = Number.parseInt(ia, 10)
    const numB = Number.parseInt(ib, 10)
    const bothNumeric = !Number.isNaN(numA) && !Number.isNaN(numB) && String(numA) === ia && String(numB) === ib

    if (bothNumeric) {
      return numA > numB ? 1 : -1
    }

    // 数字标识符优先级低于字母标识符
    if (!Number.isNaN(numA) && String(numA) === ia) return -1
    if (!Number.isNaN(numB) && String(numB) === ib) return 1

    return ia > ib ? 1 : -1
  }

  return 0
}

/**
 * current 是否满足 >= required。
 */
export function satisfiesMinimum(current: string, required: string): boolean {
  return compareVersions(current, required) >= 0
}
