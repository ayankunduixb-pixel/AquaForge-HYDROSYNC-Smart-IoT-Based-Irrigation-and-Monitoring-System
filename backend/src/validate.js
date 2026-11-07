const DEVICE_RE = /^[a-zA-Z0-9_-]{1,64}$/;
function isValidDevice(value) {
  return typeof value === "string" && DEVICE_RE.test(value);
}
function finiteRange(v, min, max) {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}
function validateTelemetry(x) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return "payload must be a JSON object";
  if (!isValidDevice(x.device)) return "invalid device";
  if (!Number.isInteger(x.uptime_ms) || x.uptime_ms < 0) return "invalid uptime_ms";
  if (!finiteRange(x.soil_pct, 0, 100)) return "invalid soil_pct";
  if (!finiteRange(x.tank_pct, 0, 100)) return "invalid tank_pct";
  if (!(x.temp_c === null || finiteRange(x.temp_c, -40, 80))) return "invalid temp_c";
  if (!(x.humidity_pct === null || finiteRange(x.humidity_pct, 0, 100))) return "invalid humidity_pct";
  if (typeof x.dht_ok !== "boolean") return "invalid dht_ok";
  if (!["AUTO","MANUAL"].includes(x.mode)) return "invalid mode";
  if (typeof x.manual_request !== "boolean") return "invalid manual_request";
  if (!["ON","OFF"].includes(x.pump)) return "invalid pump";
  if (typeof x.tank_lockout !== "boolean" || typeof x.sd_ok !== "boolean") return "invalid safety/storage flags";
  if (x.dht_ok && (x.temp_c === null || x.humidity_pct === null)) return "DHT fields missing while dht_ok=true";
  return null;
}
function validateEvent(x) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return "event must be object";
  if (!isValidDevice(x.device)) return "invalid device";
  if (!Number.isInteger(x.uptime_ms) || x.uptime_ms < 0) return "invalid uptime_ms";
  if (typeof x.event !== "string" || x.event.length === 0 || x.event.length > 40) return "invalid event";
  if (typeof x.detail !== "string" || x.detail.length > 120) return "invalid detail";
  return null;
}
module.exports = { isValidDevice, validateTelemetry, validateEvent };
