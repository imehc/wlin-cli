wlin-cli
=================

[![Package Version](https://img.shields.io/npm/v/wlin-cli.svg)](https://www.npmjs.com/package/wlin-cli)
[![Downloads](https://img.shields.io/npm/dm/wlin-cli.svg)](http://npm-stat.com/charts.html?package=wlin-cli&author=&from=&to=)

Quickly create common templates.

# Usage

```sh-session
$ npx wlin-cli create
```

Or install it globally:

```sh-session
$ npm install -g wlin-cli
$ wlin-cli create
```

# Commands

## `wlin-cli create [NAME]`

Create a project from a template. Any argument you omit is asked for interactively.

```sh-session
$ wlin-cli create
$ wlin-cli create my-app
$ wlin-cli create my-app --origin=github --template=react
```

| Option              | Description                                               |
| ------------------- | --------------------------------------------------------- |
| `NAME`              | Project name (max 16 chars, no spaces or path separators) |
| `--origin <source>` | Template repository source: `github` or `gitee`           |
| `--template <name>` | Template to use; run without it to see the list           |

Templates are discovered dynamically — every top-level directory containing a
`package.json` in the [template repository](https://github.com/imehc/fronted-template)
is offered as a choice, annotated with its `description`. When the repository has
only one template, it is used without prompting.

Passing all three arguments makes the command fully non-interactive, which is
what you want in scripts and CI. If an argument is missing and stdin is not a
TTY, the command fails with a message naming the flag rather than hanging.

## `wlin-cli update`

Update wlin-cli to the latest published version. Detects whether it was
installed with npm, pnpm, yarn, or bun and runs the matching global upgrade
command. If detection fails, it prints the command to run manually.

## Other

```sh-session
$ wlin-cli --help
$ wlin-cli --version
```

# Environment variables

| Variable                     | Effect                           |
| ---------------------------- | -------------------------------- |
| `NO_COLOR`                   | Disable coloured output          |
| `WLIN_CLI_SKIP_UPDATE_CHECK` | Skip the update check on startup |
| `CI`                         | Also skips the update check      |

# Requirements

- Node.js >= 20.12.0
- `git` available on your `PATH`

# Contributing

See [CONTRIBUTING.md](https://github.com/imehc/wlin-cli/blob/main/CONTRIBUTING.md).

# License

[MIT](https://github.com/imehc/wlin-cli/blob/main/LICENSE)
