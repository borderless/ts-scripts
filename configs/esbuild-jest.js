const esbuild = require("esbuild");
const { basename } = require("path");
const typescript = require("typescript");

exports.createTransformer = (config) => {
  return {
    async processAsync(contents, sourcefile) {
      const filename = basename(sourcefile);
      const loader = filename.replace(/^.*\./, "");

      const result = await esbuild.build({
        format: "esm",
        tsconfig: config.test.project,
        write: false,
        minify: false,
        sourcemap: "external",
        outdir: "dist",
        stdin: {
          contents,
          sourcefile,
          loader,
        },
      });

      return {
        map: result.outputFiles[0].text,
        code: result.outputFiles[1].text,
      };
    },
  };
};
