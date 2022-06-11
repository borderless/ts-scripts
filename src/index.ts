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
  dir: string | undefined;
  config: string | undefined;
}

/**
 * Configuration object.
 */
export interface Config {
  debug: boolean;
  dir: string;
  src: string[];
  ignore: string[];
  dist: string[];
  project: string[];
  checkProject: string[];
  test: Test[];
}

/**
 * Configuration files.
 */
const filename = fileURLToPath(import.meta.url);
const fileDirname = dirname(filename);
const configDir = resolve(fileDirname, "../configs");

/**
 * Resolves the absolute path to files within node modules.
 */
async function resolvePath(path: string) {
  const result = await findUp(join("node_modules", path), { cwd: fileDirname });
  if (!result) throw TypeError(`Unable to resolve: ${path}`);
  return result;
}

/**
 * Paths to node.js CLIs in use.
 */
const PATHS = {
  prettier() {
    return resolvePath("prettier/bin-prettier.js");
  },
  prettierPluginPackage() {
    return resolvePath("prettier-plugin-package/lib/index.js");
  },
  eslint() {
    return resolvePath("eslint/bin/eslint.js");
  },
  rimraf() {
    return resolvePath("rimraf/bin.js");
  },
  typescript() {
    return resolvePath("typescript/bin/tsc");
  },
  lintStaged() {
    return resolvePath("lint-staged/bin/lint-staged.js");
  },
  vitest() {
    return resolvePath("vitest/vitest.mjs");
  },
  husky() {
    return resolvePath("husky/lib/bin.js");
  },
} as const;

/** Prettier supported glob files. */
const PRETTIER_GLOB = "*.{js,jsx,ts,tsx,cjs,mjs,json,css,md,yml,yaml}";

/** ESLint supported glob files. */
const ESLINT_GLOB = `*.{js,jsx,ts,tsx}`;

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

  if (!noClean) {
    const paths = [
      ...config.dist,
      ...config.project.map((x) => x.replace(/\.json$/, ".tsbuildinfo")),
    ];

    // Skip `rimraf` if dist and project have been disabled.
    if (paths.length) {
      await run(await PATHS.rimraf(), paths, { config, name: "rimraf" });
    }
  }

  // Build all project references using `--build`.
  if (config.project.length) {
    await run(await PATHS.typescript(), ["--build", ...config.project], {
      name: "tsc --build",
      config,
    });
  }
}

/**
 * Run the pre-commit hook to lint/fix any code automatically.
 */
export async function preCommit(argv: string[], config: Config) {
  await run(
    await PATHS.lintStaged(),
    ["--config", join(configDir, "lint-staged.cjs")],
    {
      name: "lint-staged",
      config,
      env: {
        TS_SCRIPTS_LINT_GLOB: ESLINT_GLOB,
        TS_SCRIPTS_FORMAT_GLOB: PRETTIER_GLOB,
      },
    }
  );
}

/**
 * Resolve ESLint paths for linting.
 */
function getEslintPaths(paths: string[], filter: boolean, config: Config) {
  if (!paths.length) {
    return config.src.map((x) => posix.join(x, `**/${ESLINT_GLOB}`));
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
function getEslintConfig() {
  return join(configDir, "eslint.js");
}

/**
 * Lint the project using `eslint`.
 */
export async function lint(argv: string[], config: Config) {
  const {
    _: paths,
    "--check": check,
    "--filter-paths": filterPaths = false,
  } = arg(
    {
      "--filter-paths": Boolean,
      "--check": Boolean,
    },
    { argv }
  );

  const eslintPaths = getEslintPaths(paths, filterPaths, config);
  await run(
    await PATHS.eslint(),
    args(
      !check && "--fix",
      ["--config", getEslintConfig()],
      config.ignore.flatMap((ignore) => ["--ignore-pattern", ignore]),
      eslintPaths
    ),
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

  // Type check with typescript.
  for (const project of config.checkProject) {
    await run(await PATHS.typescript(), ["--noEmit", "--project", project], {
      name: `tsc --noEmit --project ${project}`,
      config,
    });
  }
}

/**
 * Run specs using `jest`.
 */
export async function specs(argv: string[], config: Config) {
  const {
    _: paths,
    "--changed": changed,
    "--coverage": coverage,
    "--since": since,
    "--test-pattern": testPattern,
    "--ui": ui,
    "--update": update,
    "--watch": watch,
  } = arg(
    {
      "--changed": Boolean,
      "--coverage": Boolean,
      "--since": String,
      "--test-pattern": String,
      "--ui": Boolean,
      "--update": Boolean,
      "--watch": Number,
      "-t": "--test-pattern",
      "-u": "--update",
    },
    { argv }
  );

  const path = await PATHS.vitest();
  const defaultArgs = args(
    "--passWithNoTests",
    coverage && "--coverage",
    update && "--update",
    changed && !since && "--changed",
    testPattern && "--testNamePattern",
    since && ["--changed", since],
    ui && "--ui",
    paths
  );

  if (watch) {
    const test = config.test[watch];
    if (!test) throw new TypeError(`No test config at: ${watch}`);

    return run(
      path,
      args(
        "watch",
        test.config && ["--config", test.config],
        test.dir && ["--dir", test.dir],
        defaultArgs
      ),
      {
        name: "vitest watch",
        config,
      }
    );
  }

  for (const test of config.test) {
    await run(
      await PATHS.vitest(),
      args(
        "run",
        test.config && ["--config", test.config],
        test.dir && ["--dir", test.dir],
        defaultArgs
      ),
      {
        name: "vitest run",
        config,
      }
    );
  }
}

/**
 * Run full test suite without automatic fixes.
 */
export async function test(argv: string[], config: Config) {
  await check([], config);
  await specs(["--coverage"], config);
  await build(["--no-clean"], config);
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
    paths.push(PRETTIER_GLOB);
    for (const src of config.src) {
      paths.push(posix.join(src, `**/${PRETTIER_GLOB}`));
    }
  }

  for (const ignore of config.ignore) {
    paths.push(`!${ignore}`);
  }

  const [prettierPath, prettierPluginPackage] = await Promise.all([
    PATHS.prettier(),
    PATHS.prettierPluginPackage(),
  ]);

  await run(
    prettierPath,
    args(
      ["--plugin", prettierPluginPackage],
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

  await run(await PATHS.husky(), ["install", join(configDir, "husky")], {
    name: "husky",
    config,
  });
}

/**
 * Prints the generated configuration for debugging.
 */
export async function config(argv: string[], config: Config) {
  console.log(JSON.stringify(config, null, 2));
}

/**
 * Supported scripts.
 */
const scripts = new Map([
  ["build", build],
  ["pre-commit", preCommit],
  ["format", format],
  ["specs", specs],
  ["test", test],
  ["lint", lint],
  ["check", check],
  ["install", install],
  ["config", config],
]);

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
  src: arrayifySchema(string()).optional(),
  ignore: arrayifySchema(string()).optional(),
  dist: arrayifySchema(string()).optional(),
  project: arrayifySchema(string()).optional(),
  test: arrayifySchema(
    object({
      dir: string().optional(),
      config: string().optional(),
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
    dir: dirname(packageJsonPath(config) ?? cwd),
    src: arrayify(schema.src ?? "src"),
    ignore: arrayify(schema.ignore ?? []),
    dist: arrayify(schema.dist ?? "dist"),
    project: arrayify(schema.project ?? "tsconfig.json"),
    checkProject: arrayify(schema.project ?? "tsconfig.json"),
    test: arrayify(schema.test ?? {}).map((testSchema) => ({
      dir: testSchema.dir,
      config: testSchema.config,
    })),
  };
}

/**
 * Main configuration options.
 */
export interface Options {
  cwd: string;
}

/**
 * Main script runtime.
 */
export async function main(args: string[], options: Options) {
  const [command, ...flags] = args;
  const script = scripts.get(command);
  if (!script) {
    throw new TypeError(`Script does not exist: ${command}`);
  }

  const config = await getConfig(options.cwd);
  return script(flags, config);
}
