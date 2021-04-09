import arg from "arg";
import pkgConf from "pkg-conf";
import { isCI } from "ci-info";
import { spawn } from "child_process";
import { resolve, join, posix, dirname, relative } from "path";
import { object, string, array, boolean } from "zod";
import { extensionsFromConfig } from "./common";

/**
 * Test configuration object.
 */
export interface Test {
  name: string | undefined;
  dir: string[] | undefined;
  env: string;
  project: string;
}

/**
 * Configuration object.
 */
export interface Config {
  js: boolean;
  react: boolean;
  dir: string;
  src: string[];
  dist: string[];
  project: string[];
  test: Test[];
}

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
  get prettierPluginPackage() {
    return require.resolve("prettier-plugin-package");
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
  config: Config;
  env?: Record<string, string>;
}

/**
 * Spawn a CLI command process.
 */
function run(
  path: string,
  args: string[] = [],
  { name, config, env }: RunOptions
) {
  console.log(`> Running "${name}"...`);

  return new Promise<void>((resolve, reject) => {
    const child = spawn("node", [path, ...args], {
      stdio: "inherit",
      cwd: config.dir,
      env: {
        ...process.env,
        ...env,
        TS_SCRIPTS_CONFIG: JSON.stringify(config),
      },
    });

    child.on("error", (err) => reject(err));
    child.on("close", (code, signal) => {
      if (code) return reject(new Error(`"${name}" exited with ${code}`));
      if (signal) return reject(new Error(`"${name}" exited with ${signal}`));
      return resolve();
    });
  });
}

/** Prettier supported glob files. */
function prettierGlob(config: Config) {
  return "*.{js,jsx,ts,tsx,json,css,md,yml,yaml}";
}

/** ESLint supported glob files. */
function eslintGlob(config: Config) {
  const exts = extensionsFromConfig(config);
  if (exts.length > 1) return `*.{${exts.join(",")}}`;
  return `*.${exts[0]}`;
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
export async function build(argv: string[], config: Config) {
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
        config.dist,
        config.project.map((x) => x.replace(/\.json$/, ".tsbuildinfo"))
      ),
      { config, name: "rimraf" }
    );

  // Build all project references using `--build`.
  await run(PATHS.typescript, ["-b", ...config.project], {
    name: "tsc",
    config,
  });
}

/**
 * Run the pre-commit hook to lint/fix any code automatically.
 */
export async function preCommit(argv: string[], config: Config) {
  await run(PATHS.lintStaged, ["--config", configLintStaged], {
    name: "lint-staged",
    config,
    env: {
      TS_SCRIPTS_LINT_GLOB: eslintGlob(config),
      TS_SCRIPTS_FORMAT_GLOB: prettierGlob(config),
    },
  });
}

/**
 * Resolve ESLint paths for linting.
 */
function getEslintPaths(paths: string[], filter: boolean, config: Config) {
  if (!paths.length) {
    return config.src.map((x) => posix.join(x, `**/${eslintGlob(config)}`));
  }

  if (filter) {
    const fullSrc = config.src.map((x) => resolve(config.dir, x));
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
      name: "eslint",
      config,
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
  const { "--force-exit": forceExit } = arg(
    {
      "--force-exit": Boolean,
      "-f": "--force-exit",
    },
    { argv }
  );

  await check([], config);
  await specs(args("--ci", "--coverage", forceExit && "--force-exit"), config);
  await build(["--no-clean"], config);
}

/**
 * Run specs using `jest`.
 */
export async function specs(argv: string[], config: Config) {
  const {
    _: paths,
    "--ci": ci = isCI,
    "--coverage": coverage,
    "--detect-open-handles": detectOpenHandles,
    "--force-exit": forceExit,
    "--only-changed": onlyChanged,
    "--test-pattern": testPattern,
    "--update-snapshot": updateSnapshot,
    "--watch-all": watchAll,
    "--watch": watch,
  } = arg(
    {
      "--ci": Boolean,
      "--coverage": Boolean,
      "--detect-open-handles": Boolean,
      "--force-exit": Boolean,
      "--only-changed": Boolean,
      "--test-pattern": String,
      "--update-snapshot": Boolean,
      "--watch-all": Boolean,
      "--watch": Boolean,
      "-f": "--force-exit",
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
      ci && "--ci",
      coverage && "--coverage",
      detectOpenHandles && "--detect-open-handles",
      forceExit && "--force-exit",
      onlyChanged && "--only-changed",
      testPattern && ["--test-name-pattern", testPattern],
      updateSnapshot && "--update-snapshot",
      watch && "--watch",
      watchAll && "--watch-all",
      paths
    ),
    { name: "jest", config }
  );
}

/**
 * Format code using `prettier`.
 */
export async function format(argv: string[], config: Config) {
  const { _: paths, "--check": check } = arg(
    {
      "--check": Boolean,
    },
    { argv }
  );

  if (!paths.length) {
    const glob = prettierGlob(config);
    paths.push(glob);
    for (const dir of config.src) paths.push(posix.join(dir, `**/${glob}`));
  }

  await run(
    PATHS.prettier,
    args(
      ["--plugin", PATHS.prettierPluginPackage],
      !check && "--write",
      check && "--check",
      paths
    ),
    {
      name: "prettier",
      config,
    }
  );
}

/**
 * Install any configuration needed for `ts-scripts` to work.
 */
export async function install(argv: string[], config: Config) {
  if (isCI) return;

  await run(PATHS.husky, ["install", join(configDir, "husky")], {
    name: "husky",
    config,
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
  js: boolean().optional(),
  react: boolean().optional(),
  src: array(string()).optional(),
  dist: array(string()).optional(),
  project: array(string()).optional(),
  test: array(
    object({
      name: string().optional(),
      env: string().optional(),
      dir: array(string()).optional(),
      project: string().optional(),
    })
  ).optional(),
});

/**
 * Load `ts-scripts` configuration.
 */
export async function getConfig(cwd: string): Promise<Config> {
  const config = await pkgConf("ts-scripts", { cwd });
  const schema = configSchema.parse(config);

  return {
    js: schema.js ?? false,
    react: schema.react ?? false,
    dir: dirname(pkgConf.filepath(config) ?? cwd),
    src: schema.src ?? ["src"],
    dist: schema.dist ?? ["dist"],
    project: schema.project ?? ["tsconfig.json"],
    test: (schema.test ?? [{}]).map((testSchema) => ({
      name: testSchema.name,
      dir: testSchema.dir,
      env: testSchema.env ?? "node",
      project: testSchema.project ?? "tsconfig.json",
    })),
  };
}

/**
 * Main configuration options.
 */
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
