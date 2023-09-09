import arg from "arg";
import { packageConfig, packageJsonPath } from "pkg-conf";
import { isCI } from "ci-info";
import { resolve, join, posix, dirname } from "path";
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
    return resolvePath("prettier/bin/prettier.cjs");
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
} as const;

/** Prettier supported glob files. */
const PRETTIER_GLOB = "*.{js,jsx,ts,tsx,cjs,mjs,json,css,md,yml,yaml}";

/**
 * Run command configuration.
 */
interface RunOptions {
  name: string;
  config: Config;
  env?: Record<string, string>;
  debug?: boolean;
}

/**
 * Log the step being run.
 */
function logStep(name: string, info?: string) {
  console.log(`> Running "${name}"...${info ? ` (${info})` : ""}`);
}

/**
 * Spawn a CLI command process.
 */
async function run(
  path: string,
  args: string[] = [],
  { name, config, env = {} }: RunOptions,
) {
  logStep(name);

  if (config.debug) {
    console.log(`> Path: ${JSON.stringify(path)}"`);
    console.log(`> Args: ${JSON.stringify(args.join(" "))}`);
  }

  if (typeof Bun === "object") {
    // Bun has a bug where it exits the parent process when using `spawn`.
    const child = Bun.spawnSync([process.argv0, path, ...args], {
      stdio: ["inherit", "inherit", "inherit"],
      cwd: config.dir,
      env: {
        ...process.env,
        ...env,
      },
    });

    if (child.exitCode) {
      throw new Error(`"${name}" exited with ${child.exitCode}`);
    }
    return;
  }

  const { spawn } = await import("child_process");

  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.argv0, [path, ...args], {
      stdio: "inherit",
      cwd: config.dir,
      env: {
        ...process.env,
        ...env,
      },
    });

    child.on("error", (err) => {
      reject(err);
    });
    child.on("close", (code, signal) => {
      if (code || signal) {
        return reject(new Error(`"${name}" exited with ${code || signal}`));
      }
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
    { argv },
  );

  if (!noClean) {
    const paths = [
      ...config.dist,
      ...config.project.map((x) => x.replace(/\.json$/, ".tsbuildinfo")),
    ];

    // Skip `rimraf` if dist and project have been disabled.
    if (paths.length) {
      logStep("rimraf");

      const rimraf = await import("rimraf");
      await rimraf.rimraf(paths);
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
 * Run the pre-commit hook on every `git commit`.
 */
export async function preCommit(argv: string[], config: Config) {
  await run(
    await PATHS.lintStaged(),
    ["--config", join(configDir, "lint-staged.cjs")],
    {
      name: "lint-staged",
      config,
      env: {
        TS_SCRIPTS_FORMAT_GLOB: PRETTIER_GLOB,
      },
    },
  );
}

/**
 * Run checks intended for CI, basically formatting without auto-fixing.
 */
export async function check(argv: string[], config: Config) {
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
    { argv },
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
    paths,
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
        defaultArgs,
      ),
      {
        name: `vitest watch ${test.dir ?? "."}`,
        config,
      },
    );
  }

  for (const test of config.test) {
    await run(
      await PATHS.vitest(),
      args(
        "run",
        test.config && ["--config", test.config],
        test.dir && ["--dir", test.dir],
        defaultArgs,
      ),
      {
        name: `vitest run ${test.dir ?? "."}`,
        config,
      },
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
    { argv },
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

  const prettierPath = await PATHS.prettier();

  await run(
    prettierPath,
    args(!check && "--write", check && "--check", paths),
    {
      name: "prettier",
      config,
    },
  );
}

/**
 * Install any configuration needed for `ts-scripts` to work.
 */
export async function install(argv: string[], config: Config) {
  if (isCI) return;

  const dir = typeof Bun === "object" ? "bun" : "node";

  logStep("husky", `using ${dir}`);

  const husky = await import("husky");
  husky.install(join(configDir, "husky", dir));
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
  checkProject: arrayifySchema(string()).optional(),
  test: arrayifySchema(
    object({
      dir: string().optional(),
      config: string().optional(),
    }),
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
    checkProject: arrayify(schema.checkProject ?? "tsconfig.json"),
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
