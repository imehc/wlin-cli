import {Args, Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import figlet from 'figlet'
import {copy, ensureDir, exists, pathExists, remove} from 'fs-extra'
import inquirer from 'inquirer'
import {exec} from 'node:child_process'
import {readdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
// import notifier from 'node-notifier'
import ora from 'ora'
import {rimraf} from 'rimraf'
import {simpleGit} from 'simple-git'

// Gitee 仍然使用分支方式的模板列表
const giteeTemplates = [/** 'next', */ 'react-ts', 'vue-ts'] as const
const origins = ['github', 'gitee'] as const
const manager = ['npm', 'yarn', 'pnpm', 'bun']

type BaseConfig = {
  isRepeat?: boolean
  name: string
  origin: (typeof origins)[number]
  pkgManager: (typeof manager)[number]
  targetDir: string
  template: string
}

export default class Create extends Command {
  static args = {
    name: Args.string({description: 'projectName'}),
  }

  static description = 'Create a project template'

  static flags = {
    origin: Flags.string({options: origins}),
    pkgManager: Flags.string({options: manager}),
    template: Flags.string(),
  }

  // 跟踪临时目录以便清理
  private tempDirs: string[] = []
  private isExiting = false

  public async run(): Promise<void> {
    // 检查 Node 版本
    if (!this.checkNodeVersion()) {
      return
    }

    // 设置 Ctrl+C 处理器
    this.setupExitHandler()

    figlet('wlin-cli', async (err, data) => {
      if (err) {
        this.error(err)
      }

      this.log(data)
      try {
        const config = await this.initConfig()
        await this.createProject(config)
      } catch (error: any) {
        // 处理用户取消操作
        if (this.isUserCancellation(error)) {
          this.log(chalk.yellow('\n✖ Operation cancelled by user'))
          await this.cleanup()
          this.exit(0)
        } else {
          // 其他错误正常抛出
          await this.cleanup()
          throw error
        }
      }
    })
  }

  /**
   * 检查 Node 版本是否符合要求
   */
  private checkNodeVersion(): boolean {
    const requiredVersion = '18.0.0'
    const currentVersion = process.version.slice(1) // 移除 'v' 前缀

    if (!this.isVersionCompatible(currentVersion, requiredVersion)) {
      this.log(chalk.red('✖ Node version error'))
      this.log(chalk.yellow(`\nYour Node version: ${chalk.bold(process.version)}`))
      this.log(chalk.yellow(`Required version: ${chalk.bold(`>=${requiredVersion}`)}`))
      this.log(chalk.cyan('\nPlease upgrade your Node.js version to continue.'))
      this.log(chalk.cyan('Download from: https://nodejs.org/'))
      return false
    }

    return true
  }

  /**
   * 比较版本号
   */
  private isVersionCompatible(current: string, required: string): boolean {
    const currentParts = current.split('.').map(Number)
    const requiredParts = required.split('.').map(Number)

    for (let i = 0; i < requiredParts.length; i++) {
      if (currentParts[i] > requiredParts[i]) return true
      if (currentParts[i] < requiredParts[i]) return false
    }

    return true
  }

  /**
   * 设置退出信号处理器
   */
  private setupExitHandler(): void {
    const exitHandler = async (signal: string) => {
      if (this.isExiting) return
      this.isExiting = true

      this.log(chalk.yellow(`\n\nReceived ${signal}, cleaning up...`))
      await this.cleanup()
      this.log(chalk.green('✓ Cleanup completed'))
      process.exit(0)
    }

    process.on('SIGINT', () => exitHandler('SIGINT'))
    process.on('SIGTERM', () => exitHandler('SIGTERM'))
  }

  /**
   * 检查是否为用户取消操作
   */
  private isUserCancellation(error: any): boolean {
    // inquirer 在用户按 Ctrl+C 时会抛出这些错误
    return (
      error?.isTtyError ||
      error?.message?.includes('User force closed') ||
      error?.message?.includes('canceled') ||
      error?.message?.includes('cancelled')
    )
  }

  /**
   * 清理所有临时目录
   */
  private async cleanup(): Promise<void> {
    for (const dir of this.tempDirs) {
      try {
        await rimraf(dir)
      } catch {
        // 忽略清理错误
      }
    }

    this.tempDirs = []
  }

  /**
   * 添加临时目录到跟踪列表
   */
  private addTempDir(dir: string): void {
    this.tempDirs.push(dir)
  }

  /**
   * 从跟踪列表移除临时目录
   */
  private removeTempDir(dir: string): void {
    const index = this.tempDirs.indexOf(dir)
    if (index > -1) {
      this.tempDirs.splice(index, 1)
    }
  }

  private async createProject({isRepeat, name, origin, pkgManager, targetDir, template}: BaseConfig): Promise<void> {
    const initSpinner = ora(chalk.cyan('Create directory...\n'))
    initSpinner.start()
    if (isRepeat) {
      try {
        await remove(targetDir)
        initSpinner.text = chalk.green('Remove the original directory success\n')
      } catch (error) {
        initSpinner.fail(chalk.red(`Failed to remove the original directory: ${error}\n`))
      }
    }

    await ensureDir(targetDir)

    try {
      initSpinner.text = chalk.green('Download template...\n')
      await this.downloadTemplate({origin, targetDir, template})
      await rimraf(`${targetDir}/.git`).catch(() => {})
      await rimraf(`${targetDir}/.github`).catch(() => {})
      exec(`cd ${targetDir} && npm pkg set name="${name}"`, (error) => {
        if (error) {
          initSpinner.stop()
          initSpinner.fail(chalk.red(error))
        }
      })
    } catch (error) {
      initSpinner.stop()
      initSpinner.fail(chalk.red(error))
      return
    }

    try {
      initSpinner.text = 'Install dependencies...\n'
      exec(`cd ${targetDir} && ${pkgManager} install`, (error) => {
        if (error) {
          initSpinner.stop()
          initSpinner.fail(chalk.red(error))
          return
        }

        // console.log(`stdout: ${stdout}`);
        // console.error(`stderr: ${stderr}`);
        // notifier.notify({
        //   message: 'Template initialization completed.',
        //   title: 'wlin-cli notification',
        // })
        initSpinner.stop()
        initSpinner.succeed('Template initialization completed.\n')
      })
    } catch {
      initSpinner.stop()
      initSpinner.fail('Installation of dependency failed.')
    }
  }

  private async downloadTemplate({
    origin,
    targetDir,
    template,
  }: Pick<BaseConfig, 'origin' | 'targetDir' | 'template'>): Promise<void> {
    switch (origin) {
      case 'gitee': {
        const basicRemoteUrl = 'https://gitee.com/imehc/fronted-template.git'
        await simpleGit().clone(basicRemoteUrl, targetDir, ['--branch', template])
        break
      }

      default: {
        // GitHub: 克隆 main 分支，然后只保留指定模板文件夹
        const basicRemoteUrl = 'https://github.com/imehc/fronted-template.git'
        const tmpDir = path.join(tmpdir(), `wlin-template-${Date.now()}`)

        try {
          // 添加到临时目录跟踪
          this.addTempDir(tmpDir)

          // 克隆整个 main 分支
          await simpleGit().clone(basicRemoteUrl, tmpDir, ['--depth', '1', '--branch', 'main'])

          // 确保目标目录存在
          await ensureDir(targetDir)

          // 复制指定模板文件夹的内容到目标目录
          const templateSrcDir = path.join(tmpDir, template)
          await copy(templateSrcDir, targetDir)

          // 清理临时目录
          await rimraf(tmpDir)
          this.removeTempDir(tmpDir)
        } catch (error) {
          // 清理临时目录
          await rimraf(tmpDir).catch(() => {})
          this.removeTempDir(tmpDir)
          throw error
        }

        break
      }
    }
  }

  /**
   * 从 GitHub main 分支动态获取可用的模板列表
   * 检测所有包含 package.json 的一级子目录
   */
  private async fetchGithubTemplates(): Promise<string[]> {
    const tmpDir = path.join(tmpdir(), `wlin-template-list-${Date.now()}`)
    const spinner = ora(chalk.cyan('Fetching available templates from GitHub...')).start()

    try {
      // 添加到临时目录跟踪
      this.addTempDir(tmpDir)

      // 克隆仓库到临时目录
      const remoteUrl = 'https://github.com/imehc/fronted-template.git'
      await simpleGit().clone(remoteUrl, tmpDir, ['--depth', '1', '--branch', 'main'])

      // 读取目录
      const entries = await readdir(tmpDir, {withFileTypes: true})

      // 筛选出包含 package.json 的目录
      const templates: string[] = []
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const pkgPath = path.join(tmpDir, entry.name, 'package.json')
          if (await pathExists(pkgPath)) {
            templates.push(entry.name)
          }
        }
      }

      // 清理临时目录
      await rimraf(tmpDir)
      this.removeTempDir(tmpDir)
      spinner.succeed(chalk.green(`Found ${templates.length} templates`))

      return templates
    } catch (error) {
      spinner.fail(chalk.red('Failed to fetch templates from GitHub'))
      await rimraf(tmpDir).catch(() => {})
      this.removeTempDir(tmpDir)
      throw error
    }
  }

  private async initConfig(): Promise<BaseConfig> {
    const {args, flags} = await this.parse(Create)
    let {name} = args
    let {origin, pkgManager, template} = flags
    let isRepeat = false

    if (!name) {
      const responses = await inquirer.prompt([
        {
          message: 'enter a project name:',
          name: 'name',
          type: 'input',
          validate(value) {
            if (value.trim().length === 0) {
              return 'The string cannot be empty. Please re-enter it.'
            }

            if (value.includes(' ')) {
              return 'The string cannot contain Spaces, please re-enter.'
            }

            if (value.length > 16) {
              return 'The string cannot exceed 16 characters, please shorten your input.'
            }

            return true
          },
        },
      ])
      name = responses.name
    }

    const targetDir = path.join(process.cwd(), name as string)
    const isExists = await exists(targetDir)

    if (isExists) {
      const response = await inquirer.prompt([
        {
          default: false,
          message: 'Check whether a file with the same name exists in the directory',
          name: 'projectCover',
          type: 'confirm',
        },
      ])

      if (!response.projectCover) {
        this.error(chalk.red(`The project name already exists. Please reset it`))
      }

      isRepeat = true
    }

    // 先选择 origin
    if (!origin) {
      const responses = await inquirer.prompt([
        {
          choices: origins,
          message: 'Select a warehouse source',
          name: 'origin',
          type: 'list',
        },
      ])
      origin = responses.origin
    }

    // 根据 origin 获取模板列表
    let availableTemplates: string[]
    if (origin === 'github') {
      // GitHub: 动态获取模板列表
      availableTemplates = await this.fetchGithubTemplates()
    } else {
      // Gitee: 使用预定义的模板列表
      availableTemplates = [...giteeTemplates]
    }

    // 选择模板
    if (!template) {
      const responses = await inquirer.prompt([
        {
          choices: availableTemplates,
          message: 'Select a template',
          name: 'template',
          type: 'list',
        },
      ])
      template = responses.template
    }

    if (!pkgManager) {
      const responses = await inquirer.prompt([
        {
          choices: manager,
          message: 'Select a package manager',
          name: 'pkgManager',
          type: 'list',
        },
      ])
      pkgManager = responses.pkgManager
    }

    return {isRepeat, name, origin, pkgManager, targetDir, template} as BaseConfig
  }
}
