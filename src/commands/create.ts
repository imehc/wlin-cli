import {Args, Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import figlet from 'figlet'
import {ensureDir, exists, remove} from 'fs-extra'
import inquirer from 'inquirer'
import {exec} from 'node:child_process'
import path from 'node:path'
import notifier from 'node-notifier'
import ora from 'ora'
import {rimraf} from 'rimraf'
import {simpleGit} from 'simple-git'

const templates = [/** 'next', */ 'react-ts', 'vue-ts'] as const
const origins = ['github', 'gitee'] as const

type BaseConfig = {
  isRepeat?: boolean
  name: string
  origin: (typeof origins)[number]
  targetDir: string
  template: (typeof templates)[number]
}

export default class Create extends Command {
  static args = {
    name: Args.string({description: 'projectName'}),
  }

  static description = 'Create a project template'

  static flags = {
    origin: Flags.string({options: origins}),
    template: Flags.string({options: templates}),
  }

  public async run(): Promise<void> {
    figlet('wlin-cli', async (err, data) => {
      if (err) {
        this.error(err)
      }

      this.log(data)
      const config = await this.initConfig()
      // this.log(`the template is: ${config.template}, name: ${config.name}, targetDir: ${config.targetDir}`)
      this.createProject(config)
    })
  }

  private async createProject({isRepeat, name, origin, targetDir, template}: BaseConfig): Promise<void> {
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
      initSpinner.text = chalk.green('Download template\n')
      await this.downloadTemplate({origin, targetDir, template})
      await rimraf(`${targetDir}/.git`).catch(() => {})
      await rimraf(`${targetDir}/.github`).catch(() => {})
      exec(`cd ${targetDir} && npm pkg set name="${name}"`, (error) => {
        if (error) {
          initSpinner.text = chalk.red(error)
          initSpinner.fail()
        }
      })
      notifier.notify({
        message: 'downloading template completed!',
        title: 'wlin-cli notification',
      })
      initSpinner.text = 'Initialization project completed.\n'
      initSpinner.succeed()
    } catch (error) {
      initSpinner.text = chalk.red(error)
      initSpinner.fail()
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
        const basicRemoteUrl = 'https://github.com/imehc/fronted-template.git'
        await simpleGit().clone(basicRemoteUrl, targetDir, ['--branch', template])
        break
      }
    }
  }

  private async initConfig(): Promise<BaseConfig> {
    const {args, flags} = await this.parse(Create)
    let {name} = args
    let {origin, template} = flags
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
      const response = await inquirer
        .prompt([
          {
            default: false,
            message: 'Check whether a file with the same name exists in the directory',
            name: 'projectCover',
            type: 'confirm',
          },
        ])
        .catch((error) => {
          this.error(error)
        })
      if (!response.projectCover) {
        this.error(chalk.red(`The project name already exists. Please reset it`))
      }

      isRepeat = true
    }

    if (!template) {
      const responses = await inquirer.prompt([
        {
          choices: templates,
          message: 'select a template',
          name: 'template',
          type: 'list',
        },
      ])
      template = responses.template
    }

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

    return {isRepeat, name, origin, targetDir, template} as BaseConfig
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
  }
}
