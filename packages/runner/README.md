# @nevergraph/runner

The runner converts a Phase 3 `found` result into a shared-schema `Witness`,
passes that witness through an explicit domain test adapter, and executes the
generated negative-specification regression with real Vitest.

An assertion failure in a generated regression is `reproduced`; a passing
regression is `not_reproduced`; compile, import, setup, spawn, timeout, and
unparseable-result failures are `execution_error`. Phase 4 does not fabricate
repair or verification state from the later proof lifecycle.
