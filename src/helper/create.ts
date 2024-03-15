// 请求 fs-extra 库，用于文件操作
import fse from 'fs-extra';
// 请求 ora 库，用于初始化项目时等待动画
import ora from 'ora';
// 请求 chalk 库
import chalk from 'chalk';
// 请求 log-symbols 库
import symbols from 'log-symbols';
// 请求 inquirer 库，用于控制台交互
import inquirer from 'inquirer';
import path from 'path';
import { exec } from 'child_process';

import { dlTemplate } from './download';
import promptProjectCover from './prompt-modules/project-cover';
import promptProjectSelect from './prompt-modules/project-select';

// 初始化项目
async function initProject(projectName: string) {
    try {
        const targetDir = path.join(process.cwd(), projectName);
        if (fse.existsSync(targetDir)) {
            // 项目重名时提醒用户
            inquirer
                .prompt(promptProjectCover)
                .then((answers) => {
                    if (answers.projectCover) {
                        createProject(projectName, targetDir, true);
                    } else {
                        console.log(symbols.error, chalk.red(`项目名称已存在，请重新设置！`));
                        process.exit();
                    }
                })
                .catch((error) => {
                    console.log(symbols.error, chalk.red(`error：${error}`));
                    process.exit();
                });
        } else {
            createProject(projectName, targetDir);
        }
    } catch (err) {
        console.error(err);
        process.exit();
    }
}

// 开始创建项目
async function createProject(projectName: string, targetDir: string, removeDir?: boolean) {
    // 执行控制台交互
    inquirer
        .prompt(promptProjectSelect)
        .then(async (answers) => {
            // 获取选择的模板
            const projectSelect = answers.projectSelect;

            // Spinner 初始设置
            const initSpinner = ora(chalk.cyan('创建目录...'));
            // 开始执行等待动画
            initSpinner.start();

            // 移除已有项目
            if (removeDir) {
                try {
                    await fse.remove(targetDir);
                } catch (err) {
                    // 如果出错，Spinner 就改变文字信息
                    initSpinner.text = chalk.red(`移除原有目录失败： ${err}`);
                    // 终止等待动画并显示 X 标志
                    initSpinner.fail();
                    // 退出进程
                    process.exit();
                }
            }
            //判断目录是否存在，不存在则创建
            fse.ensureDir(targetDir);

            // 开始下载模板
            try {
                initSpinner.text = `下载模板...`;
                await dlTemplate(targetDir, projectSelect);
                exec(`cd ${targetDir} && npm pkg set name="${projectName}"`, (error) => {
                    if (error) {
                        initSpinner.text = chalk.red(error);
                        initSpinner.fail();
                        process.exit();
                    }
                });
            } catch (e) {
                // 如果成功，Spinner 就改变文字信息
                initSpinner.text = chalk.red(e);
                // 终止等待动画并显示 ✔ 标志
                initSpinner.fail();
                // 退出进程
                process.exit();
            }
            // 如果成功，Spinner 就改变文字信息
            initSpinner.text = '初始化项目完成.';
            // 终止等待动画并显示 ✔ 标志
            initSpinner.succeed();
        })
        .catch((error) => {
            console.log(symbols.error, chalk.red(error));
        });
}

export { initProject };
