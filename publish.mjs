#!/usr/bin/env zx

/* eslint-disable no-undef */
/* eslint-disable n/shebang */
import { exit } from 'node:process';
import 'zx/globals'

// const fs = require('fs');
// const path = require('path');

async function publish(type, branch) {
  // https://www.jianshu.com/p/5565536a1f82
  try {
    switch (type) {
      // 主要
      case "1":
      case "major": {
        await $`npm version major`;
        break;
      }

      // 次要
      case "2":
      case "minor": {
        await $`npm version minor`;
        break;
      }

      // 补丁
      default: {
        await $`npm version patch`;
        break;
      }
    }

    await $`npx oclif readme`;
  } catch (error) {
    console.error(error.stderr);
    exit(1);
  }

  try {
    if (branch) {
      await $`git push origin ${branch}`;
      return;
    }

    await $`git push origin main`;
  } catch (error) {
    console.error(error);
  }
}

const args = process.argv.slice(2);
switch (args.length) {
  case 2: {
    await publish(args[1]);
    break;
  }

  case 3: {
    await publish(args[1], args[2]);
    break;
  }

  default: {
    await publish()
  }
}


