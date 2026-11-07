# Third-party notice and reuse notes

This package uses or adapts the following third-party work. This file is a
practical inventory, not legal advice; review the upstream licenses before
redistributing or deploying commercially.

## Upstream architecture reference

The Stage 4 Node.js/MQTT/SQLite/Socket.IO/Chart.js architecture was adapted
from the public MIT-licensed repository:

https://github.com/danieladarve/greenhouse-monitor

The upstream README describes an ESP32 -> MQTT -> Node.js -> SQLite -> Socket.IO
-> Chart.js architecture and a Wokwi simulation. The MIT license text from that
repository is included in `THIRD_PARTY_LICENSES/greenhouse-monitor/LICENSE`.

HYDROSYNC-specific files, schemas, firmware integration, UI structure and
documentation in this package have been adapted for the user's device ID,
sensor map, pump state, tank safety and read-only Stage 4 requirements.
This package does not include the upstream repository wholesale; the backend
and dashboard files here are HYDROSYNC-specific implementations using the
same general architecture. Review upstream license/attribution requirements
before redistributing any separately copied upstream source.

## Firmware libraries

| Library | Wokwi/Arduino name | License | Notes |
|---|---|---|---|
| DHTesp | DHT sensor library for ESPx | GPL-3.0 | Provides `DHTesp.h`. GPL text: `THIRD_PARTY_LICENSES/dhtesp/LICENSE.txt`. |
| PubSubClient | PubSubClient | MIT | MQTT client used by the sketch. |
| ArduinoJson | ArduinoJson | MIT | JSON serialization. |
| ESP32 Arduino core | esp32 | LGPL-2.1 | Platform core used by Wokwi. |

**GPL note:** DHTesp is GPL-3.0. The firmware source is provided here, but if
you distribute a compiled binary that links DHTesp, review the GPL-3.0 source
and notice obligations. Replacing DHTesp with a permissively licensed DHT driver
is an option for a closed-source product.

## Browser assets

| Asset | Version | License | Location |
|---|---:|---|---|
| Chart.js | 4.4.8 | MIT | `backend/public/vendor/chart.umd.min.js`; license in `THIRD_PARTY_LICENSES/chart.js/LICENSE.md` |

Chart.js is vendored locally so the dashboard does not depend on a public CDN.
The vendored file's SHA-384 is recorded in `backend/public/vendor/README.md`.

## Backend npm dependencies

These are installed from npm and are not copied into this repository. Their
license texts are included in their respective packages under
`backend/node_modules/` after `npm install`.

| Package | License |
|---|---|
| better-sqlite3 | MIT |
| dotenv | BSD-2-Clause |
| express | MIT |
| express-rate-limit | MIT |
| helmet | MIT |
| mqtt | MIT |
| socket.io | MIT |

## Upstream repository

https://github.com/danieladarve/greenhouse-monitor
