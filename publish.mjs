#!/usr/bin/env zx

/* eslint-disable no-undef */
/* eslint-disable n/shebang */
import { exit } from 'node:process';
import 'zx/globals'

// const fs = require('fs');
// const path = require('path');

async function upgradeVersion(type) {
  // https://www.jianshu.com/p/5565536a1f82
  try {
    switch (type) {
      // 主要
      case "1":
      case "major": {
        await $`npm version major --message "v%s"`;
        break;
      }

      // 次要
      case "2":
      case "minor": {
        await $`npm version minor --message "v%s"`;
        break;
      }

      // 补丁
      default: {
        await $`npm version patch --message "v%s"`;
        break;
      }
    }

    await $`npx oclif readme`;
  } catch (error) {
    console.error(error.stderr);
    exit(1);
  }

}

async function pushRemoteBranch() {
  try {
    if (branch) {
      await $`git push origin ${branch}`;
      return;
    }

    await $`git push origin main`;
  } catch (error) {
    console.error(error.stderr);
  }
}

const args = process.argv.slice(2);
switch (args.length) {
  case 2: {
    await upgradeVersion(args[1]);
    break;
  }

  case 3: {
    await upgradeVersion(args[1]);
    await pushRemoteBranch(args[2]);
    break;
  }

  default: {
    await upgradeVersion()
  }
}


