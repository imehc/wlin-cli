import {readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'

/**
 * 探测 JSON 文本使用的缩进风格。
 *
 * 找到第一个缩进过的行，原样返回其前导空白（可能是空格或 tab）。
 * 探测不到时回退到 2 空格 —— npm 自己写 package.json 用的也是 2 空格。
 */
export function detectIndent(source: string): number | string {
  const match = source.match(/^[ \t]+(?=["}\]])/m)
  if (!match) return 2

  const [indent] = match
  return indent.includes('\t') ? '\t' : indent.length
}

/**
 * 改写目标目录下 package.json 的 name 字段。
 *
 * 取代原来的 `execAsync('npm pkg set name="${name}"')`。换掉它有三个原因：
 *  1. 原实现把 name 直接插进 shell 命令字符串，而校验只挡空格和长度，不挡 `;`
 *     或 `$()` —— 项目名可控时是命令注入。
 *  2. 省掉一次 npm 子进程（约 200ms）。
 *  3. 不再要求用户装了 npm（用 pnpm/bun 的人也能用）。
 *
 * 保留原文件的缩进风格、键顺序和结尾换行。
 */
export async function setPackageName(targetDir: string, name: string): Promise<void> {
  const pkgPath = path.join(targetDir, 'package.json')

  let source: string
  try {
    source = await readFile(pkgPath, 'utf8')
  } catch {
    // 模板没有 package.json 不是错误，跳过即可
    return
  }

  let pkg: Record<string, unknown>
  try {
    pkg = JSON.parse(source) as Record<string, unknown>
  } catch (error) {
    throw new Error(`Template package.json is not valid JSON: ${(error as Error).message}`, {cause: error})
  }

  pkg.name = name

  const indent = detectIndent(source)
  const trailingNewline = source.endsWith('\n') ? '\n' : ''
  await writeFile(pkgPath, JSON.stringify(pkg, null, indent) + trailingNewline, 'utf8')
}
