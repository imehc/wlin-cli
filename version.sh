#!/usr/bin/env bash

# 检查 git 是否存在
command -v git >/dev/null 2>&1 || {
    echo "git 命令未找到，请先安装."
    exit 1
}

# 检查是否有未提交的改动
if ! git diff-index --quiet HEAD --; then
    echo "检测到未提交的改动，请先完成 Git 提交."
    exit 1
fi

# 设置默认级别，可以是 major、minor 或 patch
default_level="patch"

# 读取从命令行传递的参数 (如果有的话)
release_level=$1


# 如果没有提供参数，就使用默认级别
if [ -z "$release_level" ]; then
    release_level=$default_level
    echo "未指定发布级别号，将使用默认设置：$default_level."
fi

# 确定提供的级别是否有效
case $1 in
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

  # 检查执行结果
  if [ $? -ne 0 ]; then
    echo "版本升级失败"
    exit 1
  fi