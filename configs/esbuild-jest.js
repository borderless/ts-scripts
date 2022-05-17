const esbuild = require("esbuild");
const { extname } = require("path");
const ts = require("typescript");

exports.createTransformer = (tsconfig) => {
  return {
    async processAsync(contents, sourcefile) {
      const result = await esbuild.transform(contents, {
        tsconfigRaw: tsconfig.options,
        logLevel: "warning",
        target:
          tsconfig.options.target === ts.ScriptTarget.Latest
            ? "ESNext"
            : ts.ScriptTarget[tsconfig.options.target],
        format: "esm",
        minify: false,
        keepNames: true,
        sourcemap: "external",
        loader: extname(sourcefile).slice(1),
        sourcefile,
      });

      return {
        map: result.map,
        code: result.code,
      };
    },
  };
};
