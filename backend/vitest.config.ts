import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false,
    testTimeout: 30000,
  },
});
