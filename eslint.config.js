import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Flat ESLint config for the Burnwise monorepo.
 *
 * Phase 0 intent: establish a working lint baseline that catches real bugs
 * (undeclared vars, unreachable code, duplicate keys, etc.) without requiring
 * a large refactor of existing code. Stylistic / `any` rules are warnings for
 * now and will be ratcheted to errors in a later phase.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/out/**",
      "**/build/**",
      "**/node_modules/**",
      "**/*.d.ts",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/.prisma/**",
      "**/*.config.ts",
      "**/*.config.js",
      "**/coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // TypeScript handles undefined identifiers; disable the JS rule to avoid
      // false positives on globals and type-only references.
      "no-undef": "off",
      // Soften to warnings for the existing codebase; ratchet later.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/no-empty-object-type": "warn",
      // The CLI banner contains ASCII art with intentional escapes.
      "no-useless-escape": "warn",
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/exhaustive-deps": "warn",
    },
  }
);
