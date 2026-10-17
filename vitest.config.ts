import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    exclude: [
      ...configDefaults.exclude,
      "**/node_modules/**",
      "**/dist/**",
      "**/*.test.mjs",
      "**/.worktrees/**",
      // Companion uses Expo tsconfig; run those tests from companion/ after npm ci there.
      "companion/**",
    ],
  },
});
