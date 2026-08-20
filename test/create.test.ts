import {afterEach, describe, expect, test} from 'bun:test'
import {mkdtemp, mkdir, readFile, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {detectTemplates, isOrigin, validateProjectName} from '../src/create.ts'
import {copyDir, pathExists} from '../src/fsx.ts'
import {detectIndent, setPackageName} from '../src/pkg.ts'

const dirs: string[] = []

async function tmp(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'wlin-test-'))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, {force: true, recursive: true})))
})

describe('validateProjectName', () => {
  test('accepts a normal name', () => {
    expect(validateProjectName('my-app')).toBeUndefined()
    expect(validateProjectName('a')).toBeUndefined()
    expect(validateProjectName('x'.repeat(16))).toBeUndefined()
  })

  test('rejects empty or whitespace-only input', () => {
    expect(validateProjectName('')).toContain('cannot be empty')
    expect(validateProjectName('   ')).toContain('cannot be empty')
  })

  test('rejects names containing spaces', () => {
    expect(validateProjectName('my app')).toContain('cannot contain Spaces')
  })

  test('rejects names longer than 16 characters', () => {
    expect(validateProjectName('x'.repeat(17))).toContain('cannot exceed 16')
  })

  test('rejects path separators', () => {
    // 项目名会被拼进 path.join(cwd, name)，而覆盖分支对该路径执行 rmrf，
    // 放过 ../ 就等于允许删除工作目录之外的目录
    expect(validateProjectName('../evil')).toContain('path separators')
    expect(validateProjectName('a/b')).toContain('path separators')
    expect(validateProjectName(String.raw`a\b`)).toContain('path separators')
  })

  test('rejects dot and dot-dot', () => {
    expect(validateProjectName('.')).toContain('cannot be')
    expect(validateProjectName('..')).toContain('cannot be')
  })

  test('rejects names starting with a dot', () => {
    expect(validateProjectName('.hidden')).toContain('cannot start with a dot')
  })

  test('rejects names npm itself refuses', () => {
    // npm publish 会对这两个名字直接报 Invalid name；等到发布时才发现就太晚了
    expect(validateProjectName('node_modules')).toContain('reserved name')
    expect(validateProjectName('favicon.ico')).toContain('reserved name')
    expect(validateProjectName('Node_Modules')).toContain('reserved name')
  })
})

describe('isOrigin', () => {
  test('accepts known origins', () => {
    expect(isOrigin('github')).toBe(true)
    expect(isOrigin('gitee')).toBe(true)
  })

  test('rejects anything else', () => {
    expect(isOrigin('gitlab')).toBe(false)
    expect(isOrigin('')).toBe(false)
    expect(isOrigin('GitHub')).toBe(false)
  })
})

describe('detectTemplates', () => {
  test('returns only directories containing package.json, sorted', async () => {
    const dir = await tmp()
    await mkdir(path.join(dir, 'react'))
    await writeFile(path.join(dir, 'react', 'package.json'), '{}')
    await mkdir(path.join(dir, 'vue'))
    await writeFile(path.join(dir, 'vue', 'package.json'), '{}')
    // 没有 package.json 的目录不算模板
    await mkdir(path.join(dir, 'docs'))
    // 隐藏目录要跳过，否则 .github 会被当成模板
    await mkdir(path.join(dir, '.github'))
    await writeFile(path.join(dir, '.github', 'package.json'), '{}')
    // 顶层文件不算
    await writeFile(path.join(dir, 'README.md'), '# hi')

    expect(await detectTemplates(dir)).toEqual([{name: 'react'}, {name: 'vue'}])
  })

  test('returns an empty array when nothing qualifies', async () => {
    const dir = await tmp()
    await mkdir(path.join(dir, 'empty'))
    expect(await detectTemplates(dir)).toEqual([])
  })

  test('picks up the description for the select hint', async () => {
    const dir = await tmp()
    await mkdir(path.join(dir, 'react-ts'))
    await writeFile(path.join(dir, 'react-ts', 'package.json'), '{"description": "  react template  "}')

    expect(await detectTemplates(dir)).toEqual([{description: 'react template', name: 'react-ts'}])
  })

  test('still lists a template whose package.json is unreadable or blank-described', async () => {
    // 描述缺失或 JSON 损坏都不该让模板从列表里消失 —— 拷文件根本不需要读它
    const dir = await tmp()
    await mkdir(path.join(dir, 'broken'))
    await writeFile(path.join(dir, 'broken', 'package.json'), '{ not json }')
    await mkdir(path.join(dir, 'blank'))
    await writeFile(path.join(dir, 'blank', 'package.json'), '{"description": "   "}')

    expect(await detectTemplates(dir)).toEqual([{name: 'blank'}, {name: 'broken'}])
  })
})

describe('detectIndent', () => {
  test('detects two-space indentation', () => {
    expect(detectIndent('{\n  "a": 1\n}')).toBe(2)
  })

  test('detects four-space indentation', () => {
    expect(detectIndent('{\n    "a": 1\n}')).toBe(4)
  })

  test('detects tab indentation', () => {
    expect(detectIndent('{\n\t"a": 1\n}')).toBe('\t')
  })

  test('falls back to two spaces when the file is minified', () => {
    expect(detectIndent('{"a":1}')).toBe(2)
  })
})

describe('setPackageName', () => {
  test('rewrites name while preserving key order and indentation', async () => {
    const dir = await tmp()
    const source = ['{', '  "name": "old-name",', '  "version": "1.0.0",', '  "private": true', '}', ''].join('\n')
    await writeFile(path.join(dir, 'package.json'), source)

    await setPackageName(dir, 'new-name')
    const result = await readFile(path.join(dir, 'package.json'), 'utf8')

    expect(result).toBe(
      ['{', '  "name": "new-name",', '  "version": "1.0.0",', '  "private": true', '}', ''].join('\n'),
    )
  })

  test('preserves tab indentation', async () => {
    const dir = await tmp()
    await writeFile(path.join(dir, 'package.json'), '{\n\t"name": "old"\n}\n')

    await setPackageName(dir, 'new')
    expect(await readFile(path.join(dir, 'package.json'), 'utf8')).toBe('{\n\t"name": "new"\n}\n')
  })

  test('does not add a trailing newline when the original lacked one', async () => {
    const dir = await tmp()
    await writeFile(path.join(dir, 'package.json'), '{\n  "name": "old"\n}')

    await setPackageName(dir, 'new')
    expect(await readFile(path.join(dir, 'package.json'), 'utf8')).toBe('{\n  "name": "new"\n}')
  })

  test('is a no-op when the template has no package.json', async () => {
    const dir = await tmp()
    await expect(setPackageName(dir, 'new')).resolves.toBeUndefined()
  })

  test('throws a clear error on malformed JSON', async () => {
    const dir = await tmp()
    await writeFile(path.join(dir, 'package.json'), '{ not json }')
    await expect(setPackageName(dir, 'new')).rejects.toThrow('not valid JSON')
  })

  test('does not interpret shell metacharacters in the name', async () => {
    // 原实现把 name 拼进 `npm pkg set name="..."`，这类输入会被 shell 展开
    const dir = await tmp()
    await writeFile(path.join(dir, 'package.json'), '{\n  "name": "old"\n}\n')

    await setPackageName(dir, 'a";touch /tmp/pwned;"b')
    const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'))

    expect(pkg.name).toBe('a";touch /tmp/pwned;"b')
    expect(await pathExists('/tmp/pwned')).toBe(false)
  })
})

describe('copyDir', () => {
  test('copies nested directories and files', async () => {
    const src = await tmp()
    const dest = await tmp()
    await mkdir(path.join(src, 'a', 'b'), {recursive: true})
    await writeFile(path.join(src, 'top.txt'), 'top')
    await writeFile(path.join(src, 'a', 'mid.txt'), 'mid')
    await writeFile(path.join(src, 'a', 'b', 'deep.txt'), 'deep')

    await copyDir(src, path.join(dest, 'out'))

    expect(await readFile(path.join(dest, 'out', 'top.txt'), 'utf8')).toBe('top')
    expect(await readFile(path.join(dest, 'out', 'a', 'mid.txt'), 'utf8')).toBe('mid')
    expect(await readFile(path.join(dest, 'out', 'a', 'b', 'deep.txt'), 'utf8')).toBe('deep')
  })

  test('preserves empty directories', async () => {
    const src = await tmp()
    const dest = await tmp()
    await mkdir(path.join(src, 'hollow'))

    await copyDir(src, path.join(dest, 'out'))
    expect(await pathExists(path.join(dest, 'out', 'hollow'))).toBe(true)
  })

  test('copies symlinks as links rather than dereferencing them', async () => {
    const src = await tmp()
    const dest = await tmp()
    await writeFile(path.join(src, 'real.txt'), 'real')
    await symlink('real.txt', path.join(src, 'link.txt'))

    await copyDir(src, path.join(dest, 'out'))

    expect(await readFile(path.join(dest, 'out', 'link.txt'), 'utf8')).toBe('real')
    const {lstat} = await import('node:fs/promises')
    expect((await lstat(path.join(dest, 'out', 'link.txt'))).isSymbolicLink()).toBe(true)
  })

  test('overwrites an existing symlink at the destination', async () => {
    const src = await tmp()
    const dest = await tmp()
    await writeFile(path.join(src, 'real.txt'), 'real')
    await symlink('real.txt', path.join(src, 'link.txt'))

    const out = path.join(dest, 'out')
    await copyDir(src, out)
    // 二次拷贝不应因 symlink 已存在而 EEXIST
    await expect(copyDir(src, out)).resolves.toBeUndefined()
  })
})
