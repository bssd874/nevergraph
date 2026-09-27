# @nevergraph/graph

The graph engine treats a state as the pair of its lifecycle `state` and all
of its `facts`. State IDs are JSON strings whose fact keys are sorted, so fact
insertion order cannot change identity.

`StateTransition.to.facts` is a patch. Applying a transition preserves every
unspecified current fact, overwrites explicitly supplied values, and preserves
an explicit `null` as a real clearing value.

The bounded search uses deterministic breadth-first traversal. `unreachable`
means the modeled reachable state space was completely exhausted. A search
that encounters an unexplored state beyond `maxDepth` or
`maxVisitedStates` returns `limit_reached`, never `unreachable`.
