require("dotenv").config();
const path = require("node:path");
const express = require("express");
const http = require("node:http");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");
const { latest, history, recentEvents, getStatus } = require("./db");
const { startMqtt } = require("./mqtt");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const DEVICE = process.env.DEVICE_ID || "aqua5-479928426260819969";
const staleSeconds = Number(process.env.STALE_AFTER_SECONDS);
const STALE_AFTER = Number.isFinite(staleSeconds) && staleSeconds > 0 ? staleSeconds : 20;

const mqttClient = startMqtt(io);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Chart.js is vendored locally in public/vendor; no CDN is needed.
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "ws:", "wss:"],
      imgSrc: ["'self'", "data:"]
    }
  }
}));
app.use(express.json({ limit: "16kb" }));
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use("/api", rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (_req, res) => res.json({
  ok: true,
  service: "HYDROSYNC Stage 4",
  broker_connected: mqttClient.connected
}));
app.get("/api/latest", (_req, res) => {
  const row = latest.get(DEVICE);
  const status = getStatus.get(DEVICE);
  res.json({ reading: row || null, status: status || null, stale_after_seconds: STALE_AFTER });
});
app.get("/api/history", (req, res) => {
  const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));
  res.json(history.all(DEVICE, limit));
});
app.get("/api/events", (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 30));
  res.json(recentEvents.all(DEVICE, limit));
});

io.on("connection", socket => {
  const reading = latest.get(DEVICE);
  const status = getStatus.get(DEVICE);
  // Send the current broker state with every new socket. Without this, a new
  // browser tab can stay on "BROKER OFFLINE" until the broker reconnects.
  socket.emit("broker-status", { connected: mqttClient.connected });
  socket.emit("initial-state", {
    reading: reading || null,
    status: status || null,
    stale_after_seconds: STALE_AFTER
  });
});

server.listen(PORT, HOST, () => console.log(`HYDROSYNC dashboard: http://localhost:${PORT} (bound to ${HOST})`));

function shutdown() {
  console.log("Shutting down...");
  mqttClient.end(true);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
