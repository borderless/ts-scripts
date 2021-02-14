import arg from "arg";
import pkgConf from "pkg-conf";
import isCI from "is-ci";
import { spawn } from "child_process";
import { resolve, join, posix, dirname, relative } from "path";
import { object, string, array } from "zod";
import { eslintGlob, prettierGlob } from "./common";

/**
 * Configuration files.
 */
const configDir = resolve(__dirname, "../configs");
const configLintStaged = join(configDir, "lint-staged.js");
const configEslint = join(configDir, "eslint.js");
const configJest = join(configDir, "jest.js");
const configHusky = join(configDir, "husky");

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
  const { "--no-clean": noClean } = arg({ "--no-clean": Boolean }, { argv });

  if (!noClean)
    await run(
      PATHS.rimraf,
      args(
        dist,
        project.map((x) => x.replace(/\.json$/, ".tsbuildinfo"))
      ),
      { cwd: dir, name: "rimraf" }
    );

  // Run each project in sequence.
  for (const tsconfigPath of project) {
    await run(PATHS.typescript, ["--project", tsconfigPath], {
      name: `tsc \`${tsconfigPath}\``,
      cwd: dir,
    });
  }
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
 * Lint the project using `eslint`.
 */
export async function lint(argv: string[], config: Config) {
  const { _, "--filter-paths": filterPaths = false } = arg(
    { "--filter-paths": Boolean },
    { argv }
  );

  const eslintPaths = getEslintPaths(_, filterPaths, config);
  await run(PATHS.eslint, ["--fix", "--config", configEslint, ...eslintPaths], {
    cwd: config.dir,
    name: "eslint --fix",
  });
}

/**
 * Run checks intended for CI, basically linting/formatting without auto-fixing.
 */
export async function check(argv: string[], { src, dir }: Config) {
  const eslintPaths = src.map((x) => posix.join(x, `**/${eslintGlob}`));
  await run(PATHS.eslint, ["--config", configEslint, ...eslintPaths], {
    cwd: dir,
    name: "eslint",
  });

  const prettierPaths = src.map((x) => posix.join(x, `**/${prettierGlob}`));
  await run(PATHS.prettier, ["--check", ...prettierPaths], {
    cwd: dir,
    name: "prettier --check",
  });
}

/**
 * Run full test suite without automatic fixes.
 */
export async function test(argv: string[], config: Config) {
  await check([], config);
  await specs(["--ci"], config);
  await build(["--no-clean"], config);
}

/**
 * Run specs using `jest`.
 */
export async function specs(argv: string[], { src, dir }: Config) {
  const {
    _: paths,
    "--watch": watch,
    "--ci": ci = isCI,
    "--update-snapshot": updateSnapshot,
  } = arg(
    { "--watch": Boolean, "--update-snapshot": Boolean, "--ci": Boolean },
    { argv }
  );

  await run(
    PATHS.jest,
    args(
      "--coverage",
      ["--config", configJest],
      ...src.map((x) => ["--roots", posix.join("<rootDir>", x)]),
      ci && "--ci",
      watch && "--watch",
      updateSnapshot && "--update-snapshot",
      paths
    ),
    { cwd: dir, name: "jest" }
  );
}

/**
 * Format code using `prettier`.
 */
export async function format(argv: string[], { dir, src }: Config) {
  const { _: paths } = arg({}, { argv });

  if (!paths.length) {
    paths.push(prettierGlob);
    for (const dir of src) paths.push(posix.join(dir, `**/${prettierGlob}`));
  }

  await run(PATHS.prettier, ["--write", ...paths], {
    cwd: dir,
    name: "prettier --write",
  });
}

/**
 * Install any configuration needed for `ts-scripts` to work.
 */
export async function install(argv: string[], { dir }: Config) {
  if (isCI) return;

  await run(PATHS.husky, ["install", configHusky], {
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
  src: array(string()).optional(),
  dist: array(string()).optional(),
  project: array(string()).optional(),
});

/**
 * Configuration object.
 */
export interface Config {
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
    src = ["src"],
    dist = ["dist"],
    project = ["tsconfig.json"],
  } = configSchema.parse(config);
  return { dir, src, dist, project };
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
