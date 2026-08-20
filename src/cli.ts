import {cancel, confirm, intro, isCancel, log, outro, select, spinner, text} from '@clack/prompts'
import {parseArgs} from 'node:util'
import path from 'node:path'
import pc from 'picocolors'

// 只取 version 字段：bun 打包时会 tree-shake 成一个字符串常量，
// 不会把整个 package.json（含 devDependencies）内联进产物
import {version as VERSION} from '../package.json'
import {BANNER} from './banner.js'
import {
  cleanupTempDirs,
  createProject,
  fetchRepo,
  isOrigin,
  ORIGIN_HINTS,
  ORIGINS,
  type Origin,
  validateProjectName,
} from './create.js'
import {pathExists} from './fsx.js'
import {checkForUpdate, runUpdate} from './update.js'
import {satisfiesMinimum} from './version.js'

/**
 * engines.node 的下限。
 *
 * 20.12 不是我们自己的需求（parseArgs 只要 18.3），而是 @clack/prompts 1.x 的：
 * 它 import 了 node:util 的 styleText，该导出 20.12 才有。ESM 的命名导入在链接期
 * 解析，缺失就是 SyntaxError —— 在 Node 18 上连 `--version` 都跑不起来，且报错是
 * 一段无法阅读的 minify 堆栈。所以这里必须先于任何 import 拦下来。
 */
const MIN_NODE = '20.12.0'

/** 用户主动取消时的退出码，遵循 shell 的 128+SIGINT 约定 */
const EXIT_CANCELLED = 130

const HELP = `${pc.bold('wlin-cli')} — Quickly create common templates

${pc.bold('USAGE')}
  $ wlin-cli <command> [options]

${pc.bold('COMMANDS')}
  create [NAME]   Create a project template
  update          Update wlin-cli to the latest version

${pc.bold('OPTIONS')}
  --origin <${ORIGINS.join('|')}>    Template repository source
  --template <NAME>          Template to use
  -h, --help                 Show this help
  -v, --version              Show version

${pc.bold('EXAMPLES')}
  $ wlin-cli create
  $ wlin-cli create my-app
  $ wlin-cli create my-app --origin=github --template=react

${pc.bold('ENVIRONMENT')}
  NO_COLOR                     Disable coloured output
  WLIN_CLI_SKIP_UPDATE_CHECK   Skip the update check on startup
`

/**
 * 用户按下 Ctrl+C 时统一退出。
 */
async function bailOut(): Promise<never> {
  cancel('Operation cancelled')
  await cleanupTempDirs()
  process.exit(EXIT_CANCELLED)
}

/**
 * 交互提示前确认 stdin 可用。
 *
 * 原实现把 inquirer 的 isTtyError 归入「用户取消」并 exit(0)，导致在 CI 或管道里
 * 缺参数会被静默当成成功。这里明确报错，并指出该用哪个 flag 绕过交互。
 */
function requireInteractive(missing: string): void {
  if (!process.stdin.isTTY) {
    throw new Error(
      `${missing} is required when stdin is not a TTY.\n` +
        `Pass it explicitly, e.g. wlin-cli create my-app --origin=github --template=react`,
    )
  }
}

/**
 * 包装 @clack/prompts 的返回值：取消即退出，否则返回结果。
 */
async function unwrap<T>(value: T | symbol): Promise<T> {
  if (isCancel(value)) await bailOut()
  return value as T
}

/**
 * 猜出用户是用哪个包管理器跑我们的，用于「后续步骤」里给出对应的安装命令。
 *
 * `npm_config_user_agent` 由 npm / pnpm / yarn / bun 在执行脚本或 `dlx`/`exec`
 * 时注入，形如 `pnpm/9.0.0 npm/? node/v22.0.0 darwin arm64`。直接 `npx wlin-cli`
 * 之外的场景（比如全局安装后直接调用）拿不到，此时回退到列出全部选项。
 *
 * 这里刻意不复用 update.ts 的 detectPackageManager —— 那个看的是「自己被装在哪」，
 * 与「用户手上用的是哪个」是两回事：用 npm 全局装的 CLI 完全可以在 pnpm 项目里跑。
 *
 * userAgent 不给默认值，由调用方显式传入 env：否则测试传 undefined 会触发默认参数
 * 而读到真实环境变量（`bun run test` 自己就会设它），断言随运行方式而变。
 */
export function detectInvokingPackageManager(userAgent: string | undefined): string | undefined {
  if (!userAgent) return undefined

  const [first] = userAgent.split(' ')
  const name = first?.split('/')[0]

  return name && ['bun', 'npm', 'pnpm', 'yarn'].includes(name) ? name : undefined
}

/** 「后续步骤」里的安装命令：能认出包管理器就只给那一条，否则列出全部 */
function installHint(): string {
  const pm = detectInvokingPackageManager(process.env.npm_config_user_agent)
  if (pm) return `${pm} install`

  return `npm install  ${pc.dim('# or yarn / pnpm install / bun install')}`
}

async function commandCreate(positionals: string[], flags: {origin?: string; template?: string}): Promise<void> {
  intro(pc.cyan('wlin-cli'))

  let name = positionals[0]
  if (name) {
    // 命令行传进来的名字也要校验，否则会创建出非法的 package name
    const invalid = validateProjectName(name)
    if (invalid) throw new Error(invalid)
  } else {
    requireInteractive('Project name')
    name = await unwrap(
      await text({
        message: 'Enter a project name:',
        placeholder: 'my-app',
        validate: (value) => validateProjectName(value ?? ''),
      }),
    )
  }

  const targetDir = path.join(process.cwd(), name)
  let replaceExisting = false

  if (await pathExists(targetDir)) {
    requireInteractive('Overwrite confirmation')
    const overwrite = await unwrap(
      await confirm({
        initialValue: false,
        message: `${pc.yellow(name)} already exists. Overwrite it?`,
      }),
    )

    if (!overwrite) {
      throw new Error('The project name already exists. Please reset it')
    }

    replaceExisting = true
  }

  let origin: Origin | undefined
  if (flags.origin !== undefined) {
    if (!isOrigin(flags.origin)) {
      throw new Error(`Unknown origin '${flags.origin}'. Expected one of: ${ORIGINS.join(', ')}`)
    }

    origin = flags.origin
  }

  if (!origin) {
    requireInteractive('--origin')
    origin = await unwrap(
      await select({
        message: 'Select a warehouse source',
        options: ORIGINS.map((value) => ({hint: ORIGIN_HINTS[value], label: value, value})),
      }),
    )
  }

  const loader = spinner()
  loader.start(`Fetching available templates from ${origin}`)

  let repo: Awaited<ReturnType<typeof fetchRepo>>
  try {
    repo = await fetchRepo(origin)
  } catch (error) {
    loader.error(pc.red(`Failed to fetch templates from ${origin}`))
    throw error
  }

  loader.stop(`Found ${repo.templates.length} template${repo.templates.length === 1 ? '' : 's'}`)

  try {
    if (repo.templates.length === 0) {
      throw new Error(`No templates found in the ${origin} repository.`)
    }

    const names = repo.templates.map((entry) => entry.name)

    let {template} = flags
    if (template && !names.includes(template)) {
      throw new Error(`Unknown template '${template}'. Available: ${names.join(', ')}`)
    }

    if (!template) {
      const [only] = names
      if (only && names.length === 1) {
        // 只有一个选项的「请选择」是纯噪音，直接用它并说明用了什么
        template = only
        log.info(`Using the only available template: ${pc.bold(only)}`)
      } else {
        requireInteractive('--template')
        template = await unwrap(
          await select({
            message: 'Select a template',
            options: repo.templates.map((entry) => ({
              label: entry.name,
              // 目录名（react-ts / vue-ts）说明不了模板里有什么，把 description 带上
              ...(entry.description === undefined ? {} : {hint: entry.description}),
              value: entry.name,
            })),
          }),
        )
      }
    }

    const build = spinner()
    build.start('Creating project')
    try {
      await createProject({name, repoDir: repo.dir, replaceExisting, targetDir, template})
    } catch (error) {
      build.error(pc.red('Failed to create project'))
      throw error
    }

    build.stop('Template initialization completed')
  } finally {
    await repo.dispose()
  }

  log.success(`Project ${pc.bold(name)} created successfully!`)
  outro(`${pc.bold('Next steps:')}\n` + `  cd ${name}\n` + `  ${installHint()}`)
}

async function commandUpdate(): Promise<void> {
  intro(pc.cyan('wlin-cli update'))

  // force：绕过 24h 缓存。用户显式要求更新时必须查实时结果
  const latest = await checkForUpdate(VERSION, true)
  if (!latest) {
    outro(`Already up to date (${VERSION})`)
    return
  }

  const loader = spinner()
  loader.start(`Updating ${VERSION} → ${latest}`)

  const {command, ran} = await runUpdate().catch((error: unknown) => {
    loader.error(pc.red('Update failed'))
    throw error
  })

  if (ran) {
    loader.stop(`Updated to ${latest}`)
    outro(pc.dim(command))
    return
  }

  loader.error(pc.yellow('Could not detect how wlin-cli was installed'))
  outro(`Run this to update manually:\n  ${pc.cyan(command)}`)
}

/**
 * 命令结束后提示新版本。
 *
 * 检查在启动时就并发发起，这里只等结果，因此不给主流程增加延迟。
 */
async function printUpdateNotice(check: Promise<string | undefined>): Promise<void> {
  const latest = await check
  if (!latest || !process.stdout.isTTY) return

  process.stdout.write(
    `\n${pc.yellow('⚡ Update available')} ${pc.dim(VERSION)} → ${pc.green(latest)}\n` +
      `   Run ${pc.cyan('wlin-cli update')} to upgrade\n`,
  )
}

/**
 * 注册中断信号处理，确保临时目录不残留。
 *
 * 原实现在 process.on('SIGINT') 的 async 回调里 `throw`，那只会变成一个无人
 * 处理的拒绝，进程既不会干净退出也不会设置退出码。这里改为清理后显式 exit。
 *
 * 注意：交互提示进行时 stdin 处于 raw mode，Ctrl+C 会以 \x03 字节送达而不产生
 * SIGINT，由 @clack/prompts 自己转成 cancel 信号处理。此处兜的是提示之外的阶段
 * （如 git clone 期间）。
 */
function setupSignalHandlers(): void {
  let handling = false

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      if (handling) return
      handling = true

      void cleanupTempDirs().then(() => {
        process.stderr.write(`\n${pc.yellow(`Received ${signal}, cleaned up.`)}\n`)
        process.exit(EXIT_CANCELLED)
      })
    })
  }
}

export async function run(argv: string[] = process.argv.slice(2)): Promise<void> {
  if (!satisfiesMinimum(process.version, MIN_NODE)) {
    process.stderr.write(
      `${pc.red('✖ Node version error')}\n` +
        `Your Node version: ${pc.bold(process.version)}\n` +
        `Required version: ${pc.bold(`>=${MIN_NODE}`)}\n` +
        `Please upgrade to continue: https://nodejs.org/\n`,
    )
    process.exitCode = 1
    return
  }

  setupSignalHandlers()

  let parsed: ReturnType<typeof parseArgs>
  try {
    parsed = parseArgs({
      allowPositionals: true,
      args: argv,
      options: {
        help: {short: 'h', type: 'boolean'},
        origin: {type: 'string'},
        template: {type: 'string'},
        version: {short: 'v', type: 'boolean'},
      },
      strict: true,
    })
  } catch (error) {
    process.stderr.write(`${pc.red('✖')} ${(error as Error).message}\n\nRun ${pc.cyan('wlin-cli --help')}\n`)
    process.exitCode = 1
    return
  }

  const {positionals, values} = parsed

  if (values.version) {
    process.stdout.write(`${VERSION}\n`)
    return
  }

  const [command, ...rest] = positionals

  if (values.help || !command) {
    process.stdout.write(`${pc.cyan(BANNER)}\n${HELP}`)
    return
  }

  // 仅 create 需要后台版本检查：update 命令自己会查（且强制绕过缓存），
  // 更新完还提示「有新版可用」只会让人困惑 —— 当前进程跑的仍是旧版本
  const updateCheck = command === 'create' ? checkForUpdate(VERSION).catch(() => undefined) : Promise.resolve(undefined)

  try {
    switch (command) {
      case 'create': {
        await commandCreate(rest, values as {origin?: string; template?: string})
        break
      }

      case 'update': {
        await commandUpdate()
        break
      }

      default: {
        process.stderr.write(
          `${pc.red('✖')} Unknown command ${pc.bold(command)}\n\n` +
            `Available commands: ${pc.cyan('create')}, ${pc.cyan('update')}\n` +
            `Run ${pc.cyan('wlin-cli --help')} for usage\n`,
        )
        process.exitCode = 1
        return
      }
    }

    await printUpdateNotice(updateCheck)
  } catch (error) {
    await cleanupTempDirs()
    process.stderr.write(`\n${pc.red('✖')} ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
