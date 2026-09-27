/**
 * fixtures.unit.test.ts — Level 1 synthetic unit tests
 *
 * Uses tiny in-memory TypeScript source strings with names unrelated to Mercury
 * to prove that extraction is pattern-based, not Mercury-specific.
 */

import { describe, it, expect } from "vitest";
import { Project, SourceFile } from "ts-morph";
import { extractStatusAssignments, extractFactAssignments } from "../extractors/assignments.js";
import { extractGuards } from "../extractors/guards.js";
import { extractNegativeTests } from "../extractors/tests.js";
import { normalize } from "../normalizer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSourceFile(content: string): SourceFile {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile("fixture.ts", content);
}

function makeTestFile(content: string): SourceFile {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile("fixture.test.ts", content);
}

// ---------------------------------------------------------------------------
// extractStatusAssignments
// ---------------------------------------------------------------------------

describe("extractStatusAssignments", () => {
  it("extracts a simple enum status assignment", () => {
    const sf = makeSourceFile(`
      function activateWidget(widget: any): void {
        widget.state = WidgetState.ACTIVE;
      }
    `);
    const results = extractStatusAssignments(sf, "src/widget.ts");
    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.functionName).toBe("activateWidget");
    expect(r.objectName).toBe("widget");
    expect(r.propertyName).toBe("state");
    expect(r.enumName).toBe("WidgetState");
    expect(r.enumMember).toBe("ACTIVE");
    expect(r.file).toBe("src/widget.ts");
    expect(r.line).toBeGreaterThan(0);
  });

  it("extracts multiple status assignments across different functions", () => {
    const sf = makeSourceFile(`
      function startTask(task: any): void {
        task.status = TaskStatus.RUNNING;
      }
      function completeTask(task: any): void {
        task.status = TaskStatus.DONE;
      }
    `);
    const results = extractStatusAssignments(sf, "src/task.ts");
    expect(results).toHaveLength(2);
    expect(results.map(r => r.enumMember).sort()).toEqual(["DONE", "RUNNING"]);
  });

  it("ignores plain identifier assignments (non-enum RHS)", () => {
    const sf = makeSourceFile(`
      function setStatus(item: any, val: string): void {
        item.status = val;
      }
    `);
    const results = extractStatusAssignments(sf, "src/item.ts");
    expect(results).toHaveLength(0);
  });

  it("ignores nested property access on LHS", () => {
    const sf = makeSourceFile(`
      function fn(a: any): void {
        a.b.status = MyEnum.VAL;
      }
    `);
    const results = extractStatusAssignments(sf, "src/x.ts");
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// extractFactAssignments
// ---------------------------------------------------------------------------

describe("extractFactAssignments", () => {
  it("extracts a non-null fact assignment (value: true)", () => {
    const sf = makeSourceFile(`
      function processItem(item: any): void {
        item.processedAt = new Date();
      }
    `);
    const results = extractFactAssignments(sf, "src/processor.ts");
    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.propertyName).toBe("processedAt");
    expect(r.value).toBe(true);
    expect(r.functionName).toBe("processItem");
  });

  it("extracts a null assignment (value: null)", () => {
    const sf = makeSourceFile(`
      function clearItem(item: any): void {
        item.processedAt = null;
      }
    `);
    const results = extractFactAssignments(sf, "src/processor.ts");
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBeNull();
  });

  it("does not extract enum-style assignments as facts", () => {
    const sf = makeSourceFile(`
      function fn(x: any): void {
        x.state = MyEnum.ACTIVE;
        x.timestamp = new Date();
      }
    `);
    // enum assignment excluded from facts
    const facts = extractFactAssignments(sf, "src/x.ts");
    expect(facts.every(f => f.propertyName !== "state")).toBe(true);
    expect(facts.some(f => f.propertyName === "timestamp")).toBe(true);
  });

  it("records multiple fact assignments in the same function", () => {
    const sf = makeSourceFile(`
      function closeAccount(account: any): void {
        account.closedAt = new Date();
        account.balance = null;
      }
    `);
    const results = extractFactAssignments(sf, "src/account.ts");
    expect(results).toHaveLength(2);
    const props = results.map(r => r.propertyName).sort();
    expect(props).toEqual(["balance", "closedAt"]);
  });
});

// ---------------------------------------------------------------------------
// extractGuards
// ---------------------------------------------------------------------------

describe("extractGuards", () => {
  it("extracts a simple !== guard with throw", () => {
    const sf = makeSourceFile(`
      function activateDevice(device: any): void {
        if (device.state !== DeviceState.IDLE) {
          throw new InvalidStateError("not idle");
        }
        device.state = DeviceState.ACTIVE;
      }
    `);
    const guards = extractGuards(sf, "src/device.ts");
    expect(guards.length).toBeGreaterThanOrEqual(1);
    const g = guards.find(x => x.value === "IDLE");
    expect(g).toBeDefined();
    expect(g!.operator).toBe("neq");
    expect(g!.throws).toBe(true);
    expect(g!.throwsClass).toBe("InvalidStateError");
    expect(g!.functionName).toBe("activateDevice");
    expect(g!.propertyName).toBe("state");
  });

  it("extracts a === guard with throw (reject-if-equal)", () => {
    const sf = makeSourceFile(`
      function processItem(item: any): void {
        if (item.state === ItemState.DELETED) {
          throw new ForbiddenError("deleted");
        }
      }
    `);
    const guards = extractGuards(sf, "src/item.ts");
    expect(guards.length).toBeGreaterThanOrEqual(1);
    const g = guards.find(x => x.value === "DELETED");
    expect(g).toBeDefined();
    expect(g!.operator).toBe("eq");
    expect(g!.throws).toBe(true);
  });

  it("extracts multi-neq AND guard as multiple entries", () => {
    const sf = makeSourceFile(`
      function archiveRecord(record: any): void {
        if (record.status !== RecordStatus.APPROVED && record.status !== RecordStatus.REVIEWED) {
          throw new InvalidStateError("must be approved or reviewed");
        }
      }
    `);
    const guards = extractGuards(sf, "src/record.ts");
    // Should produce 2 guard entries (one per neq branch)
    expect(guards).toHaveLength(2);
    const values = guards.map(g => g.value).sort();
    expect(values).toEqual(["APPROVED", "REVIEWED"]);
    // Each guard's additionalRejected should contain the other value
    const approvedGuard = guards.find(g => g.value === "APPROVED")!;
    expect(approvedGuard.additionalRejected).toContain("REVIEWED");
  });

  it("ignores if-statements without throw", () => {
    const sf = makeSourceFile(`
      function fn(item: any): void {
        if (item.state !== MyEnum.ACTIVE) {
          console.log("not active");
        }
      }
    `);
    const guards = extractGuards(sf, "src/x.ts");
    expect(guards).toHaveLength(0);
  });

  it("does not crash on unsupported guard syntax", () => {
    const sf = makeSourceFile(`
      function fn(x: any): void {
        if (x.state !== "literal" || x.other === true) {
          throw new Error("bad");
        }
      }
    `);
    // Should not throw — just produce nothing or partial results
    expect(() => extractGuards(sf, "src/x.ts")).not.toThrow();
  });

  it("extracts a non-null rejection as a null-valued fact guard", () => {
    const sf = makeSourceFile(`
      function reopenArchive(archive: any): void {
        if (archive.sealedAt !== null) {
          throw new InvalidStateError("sealed");
        }
      }
    `);
    const guards = extractGuards(sf, "src/archive.ts");
    expect(guards).toHaveLength(1);
    expect(guards[0]).toMatchObject({
      objectName: "archive",
      propertyName: "sealedAt",
      operator: "neq",
      value: null,
    });
  });

  it("combines a state guard with a domain-neutral required null fact", () => {
    const sf = makeSourceFile(`
      function reopenArchive(archive: any): void {
        if (archive.stage !== ArchiveStage.CLOSED) {
          throw new InvalidStateError("not closed");
        }
        if (archive.sealedAt !== null) {
          throw new InvalidStateError("sealed");
        }
        archive.stage = ArchiveStage.OPEN;
      }
    `);
    const result = normalize(
      extractStatusAssignments(sf, "src/archive.ts"),
      extractFactAssignments(sf, "src/archive.ts"),
      extractGuards(sf, "src/archive.ts"),
      [],
    );

    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0]?.from).toEqual({
      state: "CLOSED",
      facts: { sealedAt: null },
    });
  });

  it("does not invent a lossy fact for an unrepresentable non-null precondition", () => {
    const sf = makeSourceFile(`
      function publishDraft(draft: any): void {
        if (draft.stage !== DraftStage.READY) {
          throw new InvalidStateError("not ready");
        }
        if (draft.approvedAt === null) {
          throw new InvalidStateError("not approved");
        }
        draft.stage = DraftStage.PUBLISHED;
      }
    `);
    const result = normalize(
      extractStatusAssignments(sf, "src/draft.ts"),
      extractFactAssignments(sf, "src/draft.ts"),
      extractGuards(sf, "src/draft.ts"),
      [],
    );

    expect(result.transitions[0]?.from).toEqual({ state: "READY", facts: {} });
    expect(result.transitions[0]?.guards).toContainEqual({
      field: "approvedAt",
      operator: "eq",
      value: null,
    });
  });
});

// ---------------------------------------------------------------------------
// extractNegativeTests
// ---------------------------------------------------------------------------

describe("extractNegativeTests", () => {
  it("extracts a negative test with toThrow()", () => {
    const sf = makeTestFile(`
      import { describe, it, expect } from "vitest";
      describe("widgetService", () => {
        it("rejects activation of a DELETED widget", () => {
          const widget = getDeletedWidget();
          expect(() => activateWidget(widget)).toThrow(InvalidStateError);
        });
      });
    `);
    const tests = extractNegativeTests(sf, "src/__tests__/widget.test.ts");
    expect(tests.length).toBeGreaterThanOrEqual(1);
    const t = tests[0]!;
    expect(t.expectsThrow).toBe(true);
    expect(t.testName).toContain("DELETED");
    expect(t.testedOperation).toBe("activateWidget");
    expect(t.suiteName).toBe("widgetService");
  });

  it("extracts referenced state values from test body", () => {
    const sf = makeTestFile(`
      import { describe, it, expect } from "vitest";
      describe("taskService", () => {
        it("cannot complete a PENDING task without review", () => {
          const task = createTask();
          expect(() => completeTask(task)).toThrow();
          expect(task.status).toBe(TaskStatus.PENDING);
        });
      });
    `);
    const tests = extractNegativeTests(sf, "src/__tests__/task.test.ts");
    expect(tests.length).toBeGreaterThanOrEqual(1);
    const t = tests.find(x => x.testedOperation === "completeTask");
    expect(t).toBeDefined();
    expect(t!.referencedStates).toContain("PENDING");
  });

  it("does not extract positive tests without toThrow()", () => {
    const sf = makeTestFile(`
      import { describe, it, expect } from "vitest";
      describe("widgetService", () => {
        it("activates a widget", () => {
          const widget = createWidget();
          activateWidget(widget);
          expect(widget.state).toBe(WidgetState.ACTIVE);
        });
      });
    `);
    const tests = extractNegativeTests(sf, "src/__tests__/widget.test.ts");
    expect(tests).toHaveLength(0);
  });
});
