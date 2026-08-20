# 本地测试指南

本文档说明如何在本地测试 wlin-cli 的功能。工具链只用 **bun**（安装、构建、测试），
不使用 pnpm/npm 作为开发时的包管理器。

## 前置条件

```bash
bun install
```

需要 `git` 在 `PATH` 上 —— 模板是通过 `git clone --depth 1` 拉取的。

## 快速运行（不构建）

`bin/dev.js` 直接用 bun 跑 `src/cli.ts`，改完代码立刻生效，无需构建：

```bash
bun bin/dev.js create
bun bin/dev.js --help
bun bin/dev.js --version
```

## 构建产物

```bash
bun run build     # 输出单文件 dist/cli.js
node bin/run.js create      # 用 node 跑构建产物，等同于用户安装后的路径
```

产物以 Node 为目标（`bun build --target=node`），所以这一步必须用 `node` 而不是
`bun` 验证 —— 用户机器上不会有 bun。

## 全局链接测试

最接近真实使用场景：

```bash
bun run build
bun link            # 在项目根目录注册
bun link wlin-cli   # 在任意目录链接进来
```

也可以用 npm（`bin/run.js` 是 node 脚本，与链接工具无关）：

```bash
npm link
npm unlink -g wlin-cli
```

## 测试场景

### 1. 全交互

```bash
bun bin/dev.js create
```

依次验证：

- 项目名输入（含校验重试：空串、含空格、超 16 字符、`../evil`、`.`、`.hidden`）
- 仓库源选择（方向键，`github` / `gitee`）
- 模板列表拉取（spinner 显示 `Fetching available templates from ...`）
- 模板选择（只列出含 `package.json` 的顶层目录）
- 创建完成后打印 `cd <name>` 与安装提示

### 2. 全参数非交互

```bash
bun bin/dev.js create demo --origin=github --template=<模板名>
```

三个参数都给全时不应有任何提示，可直接用于脚本和 CI。

### 3. 重名覆盖

对已存在的目录再跑一次，测 confirm 的两条路：

```bash
bun bin/dev.js create demo    # 选 No → 报错退出，目录保持不变
bun bin/dev.js create demo    # 选 Yes → 覆盖重建
```

### 4. Ctrl+C 中断

```bash
bun bin/dev.js create              # 在输入名称时按 Ctrl+C
bun bin/dev.js create test-cancel  # 在拉取模板时按 Ctrl+C
```

预期：打印取消信息、清理 `$TMPDIR` 下的 `wlin-template-*` 临时目录、**退出码
130**（`128 + SIGINT`，不是 0 —— 被中断的运行不是成功）。

验证临时目录已清理：

```bash
ls "${TMPDIR:-/tmp}" | grep wlin-template || echo "已清理"
```

### 5. 非 TTY

```bash
echo "" | node bin/run.js create
```

预期：明确报错并指出该传哪个 flag，**退出码 1**。不应挂住等输入，也不应静默
当成「用户取消」后 exit 0。

### 6. 管道与颜色

```bash
node bin/run.js --help | cat     # 无 ANSI 乱码
NO_COLOR=1 node bin/run.js --help
```

### 7. 版本更新

```bash
bun bin/dev.js update            # 强制查询 registry，绕过 24h 缓存
```

预期：已是最新则提示 `Already up to date`；探测不到安装方式时打印手动升级命令，
而不是猜一个包管理器乱执行。

跳过启动时的版本检查：

```bash
WLIN_CLI_SKIP_UPDATE_CHECK=1 bun bin/dev.js create demo
```

缓存文件位于 `~/.wlin-cli/update-check.json`，删掉它可让下次检查重新走网络。
测试时用 `WLIN_CLI_CACHE_DIR=$(mktemp -d)` 把缓存重定向到临时目录，免得把假版本号
写进真实缓存 —— 那会让本机在之后 24 小时里一直提示一个不存在的新版本。

### 8. Node 版本下限

下限是 **20.12.0**（`@clack/prompts` 1.x 依赖 `node:util` 的 `styleText` 导出）。
用 fnm 切到边界两侧验证：

```bash
fnm install 20.11.1 && fnm install 20.12.0

fnm exec --using=20.11.1 node bin/run.js --version   # 应友好报错，exit 1
fnm exec --using=20.12.0 node bin/run.js --version   # 应打印版本号，exit 0
fnm exec --using=18.20.8 node bin/run.js --version   # 应友好报错，exit 1
```

低于下限时应打印「✖ Node version error」并以退出码 1 结束 —— **不能**是
`SyntaxError: ... does not provide an export named 'styleText'` 那种 minify 堆栈。
若看到堆栈，说明 `bin/run.js` 的前置检查被绕过了（比如有人把动态 `import()` 改回了
静态 import）。

### 9. 发布产物

`prepack` 会精简 package.json，`postpack` 还原。跑一次确认两头都对：

```bash
npm pack --dry-run
# 应看到 "package.json trimmed for publish" 与 "package.json restored"

git diff --stat package.json   # 应无输出：工作区必须被完整还原
ls .package.json.bak           # 应不存在
```

在完全干净的环境里验证产物自包含（tarball 内不含 node_modules）：

```bash
npm pack --pack-destination /tmp
mkdir -p /tmp/t && cd /tmp/t && npm init -y && npm install /tmp/wlin-cli-*.tgz
./node_modules/.bin/wlin-cli --version
```

## 自动化测试

单元测试用 `bun test`（不需要网络）：

```bash
bun test                     # 全部
bun test test/version.test.ts  # 单个文件
bun run typecheck            # tsc --noEmit
bun run lint                 # eslint
```

覆盖范围：版本号比较（含预发布后缀）、项目名校验（含路径穿越）、模板探测、
`package.json` name 改写（保留缩进与键顺序）、目录递归拷贝（含符号链接）、
包管理器探测。

## 依赖体量确认

```bash
bun pm ls --all | wc -l      # 生产依赖只应有 @clack/prompts 与 picocolors 两条直接依赖
npm pack --dry-run           # 确认 tarball 只含 bin/run.js 与 dist/
```

## 常见问题

### Q: 修改代码后没生效？

用 `bun bin/dev.js` 直接跑源码；若在测 `dist/cli.js`，需要先 `bun run build`。

### Q: 链接后找不到命令？

确认全局 bin 目录在 `PATH` 上：

```bash
bun pm bin -g     # 或 npm config get prefix
```

### Q: 如何清理测试产物？

```bash
rm -rf demo test-cancel dist
```

## 功能验证清单

- [ ] `github` / `gitee` 两个源都能扫出含 `package.json` 的顶层目录作为模板
- [ ] 不含 `package.json` 的目录与隐藏目录（如 `.github`）不被列为模板
- [ ] 模板拉取只 clone 一次（列模板与拷贝复用同一个临时仓库）
- [ ] 目标 `package.json` 的 `name` 被改写，且缩进/键顺序/末尾换行不变
- [ ] 项目名含 `/`、`\`、`..` 时被拒绝
- [ ] 临时目录在成功、失败、Ctrl+C 三条路径上都被清理
- [ ] Ctrl+C 退出码 130，非 TTY 缺参数退出码 1，未知命令退出码 1
- [ ] 不向用户抛错误堆栈
- [ ] `wlin-cli update` 与启动时的新版提示都工作，且离线时静默跳过
