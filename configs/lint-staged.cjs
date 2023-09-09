const script = `${process.argv0} '${require.resolve("../dist/bin.js")}'`;

module.exports = {
  [process.env.TS_SCRIPTS_FORMAT_GLOB]: `${script} format`,
};
