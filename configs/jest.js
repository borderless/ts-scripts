const { posix } = require("path");
const ts = require("typescript");

/** @type {import("../src/index").Config} */
const config = JSON.parse(process.env.TS_SCRIPTS_CONFIG || "{}");
const extensionRegexp = `\\.(?:js|jsx|ts|tsx)$`;

module.exports = {
  rootDir: config.dir,
  projects: config.test.map((test) => {
    // Load config once here because `createTransformer` gets called multiple times.
    const tsconfig = ts.getParsedCommandLineOfConfigFile(
      test.project,
      undefined,
      ts.sys
    );
    if (tsconfig.errors.length) {
      const message = ts.formatDiagnostics(tsconfig.errors, {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => process.cwd(),
        getNewLine: () => ts.sys.newLine,
      });

      throw new TypeError(`Unable to read project: ${message}`);
    }

    const options = {
      rootDir: config.dir,
      roots: (test.dir || config.src).map((x) => posix.join("<rootDir>", x)),
      testEnvironment: test.env,
      extensionsToTreatAsEsm: [".jsx", ".ts", ".tsx"],
      transform: {
        [extensionRegexp]: [require.resolve("./esbuild-jest.js"), tsconfig],
      },
      testRegex: `(?:/__tests__/.*|\\.test|\\.spec)${extensionRegexp}`,
      moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
      moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": ["$1.ts", "$1.tsx", "$1.js", "$1.jsx"],
      },
    };

    // Set explicitly since `undefined` gets serialized to a string.
    if (test.name) options.displayName = test.name;

    return options;
  }),
};
