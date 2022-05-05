import arg from "arg";
import { packageConfig, packageJsonPath } from "pkg-conf";
import { isCI } from "ci-info";
import { spawn } from "child_process";
import { resolve, join, posix, dirname, relative } from "path";
import { fileURLToPath } from "url";
import { object, string, array, boolean, union, ZodType } from "zod";
import { findUp } from "find-up";

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
  debug: boolean;
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
const filename = fileURLToPath(import.meta.url);
const fileDirname = dirname(filename);
const configDir = resolve(fileDirname, "../configs");

async function resolvePath(path: string) {
  const result = await findUp(join("node_modules", path), { cwd: fileDirname });
  if (!result) throw TypeError(`Unable to resolve: ${path}`);
  return result;
}

/**
 * Paths to node.js CLIs in use.
 */
const PATHS = {
  get prettier() {
    return resolvePath("prettier/bin-prettier.js");
  },
  get prettierPluginPackage() {
    return resolvePath("prettier-plugin-package/lib/index.js");
  },
  get eslint() {
    return resolvePath("eslint/bin/eslint.js");
  },
  get rimraf() {
    return resolvePath("rimraf/bin.js");
  },
  get typescript() {
    return resolvePath("typescript/bin/tsc");
  },
  get lintStaged() {
    return resolvePath("lint-staged/bin/lint-staged.js");
  },
  get jest() {
    return resolvePath("jest/bin/jest.js");
  },
  get husky() {
    return resolvePath("husky/lib/bin.js");
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
  debug?: boolean;
  nodeArgs?: string[];
}

/**
 * Spawn a CLI command process.
 */
function run(
  path: string,
  args: string[] = [],
  { name, config, env, nodeArgs }: RunOptions
) {
  console.log(`> Running "${name}"...`);
  if (config.debug) {
    console.log(`> Path: ${JSON.stringify(path)}"`);
    console.log(`> Args: ${JSON.stringify(args.join(" "))}`);
  }

  return new Promise<void>((resolve, reject) => {
    const child = spawn("node", [...(nodeArgs ?? []), path, ...args], {
      stdio: "inherit",
      cwd: config.dir,
      env: env
        ? {
            ...process.env,
            ...env,
          }
        : process.env,
    });

    child.on("error", (err) => reject(err));
    child.on("close", (code, signal) => {
      if (code) return reject(new Error(`"${name}" exited with ${code}`));
      if (signal) return reject(new Error(`"${name}" exited with ${signal}`));
      return resolve();
    });
  });
}

/** Build the list of supported script extensions for ESLint and Jest. */
function extensionsFromConfig(config: Config): string[] {
  const exts = ["ts"];
  if (config.js) exts.push("js");
  if (config.react) exts.push("tsx");
  if (config.js && config.react) exts.push("jsx");
  return exts;
}

/** Prettier supported glob files. */
function prettierGlob() {
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
      await PATHS.rimraf,
      args(
        config.dist,
        config.project.map((x) => x.replace(/\.json$/, ".tsbuildinfo"))
      ),
      { config, name: "rimraf" }
    );

  // Build all project references using `--build`.
  await run(await PATHS.typescript, ["-b", ...config.project], {
    name: "tsc",
    config,
  });
}

/**
 * Run the pre-commit hook to lint/fix any code automatically.
 */
export async function preCommit(argv: string[], config: Config) {
  await run(
    await PATHS.lintStaged,
    ["--config", join(configDir, "lint-staged.cjs")],
    {
      name: "lint-staged",
      config,
      env: {
        TS_SCRIPTS_LINT_GLOB: eslintGlob(config),
        TS_SCRIPTS_FORMAT_GLOB: prettierGlob(),
      },
    }
  );
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
  const {
    _,
    "--check": check,
    "--filter-paths": filterPaths = false,
  } = arg(
    {
      "--filter-paths": Boolean,
      "--check": Boolean,
    },
    { argv }
  );

  const eslintPaths = getEslintPaths(_, filterPaths, config);
  await run(
    await PATHS.eslint,
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
    "--fail-with-no-tests": failWithNoTests,
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
      "--fail-with-no-tests": Boolean,
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
    await PATHS.jest,
    args(
      ["--config", join(configDir, "jest.js")],
      "--injectGlobals=false",
      !failWithNoTests && "--passWithNoTests",
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
    {
      name: "jest",
      config,
      nodeArgs: ["--experimental-vm-modules"],
      env: {
        TS_SCRIPTS_CONFIG: JSON.stringify(config),
        TS_SCRIPTS_EXTENSIONS: extensionsFromConfig(config).join("|"),
      },
    }
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
    const glob = prettierGlob();
    paths.push(glob);
    for (const dir of config.src) paths.push(posix.join(dir, `**/${glob}`));
  }

  await run(
    await PATHS.prettier,
    args(
      ["--plugin", await PATHS.prettierPluginPackage],
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

  await run(await PATHS.husky, ["install", join(configDir, "husky")], {
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
 * Allow array or string values for schema entries.
 */
const arrayifySchema = <T extends ZodType<unknown>>(value: T) => {
  return union([value, array(value)]);
};

/**
 * Convert value into array format.
 */
const arrayify = <T>(value: T | T[]) => {
  return Array.isArray(value) ? value : [value];
};

/**
 * Configuration schema object for validation.
 */
const configSchema = object({
  debug: boolean().optional(),
  js: boolean().optional(),
  react: boolean().optional(),
  src: arrayifySchema(string()).optional(),
  dist: arrayifySchema(string()).optional(),
  project: arrayifySchema(string()).optional(),
  test: arrayifySchema(
    object({
      name: string().optional(),
      env: string().optional(),
      dir: arrayifySchema(string()).optional(),
      project: string().optional(),
    })
  ).optional(),
});

/**
 * Load `ts-scripts` configuration.
 */
export async function getConfig(cwd: string): Promise<Config> {
  const config = await packageConfig("ts-scripts", { cwd });
  const schema = configSchema.parse(config);

  return {
    debug: schema.debug ?? false,
    js: schema.js ?? false,
    react: schema.react ?? false,
    dir: dirname(packageJsonPath(config) ?? cwd),
    src: arrayify(schema.src ?? "src"),
    dist: arrayify(schema.dist ?? "dist"),
    project: arrayify(schema.project ?? "tsconfig.json"),
    test: arrayify(schema.test ?? {}).map((testSchema) => ({
      name: testSchema.name,
      dir: testSchema.dir ? arrayify(testSchema.dir) : undefined,
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
