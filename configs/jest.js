const { posix } = require("path");

/** @type {import("../src/index").Config} */
const config = JSON.parse(process.env.TS_SCRIPTS_CONFIG || "{}");
const extensions = process.env.TS_SCRIPTS_EXTENSIONS || "";
const extensionRegexp = `\\.(?:${extensions})$`;

/** @type {import("ts-jest/dist/types").InitialOptionsTsJest} */
module.exports = {
  rootDir: config.dir,
  projects: config.test.map((test) => {
    /** @type {import("ts-jest/dist/types").InitialOptionsTsJest} */
    const options = {
      rootDir: config.dir,
      roots: (test.dir || config.src).map((x) => posix.join("<rootDir>", x)),
      testEnvironment: test.env,
      extensionsToTreatAsEsm: [".jsx", ".ts", ".tsx"],
      globals: {
        "ts-jest": {
          tsconfig: test.project,
          useESM: true,
        },
      },
      transform: {
        [extensionRegexp]: require.resolve("ts-jest"),
      },
      testRegex: `(?:/__tests__/.*|\\.test|\\.spec)${extensionRegexp}`,
      moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
    };

    // Set explicitly since `undefined` gets serialized to a string.
    if (test.name) options.displayName = test.name;

    return options;
  }),
};
