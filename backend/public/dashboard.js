const socket = io();
const $ = id => document.getElementById(id);

const MAX_SAMPLES = 60;
const MAX_EVENTS = 30;

const sampleRows = [];
const seenSamples = new Set();
const eventRows = [];
const seenEvents = new Set();

let staleAfterSeconds = 20;
let latestAt = 0;
let lastUpdateText = "Waiting for device…";
let brokerConnected = false;
let deviceOnline = false;
let initialHistoryLoaded = false;
let initialLoadPromise = null;

function setText(id, value) { $(id).textContent = value; }

function setHealth(id, text, ok) {
  const el = $(id);
  el.textContent = text;
  // SQLite stores booleans as 1/0, so a strict `ok === true` check would show
  // a healthy sensor as amber. Treat only null/undefined as unknown.
  el.style.color = ok === null || ok === undefined
    ? "var(--amber)"
    : ok ? "var(--teal)" : "var(--red)";
}

function setMeter(id, value) {
  const el = $(id);
  el.style.width = `${Math.max(0, Math.min(100, Number(value) || 0))}%`;
}

function fmt(v, digits = 1) {
  return Number.isFinite(Number(v)) ? Number(v).toFixed(digits) : "—";
}

function staleAfterMs() {
  return Math.max(1, Number(staleAfterSeconds) || 20) * 1000;
}

function receivedAtMs(row) {
  const parsed = Date.parse(row && row.received_at);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTime(row) {
  const parsed = receivedAtMs(row);
  return parsed ? new Date(parsed).toLocaleTimeString() : "—";
}

function sampleKey(row) {
  if (row.id !== null && row.id !== undefined) return `id:${row.id}`;
  return `row:${row.received_at || ""}|${row.uptime_ms ?? ""}`;
}

function compareSamples(a, b) {
  const ta = receivedAtMs(a);
  const tb = receivedAtMs(b);
  if (ta !== tb) return ta - tb;
  return (Number(a.id) || 0) - (Number(b.id) || 0);
}

function updateLastUpdateDisplay() {
  if (!latestAt) {
    setText("lastUpdate", "Waiting for device…");
    return;
  }
  const stale = Date.now() - latestAt >= staleAfterMs();
  setText("lastUpdate", stale ? `STALE · ${lastUpdateText}` : lastUpdateText);
}

function refreshConnectionDisplay() {
  const fresh = latestAt > 0 && (Date.now() - latestAt < staleAfterMs());
  const pill = $("connectionPill");

  let text;
  let className;
  let networkText;
  let networkOk;

  if (!brokerConnected) {
    text = "BROKER OFFLINE";
    className = "offline";
    networkText = "BROKER DISCONNECTED";
    networkOk = false;
  } else if (fresh) {
    text = "DEVICE ONLINE";
    className = "online";
    networkText = "DEVICE + BROKER ONLINE";
    networkOk = true;
  } else if (deviceOnline) {
    text = "DEVICE STALE";
    className = "offline";
    networkText = "BROKER CONNECTED · NO FRESH DATA";
    // Amber: the broker is healthy, but telemetry is not fresh.
    networkOk = null;
  } else {
    text = "WAITING FOR DEVICE";
    className = "offline";
    networkText = "BROKER CONNECTED · WAITING";
    networkOk = null;
  }

  pill.textContent = text;
  pill.className = `pill ${className}`;
  setHealth("networkStatus", networkText, networkOk);
  updateLastUpdateDisplay();
}

function pushSample(row, redraw = true) {
  const key = sampleKey(row);
  if (seenSamples.has(key)) return;
  seenSamples.add(key);

  sampleRows.push({
    key,
    id: row.id,
    received_at: row.received_at,
    label: formatTime(row),
    soil: Number(row.soil_pct),
    tank: Number(row.tank_pct),
    temp: row.temp_c == null ? null : Number(row.temp_c),
    humidity: row.humidity_pct == null ? null : Number(row.humidity_pct)
  });
  sampleRows.sort(compareSamples);

  if (sampleRows.length > MAX_SAMPLES) {
    const removed = sampleRows.splice(0, sampleRows.length - MAX_SAMPLES);
    for (const item of removed) seenSamples.delete(item.key);
  }
  if (redraw) updateCharts();
}

function renderReading(r, live = false) {
  if (!r) return;

  const parsed = receivedAtMs(r);
  // Live socket messages are fresh by definition. Historical/API rows must use
  // their stored timestamp so an old database row cannot look current.
  latestAt = live ? Date.now() : (parsed || Date.now());
  lastUpdateText = parsed ? new Date(parsed).toLocaleTimeString() : new Date().toLocaleTimeString();

  setText("soilValue", fmt(r.soil_pct));
  setMeter("soilBar", r.soil_pct);
  setText("tankValue", fmt(r.tank_pct));
  setMeter("tankBar", r.tank_pct);
  setText("tempValue", r.temp_c == null ? "—" : fmt(r.temp_c));
  setText("humidityValue", r.humidity_pct == null ? "—" : fmt(r.humidity_pct));
  setText("soilHint", r.soil_pct <= 30
    ? "Dry · automatic demand threshold"
    : r.soil_pct >= 45
      ? "Moist · automatic stop threshold"
      : "Within hysteresis band");
  setText("tankHint", r.tank_lockout
    ? "LOW LEVEL · SAFETY LOCKOUT"
    : "Water level sufficient");
  setText("dhtHint", r.dht_ok ? "DHT22 readings valid" : "DHT22 unavailable");
  setText("pumpState", r.pump === "ON" ? "Pump running" : "Pump stopped");
  setText("modeText", `Mode: ${r.mode}`);
  if (r.device) setText("deviceLabel", `DEVICE · ${String(r.device).split("-")[0].toUpperCase()}`);

  $("pumpBadge").textContent = r.pump;
  $("pumpBadge").className = `pill ${r.pump === "ON" ? "good" : "neutral"}`;
  $("pumpOrb").classList.toggle("on", r.pump === "ON");

  setHealth("tankSafety", r.tank_lockout ? "LOCKOUT" : "NORMAL", !r.tank_lockout);
  setHealth("sdStatus", r.sd_ok ? "AVAILABLE" : "UNAVAILABLE", r.sd_ok);
  setHealth("dhtStatus", r.dht_ok ? "HEALTHY" : "FAULT", r.dht_ok);

  deviceOnline = true;
  refreshConnectionDisplay();
  pushSample(r);
}

let waterChart;
let climateChart;

function initCharts() {
  if (!window.Chart) {
    console.error("Chart.js failed to load; charts are unavailable.");
    return;
  }
  const common = {
    responsive: true,
    animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { labels: { color: "#b7cacc", usePointStyle: true } } },
    scales: {
      x: { ticks: { color: "#78959a", maxTicksLimit: 7 }, grid: { color: "#203a42" } },
      y: { min: 0, max: 100, ticks: { color: "#78959a" }, grid: { color: "#203a42" } }
    }
  };

  waterChart = new Chart($("waterChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "Soil %", data: [], borderColor: "#5ed6c2", backgroundColor: "#5ed6c222", tension: 0.3 },
        { label: "Tank %", data: [], borderColor: "#58b8e8", backgroundColor: "#58b8e822", tension: 0.3 }
      ]
    },
    options: common
  });

  climateChart = new Chart($("climateChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "Temperature °C", data: [], borderColor: "#f3bd67", tension: 0.3, yAxisID: "y" },
        { label: "Humidity %", data: [], borderColor: "#9b91ed", tension: 0.3, yAxisID: "y1" }
      ]
    },
    options: {
      ...common,
      scales: {
        ...common.scales,
        y: { ...common.scales.y, min: -10, max: 100 },
        y1: {
          position: "right",
          min: 0,
          max: 100,
          grid: { drawOnChartArea: false },
          ticks: { color: "#78959a" }
        }
      }
    }
  });
}

function updateCharts() {
  if (!waterChart || !climateChart) return;
  const labels = sampleRows.map(item => item.label);
  waterChart.data.labels = labels;
  waterChart.data.datasets[0].data = sampleRows.map(item => item.soil);
  waterChart.data.datasets[1].data = sampleRows.map(item => item.tank);
  waterChart.update("none");

  climateChart.data.labels = labels;
  climateChart.data.datasets[0].data = sampleRows.map(item => item.temp);
  climateChart.data.datasets[1].data = sampleRows.map(item => item.humidity);
  climateChart.update("none");
}

function eventKey(item) {
  if (item.id !== null && item.id !== undefined) return `id:${item.id}`;
  return `e:${item.received_at || ""}|${item.uptime_ms ?? ""}|${item.event || ""}|${item.detail || ""}`;
}

function compareEventsDesc(a, b) {
  const ta = receivedAtMs(a);
  const tb = receivedAtMs(b);
  if (ta !== tb) return tb - ta;
  return (Number(b.id) || 0) - (Number(a.id) || 0);
}

function renderEvents() {
  const host = $("events");
  host.replaceChildren();
  setText("eventCount", `${eventRows.length} event${eventRows.length === 1 ? "" : "s"}`);

  if (!eventRows.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No events received yet.";
    host.append(empty);
    return;
  }

  for (const item of eventRows) {
    const row = document.createElement("div");
    row.className = "event";
    const label = document.createElement("span");
    label.textContent = `${item.event || "EVENT"} · ${item.detail || ""}`;
    const time = document.createElement("small");
    time.textContent = formatTime(item);
    row.append(label, time);
    host.append(row);
  }
}

function addEvent(item) {
  if (!item) return;
  const key = eventKey(item);
  if (seenEvents.has(key)) return;
  seenEvents.add(key);

  eventRows.push(item);
  eventRows.sort(compareEventsDesc);
  if (eventRows.length > MAX_EVENTS) {
    const removed = eventRows.splice(MAX_EVENTS);
    for (const old of removed) seenEvents.delete(eventKey(old));
  }
  renderEvents();
}

function updateDeviceStatus(data) {
  if (!data) return;
  deviceOnline = data.status === "online";
  refreshConnectionDisplay();
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

async function loadDashboardData() {
  if (initialLoadPromise) return initialLoadPromise;

  initialLoadPromise = (async () => {
    try {
      // Load history once, oldest to newest, so reconnects do not duplicate
      // chart samples. Latest/events are refreshed on every reconnect and are
      // deduplicated by their database IDs.
      if (!initialHistoryLoaded) {
        const historyData = await fetchJson("/api/history?limit=60");
        historyData.slice().reverse().forEach(row => pushSample(row, false));
        initialHistoryLoaded = true;
      }

      const latestData = await fetchJson("/api/latest");
      if (Number.isFinite(Number(latestData.stale_after_seconds))) {
        staleAfterSeconds = Number(latestData.stale_after_seconds);
      }
      if (latestData.reading) renderReading(latestData.reading);
      if (latestData.status) updateDeviceStatus(latestData.status);

      const eventData = await fetchJson("/api/events?limit=30");
      eventData.forEach(addEvent);

      updateCharts();
      refreshConnectionDisplay();
    } catch (err) {
      console.error("Initial dashboard load failed", err);
    } finally {
      initialLoadPromise = null;
    }
  })();

  return initialLoadPromise;
}

socket.on("connect", loadDashboardData);
socket.on("disconnect", () => {
  brokerConnected = false;
  refreshConnectionDisplay();
});
socket.on("telemetry", payload => renderReading(payload, true));
socket.on("event", addEvent);
socket.on("broker-status", data => {
  brokerConnected = !!data.connected;
  refreshConnectionDisplay();
});
socket.on("device-status", updateDeviceStatus);
socket.on("initial-state", data => {
  if (Number.isFinite(Number(data.stale_after_seconds))) {
    staleAfterSeconds = Number(data.stale_after_seconds);
  }
  if (data.reading) renderReading(data.reading);
  if (data.status) updateDeviceStatus(data.status);
});

initCharts();
setInterval(refreshConnectionDisplay, 2000);
