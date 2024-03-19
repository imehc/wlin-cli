import {Args, Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import {ensureDir, exists, remove} from 'fs-extra'
import inquirer from 'inquirer'
import {exec} from 'node:child_process'
import path from 'node:path'
import notifier from 'node-notifier'
import ora from 'ora'
import {CleanOptions, SimpleGit, simpleGit} from 'simple-git'

const templates = ['react-ts', 'vue-ts'] as const

type BaseConfig = {
  isRepeat?: boolean
  name: string
  targetDir: string
  template: (typeof templates)[number]
}

export default class Create extends Command {
  static args = {
    name: Args.string({description: 'projectName'}),
  }

  static description = 'Create a project template'

  static flags = {
    template: Flags.string({options: templates}),
  }

  public async run(): Promise<void> {
    const config = await this.initConfig()
    this.log(`the template is: ${config.template}, name: ${config.name}, targetDir: ${config.targetDir}`)
    this.createProject(config)
  }

  private async createProject({isRepeat, name, targetDir, template}: BaseConfig): Promise<void> {
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
      await this.downloadTemplate({targetDir, template})
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

  private async downloadTemplate({targetDir, template}: Pick<BaseConfig, 'targetDir' | 'template'>): Promise<void> {
    const remoteUrl = [
      {
        name: 'react-ts',
        url: 'git@github.com:imehc/basic-template.git',
      },
      {
        name: 'vue-ts',
        url: 'git@github.com:imehc/template-vue.git',
      },
    ].find((item) => item.name === template)!.url
    const git: SimpleGit = simpleGit().clean(CleanOptions.FORCE)
    await git.clone(remoteUrl, targetDir)
  }

  private async initConfig(): Promise<BaseConfig> {
    const {args, flags} = await this.parse(Create)
    let {name} = args
    let {template} = flags
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
            default: 'true',
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
          choices: templates.map((name) => ({name})),
          message: 'select a template',
          name: 'template',
          type: 'list',
        },
      ])
      template = responses.template
    }

    return {isRepeat, name, targetDir, template} as BaseConfig
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
  }
}
