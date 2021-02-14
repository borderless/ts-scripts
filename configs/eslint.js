module.exports = {
  parser: "@typescript-eslint/parser",
  extends: [
    "plugin:@typescript-eslint/recommended",
    "prettier/@typescript-eslint",
    "prettier",
  ],
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: "module",
  },
};
