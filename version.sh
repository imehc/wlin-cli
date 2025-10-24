#!/usr/bin/env bash

set -e

# -------------------------------
# 检查依赖
# -------------------------------
command -v git >/dev/null 2>&1 || {
    echo "❌ git 命令未找到，请先安装."
    exit 1
}

command -v npm >/dev/null 2>&1 || {
    echo "❌ npm 命令未找到，请先安装."
    exit 1
}

# -------------------------------
# 检查未提交改动
# -------------------------------
if ! git diff-index --quiet HEAD --; then
    echo "❌ 检测到未提交的改动，请先完成 Git 提交."
    exit 1
fi

# -------------------------------
# 设置发布级别
# -------------------------------
default_level="patch"
release_level=$1

if [ -z "$release_level" ]; then
    release_level=$default_level
    echo "ℹ️ 未指定发布级别，将使用默认设置：$default_level."
fi

# -------------------------------
# 升级版本号并打 tag
# -------------------------------
case $release_level in
  1|major)
    npm version major --message "chore: release v%s"
    ;;
  2|minor)
    npm version minor --message "chore: release v%s"
    ;;
  *)
    npm version patch --message "chore: release v%s"
    ;;
esac

new_tag=$(git describe --tags --abbrev=0)
echo "✅ 新版本号：$new_tag"

# -------------------------------
# 使用 conventional-changelog 生成日志
# -------------------------------
echo "📝 正在生成 CHANGELOG.md..."
npx conventional-changelog -p angular -r 0 -i CHANGELOG.md -s

# -------------------------------
# 把 CHANGELOG.md 加入最后一次提交
# -------------------------------
git add CHANGELOG.md
# 修改最后一个提交（保持提交信息不变）
git commit --amend --no-edit

# -------------------------------
# 更新 tag（因为 commit 哈希变了）
# -------------------------------
git tag -f "$new_tag"

echo "✅ 已将 CHANGELOG.md 合并到版本提交中"
echo "ℹ️ 当前版本: $new_tag"
echo ""
echo "🚀 你可以手动执行以下命令推送："
echo "   git push origin main --tags --force-with-lease"
echo ""
