/**
 * Internal raw observations produced by ts-morph extractors before
 * normalization into @nevergraph/schemas types.
 *
 * These types are package-private. Public consumers use EvidenceItem and
 * StateTransition from @nevergraph/schemas.
 */

/** A single state-property assignment, e.g. `entity.status = Enum.VALUE` */
export interface RawStatusAssignment {
  /** Owning function name */
  functionName: string;
  /** Object receiving the assignment, e.g. "order" */
  objectName: string;
  /** Property being assigned, e.g. "status" */
  propertyName: string;
  /** Enum identifier, e.g. "OrderStatus" */
  enumName: string;
  /** Enum member, e.g. "PAID" */
  enumMember: string;
  file: string;
  line: number;
}

/** A single lifecycle fact mutation, e.g. `entity.paidAt = new Date()` or `entity.x = null` */
export interface RawFactAssignment {
  functionName: string;
  objectName: string;
  propertyName: string;
  /** Normalized value: true for non-null assignment, null for null literal */
  value: true | null;
  file: string;
  line: number;
}

/**
 * A simple guard condition extracted from a function entry check.
 *
 * Supported grammar variants:
 *   - entity.prop !== Enum.VALUE  (operator: "neq", comparison guard)
 *   - entity.prop === Enum.VALUE  (operator: "eq", comparison guard)
 *   - entity.prop !== Enum.A && entity.prop !== Enum.B  (multi-neq AND — whitelist inversion)
 *   - entity.prop === Enum.VALUE  inside a standalone throw-if-eq guard
 */
export interface RawGuard {
  functionName: string;
  /** The guarded object.property, e.g. "order.status" */
  subject: string;
  /** Property name only, e.g. "status" */
  propertyName: string;
  /** Operator as extracted */
  operator: "eq" | "neq";
  /** Enum identifier if a qualified name, else raw string */
  enumName: string | null;
  /** Enum member or raw value */
  value: string;
  /** Whether a throw statement exists inside this guard body */
  throws: boolean;
  /** Error class name if throw is `new ErrorClass(...)` */
  throwsClass: string | null;
  /**
   * For multi-value guards (AND chain of neq), additional rejected values.
   * When non-empty, this guard means: reject all values NOT in the allowed set.
   * The allowed set is all enum members MINUS { value, ...additionalRejected }.
   */
  additionalRejected: string[];
  file: string;
  line: number;
}

/** A negative test observation from Vitest source */
export interface RawNegativeTest {
  /** describe() block name */
  suiteName: string;
  /** it() / test() name */
  testName: string;
  /** Detected operation being tested (function called inside the expect wrapper) */
  testedOperation: string | null;
  /** Whether expect(...).toThrow() is present */
  expectsThrow: boolean;
  /** Status/enum values referenced in the test body (best-effort) */
  referencedStates: string[];
  file: string;
  line: number;
}
