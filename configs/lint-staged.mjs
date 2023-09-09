const script = `${process.argv0} '${require.resolve("../dist/bin.js")}'`;

const config = {
  [process.env.TS_SCRIPTS_FORMAT_GLOB]: `${script} format`,
};

export default config;
