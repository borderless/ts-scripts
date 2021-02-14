/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  rootDir: process.cwd(),
  transform: {
    "\\.[tj]sx?$": "ts-jest",
  },
  testRegex: "(?:/__tests__/.*|\\.(?:test|spec))\\.[tj]sx?$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
};
