# 开发与发布

面向维护者的说明。用户侧文档在 [README.md](./README.md)，本地手工测试步骤在
[TESTING.md](./TESTING.md)。这些文件都不会随 npm 包发布 —— `package.json` 的
`files` 只包含 `bin/run.js` 和 `dist/`。

## 工具链

**只用 bun**：安装依赖、构建、跑测试都是 bun，仓库里只有 `bun.lock`，不再有
`pnpm-lock.yaml` / `package-lock.json`（`.gitignore` 里已挡掉）。

唯一还需要 npm 的地方是发布：`npm publish --provenance` 目前只有 npm 支持，
`npm version` 也顺带用来升版本号和打 tag。

```sh
bun install
bun bin/dev.js create   # 直接跑源码，改完立即生效，无需构建
bun test                # 单元测试
bun run typecheck       # tsc --noEmit
bun run lint            # eslint
bun run format          # prettier --write .
bun run build           # 打包成单文件 dist/cli.js
bun run verify:tarball  # 演练 npm pack，校验发布产物
```

`bun run test` 会在测试后自动跑 `posttest`（typecheck + lint + format check）；
`bun test` 是 bun 内置的测试运行器，不会触发这个钩子。

## 目录结构

```
src/
  cli.ts        入口：util.parseArgs 解析、--help/--version、未知命令提示、信号处理
  create.ts     业务逻辑：项目名校验、模板探测、临时目录管理、落盘
  banner.ts     ASCII banner（原先由 figlet 运行时生成，其实是个常量）
  fsx.ts        pathExists / ensureDir / rmrf / copyDir
  git.ts        execFile 包装的 shallowClone
  pkg.ts        改写 package.json 的 name，保留缩进与键顺序
  update.ts     新版检测（超时 + 24h 缓存）与 update 命令
  version.ts    semver 比较（含预发布后缀）
bin/
  run.js        发布入口：先做 Node 版本检查，再动态 import dist/cli.js
  dev.js        开发入口，bun 跑 src/cli.ts
scripts/
  pack-json.js      prepack 精简 package.json / postpack 还原
  verify-tarball.js 校验 tarball 内容与精简结果
```

## Node 版本下限

`engines.node` 是 `>=20.12.0`。这个数字不是我们自己的需求 —— `util.parseArgs` 只要
18.3 —— 而是 `@clack/prompts` 1.x 的：它 `import {styleText} from 'node:util'`，该
导出 20.12 才有。

**这条约束有个不直观的后果**：ESM 的命名导入在链接期校验，缺失即 `SyntaxError`，
比任何模块顶层代码都早。所以版本检查写在 `src/cli.ts` 里是无效的 —— 在 Node 18 上
`dist/cli.js` 压根来不及执行就崩，用户看到的是一段 minify 后的堆栈。检查因此放在
`bin/run.js`：只用旧 Node 也能解析的语法，并用**动态** `import()` 推迟链接。

改 `MIN_NODE` 时要同时改三处：`bin/run.js`、`src/cli.ts` 的 `MIN_NODE`（对 `bun
bin/dev.js` 这条源码路径生效）、以及 `package.json` 的 `engines`。

用 fnm 验证边界：

```sh
fnm install 20.11.1 && fnm exec --using=20.11.1 node bin/run.js --version  # 应干净报错，exit 1
fnm install 20.12.0 && fnm exec --using=20.12.0 node bin/run.js --version  # 应正常输出版本号
```

## 依赖红线

生产依赖只有两个直接依赖，加起来 4 个包：

- `@clack/prompts` —— 方向键选择、输入校验重试、spinner、Ctrl+C 语义
- `picocolors` —— 0 传递依赖，且本就是 clack 的传递依赖

改动时请守住这条线。之前的 244 个生产依赖里 82% 来自 oclif 全家桶，而这个工具
实际只做四件事：浅克隆模板仓库 → 拷子目录 → 改 `package.json` 的 `name` →
打印后续步骤。

刻意没用 **`fs.cp({recursive})`** —— Node 22.3 之前是 experimental，会往 stderr 打
`ExperimentalWarning` 污染 CLI 输出。改为 `src/fsx.ts` 里手写递归拷贝，顺带能显式
决定符号链接按链接复制而不是解引用。

颜色用 `picocolors` 而非 `util.styleText`：后者的 `NO_COLOR` / 非 TTY 自动检测要到
22.13 才靠 `{stream}` 选项支持，早期版本在管道里也会硬吐 ANSI。（clack 内部直接用
了 `styleText`，那是它的选择，也是上面那条 20.12 下限的来源。）

## 构建

```sh
bun run build
```

`bun build src/cli.ts --target=node --outfile dist/cli.js --minify` 产出单文件。
`--target=node` 很关键：用户机器上只有 node，没有 bun。因此验证产物必须用
`node bin/run.js`，不能用 bun 跑。

`src/cli.ts` 里 `import {version as VERSION} from '../package.json'` 用的是具名
导入，bun 会 tree-shake 成一个字符串常量，不会把整个 package.json（含
devDependencies）内联进产物。

## 发布

版本号在本地升，发布和 changelog 在 CI 做：

```sh
bun run pub              # 默认 patch，也接受 minor / major（或 1 / 2）
git push origin main --tags
```

`bun run pub` 只做两件事：`npm version <level>` 升版本号 + 打 tag。它不再生成
changelog，因此也不需要 `git commit --amend` / `git tag -f` /
`--force-with-lease` 那套改写已有提交的动作。

推到 `main` 后 `.github/workflows/release.yml` 接手：

1. `EndBug/version-check` 判断 `package.json` 的 version 是否变化，没变则整个流程跳过
2. `bun install --frozen-lockfile` → `bun run build`
3. `node scripts/verify-tarball.js` 校验发布产物（见下节）
4. `npm publish --provenance --access public`
5. **发布成功后**才用 `conventional-changelog` 重新生成 `CHANGELOG.md` 并提交回
   `main`。发布失败时不会留下 changelog 提交。

几个容易踩的点：

- 生成用的是 `-r 0`（按全部 tag 重新生成整个文件），所以重跑 workflow 不会追加
  重复段落。也因此 checkout 需要 `fetch-depth: 0`，否则拿不到历史和 tag。
- 回推的提交信息带 `[skip ci]`，避免再次触发同一个 workflow。
- checkout 用了 `persist-credentials: false`，所以回推要显式带
  `x-access-token:${GITHUB_TOKEN}`，并且 workflow 权限得是 `contents: write`。
- `prepack` 会在 `npm publish` 时再跑一次 `bun run build`，所以 CI 里 bun 必须在
  publish 之前就装好。

## 发布产物里有什么

tarball 只有 4 个文件，共约 20 KB：

```
package/README.md       ← npm 强制包含，忽略 files 配置
package/package.json    ← 同上，且会被 prepack 精简
package/bin/run.js      ← bin 入口
package/dist/cli.js     ← 单文件产物，clack 与 picocolors 都已内联
```

**package.json 的精简**：npm 总是把 package.json 原样发上去，`files` 管不到它，
所以 devDependencies、`scripts`、`lint-staged`、commitizen 配置这些纯开发期字段
默认会被所有用户下载。`prepack` 调 `scripts/pack-json.js trim` 裁掉它们（备份到
`.package.json.bak`），`postpack` 再还原工作区。效果是 1.7 KB → 657 B。

改 `scripts/pack-json.js` 时注意两条实测出来的边界：

- **不能删 `files`** —— 删掉后 npm 回退成「打包目录下所有文件」，反而会把源码、
  `.husky/`、`.vscode/` 一起发出去。
- **不能删 `bin` / `type` / `engines` / `dependencies`** —— 这些是安装期语义。

`bun run verify:tarball` 会把上面每一条都检查一遍：文件清单是否只有那 4 个、
开发期字段是否泄漏、必需字段是否被误删、`postpack` 是否把工作区还原干净。CI 在
publish 前会跑它，本地改发布逻辑后也该跑一次。

**关于 `dependencies`**：产物是自包含的（实测删掉 `dependencies` 后装出来的包
仍能正常跑，`node_modules` 只有 92 KB）。但仍然保留声明 —— 它让 `npm ls`、
Dependabot、审计工具能看到真实的依赖与许可证（clack/sisteransi/fast-\* 是 MIT，
picocolors 是 ISC），代价只是用户多装 316 KB。

## CI

`.github/workflows/ci.yml` 在 push 和 PR 上跑：install → test → typecheck →
lint → format check → build，然后三步产物校验：

1. 用 **node** 跑一遍产物做 smoke test（那才是用户的运行环境，不是 bun）
2. 切到 Node 18 确认版本守卫给出的是友好提示而不是 `styleText` 链接错误 ——
   防的是「有人把 `bin/run.js` 的动态 `import()` 改回静态 import」这类回归
3. `verify-tarball.js` 校验发布产物

setup-node 固定在 `20.12.0`，即 `engines.node` 的下限：在最低支持版本上验证比在
最新版上更有意义。

## 提交规范

commitlint + cz-git，中文提示：

```sh
bun run commit     # 等价于 git cz
```

husky 钩子：`pre-commit` 跑 `bunx lint-staged`，`commit-msg` 跑 commitlint。
