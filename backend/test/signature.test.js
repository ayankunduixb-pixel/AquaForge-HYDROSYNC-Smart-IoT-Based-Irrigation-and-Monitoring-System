const test = require("node:test");
const assert = require("node:assert/strict");
const { telemetrySignature } = require("../src/signature");

const payload = {
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

test("JSON booleans and SQLite 1/0 produce the same signature", () => {
  const dbRow = {
    ...payload,
    dht_ok: 1,
    manual_request: 0,
    tank_lockout: 0,
    sd_ok: 1
  };
  assert.equal(telemetrySignature(payload), telemetrySignature(dbRow));
});

test("a different uptime or sensor value changes the signature", () => {
  assert.notEqual(
    telemetrySignature(payload),
    telemetrySignature({ ...payload, uptime_ms: 130000 })
  );
  assert.notEqual(
    telemetrySignature(payload),
    telemetrySignature({ ...payload, soil_pct: 33 })
  );
});

test("null DHT values are treated the same for payloads and DB rows", () => {
  const nullPayload = { ...payload, temp_c: null, humidity_pct: null, dht_ok: false };
  const nullRow = { ...nullPayload, dht_ok: 0 };
  assert.equal(telemetrySignature(nullPayload), telemetrySignature(nullRow));
});
