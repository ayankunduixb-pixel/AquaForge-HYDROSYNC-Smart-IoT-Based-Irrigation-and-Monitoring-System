# Installation

## Wokwi project
Copy the three files in `Wokwi_Project_Files/` into the matching Wokwi tabs: `sketch.ino`, `diagram.json`, and `libraries.txt`. Save and start the simulation.

The `libraries.txt` contents must be exactly:

```text
DHT sensor library for ESPx
PubSubClient
ArduinoJson
```

The sketch keeps `#include <DHTesp.h>`. The Wokwi library package is named `DHT sensor library for ESPx`; this package provides the DHTesp.h header. Do not add `DHTesp` as a dependency name.

The supplied diagram starts the mode switch in **AUTO** (right) and the manual
request switch **OFF** (left). Both switches have Wokwi bounce disabled, and the
firmware also debounces them in software.

## Backend
Requirements: Node.js 20 or newer, npm, internet. Node.js 24 and
`better-sqlite3` 12 are tested. From `backend/`:

```text
copy .env.example .env
npm install
npm start
```

Open `http://localhost:3000`. The server listens on `0.0.0.0` by default; set
`HOST=127.0.0.1` in `.env` if you want to restrict it to the local machine.

Run `npm test` from `backend/` to execute the validation and topic unit tests.

Firmware and `.env` must use the same topic root: `aquaforge/hydrosync/aqua5-479928426260819969`.
The firmware builds this root from `DEVICE_ID`, so changing the device ID in one
place is enough. Change `MQTT_TOPIC_ROOT` and `DEVICE_ID` in `.env` to match.

The public HiveMQ broker is shared and unauthenticated; use only synthetic Wokwi data. Production requires private MQTT, TLS, authentication and ACLs.

## Dashboard assets
Chart.js 4.4.8 is vendored at `backend/public/vendor/chart.umd.min.js` and served
locally. No CDN access is required. See `backend/public/vendor/README.md` for the
source URL, hash and license.
