const { posix } = require("path");
const { extensionsFromConfig } = require("../dist/common");

/** @type {import("../src/index").Config} */
const config = JSON.parse(process.env.TS_SCRIPTS_CONFIG || "{}");
const extensions = extensionsFromConfig(config);
const extensionRegexp = `\\.(?:${extensions.join("|")})$`;

module.exports = {
  projects: config.test.map((test) => {
    /** @type {import("ts-jest/dist/types").InitialOptionsTsJest} */
    const options = {
      rootDir: config.dir,
      roots: (test.dir || config.src).map((x) => posix.join("<rootDir>", x)),
      testEnvironment: test.env,
      globals: {
        "ts-jest": {
          tsconfig: test.project,
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
