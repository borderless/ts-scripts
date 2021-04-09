const { posix } = require("path");

/** @type {import("../src/common").Config} */
const config = JSON.parse(process.env.TS_SCRIPTS_CONFIG ?? "{}");

module.exports = {
  projects: config.test.map((test) => {
    /** @type {import("ts-jest/dist/types").InitialOptionsTsJest} */
    const options = {
      rootDir: config.dir,
      roots: (test.dir ?? config.src).map((x) => posix.join("<rootDir>", x)),
      testEnvironment: test.env,
      globals: {
        "ts-jest": {
          tsconfig: test.project,
        },
      },
      transform: {
        "\\.[tj]sx?$": require.resolve("ts-jest"),
      },
      testRegex: "(?:/__tests__/.*|\\.(?:test|spec))\\.[tj]sx?$",
      moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
    };

    // Set explicitly since `undefined` gets serialized to a string.
    if (test.name) options.displayName = test.name;

    return options;
  }),
};
