module.exports = {
  parser: "@typescript-eslint/parser",
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "prettier",
  ],
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: "module",
  },
};
