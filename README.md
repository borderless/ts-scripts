# TS Scripts

[![NPM version][npm-image]][npm-url]
[![NPM downloads][downloads-image]][downloads-url]
[![Node build status][node-build-image]][node-build-url]
[![Bun build status][bun-build-image]][bun-build-url]
[![Build coverage][coverage-image]][coverage-url]

> Simple, mostly opinionated, scripts to build TypeScript modules.

## Installation

```sh
npm install @borderless/ts-scripts --save-dev
```

## Usage

In your `package.json` you can use the scripts:

```json
{
  "scripts": {
    "format": "ts-scripts format",
    "specs": "ts-scripts specs",
    "test": "ts-scripts test", // Runs `check`, `specs --coverage`, `build`.
    "build": "ts-scripts build",
    "prepublishOnly": "npm run build",
    "prepare": "ts-scripts install"
  }
}
```

You will also need to install `typescript` for building and `vitest` for specs.

**Note:** If using `bun`, you don't need `vitest`. You can use `bun test` instead.

### Batteries Included

- `install` - Installs `husky` and `lint-staged` for git commit hooks
- `format` - Uses `prettier --write` on all supported files in `src` and the root directory
- `specs` - Uses `vitest` to run test files match `*.{test,spec}.*` files
  - `--watch <index>` Runs vitest in watch mode on the config at `<index>`
  - `--update` Updates the snapshot files
  - `--changed` Runs tests on only changed files
  - `--since <commit>` Runs tests on files changed since `<commit>`
  - `--test-pattern` Runs tests matching the specified pattern
- `build` - Uses `rimraf` and `tsc`
- `check` - Uses `prettier --check` and `tsc` on each test "project"
- `test` - Runs `check`, `specs`, and `build`

### Configuration

Configuration can get specified in your `package.json` file under `ts-scripts`:

- `src` - An array of source file directories (default: `["src"]`)
- `ignore` - An array of patterns to ignore (default: `[]`)
- `dist` - An array of output directories to clean before `build` (default: `["dist"]`)
- `project` An array of TSConfig files to build using TypeScript (default: `["tsconfig.json"]`)
- `checkProject` An array of TSConfig files to type check using TypeScript (default: `["tsconfig.json"]`)
- `test` An array of test configuration objects (default: `[{}]`)
  - `dir` The directory to read tests from (default: `undefined`, root directory)
  - `config` The configuration file to use for this test (default: `undefined`, discovered by `vitest`)

Specific configuration can be disabled for customized configuration by setting `src`, `dist`, `project`, or `test` to an empty array.

## License

MIT

[npm-image]: https://img.shields.io/npm/v/@borderless/ts-scripts
[npm-url]: https://npmjs.org/package/@borderless/ts-scripts
[downloads-image]: https://img.shields.io/npm/dm/@borderless/ts-scripts
[downloads-url]: https://npmjs.org/package/@borderless/ts-scripts
[node-build-image]: https://img.shields.io/github/actions/workflow/status/borderless/ts-scripts/ci-node.yml?branch=main&label=node%20build
[node-build-url]: https://github.com/borderless/ts-scripts/actions/workflows/ci-node.yml?query=branch%3Amain
[bun-build-image]: https://img.shields.io/github/actions/workflow/status/borderless/ts-scripts/ci-bun.yml?branch=main&label=bun%20build
[bun-build-url]: https://github.com/borderless/ts-scripts/actions/workflows/ci-bun.yml?query=branch%3Amain
[coverage-image]: https://img.shields.io/codecov/c/gh/borderless/ts-scripts
[coverage-url]: https://codecov.io/gh/borderless/ts-scripts
