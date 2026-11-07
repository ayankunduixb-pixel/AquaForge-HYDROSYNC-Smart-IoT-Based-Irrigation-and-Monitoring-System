// Pure topic helpers. Keeping these free of MQTT/database imports makes them
// easy to unit-test and prevents a malformed topic from being attributed to the
// wrong device.

const MAX_PAYLOAD_BYTES = 4096;

function normalizeRoot(root) {
  return String(root || "").trim().replace(/\/+$/, "");
}

function topicMap(root) {
  const base = normalizeRoot(root);
  return {
    telemetry: `${base}/telemetry`,
    events: `${base}/events`,
    status: `${base}/status`
  };
}

function deviceFromRoot(root) {
  const parts = normalizeRoot(root).split("/");
  return parts[parts.length - 1] || "";
}

function parseTopic(topic, root) {
  for (const [leaf, expected] of Object.entries(topicMap(root))) {
    if (topic === expected) return leaf;
  }
  return null;
}

module.exports = {
  MAX_PAYLOAD_BYTES,
  normalizeRoot,
  topicMap,
  deviceFromRoot,
  parseTopic
};
