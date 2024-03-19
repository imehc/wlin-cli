export {run} from '@oclif/core'

// eslint-disable-next-line no-warning-comments
// TODO: 待实现清单
// https://superface.ai/blog/npm-publish-gh-actions-changelog
// https://docs.npmjs.com/cli/v8/commands/npm-version
// 1.根据提交前缀[<newversion> | major | minor | patch | premajor | preminor | prepatch | prerelease | from-git]自动来判断是否触发CI/CD
// 2.更新package.json版本号并发布到npm,更新版本号可根据提交前缀来更新合适的版本号，在合适的时候自动tag标签
// 3.如果发布到npm成功，聚合上次发布到这次之间的commit内容到CHANGELOG.md,并通过PR合并到主分支
