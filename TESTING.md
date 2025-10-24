# 本地测试指南

本文档说明如何在本地测试 wlin-cli 的功能。

## 前置条件

确保已安装依赖：

```bash
pnpm install
```

## 构建项目

在测试前需要先构建项目：

```bash
pnpm run build
```

## 测试方法

### 方法 1：使用 npm link（推荐）

这是最接近实际使用场景的测试方法。

#### 步骤 1: 链接到全局

在项目根目录执行：

```bash
npm link
```

或使用 pnpm：

```bash
pnpm link --global
```

#### 步骤 2: 测试命令

现在可以在任何目录使用 `wlin-cli` 命令：

```bash
# 创建一个新项目（交互式）
wlin-cli create

# 或指定项目名称
wlin-cli create my-project

# 使用命令行参数跳过交互
wlin-cli create my-project --origin github --template react-ts --pkgManager npm
```

#### 步骤 3: 验证功能

测试 GitHub 动态模板获取功能：

1. 运行 `wlin-cli create test-project`
2. 输入项目名称（如果没有指定）
3. 选择 `github` 作为仓库源
4. 等待自动获取模板列表（会显示 "Fetching available templates from GitHub..."）
5. 从列表中选择一个模板（如 `react-ts`、`vue-ts` 等）
6. 选择包管理器
7. 等待项目创建完成

#### 步骤 4: 取消链接

测试完成后，取消全局链接：

```bash
npm unlink -g wlin-cli
```

或使用 pnpm：

```bash
pnpm unlink --global
```

### 方法 2：直接运行（快速测试）

如果只是快速测试某个功能，可以直接运行：

```bash
# 在项目根目录
node ./bin/run.js create test-project
```

### 方法 3：使用开发模式

开发模式会自动监听文件变化：

```bash
./bin/dev.js create
```

## 测试场景

### 测试 1: GitHub 动态模板获取

```bash
wlin-cli create test-github
# 选择 github
# 验证是否显示从 main 分支扫描到的模板列表
```

### 测试 2: Gitee 固定模板列表

```bash
wlin-cli create test-gitee
# 选择 gitee
# 验证是否显示预定义的模板列表（react-ts, vue-ts）
```

### 测试 3: 使用命令行参数

```bash
# GitHub
wlin-cli create test-cli-github --origin github --template react-ts --pkgManager pnpm

# Gitee
wlin-cli create test-cli-gitee --origin gitee --template vue-ts --pkgManager npm
```

### 测试 4: Ctrl+C 优雅退出

测试在不同阶段按 Ctrl+C 是否能正常退出：

```bash
# 1. 在输入项目名称时按 Ctrl+C
wlin-cli create
# 输入项目名称时按 Ctrl+C
# 预期：显示 "✖ Operation cancelled by user" 并清理临时文件

# 2. 在选择仓库源时按 Ctrl+C
wlin-cli create test-cancel
# 在选择 origin 时按 Ctrl+C
# 预期：显示 "✖ Operation cancelled by user"

# 3. 在获取模板列表时按 Ctrl+C
wlin-cli create test-cancel2
# 选择 github 后，在获取模板列表时按 Ctrl+C
# 预期：显示 "Received SIGINT, cleaning up..." 并清理临时目录

# 4. 在下载模板时按 Ctrl+C
wlin-cli create test-cancel3 --origin github --template react-ts
# 在下载过程中按 Ctrl+C
# 预期：自动清理临时文件，显示清理信息
```

所有情况下都应该：
- 不显示错误堆栈
- 显示友好的退出消息
- 自动清理临时文件
- 退出码为 0（正常退出）

## 调试

如果遇到问题，可以查看详细日志：

```bash
# 设置 DEBUG 环境变量
DEBUG=* wlin-cli create test-project
```

## 常见问题

### Q: npm link 后找不到命令？

A: 确保全局 npm bin 目录在 PATH 中：

```bash
npm config get prefix
# 确保这个路径的 bin 子目录在 PATH 中
```

### Q: 修改代码后测试没有生效？

A: 需要重新构建：

```bash
pnpm run build
```

### Q: 如何清理测试项目？

A: 直接删除创建的测试目录：

```bash
rm -rf test-project test-github test-gitee
```

## 自动化测试

项目使用 mocha 进行单元测试：

```bash
pnpm test
```

## 功能验证清单

测试新功能时，确保以下功能正常：

- [ ] GitHub 源能正确扫描 main 分支的模板文件夹
- [ ] 只显示包含 package.json 的文件夹
- [ ] Gitee 源仍使用分支方式（向后兼容）
- [ ] 模板下载成功
- [ ] package.json 的 name 字段被正确修改
- [ ] 依赖安装成功
- [ ] 临时文件被正确清理
- [ ] Ctrl+C 退出时显示友好提示
- [ ] Ctrl+C 退出时清理所有临时文件
- [ ] 不显示错误堆栈信息
- [ ] Node 版本不符合要求时有友好提示

## 性能测试

可以测试大型模板的下载性能：

```bash
time wlin-cli create perf-test --origin github --template react-ts --pkgManager npm
```
