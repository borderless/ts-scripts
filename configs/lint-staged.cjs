const { join, basename } = require("path");

const script =
  basename(join(__dirname, "..", "..")) === "node_modules"
    ? "ts-scripts"
    : `node '${require.resolve("../dist/bin.js")}'`;

console.log(
  "running",
  process.cwd(),
  process.env.TS_SCRIPTS_LINT_GLOB,
  process.env.TS_SCRIPTS_FORMAT_GLOB
);

module.exports = {
  [process.env.TS_SCRIPTS_LINT_GLOB]: `${script} lint --filter-paths`,
  ["**/*.ts"]: `${script} format`,
};
