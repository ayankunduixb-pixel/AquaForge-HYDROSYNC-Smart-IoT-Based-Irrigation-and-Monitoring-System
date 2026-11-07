# Stage 4 architecture

1. ESP32 retains local Stage 2 control and Stage 3 SD logging.
2. ESP32 publishes telemetry and events to MQTT.
3. Node.js backend subscribes to the exact telemetry/events/status topics,
   validates payloads, rejects topic/device mismatches and writes SQLite.
4. Socket.IO forwards validated updates to the browser dashboard.
5. Browser only displays telemetry; it cannot publish pump commands.

Network outages must not disable local sensor reads, pump control or tank
interlock. The MQTT public broker is only for synthetic Wokwi demonstrations.

The dashboard uses only local browser assets: Chart.js is vendored under
`backend/public/vendor/` and served by Express, so no CDN is required. Socket.IO
messages and REST history carry database IDs so reconnects do not duplicate
chart samples or events. Freshness is based on the stored `received_at`
timestamp, not on when the browser happened to fetch an old row.
