import {execFile} from 'node:child_process'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

/** git 不可用时抛出的错误信息 */
const GIT_MISSING = 'git command not found. Please install git and try again: https://git-scm.com/downloads'

/**
 * 浅克隆仓库的单个分支到指定目录。
 *
 * 取代 simple-git —— 它内部同样是 shell out 到 git 二进制，这里省掉包装层。
 * 用 execFile 而非 exec：参数以数组传递，不经过 shell，url 或分支名里的特殊字符
 * 不会被解释为命令（原实现用 exec + 字符串拼接）。
 */
export async function shallowClone(url: string, dest: string, branch = 'main'): Promise<void> {
  try {
    await execFileAsync('git', ['clone', '--depth', '1', '--branch', branch, '--single-branch', url, dest])
  } catch (error) {
    const err = error as {code?: string; stderr?: string}

    if (err.code === 'ENOENT') {
      throw new Error(GIT_MISSING, {cause: error})
    }

    // git 把进度和错误都写在 stderr，直接透给用户比 "Command failed" 有用得多
    const detail = err.stderr?.trim()
    throw new Error(detail ? `git clone failed:\n${detail}` : `git clone failed for ${url}`, {cause: error})
  }
}
