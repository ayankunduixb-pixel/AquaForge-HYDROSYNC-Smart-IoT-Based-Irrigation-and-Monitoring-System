# HYDROSYNC MQTT protocol

## Broker (Wokwi demonstration only)
- URL: `mqtt://broker.hivemq.com:1883`
- Authentication: none
- Payload: synthetic simulator telemetry only
- Shared/public broker: topic names are public, not private.

## Topic root
`aquaforge/hydrosync/aqua5-479928426260819969`

The firmware derives this root from `DEVICE_ID`; the backend derives the device
name from the final segment of `MQTT_TOPIC_ROOT`. They must match.

| Topic | Retained | QoS | Payload |
|---|---|---|---|
| `/telemetry` | yes | 0 | Telemetry JSON, every 5 seconds |
| `/status` | yes | 0 | `online`, or Last Will `offline` |
| `/events` | no | 0 | Event JSON on state changes |

The backend subscribes to exactly these three topics. It rejects unexpected
topics, payloads larger than 4 KiB, invalid JSON, and payloads whose `device`
does not match the topic root.

Retained telemetry is replayed after a backend restart. The backend remembers
the last accepted sample and does not insert a duplicate row for an identical
replay.

## Telemetry schema

```json
{
  "device": "aqua5-479928426260819969",
  "uptime_ms": 125000,
  "soil_pct": 32.0,
  "tank_pct": 76.0,
  "temp_c": 28.5,
  "humidity_pct": 65.2,
  "dht_ok": true,
  "mode": "AUTO",
  "manual_request": false,
  "pump": "ON",
  "tank_lockout": false,
  "sd_ok": true
}
```

`temp_c` and `humidity_pct` are `null` when the DHT22 read is invalid.
All pump commands are deliberately absent from the Stage 4 protocol.

## Status schema

Plain text, not JSON:

```text
online
offline
```

The firmware publishes retained `online` after connecting. The MQTT Last Will
publishes retained `offline` if the connection drops. The backend stores the
latest status with its own `received_at` timestamp.

## Event schema

```json
{
  "device": "aqua5-479928426260819969",
  "uptime_ms": 125000,
  "event": "PUMP_EVENT",
  "detail": "ON:AUTO_SOIL_DEMAND"
}
```

`event` is at most 40 characters and `detail` at most 120 characters. Events are
not retained because they describe transitions, not current state.

## Backend fan-out
Validated telemetry and events are stored in SQLite and emitted over Socket.IO
with their database `id` and a `received_at` timestamp. The dashboard uses those
IDs to deduplicate history and live messages after a reconnect.

## Stage 4 boundary
There is no command topic, no pump-control subscription and no remote-control
UI. The ESP32 remains authoritative for irrigation and the tank interlock.
