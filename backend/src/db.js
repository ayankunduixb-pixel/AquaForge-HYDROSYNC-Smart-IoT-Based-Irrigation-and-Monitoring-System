const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");

const dbPath = process.env.DB_PATH || "./data/hydrosync.sqlite";
const absolute = path.resolve(__dirname, "..", dbPath);
fs.mkdirSync(path.dirname(absolute), { recursive: true });
const db = new Database(absolute);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("busy_timeout = 5000");
db.exec(`
CREATE TABLE IF NOT EXISTS telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  uptime_ms INTEGER,
  soil_pct REAL NOT NULL,
  tank_pct REAL NOT NULL,
  temp_c REAL,
  humidity_pct REAL,
  dht_ok INTEGER NOT NULL,
  mode TEXT NOT NULL,
  manual_request INTEGER NOT NULL,
  pump TEXT NOT NULL,
  tank_lockout INTEGER NOT NULL,
  sd_ok INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telemetry_device_time ON telemetry(device, id DESC);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  uptime_ms INTEGER,
  event TEXT NOT NULL,
  detail TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_device_time ON events(device, id DESC);
CREATE TABLE IF NOT EXISTS device_status (
  device TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`);
const insertTelemetry = db.prepare(`INSERT INTO telemetry
(device, received_at, uptime_ms, soil_pct, tank_pct, temp_c, humidity_pct, dht_ok,
 mode, manual_request, pump, tank_lockout, sd_ok)
VALUES (@device, @received_at, @uptime_ms, @soil_pct, @tank_pct, @temp_c, @humidity_pct,
 @dht_ok, @mode, @manual_request, @pump, @tank_lockout, @sd_ok)`);
const insertEvent = db.prepare(`INSERT INTO events(device, received_at, uptime_ms, event, detail)
VALUES (@device, @received_at, @uptime_ms, @event, @detail)`);
const latest = db.prepare(`SELECT * FROM telemetry WHERE device=? ORDER BY id DESC LIMIT 1`);
const history = db.prepare(`SELECT * FROM telemetry WHERE device=? ORDER BY id DESC LIMIT ?`);
const recentEvents = db.prepare(`SELECT * FROM events WHERE device=? ORDER BY id DESC LIMIT ?`);
const setStatus = db.prepare(`INSERT INTO device_status(device,status,received_at)
VALUES(@device,@status,@received_at)
ON CONFLICT(device) DO UPDATE SET status=excluded.status, received_at=excluded.received_at`);
const getStatus = db.prepare(`SELECT * FROM device_status WHERE device=?`);
module.exports = { db, insertTelemetry, insertEvent, latest, history, recentEvents, setStatus, getStatus };
