import {mkdtemp, readdir, readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {shallowClone} from './git.js'
import {copyDir, ensureDir, rmrf} from './fsx.js'
import {setPackageName} from './pkg.js'

export const ORIGINS = ['github', 'gitee'] as const

export type Origin = (typeof ORIGINS)[number]

export const REMOTE_URLS: Record<Origin, string> = {
  gitee: 'https://gitee.com/imehc/fronted-template.git',
  github: 'https://github.com/imehc/fronted-template.git',
}

/** 选择列表里附在源名称后的说明，帮用户判断该选哪个 */
export const ORIGIN_HINTS: Record<Origin, string> = {
  gitee: 'mirror, usually faster in mainland China',
  github: 'upstream',
}

/**
 * 收窄任意字符串到已知的仓库源。
 *
 * 不写成 `ORIGINS.includes(x as Origin)`：那样的断言会让 TS 在校验之前就把类型
 * 当成 Origin，等于绕过检查。
 */
export function isOrigin(value: string): value is Origin {
  return (ORIGINS as readonly string[]).includes(value)
}

/** 项目名长度上限 */
const MAX_NAME_LENGTH = 16

/**
 * npm 明确拒绝的目录名。
 *
 * 这两个不是「不推荐」而是硬性非法：`npm publish` 会直接报 `Invalid name`。放过它们
 * 用户要等到发布时才发现名字不能用，而那时项目已经建好了。
 */
const RESERVED_NAMES = new Set(['favicon.ico', 'node_modules'])

/**
 * 校验项目名。
 *
 * 除长度和空格外，还必须拒绝路径分隔符和 `..` —— 项目名会被拼进
 * path.join(process.cwd(), name)，而覆盖分支会对该路径执行 rmrf。若放过
 * `../../foo` 这类输入，用户就能删掉工作目录之外的任意目录。
 *
 * @returns 出错时返回错误信息，合法时返回 undefined（@clack/prompts 的 validate 约定）
 */
export function validateProjectName(value: string): string | undefined {
  if (value.trim().length === 0) {
    return 'The string cannot be empty. Please re-enter it.'
  }

  if (value.includes(' ')) {
    return 'The string cannot contain Spaces, please re-enter.'
  }

  if (value.length > MAX_NAME_LENGTH) {
    return `The string cannot exceed ${MAX_NAME_LENGTH} characters, please shorten your input.`
  }

  if (value.includes('/') || value.includes('\\')) {
    return 'The project name cannot contain path separators.'
  }

  if (value === '.' || value === '..') {
    return 'The project name cannot be "." or "..".'
  }

  if (value.startsWith('.')) {
    return 'The project name cannot start with a dot.'
  }

  if (RESERVED_NAMES.has(value.toLowerCase())) {
    return `"${value}" is a reserved name that npm refuses. Please choose another.`
  }

  return undefined
}

/** 一个可用模板：目录名 + 从其 package.json 读到的描述 */
export type Template = {
  /** package.json 的 description，缺失时为 undefined */
  description?: string
  /** 目录名，也是 --template 的取值 */
  name: string
}

/**
 * 找出目录下所有「包含 package.json 的一级子目录」，即可用模板。
 *
 * 顺带读出各自的 description 用作选择列表的提示 —— 文件已经在本地了，多读一次
 * package.json 不产生网络开销，而 `react-ts` / `vue-ts` 这种目录名并不能说明
 * 模板里到底有什么。
 *
 * 隐藏目录（.git/.github 等）跳过。
 */
export async function detectTemplates(repoDir: string): Promise<Template[]> {
  const entries = await readdir(repoDir, {withFileTypes: true})

  const checks = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(async (entry) => {
        const pkgPath = path.join(repoDir, entry.name, 'package.json')

        let source: string
        try {
          source = await readFile(pkgPath, 'utf8')
        } catch {
          // 没有 package.json 就不是模板
          return undefined
        }

        // 描述读不出来无所谓，模板本身仍然可用，只是列表里少一行提示。
        // exactOptionalPropertyTypes 下 description 要么带上真值、要么整个键不存在
        let description: string | undefined
        try {
          const parsed = JSON.parse(source) as {description?: unknown}
          if (typeof parsed.description === 'string' && parsed.description.trim()) {
            description = parsed.description.trim()
          }
        } catch {
          description = undefined
        }

        const template: Template = {name: entry.name}
        if (description !== undefined) template.description = description
        return template
      }),
  )

  return checks.filter((entry): entry is Template => entry !== undefined).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * 已创建的临时目录，供中断时清理。
 */
const tempDirs = new Set<string>()

/**
 * 创建一个受跟踪的临时目录。
 *
 * 用 mkdtemp 而非 `wlin-template-${Date.now()}`：由内核保证唯一，同一毫秒内
 * 并发调用也不会撞名。
 */
async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix))
  tempDirs.add(dir)
  return dir
}

async function releaseTempDir(dir: string): Promise<void> {
  await rmrf(dir).catch(() => {})
  tempDirs.delete(dir)
}

/**
 * 清理所有残留的临时目录。中断退出时调用。
 */
export async function cleanupTempDirs(): Promise<void> {
  await Promise.all([...tempDirs].map((dir) => rmrf(dir).catch(() => {})))
  tempDirs.clear()
}

/**
 * 克隆模板仓库到临时目录，并列出其中的可用模板。
 *
 * 调用方负责在用完后调用返回的 dispose()。
 *
 * 原实现会克隆仓库两次 —— 一次为了列模板，一次为了拷文件。这里只克隆一次，
 * 两个用途共用，省掉一半网络时间。
 */
export async function fetchRepo(origin: Origin): Promise<{
  dir: string
  dispose: () => Promise<void>
  templates: Template[]
}> {
  const dir = await createTempDir('wlin-template-')

  try {
    await shallowClone(REMOTE_URLS[origin], dir)
    const templates = await detectTemplates(dir)
    return {dir, dispose: () => releaseTempDir(dir), templates}
  } catch (error) {
    await releaseTempDir(dir)
    throw error
  }
}

export type CreateOptions = {
  /** 已克隆好的模板仓库目录 */
  repoDir: string
  /** 目标目录已存在、需先删除 */
  replaceExisting: boolean
  /** 项目名，同时作为目标目录名和 package.json 的 name */
  name: string
  /** 选定的模板（repoDir 下的子目录名） */
  template: string
  /** 目标目录绝对路径 */
  targetDir: string
}

/**
 * 把模板内容落到目标目录。
 */
export async function createProject({
  name,
  repoDir,
  replaceExisting,
  targetDir,
  template,
}: CreateOptions): Promise<void> {
  if (replaceExisting) {
    await rmrf(targetDir)
  }

  await ensureDir(targetDir)
  await copyDir(path.join(repoDir, template), targetDir)

  // 模板仓库自身的 git 历史和 CI 配置不该带进新项目
  await Promise.all([rmrf(path.join(targetDir, '.git')), rmrf(path.join(targetDir, '.github'))])

  await setPackageName(targetDir, name)
}
