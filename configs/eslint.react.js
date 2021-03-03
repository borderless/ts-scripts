const config = require("./eslint");

module.exports = {
  ...config,
  parser: "@typescript-eslint/parser",
  extends: ["plugin:react/recommended", ...config.extends],
  parserOptions: {
    ...config.parserOptions,
    ecmaFeatures: {
      jsx: true,
    },
  },
  settings: {
    react: {
      version: "detect",
    },
  },
};
