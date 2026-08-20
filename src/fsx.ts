import {constants} from 'node:fs'
import {access, copyFile, lstat, mkdir, readdir, readlink, rm, symlink} from 'node:fs/promises'
import path from 'node:path'

/**
 * 目标路径是否存在。
 *
 * 取代 fs-extra 的 pathExists/exists。
 */
export async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target, constants.F_OK)
    return true
  } catch {
    return false
  }
}

/**
 * 递归创建目录，已存在时不报错。
 *
 * 取代 fs-extra 的 ensureDir。
 */
export async function ensureDir(target: string): Promise<void> {
  await mkdir(target, {recursive: true})
}

/**
 * 递归删除，不存在时不报错。
 *
 * 取代 rimraf。
 */
export async function rmrf(target: string): Promise<void> {
  await rm(target, {force: true, recursive: true})
}

/**
 * 递归拷贝目录内容。
 *
 * 取代 fs-extra 的 copy。这里没用内置的 fs.cp({recursive:true})：它在 Node 22.3
 * 之前是 experimental，会向 stderr 打印 ExperimentalWarning 污染 CLI 输出，而本项目
 * engines 下限是 18。手写一份可以保持 engines 不变，也能显式决定符号链接的处理方式。
 *
 * 符号链接按原样复制（保留链接本身而非解引用），与 fs-extra 的默认行为一致。
 */
export async function copyDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, {recursive: true})
  const entries = await readdir(src, {withFileTypes: true})

  await Promise.all(
    entries.map(async (entry) => {
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)

      if (entry.isDirectory()) {
        await copyDir(srcPath, destPath)
        return
      }

      if (entry.isSymbolicLink()) {
        const target = await readlink(srcPath)
        // 目标可能已存在（重复拷贝），先清掉再建，否则 symlink 会 EEXIST
        await rm(destPath, {force: true})
        await symlink(target, destPath)
        return
      }

      if (entry.isFile()) {
        await copyFile(srcPath, destPath)
        return
      }

      // 套接字/FIFO/块设备等特殊文件：模板仓库里不应出现，静默跳过
      const stats = await lstat(srcPath)
      if (stats.isFile()) {
        await copyFile(srcPath, destPath)
      }
    }),
  )
}
