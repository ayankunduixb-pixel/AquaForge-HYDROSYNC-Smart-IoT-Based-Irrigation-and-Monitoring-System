const mqtt = require("mqtt");
const { insertTelemetry, insertEvent, latest, setStatus } = require("./db");
const { isValidDevice, validateTelemetry, validateEvent } = require("./validate");
const { MAX_PAYLOAD_BYTES, deviceFromRoot, normalizeRoot, parseTopic, topicMap } = require("./topics");
const { telemetrySignature } = require("./signature");

function startMqtt(io) {
  const url = process.env.MQTT_URL || "mqtt://broker.hivemq.com:1883";
  const root = normalizeRoot(process.env.MQTT_TOPIC_ROOT ||
    "aquaforge/hydrosync/aqua5-479928426260819969");
  const topicDevice = deviceFromRoot(root);
  const topics = topicMap(root);
  const topicDeviceValid = isValidDevice(topicDevice);

  if (!topicDeviceValid) {
    console.error("[MQTT] MQTT_TOPIC_ROOT must end with a valid device ID:", root);
  }

  const client = mqtt.connect(url, {
    clientId: `hydrosync-backend-${Math.random().toString(16).slice(2, 10)}`,
    reconnectPeriod: 3000,
    connectTimeout: 8000,
    clean: true
  });

  // The firmware publishes retained telemetry. A backend restart therefore
  // replays the last sample; seed the signature from the newest stored row so
  // the replay is ignored even after the process restarts.
  const previousRow = latest.get(topicDevice);
  let lastTelemetrySignature = previousRow ? telemetrySignature(previousRow) : "";

  const emitBroker = (connected, extra = {}) => {
    io.emit("broker-status", { connected, ...extra });
  };

  client.on("connect", () => {
    console.log(`[MQTT] connected to ${url}`);
    client.subscribe([topics.telemetry, topics.events, topics.status], { qos: 0 }, err => {
      if (err) console.error("[MQTT] subscribe error:", err.message);
      else console.log(`[MQTT] subscribed under ${root}/#`);
    });
    emitBroker(true);
  });
  client.on("reconnect", () => emitBroker(false, { reconnecting: true }));
  client.on("offline", () => emitBroker(false, { reconnecting: true }));
  client.on("close", () => emitBroker(false));
  client.on("error", err => console.error("[MQTT]", err.message));

  client.on("message", (topic, buf) => {
    if (!topicDeviceValid) return;
    if (buf.length > MAX_PAYLOAD_BYTES) {
      console.warn(`[MQTT] discarded oversized payload (${buf.length} bytes) on ${topic}`);
      return;
    }

    const leaf = parseTopic(topic, root);
    if (!leaf) {
      console.warn("[MQTT] ignored unexpected topic:", topic);
      return;
    }

    const text = buf.toString("utf8");

    if (leaf === "status") {
      const status = text.trim();
      if (!["online", "offline"].includes(status)) {
        console.warn("[MQTT] status rejected: expected online/offline");
        return;
      }
      const receivedAt = new Date().toISOString();
      try {
        setStatus.run({ device: topicDevice, status, received_at: receivedAt });
      } catch (err) {
        console.error("[MQTT] status DB write failed:", err.message);
        return;
      }
      io.emit("device-status", {
        device: topicDevice,
        status,
        received_at: receivedAt
      });
      return;
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      console.warn("[MQTT] discarded invalid JSON on", topic);
      return;
    }

    if (leaf === "telemetry") {
      const error = validateTelemetry(payload);
      if (error) {
        console.warn("[MQTT] telemetry rejected:", error);
        return;
      }
      if (payload.device !== topicDevice) {
        console.warn("[MQTT] telemetry device/topic mismatch");
        return;
      }

      const signature = telemetrySignature(payload);
      if (signature === lastTelemetrySignature) {
        console.log("[MQTT] duplicate retained telemetry ignored");
        return;
      }

      const receivedAt = new Date().toISOString();
      const row = {
        ...payload,
        received_at: receivedAt,
        dht_ok: payload.dht_ok ? 1 : 0,
        manual_request: payload.manual_request ? 1 : 0,
        tank_lockout: payload.tank_lockout ? 1 : 0,
        sd_ok: payload.sd_ok ? 1 : 0
      };

      let info;
      try {
        info = insertTelemetry.run(row);
      } catch (err) {
        console.error("[MQTT] telemetry DB write failed:", err.message);
        return;
      }
      lastTelemetrySignature = signature;
      io.emit("telemetry", {
        id: Number(info.lastInsertRowid),
        ...payload,
        received_at: receivedAt
      });
      return;
    }

    // events
    const error = validateEvent(payload);
    if (error) {
      console.warn("[MQTT] event rejected:", error);
      return;
    }
    if (payload.device !== topicDevice) {
      console.warn("[MQTT] event device/topic mismatch");
      return;
    }

    const receivedAt = new Date().toISOString();
    let info;
    try {
      info = insertEvent.run({ ...payload, received_at: receivedAt });
    } catch (err) {
      console.error("[MQTT] event DB write failed:", err.message);
      return;
    }
    io.emit("event", {
      id: Number(info.lastInsertRowid),
      ...payload,
      received_at: receivedAt
    });
  });

  return client;
}

module.exports = { startMqtt };
