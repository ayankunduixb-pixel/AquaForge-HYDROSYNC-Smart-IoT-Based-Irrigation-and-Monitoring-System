// Canonical signature for a telemetry sample. It normalizes JSON booleans and
// SQLite 1/0 values so a retained replay can be compared with the last row that
// was already stored before a backend restart.

function nullableNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function telemetrySignature(row) {
  return JSON.stringify([
    Number(row.uptime_ms),
    Number(row.soil_pct),
    Number(row.tank_pct),
    nullableNumber(row.temp_c),
    nullableNumber(row.humidity_pct),
    Boolean(row.dht_ok),
    String(row.mode),
    Boolean(row.manual_request),
    String(row.pump),
    Boolean(row.tank_lockout),
    Boolean(row.sd_ok)
  ]);
}

module.exports = { telemetrySignature };
