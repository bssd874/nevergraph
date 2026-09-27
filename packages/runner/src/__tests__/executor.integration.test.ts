import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runGeneratedTest } from "../index.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const tempParent = path.resolve(currentDirectory, "../../.tmp-tests");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createFixture(source: string): string {
  mkdirSync(tempParent, { recursive: true });
  const directory = mkdtempSync(path.join(tempParent, "executor-"));
  temporaryDirectories.push(directory);
  writeFileSync(
    path.join(directory, "vitest.config.ts"),
    'export default { test: { environment: "node", include: ["**/*.test.ts"] } };\n',
    "utf8",
  );
  writeFileSync(path.join(directory, "generated.test.ts"), source, "utf8");
  return directory;
}

async function executeFixture(source: string) {
  const cwd = createFixture(source);
  return runGeneratedTest({
    identifier: "TEST-RULE-001",
    cwd,
    testFile: "generated.test.ts",
    configFile: "vitest.config.ts",
  });
}

describe("real Vitest process execution", () => {
  it("classifies a passing regression as not reproduced", async () => {
    const result = await executeFixture([
      'import { expect, it } from "vitest";',
      'it("passes", () => { expect(1).toBe(1); });',
      "",
    ].join("\n"));

    expect(result.status).toBe("not_reproduced");
    expect(result.testResult).toBe("pass");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
    expect(typeof result.stderr).toBe("string");
    expect(result.command[0]).toBe(process.execPath);
  });

  it("classifies a real assertion failure as reproduced", async () => {
    const result = await executeFixture([
      'import { expect, it } from "vitest";',
      'it("fails", () => { expect("forbidden").toBe("blocked"); });',
      "",
    ].join("\n"));

    expect(result.status).toBe("reproduced");
    expect(result.testResult).toBe("fail");
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("failed");
  });

  it("classifies a missing module as execution_error, never reproduced", async () => {
    const result = await executeFixture([
      'import { missing } from "./module-that-does-not-exist.js";',
      'import { it } from "vitest";',
      'it("cannot load", () => { missing(); });',
      "",
    ].join("\n"));

    expect(result.status).toBe("execution_error");
    expect(result.testResult).toBe("error");
    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/module-that-does-not-exist/);
  });
});
