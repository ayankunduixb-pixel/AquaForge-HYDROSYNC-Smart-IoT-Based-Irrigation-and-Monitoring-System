/*
 * AquaForge / HYDROSYNC - Stage 4
 * IoT telemetry + Stage 2 irrigation control + Stage 3 microSD CSV logging.
 *
 * Based on the user's saved Wokwi project:
 * https://wokwi.com/projects/479928426260819969
 *
 * Local control is authoritative. No MQTT message is accepted as a pump command.
 * Network failures must never disable local irrigation or the tank interlock.
 *
 * Pin map:
 * Soil ADC GPIO34 | Tank ADC GPIO35 | DHT22 GPIO15
 * Pump LED GPIO25 | Tank LED GPIO26 | AUTO/MANUAL GPIO27
 * Manual request GPIO14 | Relay IN GPIO22
 * SD CS GPIO5 | SCK GPIO18 | MISO GPIO19 | MOSI GPIO23
 */

#include <Arduino.h>
#include <WiFi.h>
#include <SPI.h>
#include <SD.h>
#include <DHTesp.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ---------- Hardware pins: sourced from the HYDROSYNC Wokwi circuit ----------
static constexpr uint8_t SOIL_PIN = 34;
static constexpr uint8_t TANK_PIN = 35;
static constexpr uint8_t DHT_PIN = 15;
static constexpr uint8_t PUMP_LED_PIN = 25;
static constexpr uint8_t TANK_LED_PIN = 26;
static constexpr uint8_t MODE_SWITCH_PIN = 27;
static constexpr uint8_t MANUAL_SWITCH_PIN = 14;
static constexpr uint8_t RELAY_PIN = 22;
static constexpr uint8_t SD_CS_PIN = 5;

// ---------- Stage 2 control parameters ----------
static constexpr float SOIL_ON_THRESHOLD = 30.0f;
static constexpr float SOIL_OFF_THRESHOLD = 45.0f;
// Tank hysteresis prevents rapid lockout/recovery chatter near the threshold.
static constexpr float TANK_MINIMUM = 15.0f;
static constexpr float TANK_RECOVERY = 20.0f;

// Set true only if the installed relay module is active-low.
static constexpr bool RELAY_ACTIVE_LOW = false;

// ---------- Stage 3 / Stage 4 timing ----------
static constexpr uint32_t DHT_INTERVAL_MS = 2500;
static constexpr uint32_t CSV_INTERVAL_MS = 5000;
static constexpr uint32_t MQTT_INTERVAL_MS = 5000;
static constexpr uint32_t WIFI_RETRY_MS = 10000;
static constexpr uint32_t WIFI_ATTEMPT_TIMEOUT_MS = 30000;
static constexpr uint32_t MQTT_RETRY_MS = 5000;
static constexpr uint32_t SWITCH_DEBOUNCE_MS = 40;

// ---------- Demo network configuration ----------
// Wokwi's open demo Wi-Fi. No password is required.
static const char *WIFI_SSID = "Wokwi-GUEST";
static const char *WIFI_PASSWORD = "";

// Public broker is for synthetic Wokwi demonstration data only.
// Use a private TLS/authenticated broker for a real installation.
static const char *MQTT_HOST = "broker.hivemq.com";
static constexpr uint16_t MQTT_PORT = 1883;

// Match this ID in backend/.env and documentation/MQTT_PROTOCOL.md.
// Change it to a unique ID if multiple demonstrations share this broker.
static const char *DEVICE_ID = "aqua5-479928426260819969";
// Topics are derived from DEVICE_ID in setup() so the root and payload device
// can never drift apart.
static const char *TOPIC_BASE = "aquaforge/hydrosync";

static const char *LOG_FILE = "/hydrosync_log.csv";

DHTesp dht;
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

bool sdAvailable = false;
bool wifiEverConnected = false;
bool pumpOn = false;
bool autoMode = false;
bool manualRequest = false;
bool tankLockout = false;
bool dhtValid = false;
bool dhtFaultActive = false;

// Debounced switch state. Candidates are seeded from the real pin levels in
// setup() so the controller never emits a false mode event at boot.
bool autoModeCandidate = false;
bool manualRequestCandidate = false;
uint32_t lastModeChangeMs = 0;
uint32_t lastManualChangeMs = 0;

float soilPercent = 0.0f;
float tankPercent = 0.0f;
float temperatureC = NAN;
float humidityPercent = NAN;

uint32_t bootMs = 0;
uint32_t lastDhtMs = 0;
uint32_t lastCsvMs = 0;
uint32_t lastMqttPublishMs = 0;
uint32_t lastWifiAttemptMs = 0;
uint32_t lastMqttAttemptMs = 0;

bool autoDemand = false;
String serialBuffer;

char topicTelemetry[160];
char topicStatus[160];
char topicEvents[160];

float readPercent(uint8_t pin) {
  const int raw = analogRead(pin);
  return constrain((float)raw * 100.0f / 4095.0f, 0.0f, 100.0f);
}

void writeRelay(bool on) {
  const bool outputLevel = RELAY_ACTIVE_LOW ? !on : on;
  digitalWrite(RELAY_PIN, outputLevel ? HIGH : LOW);
  digitalWrite(PUMP_LED_PIN, on ? HIGH : LOW);
}

String csvField(const String &value) {
  String out = "\"";
  for (size_t i = 0; i < value.length(); i++) {
    if (value[i] == '"') out += "\"\"";
    else out += value[i];
  }
  out += "\"";
  return out;
}

void appendCsv(const char *kind, const char *detail) {
  if (!sdAvailable) return;
  File file = SD.open(LOG_FILE, FILE_APPEND);
  if (!file) {
    Serial.println("SD LOG ERROR: CSV unavailable; local irrigation continues.");
    sdAvailable = false;
    return;
  }
  file.print(millis() - bootMs); file.print(',');
  file.print(kind); file.print(',');
  file.print(csvField(String(detail))); file.print(',');
  file.print(soilPercent, 1); file.print(',');
  file.print(tankPercent, 1); file.print(',');
  if (dhtValid) file.print(temperatureC, 1); else file.print("NA");
  file.print(',');
  if (dhtValid) file.print(humidityPercent, 1); else file.print("NA");
  file.print(',');
  file.print(autoMode ? "AUTO" : "MANUAL"); file.print(',');
  file.print(pumpOn ? "ON" : "OFF"); file.print(',');
  file.println(tankLockout ? "LOCKOUT" : "OK");
  file.close();
}

void publishEvent(const char *kind, const char *detail) {
  if (!mqtt.connected()) return;
  StaticJsonDocument<192> doc;
  doc["device"] = DEVICE_ID;
  doc["uptime_ms"] = millis() - bootMs;
  doc["event"] = kind;
  doc["detail"] = detail;
  char payload[220];
  const size_t n = serializeJson(doc, payload, sizeof(payload));
  if (n > 0) mqtt.publish(topicEvents, payload, false);
}

void recordEvent(const char *kind, const char *detail) {
  appendCsv(kind, detail);
  publishEvent(kind, detail);
  Serial.print("EVENT: ");
  Serial.print(kind);
  Serial.print(" | ");
  Serial.println(detail);
}

void initializeSD() {
  Serial.println("Initializing microSD...");
  pinMode(SD_CS_PIN, OUTPUT);
  digitalWrite(SD_CS_PIN, HIGH);
  SPI.begin(18, 19, 23, SD_CS_PIN);
  delay(50);

  if (!SD.begin(SD_CS_PIN, SPI, 4000000)) {
    sdAvailable = false;
    Serial.println("SD ERROR: Initialization failed; irrigation continues.");
    return;
  }

  sdAvailable = true;
  if (!SD.exists(LOG_FILE)) {
    File f = SD.open(LOG_FILE, FILE_WRITE);
    if (f) {
      f.println("elapsed_ms,record_type,detail,soil_pct,tank_pct,temp_c,humidity_pct,mode,pump,tank_state");
      f.close();
    } else {
      sdAvailable = false;
      Serial.println("SD ERROR: Could not create CSV file.");
      return;
    }
  }
  Serial.println("SD card initialized; CSV logging enabled.");
  appendCsv("SYSTEM", "START");
}

void updateSensors() {
  soilPercent = readPercent(SOIL_PIN);
  tankPercent = readPercent(TANK_PIN);
  // The low-tank LED follows the hysteresis state in updateControl(), not the
  // raw threshold, so it stays lit until the tank recovers to TANK_RECOVERY.
}

void updateDht() {
  const uint32_t now = millis();
  if (now - lastDhtMs < DHT_INTERVAL_MS) return;
  lastDhtMs = now;

  TempAndHumidity value = dht.getTempAndHumidity();
  const bool valid = !isnan(value.temperature) && !isnan(value.humidity) &&
    value.temperature >= -40.0f && value.temperature <= 80.0f &&
    value.humidity >= 0.0f && value.humidity <= 100.0f;

  dhtValid = valid;
  if (valid) {
    temperatureC = value.temperature;
    humidityPercent = value.humidity;
    if (dhtFaultActive) {
      dhtFaultActive = false;
      recordEvent("DHT_EVENT", "RECOVERED");
    }
  } else {
    if (!dhtFaultActive) {
      dhtFaultActive = true;
      recordEvent("DHT_EVENT", "FAULT");
    }
    Serial.print("DHT22 unavailable: ");
    Serial.println(dht.getStatusString());
  }
}

void setPump(bool requested, const char *reason) {
  // Safety interlock always overrides the requested pump state.
  const bool allowed = requested && !tankLockout;
  if (allowed != pumpOn) {
    pumpOn = allowed;
    writeRelay(pumpOn);
    char detail[80];
    snprintf(detail, sizeof(detail), "%s:%s", pumpOn ? "ON" : "OFF", reason);
    recordEvent("PUMP_EVENT", detail);
    Serial.print("PUMP: ");
    Serial.println(detail);
  }
}

void updateControl() {
  const uint32_t now = millis();

  // Debounce both switches so a noisy slide contact cannot toggle the mode or
  // manual request many times in a single loop.
  const bool modeRaw = digitalRead(MODE_SWITCH_PIN) == HIGH;
  if (modeRaw != autoModeCandidate) {
    autoModeCandidate = modeRaw;
    lastModeChangeMs = now;
  }
  if (autoModeCandidate != autoMode && now - lastModeChangeMs >= SWITCH_DEBOUNCE_MS) {
    autoMode = autoModeCandidate;
    recordEvent("MODE_EVENT", autoMode ? "AUTO" : "MANUAL");
    Serial.println(autoMode ? "MODE: AUTOMATIC" : "MODE: MANUAL");
  }

  const bool manualRaw = digitalRead(MANUAL_SWITCH_PIN) == HIGH;
  if (manualRaw != manualRequestCandidate) {
    manualRequestCandidate = manualRaw;
    lastManualChangeMs = now;
  }
  if (manualRequestCandidate != manualRequest && now - lastManualChangeMs >= SWITCH_DEBOUNCE_MS) {
    manualRequest = manualRequestCandidate;
  }

  // Hysteresis: lock out below 15%, but only recover once the tank reaches 20%.
  bool newLockout = tankLockout;
  if (!tankLockout && tankPercent < TANK_MINIMUM) newLockout = true;
  else if (tankLockout && tankPercent >= TANK_RECOVERY) newLockout = false;

  if (newLockout != tankLockout) {
    tankLockout = newLockout;
    recordEvent("TANK_EVENT", tankLockout ? "LOW_LOCKOUT" : "LEVEL_RECOVERED");
    Serial.println(tankLockout ? "SAFETY: LOW TANK - PUMP LOCKED OUT"
                               : "SAFETY: TANK LEVEL RECOVERED");
  }
  digitalWrite(TANK_LED_PIN, tankLockout ? HIGH : LOW);

  bool request = false;
  const char *reason = "CONTROL";
  if (autoMode) {
    if (soilPercent <= SOIL_ON_THRESHOLD) autoDemand = true;
    else if (soilPercent >= SOIL_OFF_THRESHOLD) autoDemand = false;
    request = autoDemand;
    reason = "AUTO_SOIL_DEMAND";
  } else {
    request = manualRequest;
    reason = "MANUAL_REQUEST";
  }
  if (tankLockout && request) reason = "TANK_SAFETY_LOCKOUT";
  setPump(request, reason);
}

void publishTelemetry() {
  if (!mqtt.connected()) return;

  StaticJsonDocument<384> doc;
  doc["device"] = DEVICE_ID;
  doc["uptime_ms"] = millis() - bootMs;
  doc["soil_pct"] = soilPercent;
  doc["tank_pct"] = tankPercent;
  if (dhtValid) {
    doc["temp_c"] = temperatureC;
    doc["humidity_pct"] = humidityPercent;
  } else {
    doc["temp_c"] = nullptr;
    doc["humidity_pct"] = nullptr;
  }
  doc["dht_ok"] = dhtValid;
  doc["mode"] = autoMode ? "AUTO" : "MANUAL";
  doc["manual_request"] = manualRequest;
  doc["pump"] = pumpOn ? "ON" : "OFF";
  doc["tank_lockout"] = tankLockout;
  doc["sd_ok"] = sdAvailable;

  char payload[384];
  const size_t n = serializeJson(doc, payload, sizeof(payload));
  if (n > 0 && mqtt.publish(topicTelemetry, payload, true)) {
    Serial.println("MQTT: telemetry published.");
  }
}

void serviceWiFi() {
  const wl_status_t status = WiFi.status();
  if (status == WL_CONNECTED) {
    if (!wifiEverConnected) {
      wifiEverConnected = true;
      Serial.print("Wi-Fi connected. IP: ");
      Serial.println(WiFi.localIP());
    }
    return;
  }

  if (mqtt.connected()) mqtt.disconnect();

  const uint32_t now = millis();
  if (now - lastWifiAttemptMs < WIFI_RETRY_MS) return;
  // Do not restart an association that is still in progress; only retry after
  // the attempt timeout has elapsed.
  if (status == WL_IDLE_STATUS && now - lastWifiAttemptMs < WIFI_ATTEMPT_TIMEOUT_MS) {
    return;
  }
  lastWifiAttemptMs = now;

  Serial.print("Wi-Fi disconnected (status ");
  Serial.print(static_cast<int>(status));
  Serial.println("); reconnect attempt started.");
  WiFi.mode(WIFI_STA);
  // Do not force a Wi-Fi channel; the access point may use any channel.
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void serviceMqtt() {
  if (WiFi.status() != WL_CONNECTED) return;

  if (mqtt.connected()) {
    mqtt.loop();
    return;
  }

  const uint32_t now = millis();
  if (now - lastMqttAttemptMs < MQTT_RETRY_MS) return;
  lastMqttAttemptMs = now;

  Serial.println("MQTT reconnect attempt...");
  String clientId = String("HYDROSYNC-") + String((uint32_t)(ESP.getEfuseMac() & 0xFFFFFFFFULL), HEX);
  if (mqtt.connect(clientId.c_str(), topicStatus, 0, true, "offline")) {
    mqtt.publish(topicStatus, "online", true);
    Serial.println("MQTT connected; read-only telemetry enabled.");
  } else {
    Serial.print("MQTT unavailable, state=");
    Serial.println(mqtt.state());
  }
}

void printStatus() {
  Serial.println("\n===== HYDROSYNC STAGE 4 STATUS =====");
  Serial.print("Mode: "); Serial.println(autoMode ? "AUTO" : "MANUAL");
  Serial.print("Soil: "); Serial.print(soilPercent, 1); Serial.println("%");
  Serial.print("Tank: "); Serial.print(tankPercent, 1); Serial.println("%");
  Serial.print("DHT22: ");
  if (dhtValid) {
    Serial.print(temperatureC, 1); Serial.print(" C / ");
    Serial.print(humidityPercent, 1); Serial.println("% RH");
  } else Serial.println("UNAVAILABLE");
  Serial.print("Pump: "); Serial.println(pumpOn ? "ON" : "OFF");
  Serial.print("Tank safety: "); Serial.println(tankLockout ? "LOCKOUT" : "OK");
  Serial.print("SD: "); Serial.println(sdAvailable ? "AVAILABLE" : "UNAVAILABLE");
  Serial.print("Wi-Fi: "); Serial.println(WiFi.status() == WL_CONNECTED ? "CONNECTED" : "DISCONNECTED");
  Serial.print("MQTT: "); Serial.println(mqtt.connected() ? "CONNECTED" : "DISCONNECTED");
  Serial.println("====================================\n");
}

void showLog() {
  if (!sdAvailable) {
    Serial.println("SD unavailable; CSV log cannot be displayed.");
    return;
  }
  File f = SD.open(LOG_FILE, FILE_READ);
  if (!f) {
    Serial.println("CSV file not found.");
    return;
  }
  Serial.println("\n--- HYDROSYNC CSV LOG ---");
  while (f.available()) Serial.write(f.read());
  f.close();
  Serial.println("\n--- END LOG ---");
}

void processSerial() {
  while (Serial.available()) {
    const char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      serialBuffer.trim();
      serialBuffer.toUpperCase();
      if (serialBuffer == "STATUS") printStatus();
      else if (serialBuffer == "SHOWLOG") showLog();
      else if (serialBuffer == "HELP") Serial.println("Commands: STATUS | SHOWLOG | HELP");
      serialBuffer = "";
    } else if (serialBuffer.length() < 32) {
      serialBuffer += c;
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(400);
  bootMs = millis();

  pinMode(PUMP_LED_PIN, OUTPUT);
  pinMode(TANK_LED_PIN, OUTPUT);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(MODE_SWITCH_PIN, INPUT);
  pinMode(MANUAL_SWITCH_PIN, INPUT);
  writeRelay(false);
  digitalWrite(TANK_LED_PIN, LOW);

  analogReadResolution(12);
  dht.setup(DHT_PIN, DHTesp::DHT22);

  // Seed debounced state from the actual switch positions at boot.
  autoMode = autoModeCandidate = digitalRead(MODE_SWITCH_PIN) == HIGH;
  manualRequest = manualRequestCandidate = digitalRead(MANUAL_SWITCH_PIN) == HIGH;
  lastModeChangeMs = lastManualChangeMs = millis();

  snprintf(topicTelemetry, sizeof(topicTelemetry), "%s/%s/telemetry", TOPIC_BASE, DEVICE_ID);
  snprintf(topicStatus, sizeof(topicStatus), "%s/%s/status", TOPIC_BASE, DEVICE_ID);
  snprintf(topicEvents, sizeof(topicEvents), "%s/%s/events", TOPIC_BASE, DEVICE_ID);

  Serial.println("\nAquaForge / HYDROSYNC - Stage 4");
  Serial.println("Wi-Fi + MQTT remote monitoring; local irrigation retained.");
  Serial.println("Remote pump commands are DISABLED in Stage 4.");

  initializeSD();

  updateSensors();
  lastDhtMs = millis();
  lastCsvMs = millis();
  lastMqttPublishMs = millis();

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWifiAttemptMs = millis();

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(512);
  mqtt.setKeepAlive(30);
  mqtt.setSocketTimeout(5);

  Serial.println("Wi-Fi connection started: Wokwi-GUEST.");
  Serial.println("Commands: STATUS | SHOWLOG | HELP");
  Serial.println("System initialization complete.");
}

void loop() {
  // Local control and safety are serviced before optional network work.
  updateSensors();
  updateControl();
  updateDht();
  processSerial();

  serviceWiFi();
  serviceMqtt();

  const uint32_t now = millis();
  if (now - lastCsvMs >= CSV_INTERVAL_MS) {
    lastCsvMs = now;
    appendCsv("SNAPSHOT", "PERIODIC");
  }
  if (now - lastMqttPublishMs >= MQTT_INTERVAL_MS) {
    lastMqttPublishMs = now;
    publishTelemetry();
  }
  delay(10);
}
