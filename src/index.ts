import arg from "arg";
import pkgConf from "pkg-conf";
import { isCI } from "ci-info";
import { spawn } from "child_process";
import { resolve, join, posix, dirname, relative } from "path";
import { object, string, array, boolean } from "zod";
import { eslintGlob, prettierGlob } from "./common";

/**
 * Configuration files.
 */
const configDir = resolve(__dirname, "../configs");
const configLintStaged = join(configDir, "lint-staged.js");

/**
 * Paths to node.js CLIs in use.
 */
const PATHS = {
  get prettier() {
    return require.resolve("prettier/bin-prettier.js");
  },
  get eslint() {
    return require.resolve("eslint/bin/eslint.js");
  },
  get rimraf() {
    return require.resolve("rimraf/bin.js");
  },
  get typescript() {
    return require.resolve("typescript/bin/tsc");
  },
  get lintStaged() {
    return require.resolve("lint-staged/bin/lint-staged.js");
  },
  get jest() {
    return require.resolve("jest/bin/jest.js");
  },
  get husky() {
    return require.resolve("husky/lib/bin.js");
  },
} as const;

/**
 * Get a value from an object by key.
 */
function get<K extends PropertyKey, T>(
  obj: Record<K | PropertyKey, T>,
  key: K
): T | undefined {
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

/**
 * Run command configuration.
 */
interface RunOptions {
  name: string;
  cwd: string;
}

/**
 * Spawn a CLI command process.
 */
function run(path: string, args: string[] = [], { name, cwd }: RunOptions) {
  console.log(`> Running "${name}"...`);

  return new Promise<void>((resolve, reject) => {
    const process = spawn("node", [path, ...args], { stdio: "inherit", cwd });
    process.on("error", (err) => reject(err));
    process.on("close", (code, signal) => {
      if (code) return reject(new Error(`"${name}" exited with ${code}`));
      if (signal) return reject(new Error(`"${name}" exited with ${signal}`));
      return resolve();
    });
  });
}

/**
 * Build args from a set of possible values.
 */
function args(...values: Array<string | string[] | false | undefined>) {
  const result: string[] = [];
  for (const arg of values) {
    if (Array.isArray(arg)) {
      result.push(...arg);
    } else if (arg) {
      result.push(arg);
    }
  }
  return result;
}

/**
 * Build the project using `tsc`.
 */
export async function build(argv: string[], { dir, dist, project }: Config) {
  const { "--no-clean": noClean } = arg(
    {
      "--no-clean": Boolean,
    },
    { argv }
  );

  if (!noClean)
    await run(
      PATHS.rimraf,
      args(
        dist,
        project.map((x) => x.replace(/\.json$/, ".tsbuildinfo"))
      ),
      { cwd: dir, name: "rimraf" }
    );

  // Build all project references using `--build`.
  await run(PATHS.typescript, ["-b", ...project], {
    name: "tsc",
    cwd: dir,
  });
}

/**
 * Run the pre-commit hook to lint/fix any code automatically.
 */
export async function preCommit(argv: string[], { dir }: Config) {
  await run(PATHS.lintStaged, ["--config", configLintStaged], {
    name: "lint-staged",
    cwd: dir,
  });
}

/**
 * Resolve ESLint paths for linting.
 */
function getEslintPaths(
  paths: string[],
  filter: boolean,
  { dir, src }: Config
) {
  if (!paths.length) {
    return src.map((x) => posix.join(x, `**/${eslintGlob}`));
  }

  if (filter) {
    const fullSrc = src.map((x) => resolve(dir, x));
    return paths.filter((path) =>
      fullSrc.some((src) => !relative(src, path).startsWith(".."))
    );
  }

  return paths;
}

/**
 * Get the expected ESLint config with react support.
 */
function getEslintConfig({ react }: Config) {
  return join(configDir, react ? "eslint.react.js" : "eslint.js");
}

/**
 * Lint the project using `eslint`.
 */
export async function lint(argv: string[], config: Config) {
  const { _, "--check": check, "--filter-paths": filterPaths = false } = arg(
    {
      "--filter-paths": Boolean,
      "--check": Boolean,
    },
    { argv }
  );

  const eslintPaths = getEslintPaths(_, filterPaths, config);
  await run(
    PATHS.eslint,
    args(!check && "--fix", ["--config", getEslintConfig(config)], eslintPaths),
    {
      cwd: config.dir,
      name: "eslint",
    }
  );
}

/**
 * Run checks intended for CI, basically linting/formatting without auto-fixing.
 */
export async function check(argv: string[], config: Config) {
  await lint(["--check"], config);
  await format(["--check"], config);
}

/**
 * Run full test suite without automatic fixes.
 */
export async function test(argv: string[], config: Config) {
  await check([], config);
  await specs(["--ci", "--coverage"], config);
  await build(["--no-clean"], config);
}

/**
 * Run specs using `jest`.
 */
export async function specs(argv: string[], { src, dir }: Config) {
  const {
    _: paths,
    "--ci": ci = isCI,
    "--coverage": coverage,
    "--only-changed": onlyChanged,
    "--test-pattern": testPattern,
    "--update-snapshot": updateSnapshot,
    "--watch-all": watchAll,
    "--watch": watch,
  } = arg(
    {
      "--ci": Boolean,
      "--coverage": Boolean,
      "--only-changed": Boolean,
      "--test-pattern": String,
      "--update-snapshot": Boolean,
      "--watch-all": Boolean,
      "--watch": Boolean,
      "-o": "--only-changed",
      "-t": "--test-pattern",
      "-u": "--update-snapshot",
    },
    { argv }
  );

  await run(
    PATHS.jest,
    args(
      ["--config", join(configDir, "jest.js")],
      ...src.map((x) => ["--roots", posix.join("<rootDir>", x)]),
      ci && "--ci",
      coverage && "--coverage",
      onlyChanged && "--only-changed",
      testPattern && ["--test-name-pattern", testPattern],
      updateSnapshot && "--update-snapshot",
      watch && "--watch",
      watchAll && "--watch-all",
      paths
    ),
    { cwd: dir, name: "jest" }
  );
}

/**
 * Format code using `prettier`.
 */
export async function format(argv: string[], { dir, src }: Config) {
  const { _: paths, "--check": check } = arg(
    {
      "--check": Boolean,
    },
    { argv }
  );

  if (!paths.length) {
    paths.push(prettierGlob);
    for (const dir of src) paths.push(posix.join(dir, `**/${prettierGlob}`));
  }

  await run(
    PATHS.prettier,
    args(
      ["--plugin", "prettier-plugin-package"],
      !check && "--write",
      check && "--check",
      paths
    ),
    {
      cwd: dir,
      name: "prettier",
    }
  );
}

/**
 * Install any configuration needed for `ts-scripts` to work.
 */
export async function install(argv: string[], { dir }: Config) {
  if (isCI) return;

  await run(PATHS.husky, ["install", join(configDir, "husky")], {
    cwd: dir,
    name: "husky",
  });
}

/**
 * Supported scripts.
 */
export const scripts = {
  build: build,
  "pre-commit": preCommit,
  format: format,
  specs: specs,
  test: test,
  lint: lint,
  check: check,
  install: install,
} as const;

/**
 * Configuration schema object for validation.
 */
const configSchema = object({
  react: boolean().optional(),
  src: array(string()).optional(),
  dist: array(string()).optional(),
  project: array(string()).optional(),
});

/**
 * Configuration object.
 */
export interface Config {
  react: boolean;
  dir: string;
  src: string[];
  dist: string[];
  project: string[];
}

/**
 * Load `ts-scripts` configuration.
 */
export async function getConfig(cwd: string): Promise<Config> {
  const config = await pkgConf("ts-scripts", { cwd });
  const dir = dirname(pkgConf.filepath(config) || cwd);
  const {
    react = false,
    src = ["src"],
    dist = ["dist"],
    project = ["tsconfig.json"],
  } = configSchema.parse(config);
  return { react, dir, src, dist, project };
}

export interface Options {
  cwd?: string;
}

/**
 * Main script runtime.
 */
export async function main(args: string[], { cwd = process.cwd() }: Options) {
  const [command, ...flags] = args;
  const script = get(scripts, command);

  if (!script) {
    throw new TypeError(`Script does not exist: ${command}`);
  }

  const config = await getConfig(cwd);
  return script(flags, config);
}
