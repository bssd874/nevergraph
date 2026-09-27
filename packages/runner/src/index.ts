/** @nevergraph/runner — deterministic witness generation and execution. */

export { createWitness, type CreateWitnessInput } from "./witness.js";
export { generateRegressionTest } from "./generator.js";
export { runGeneratedTest, classifyVitestExecution } from "./executor.js";
export {
  generatedTestPath,
  persistProofExecution,
  persistWitness,
  proofExecutionPath,
  serializeProofExecution,
  serializeWitness,
  validateArtifactIdentifier,
  witnessArtifactPath,
} from "./artifacts.js";
export type {
  GenerateRegressionTestInput,
  GeneratedRegressionTest,
  ProofExecutionResult,
  ProofExecutionStatus,
  RunGeneratedTestInput,
  SafetyAssertion,
  VitestProcessOutput,
  WitnessTestAdapter,
  WitnessTestAdapterInput,
} from "./types.js";
