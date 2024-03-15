// 引用 update-notifier 库，用于检查更新，最新版不支持commonjs，所以用5.x
import updateNotifier from 'update-notifier';
// 引用 chalk 库，用于控制台字符样式
import chalk from 'chalk';
import pkg from '../../package.json';

// updateNotifier 是 update-notifier 的方法，其他方法可到 npmjs 查看
const notifier = updateNotifier({
    // 从 package.json 获取 name 和 version 进行查询
    pkg,
    // 设定检查更新周期，默认为 1000 * 60 * 60 * 24（1 天）
    // 这里设定为 1000 毫秒（1秒）
    updateCheckInterval: 1000,
});

function updateChk() {
    // 当检测到版本时，notifier.update 会返回 Object
    // 此时可以用 notifier.update.latest 获取最新版本号
    if (notifier.update) {
        console.log(
            `New version available: ${chalk.cyan(notifier.update.latest)}, it's recommended that you update before using.`,
        );
        notifier.notify();
    } else {
        console.log('No new version is available.');
    }
}

export { updateChk };
