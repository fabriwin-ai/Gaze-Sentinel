const test = require("node:test");
const assert = require("node:assert/strict");
global.window = global;
require("../omega-core.js");

test("field exposes explicit directed synapses between distinct nodes", () => {
  const field = new OmegaField();
  const s = field.snapshot();
  assert.equal(s.nodes.length, 49);
  assert.equal(s.synapseCount, 49 * 48);
  assert.ok(field.synapses.every(e => e.from !== e.to && e.weight === 0));
});

test("plasticity learns a repeated navigation transition", () => {
  const field = new OmegaField({ budget: 100, learningRate: 0.2, plasticity: true });
  const A = { x: 0.1, y: 0.1, target: "link", confidence: 0.95, dwell: 900 };
  const B = { x: 0.9, y: 0.9, target: "content", confidence: 0.95, dwell: 900 };
  for (let i = 0; i < 30; i++) { field.observe(A); field.observe(B); }
  const a = field.encode(A).winner.id, b = field.encode(B).winner.id;
  const learned = field.outgoing[a].find(e => e.to === b);
  assert.ok(learned.weight > 0.5, "repeated A→B transition should strengthen its synapse");
  const prediction = field.predictFrom(a);
  assert.equal(prediction.node, b);
  assert.ok(prediction.confidence > 0.8);
});

test("disabling plasticity prevents synaptic weight updates", () => {
  const field = new OmegaField({ budget: 100, plasticity: false });
  for (let i = 0; i < 12; i++) {
    field.observe({ x: 0.1, y: 0.1, target: "link", confidence: 1, dwell: 1000 });
    field.observe({ x: 0.9, y: 0.9, target: "content", confidence: 1, dwell: 1000 });
  }
  assert.equal(field.updates, 0);
  assert.equal(field.snapshot().learnedSynapses, 0);
});

test("admission respects budget without starving later low-cost tasks", () => {
  const field = new OmegaField({ budget: 22 });
  const a = field.admit({ novelty: "novel", predictionError: 1, confidence: 1, dwell: 1000 });
  assert.ok(a.used <= a.budget);
  assert.ok(a.admitted.length >= 1);
});

test("episodic memory remains bounded to 24 events", () => {
  const field = new OmegaField({ budget: 100 });
  for (let i = 0; i < 50; i++) field.observe({ x: 0.5, y: 0.5, target: "media", confidence: 0.9, dwell: 1000 });
  assert.equal(field.snapshot().memory.length, 24);
});

test("prediction error is bounded and resetLearning clears learned weights", () => {
  const field = new OmegaField({ budget: 100 });
  for (let i = 0; i < 10; i++) {
    field.observe({ x: 0.2, y: 0.2, target: "link", confidence: 1, dwell: 1000 });
    field.observe({ x: 0.8, y: 0.8, target: "content", confidence: 1, dwell: 1000 });
  }
  assert.ok(field.last.predictionError >= 0 && field.last.predictionError <= 1);
  field.resetLearning();
  assert.equal(field.snapshot().learnedSynapses, 0);
});