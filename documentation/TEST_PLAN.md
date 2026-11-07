# Stage 4 integrated acceptance tests

## Backend automated checks
Run these before the Wokwi demonstration:

1. From `backend/`, run `npm test`. All validation and MQTT-topic tests must pass.
2. Start the backend with a temporary database, for example:
   `DB_PATH=./data/test.sqlite PORT=3100 npm start`.
3. `GET /api/health` returns `ok: true` and the current `broker_connected` value.
4. Publish synthetic telemetry to the configured topic and confirm it appears
   in `GET /api/latest` and `GET /api/history`.
5. Confirm an oversized or malformed payload is rejected without crashing the
   process.
6. Restart the backend and confirm the retained telemetry replay does not create
   a duplicate database row.

## Wokwi / browser acceptance checks
1. Firmware boots and reports SD status.
2. ESP32 joins Wokwi-GUEST (network access must be enabled in Wokwi).
3. ESP32 connects to MQTT broker and publishes retained `online` status.
4. Backend connects and subscribes to the device's telemetry/events/status topics.
5. Telemetry arrives and passes schema validation every 5 seconds.
6. Dashboard updates all sensor and state cards; the connection pill shows
   `DEVICE ONLINE`, not `BROKER OFFLINE`.
7. Charts append no more than 60 latest samples and render without browser
   console errors. Chart.js is loaded from `/vendor/chart.umd.min.js`.
8. Healthy SD and DHT rows are teal, failed rows are red, and unknown rows are
   amber.
9. Event panel displays pump/mode/tank/DHT events in newest-first order, with no
   duplicates after a browser reconnect.
10. Set the tank potentiometer below 15%: the pump stops and the tank LED turns
    on. Raise it to 16–19%: lockout remains. Raise it to 20% or more: lockout
    clears without chatter.
11. Move the AUTO/MANUAL switch quickly: the mode changes once after the
    debounce interval, not repeatedly.
12. Disconnect broker/Wi-Fi: local irrigation and tank lockout continue.
13. Restore connectivity: telemetry and dashboard recover automatically.
14. Stop telemetry for longer than `STALE_AFTER_SECONDS`: the dashboard shows
    `DEVICE STALE` and an old database row is not shown as fresh.
15. Confirm no remote command topic or remote pump-control UI exists.

Not executed automatically: the Wokwi compile and browser demonstration must be
run in the user's Wokwi/browser/Node environment.
