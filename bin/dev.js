#!/usr/bin/env bun

// 开发入口：bun 直接执行 TypeScript，不需要 ts-node/register 那套 loader
import {run} from '../src/cli.ts'

await run()
