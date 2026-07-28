import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "dev-dist/**",
      "node_modules/**",
      "public/bangs.json",
      "public/bangs-hot.json",
      "src/bang.ts",
      "pnpm-lock.yaml",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["scripts/**/*.{js,mjs}", "vite.config.ts", "vite-ac-proxy.ts", "api/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["src/sw.ts"],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
      },
    },
  },
);
