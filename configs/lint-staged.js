const { join, basename } = require("path");
const { eslintGlob, prettierGlob } = require("../dist/common.js");

const script =
  basename(join(__dirname, "..", "..")) === "node_modules"
    ? "ts-scripts"
    : `node '${require.resolve("../dist/bin.js")}'`;

module.exports = {
  [eslintGlob]: `${script} lint --filter-paths`,
  [prettierGlob]: `${script} format`,
};
