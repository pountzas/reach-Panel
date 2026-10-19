// @ts-check
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Strict React + TypeScript linting for the main Vite app (`src/`).
 * ESLint 9 is pinned while jsx-a11y / eslint-plugin-react peer on ^9.
 */
export default defineConfig(
  globalIgnores([
    "dist/**",
    "node_modules/**",
    "src-tauri/**",
    "companion/**",
    "wordpacks-dist/**",
    "updater/**",
    "spikes/**",
    "docs/**",
    "scripts/**",
    "coverage/**",
    "*.config.js",
    "*.config.ts",
    "vitest.setup.ts",
  ]),
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      react.configs.flat["jsx-runtime"],
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.strict,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // Prefer explicit return types on exported APIs; keep local helpers free.
      "@typescript-eslint/explicit-module-boundary-types": "off",
      // Codebase already prefers `type` over `interface` (~2:1).
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      // Numbers/booleans in templates are idiomatic in this UI.
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true },
      ],
      // Zustand / Tauri event handlers often use void-returning async fires.
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      // Intentional no-op handlers (pointer capture, defaultProps stubs).
      "@typescript-eslint/no-empty-function": [
        "error",
        { allow: ["arrowFunctions", "methods", "private-constructors"] },
      ],
      // Match TypeScript: unused names starting with `_` are intentional.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Touch-first UI: keep label / aria / focus from the strict a11y preset;
      // warn on static click handlers that the keyboard surface still needs.
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
    },
  },
  {
    files: ["src/**/*.{test,spec}.{ts,tsx}"],
    rules: {
      // Tests use flexible mocks and intentional any casts.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
);
