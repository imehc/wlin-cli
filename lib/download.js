// 请求 download-git-repo 库，用于下载模板
const download = require('download-git-repo');
const path = require('path');

// 请求 mirror.js 文件
const dataMirror = require('./mirror');

async function dlTemplate(targetDir, projectSelect) {
  return new Promise(((resolve, reject) => {
    download(dataMirror[projectSelect], targetDir, {clone: true}, function (err) {
      if (err) {
        reject(`模板下载失败. ${err}`)
      } else {
        resolve(`模板下载完成`)
      }
    });
  }))
}

// 将上面的 dlTemplate() 方法导出
module.exports = dlTemplate;

