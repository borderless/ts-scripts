const script = `node '${require.resolve("../dist/bin.js")}'`;

module.exports = {
  [process.env.TS_SCRIPTS_LINT_GLOB]: `${script} lint --filter-paths`,
  [process.env.TS_SCRIPTS_FORMAT_GLOB]: `${script} format`,
};
