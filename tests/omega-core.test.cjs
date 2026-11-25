const test = require("node:test");
const assert = require("node:assert/strict");
global.window = global;
require("../omega-core.js");

test("Omega familiarity remains finite and bounded", () => {
  const field = new OmegaField();
  for (let i = 0; i < 80; i++) {
    const s = field.observe({ x: (i % 10) / 9, y: ((i * 3) % 10) / 9, target: "content", confidence: 0.8, dwell: 100 });
    assert.ok(Number.isFinite(s.last.familiarity));
    assert.ok(s.last.familiarity >= 0 && s.last.familiarity <= 1);
  }
});

test("admission never exceeds the configured abstract budget", () => {
  for (const policy of ["uniform", "topological", "temporal"]) {
    const field = new OmegaField({ budget: 25, policy });
    for (let i = 0; i < 20; i++) {
      const s = field.observe({ x: 0.2 + i / 30, y: 0.7, target: "link", confidence: 0.9, dwell: 900 });
      assert.ok(s.last.used <= s.last.budget);
    }
  }
});

test("episodic memory is bounded to 24 events", () => {
  const field = new OmegaField({ budget: 100 });
  for (let i = 0; i < 40; i++) field.observe({ x: 0.5, y: 0.5, target: "media", confidence: 0.9, dwell: 1000 });
  assert.equal(field.snapshot().memory.length, 24);
});

test("configuration changes affect subsequent snapshots", () => {
  const field = new OmegaField();
  const s = field.configure({ policy: "temporal", budget: 55, plasticity: false });
  assert.equal(s.settings.policy, "temporal");
  assert.equal(s.settings.budget, 55);
  assert.equal(s.settings.plasticity, false);
});
