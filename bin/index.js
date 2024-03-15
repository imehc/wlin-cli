#!/usr/bin/env node

// 来源：https://juejin.cn/post/7231416555355373623

// 请求 commander 库
const program = require('commander')

// 从 package.json 文件中请求 version 字段的值，-v和--version是参数
program.version(require('../package.json').version, '-v, --version')


// 请求 lib/update.js
const updateChk = require('../lib/update')

// upgrade 检测更新
program
    .command('upgrade')
    .description("Check the wlin-cli version.")
    .action(() => {
      updateChk()
    });

// 请求 lib/init.js
const initProject = require('../lib/create')

// init 初始化项目
program
    .name('wlin-cli')
    .usage('<commands> [options]')
    .command('create <project_name>')
    .description('create a new project')
    .action(project => {
      initProject(project)
    })

// 解析命令行参数
program.parse(process.argv)

