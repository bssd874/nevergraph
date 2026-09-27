import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "..");

export default defineConfig({
  root,
  resolve: {
    alias: { "@": resolve(root, "src") },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
