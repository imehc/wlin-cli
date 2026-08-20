#!/usr/bin/env bash

set -e

# 只做两件事：升版本号 + 打 tag。
# CHANGELOG.md 与 GitHub Release 都由 .github/workflows/release.yml 在 CI 里生成，
# 所以这里不再生成 changelog，也不需要 commit --amend / tag -f / --force-with-lease。

command -v git >/dev/null 2>&1 || {
    echo "❌ git 命令未找到，请先安装."
    exit 1
}

# 仅用于 npm version（升版本号 + 打 tag）。依赖安装/构建/测试全部走 bun，
# 发布用的 npm publish --provenance 也只有 npm 支持。
command -v npm >/dev/null 2>&1 || {
    echo "❌ npm 命令未找到，请先安装."
    exit 1
}

# 干净工作区检查。
#
# 必须先 `update-index --refresh`：diff-index 会先比 stat(mtime/size)，mtime 变了但
# 内容没变时它直接报「有改动」而不去读文件确认。而本仓库有两处正常操作会改 mtime 却
# 不改内容 —— `verify:tarball` 走 npm pack，prepack 改写 package.json、postpack 逐字节
# 还原；`prettier --write` 也会重写未变动的文件。结果就是明明 `git status` 干净，
# 这里却拦下来。refresh 会实际读盘核对内容，把这类假阳性清掉。
git update-index -q --refresh

if ! git diff-index --quiet HEAD --; then
    echo "❌ 检测到未提交的改动，请先完成 Git 提交."
    git status --short
    exit 1
fi

release_level=${1:-patch}

case $release_level in
  1|major) release_level=major ;;
  2|minor) release_level=minor ;;
  *)       release_level=patch ;;
esac

echo "ℹ️ 发布级别：$release_level"

npm version "$release_level" --message "chore: release v%s"

new_tag=$(git describe --tags --abbrev=0)

echo "✅ 新版本号：$new_tag"
echo ""
echo "🚀 推送后 CI 会自动发布到 npm，并回写 CHANGELOG.md："
echo "   git push origin main --tags"
echo ""
