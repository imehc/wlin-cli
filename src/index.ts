#! /usr/bin/env node

import figlet from 'figlet';
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import pkg from '../package.json';
import { updateChk } from './helper/update';
import { initProject } from './helper/create';

// 参考链接
// https://blog.logrocket.com/building-typescript-cli-node-js-commander/

const program = new Command();

// 生成艺术字文本
console.log(figlet.textSync('wlin-cli'));

program
    .version(pkg.version, '-v, --version')
    .description('An CLI for managing a directory')
    .option('-l, --ls  [value]', 'list directory contents')
    .option('-m, --mkdir <value>', 'create a directory')
    .option('-t, --touch <value>', 'create a file');

// upgrade 检测更新
program
    .command('upgrade')
    .description('Check the wlin-cli version.')
    .action(() => {
        updateChk();
    });

program
    .name('wlin-cli')
    .usage('<commands> [options]')
    .command('create <project_name>')
    .description('create a new project')
    .action((project) => {
        initProject(project);
    });
// 解析命令行参数
program.parse(process.argv);

const options = program.opts();

async function listDirContents(filepath: string) {
    try {
        const files = await fs.promises.readdir(filepath);
        const detailedFilesPromises = files.map(async (file: string) => {
            const fileDetails = await fs.promises.lstat(path.resolve(filepath, file));
            const { size, birthtime } = fileDetails;
            return { filename: file, 'size(KB)': size, created_at: birthtime };
        });
        const detailedFiles = await Promise.all(detailedFilesPromises);
        console.table(detailedFiles);
    } catch (error) {
        console.error('Error occurred while reading the directory!', error);
    }
}

function createDir(filepath: string) {
    if (!fs.existsSync(filepath)) {
        fs.mkdirSync(filepath);
        console.log('The directory has been created successfully');
    }
}

function createFile(filepath: string) {
    fs.openSync(filepath, 'w');
    console.log('An empty file has been created');
}

if (options.ls) {
    const filepath = typeof options.ls === 'string' ? options.ls : __dirname;
    listDirContents(filepath);
}

if (options.mkdir) {
    createDir(path.resolve(__dirname, options.mkdir));
}

if (options.touch) {
    createFile(path.resolve(__dirname, options.touch));
}

if (!process.argv.slice(2).length) {
    program.outputHelp();
}
