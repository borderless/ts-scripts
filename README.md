# TS Scripts

[![NPM version][npm-image]][npm-url]
[![NPM downloads][downloads-image]][downloads-url]
[![Build status][build-image]][build-url]
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
    "lint": "ts-scripts lint",
    "format": "ts-scripts format",
    "specs": "ts-scripts specs",
    "test": "ts-scripts test",
    "prepare": "ts-scripts install && ts-scripts build"
  }
}
```

### Batteries Included

- `install` - Installs `husky` and `lint-staged`
- `lint` - Uses `eslint --fix`
- `format` - Uses `prettier --write`
- `specs` - Uses `jest`
- `build` - Uses `rimraf` and `tsc`
- `check` - Uses `eslint` and `prettier --check`
- `test` - Runs `check`, `specs`, and `build`

## License

MIT

[npm-image]: https://img.shields.io/npm/v/@borderless/ts-scripts
[npm-url]: https://npmjs.org/package/@borderless/ts-scripts
[downloads-image]: https://img.shields.io/npm/dm/@borderless/ts-scripts
[downloads-url]: https://npmjs.org/package/@borderless/ts-scripts
[build-image]: https://img.shields.io/github/workflow/status/borderless/ts-scripts/CI/main
[build-url]: https://github.com/borderless/ts-scripts/actions/workflows/ci.yml?query=branch%3Amain
[coverage-image]: https://img.shields.io/codecov/c/gh/borderless/ts-scripts
[coverage-url]: https://codecov.io/gh/borderless/ts-scripts
