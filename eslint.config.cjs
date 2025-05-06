const foxglove = require("@foxglove/eslint-plugin");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  {
    ignores: ["dist/**/*", "*.js", "*.cjs", "perf/**/*.js"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
      },
    },
  },
  ...foxglove.configs.base,
  ...foxglove.configs.jest,
  ...foxglove.configs.typescript,
);
