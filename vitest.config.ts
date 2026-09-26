import { defineConfig } from "vitest/config";
import { resolve } from "path";
import { fileURLToPath } from "url";

const root = resolve(fileURLToPath(import.meta.url), "..");

export default defineConfig({
  root,
  test: {
    globals: false,
    environment: "node",
    include: ["packages/*/src/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["packages/*/src/__tests__/**"],
    },
  },
});
