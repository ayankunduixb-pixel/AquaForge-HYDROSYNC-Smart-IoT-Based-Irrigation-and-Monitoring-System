const test = require("node:test");
const assert = require("node:assert/strict");
const { isValidDevice, validateTelemetry, validateEvent } = require("../src/validate");

const telemetry = {
  device: "aqua5-479928426260819969",
  uptime_ms: 125000,
  soil_pct: 32.5,
  tank_pct: 76,
  temp_c: 28.5,
  humidity_pct: 65.2,
  dht_ok: true,
  mode: "AUTO",
  manual_request: false,
  pump: "ON",
  tank_lockout: false,
  sd_ok: true
};

test("valid telemetry passes validation", () => {
  assert.equal(validateTelemetry(telemetry), null);
});

test("telemetry allows null DHT values only when dht_ok is false", () => {
  assert.equal(validateTelemetry({ ...telemetry, dht_ok: false, temp_c: null, humidity_pct: null }), null);
  assert.match(
    validateTelemetry({ ...telemetry, dht_ok: true, temp_c: null, humidity_pct: null }),
    /DHT fields missing/
  );
});

test("telemetry rejects out-of-range and malformed fields", () => {
  assert.match(validateTelemetry({ ...telemetry, soil_pct: 101 }), /soil_pct/);
  assert.match(validateTelemetry({ ...telemetry, mode: "REMOTE" }), /mode/);
  assert.match(validateTelemetry({ ...telemetry, pump: "MAYBE" }), /pump/);
  assert.match(validateTelemetry({ ...telemetry, device: "../bad" }), /device/);
  assert.match(validateTelemetry(null), /JSON object/);
});

test("valid events pass and malformed events fail", () => {
  assert.equal(validateEvent({
    device: telemetry.device,
    uptime_ms: 42,
    event: "PUMP_EVENT",
    detail: "ON:AUTO_SOIL_DEMAND"
  }), null);
  assert.match(validateEvent({ device: telemetry.device, uptime_ms: 1, event: "", detail: "" }), /event/);
  assert.match(validateEvent({ device: telemetry.device, uptime_ms: 1, event: "X", detail: "x".repeat(121) }), /detail/);
});

test("device IDs are restricted to safe topic characters", () => {
  assert.equal(isValidDevice("aqua5-479928426260819969"), true);
  assert.equal(isValidDevice("bad/device"), false);
  assert.equal(isValidDevice(""), false);
  assert.equal(isValidDevice("x".repeat(65)), false);
});
