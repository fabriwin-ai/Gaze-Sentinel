# Omega-SNNF Experimental Core v1.2

This iteration replaces the first fixed familiarity heuristic with an explicit, inspectable transition-learning field.

## What is implemented
- 49 spatial units with decaying membrane state, activation, and spike counters.
- A directed 49×48 synapse graph. Each edge has a weight, eligibility trace, and update counter.
- Online transition learning: repeated navigation transitions strengthen source→destination edges; inactive alternatives decay.
- Prediction from the outgoing learned transition distribution, with normalized spatial prediction error.
- A task-admission pass that ranks prediction, memory, context, and plasticity work and checks each cost independently against an abstract budget.
- Bounded episodic event memory and a resetLearning() method for controlled experiments.

## Important scientific boundary
This is an online associative transition learner with simplified spiking-style state variables. It is **not** a biologically validated spiking neural network, a calibrated eye tracker, or evidence of cognition. The membrane/spike variables are engineering abstractions. Prediction is a weighted distribution over previously learned transitions.

## Run tests
Requires Node.js 18+:
```sh
node --test tests/omega-core.test.cjs
node tests/benchmark.cjs
```

## First benchmark protocol
1. Generate deterministic navigation sequences with repeated transitions and held-out transitions.
2. Compare plasticity ON against plasticity OFF, using identical sequences.
3. Record next-node top-1 accuracy, normalized spatial prediction error, learned-synapse count, updates, and runtime.
4. Repeat with shuffled transitions to detect memorization and leakage.
5. Do not claim improvement until held-out results beat a frequency baseline across multiple seeds.

The budget values are abstract admission units, not CPU time, energy, or memory measurements.
