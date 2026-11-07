const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_PAYLOAD_BYTES,
  deviceFromRoot,
  normalizeRoot,
  parseTopic,
  topicMap
} = require("../src/topics");

const root = "aquaforge/hydrosync/aqua5-479928426260819969";

test("topic root normalization removes trailing slashes", () => {
  assert.equal(normalizeRoot(`${root}///`), root);
  assert.equal(normalizeRoot(`  ${root}/  `), root);
});

test("topic map uses the exact expected leaves", () => {
  assert.deepEqual(topicMap(root), {
    telemetry: `${root}/telemetry`,
    events: `${root}/events`,
    status: `${root}/status`
  });
});

test("topic parsing accepts only exact topics", () => {
  assert.equal(parseTopic(`${root}/telemetry`, root), "telemetry");
  assert.equal(parseTopic(`${root}/events`, root), "events");
  assert.equal(parseTopic(`${root}/status`, root), "status");
  assert.equal(parseTopic(`${root}/telemetry/extra`, root), null);
  assert.equal(parseTopic(`other/${root}/telemetry`, root), null);
  assert.equal(parseTopic(`${root}/commands`, root), null);
});

test("device ID is the final topic-root segment", () => {
  assert.equal(deviceFromRoot(root), "aqua5-479928426260819969");
  assert.equal(deviceFromRoot(`${root}/`), "aqua5-479928426260819969");
});

test("payload cap is a reasonable positive number", () => {
  assert.equal(Number.isInteger(MAX_PAYLOAD_BYTES), true);
  assert.ok(MAX_PAYLOAD_BYTES >= 1024);
});
