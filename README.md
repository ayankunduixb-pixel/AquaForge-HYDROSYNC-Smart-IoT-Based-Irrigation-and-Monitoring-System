# AquaForge / HYDROSYNC — Stage 4 Complete Package

## Important Wokwi DHT library correction
The Wokwi package name is **DHT sensor library for ESPx**. The C++ header remains `DHTesp.h`. These are intentionally different. Do not put `DHTesp` in `libraries.txt`.

## Contents
- `Wokwi_Project_Files/`: ready-to-copy `sketch.ino`, `diagram.json`, `libraries.txt`.
- `firmware/`: ESP32 Stage 4 firmware and dependency list.
- `wokwi/`: circuit and Wokwi notes.
- `backend/`: Node.js MQTT subscriber, Express API, SQLite, Socket.IO and dashboard.
  Chart.js is vendored in `backend/public/vendor/`, so the dashboard does not
  need a public CDN.
- `config/`: MQTT topic and telemetry contract.
- `documentation/`: installation, architecture, pinout and test plan.
- `THIRD_PARTY_NOTICES.md`: reuse and licensing notes.
- `THIRD_PARTY_LICENSES/`: upstream license texts.

## Quick start
1. Copy all three files in `Wokwi_Project_Files/` into the matching Wokwi project tabs.
2. In `backend/`, copy `.env.example` to `.env`, run `npm install`, then `npm start`
   (Node.js 20 or newer; tested with Node.js 24 and `better-sqlite3` 12).
3. Open `http://localhost:3000`.

Run the backend unit tests with `npm test` from `backend/`.

## Stage 4 boundaries
Read-only remote monitoring. No remote pump-control topic or command is implemented. Tank lockout and irrigation decisions remain local on the ESP32. The public HiveMQ broker is for synthetic Wokwi demo data only.

## Behaviour notes
- Tank lockout engages below 15% and recovers at 20% to avoid relay chatter.
- The AUTO/MANUAL and manual-request switches are debounced.
- The Wokwi diagram starts in AUTO with the manual request off.
- The dashboard shows stale data as stale instead of treating an old database
  row as a live reading.
- Firmware topics are derived from `DEVICE_ID`, keeping the topic root and the
  JSON `device` field in sync.

## Validation status
- Wokwi JSON parses and the duplicate Wokwi file sets are byte-identical.
- Backend unit tests, SQLite ingestion, REST API and MQTT ingestion were checked
  with synthetic telemetry.
- The firmware has not been compiled in the user's Wokwi session, and the final
  end-to-end Wokwi/browser demonstration must still be run there.
