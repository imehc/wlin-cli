import download from 'download-git-repo';
import dataMirror from './mirror';

async function dlTemplate(targetDir: string, projectSelect: keyof typeof dataMirror) {
    return new Promise((resolve, reject) => {
        download(dataMirror[projectSelect], targetDir, { clone: true }, function (err) {
            if (err) {
                reject(`模板下载失败. ${err}`);
            } else {
                resolve(`模板下载完成`);
            }
        });
    });
}

export { dlTemplate };
