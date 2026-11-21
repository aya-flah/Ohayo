// Sonae Node (ESP32): measures the tank, runs the plan, keeps the water flowing during a STEG cut.
// Same code on the real board and in Wokwi (build with -D WOKWI=1, or uncomment the next line in Wokwi's editor).
// #define WOKWI 1

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <RTClib.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <time.h>
#include "mbedtls/md.h"
#ifndef WOKWI
#include <Adafruit_INA219.h>
#endif

// ---------- Settings (put real values in a local copy; never commit real keys) ----------
#ifdef WOKWI
const char *WIFI_SSID = "Wokwi-GUEST";
const char *WIFI_PASS = "";
#else
const char *WIFI_SSID = "your-wifi";
const char *WIFI_PASS = "your-password";
#endif
const char *MQTT_HOST = "broker.hivemq.com";  // demo broker; production: private broker with TLS on 8883
const uint16_t MQTT_PORT = 1883;
const char *GDA_ID = "gda-kairouan-01";
const char *NODE_ID = "N01";
const char *DEVICE_KEY = "demo-device-key-change-me";  // HMAC secret shared with the server

// ---------- Pin map (plan doc, section 10) ----------
const int PIN_TRIG = 25, PIN_ECHO = 34;   // HC-SR04 (echo through a 1k/2k divider on the real board)
const int PIN_FLOW = 35;                  // YF-S401 pulses (Wokwi: potentiometer = flow)
const int PIN_GRID_SENSE = 36;            // 12 V line through a 47k/10k divider (Wokwi: slide switch)
const int PIN_SOLAR_SIM = 39;             // Wokwi only: potentiometer = solar power
const int PIN_PUMP_RELAY = 26, PIN_VALVE_SERVO = 13;
const int PIN_LED_GRID = 32, PIN_LED_CUT = 33, PIN_LED_PUMP = 4;
const int PIN_CUT_BUTTON = 14;            // press to simulate a STEG cut

// ---------- Tank geometry and safety ----------
const float EMPTY_CM = 30.0, FULL_CM = 5.0;   // sensor-to-water distance when empty / full
const float STOP_PUMP_AT_PCT = 95.0;          // overflow protection
const float RESERVE_PCT = 10.0;               // never drain below this by gravity
const unsigned long DRY_RUN_MS = 15000;       // pump on with no flow this long: stop
const unsigned long MAX_RUN_MS = 3UL * 3600000UL;
const float PULSES_PER_LPM = 98.0;            // YF-S401: F(Hz) = 98 x Q(L/min). Calibrate!

WiFiClient net;
PubSubClient mqtt(net);
Servo valve;
RTC_DS1307 rtc;  // RTClib also drives the DS3231 on the real board: change the type if you use one
Adafruit_SSD1306 oled(128, 64, &Wire, -1);
#ifndef WOKWI
Adafruit_INA219 ina219;
#endif

enum Mode { BOOT, IDLE, PUMPING, IRRIGATING, GRID_DOWN, SAFE_STOP };
const char *MODE_NAMES[] = {"BOOT", "IDLE", "PUMPING", "IRRIGATING", "GRID_DOWN", "SAFE_STOP"};

// The 48-hour plan pushed by the server (one char per hour): pump '1'/'0', valve '1'/'0'.
struct Plan {
  uint32_t start = 0;
  char pump[49] = {0};
  char valve[49] = {0};
} plan;

volatile uint32_t flowPulses = 0;
bool simulatedCut = false, pumpOn = false, valveOpen = false, rtcOk = false, oledOk = false;
float levelPct = 0, flowLpm = 0, solarW = 0, litresThisTurn = 0;
uint32_t seq = 0;
unsigned long pumpStartedMs = 0, noFlowSinceMs = 0, lastTelemetryMs = 0, lastFlowMs = 0;
Mode mode = BOOT;
String prevSig = "";

void IRAM_ATTR onFlowPulse() { flowPulses++; }

// ---------- Time: NTP when online, the RTC when offline ----------
uint32_t nowUnix() {
  time_t t = time(nullptr);
  if (t > 1700000000) return (uint32_t)t;
  if (rtcOk) return rtc.now().unixtime() - 3600;  // RTC keeps Tunis local time (UTC+1)
  return millis() / 1000;
}
int localHour() { return ((nowUnix() + 3600) / 3600) % 24; }

// ---------- HMAC-SHA256 signing ----------
String hmacHex(const String &msg) {
  uint8_t out[32];
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 1);
  mbedtls_md_hmac_starts(&ctx, (const unsigned char *)DEVICE_KEY, strlen(DEVICE_KEY));
  mbedtls_md_hmac_update(&ctx, (const unsigned char *)msg.c_str(), msg.length());
  mbedtls_md_hmac_finish(&ctx, out);
  mbedtls_md_free(&ctx);
  char hex[65];
  for (int i = 0; i < 32; i++) sprintf(hex + i * 2, "%02x", out[i]);
  return String(hex);
}

// ---------- Sensors ----------
float readDistanceCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  unsigned long us = pulseIn(PIN_ECHO, HIGH, 30000);
  return us == 0 ? EMPTY_CM : us / 58.0;
}

float readLevelPct() {
  float samples[5];
  for (int i = 0; i < 5; i++) samples[i] = readDistanceCm();
  // median of 5 to ignore ripples and echoes
  for (int i = 0; i < 5; i++)
    for (int j = i + 1; j < 5; j++)
      if (samples[j] < samples[i]) { float t = samples[i]; samples[i] = samples[j]; samples[j] = t; }
  float pct = (EMPTY_CM - samples[2]) / (EMPTY_CM - FULL_CM) * 100.0;
  return constrain(pct, 0.0, 100.0);
}

bool readGridOn() {
#ifdef WOKWI
  bool line = digitalRead(PIN_GRID_SENSE) == HIGH;
#else
  bool line = analogRead(PIN_GRID_SENSE) > 1500;  // ~2.1 V when the 12 V adapter is plugged in
#endif
  return line && !simulatedCut;
}

void readFlowAndSolar() {
  unsigned long now = millis();
  float dt = (now - lastFlowMs) / 1000.0;
  if (dt < 1.0) return;
#ifdef WOKWI
  flowLpm = valveOpen || pumpOn ? analogRead(PIN_FLOW) / 4095.0 * 6.0 : 0;
  solarW = analogRead(PIN_SOLAR_SIM) / 4095.0 * 3.0;  // a 3 W tabletop panel
#else
  noInterrupts();
  uint32_t pulses = flowPulses;
  flowPulses = 0;
  interrupts();
  flowLpm = (pulses / dt) / PULSES_PER_LPM;
  solarW = ina219.getPower_mW() / 1000.0;
#endif
  if (valveOpen) litresThisTurn += flowLpm * dt / 60.0;
  lastFlowMs = now;
}

// ---------- Actuators ----------
void setPump(bool on) {
  if (on && !pumpOn) pumpStartedMs = millis();
  pumpOn = on;
  digitalWrite(PIN_PUMP_RELAY, on ? HIGH : LOW);
  digitalWrite(PIN_LED_PUMP, on ? HIGH : LOW);
}

void setValve(bool open) {
  if (open && !valveOpen) litresThisTurn = 0;
  valveOpen = open;
  valve.write(open ? 90 : 0);
}

// ---------- The plan, with safety rules that no command can override ----------
void runPlan(bool gridOn) {
  int idx = plan.start ? (int)((nowUnix() - plan.start) / 3600) : -1;
  bool havePlan = idx >= 0 && idx < 48 && plan.pump[idx] != 0;
  bool wantPump, wantValve;
  if (havePlan) {
    wantPump = plan.pump[idx] == '1';
    wantValve = plan.valve[idx] == '1';
  } else {
    // No plan (or offline too long): pump-ahead rules on board.
    int h = localHour();
    wantPump = levelPct < 85.0 && (solarW > 1.5 || (gridOn && (h >= 22 || h < 9)));
    wantValve = (h >= 5 && h < 9) || (h >= 18 && h < 21);
  }
  bool canPump = gridOn || solarW > 1.5;  // a solar pump inverter runs without the grid
  if (levelPct >= STOP_PUMP_AT_PCT) wantPump = false;
  if (pumpOn && millis() - pumpStartedMs > MAX_RUN_MS) wantPump = false;
  if (pumpOn && flowLpm < 0.2) {
    if (!noFlowSinceMs) noFlowSinceMs = millis();
    if (millis() - noFlowSinceMs > DRY_RUN_MS) {
      setPump(false);
      mode = SAFE_STOP;
      return;
    }
  } else {
    noFlowSinceMs = 0;
  }
  if (levelPct <= RESERVE_PCT) wantValve = false;
  setPump(wantPump && canPump);
  setValve(wantValve);
  mode = !gridOn && !pumpOn ? GRID_DOWN : pumpOn ? PUMPING : valveOpen ? IRRIGATING : IDLE;
}

// ---------- MQTT ----------
String topic(const char *leaf) { return String("sonae/") + GDA_ID + "/" + NODE_ID + "/" + leaf; }

void onMessage(char *t, byte *payload, unsigned int len) {
  JsonDocument doc;
  if (deserializeJson(doc, payload, len)) return;
  String tp(t);
  // Every message from the server must carry sig = HMAC(key, "<kind>:<ts>") and be fresh.
  uint32_t ts = doc["ts"] | 0;
  String kind = tp.endsWith("/plan") ? "plan" : String((const char *)(doc["cmd"] | ""));
  if (abs((long)nowUnix() - (long)ts) > 120 || hmacHex(kind + ":" + String(ts)) != String((const char *)(doc["sig"] | ""))) return;
  if (tp.endsWith("/plan")) {
    plan.start = doc["start"] | 0;
    strlcpy(plan.pump, doc["pump"] | "", sizeof(plan.pump));
    strlcpy(plan.valve, doc["valve"] | "", sizeof(plan.valve));
  } else if (kind == "cut") {
    simulatedCut = doc["value"] | false;
  }
}

void ensureMqtt() {
  if (WiFi.status() != WL_CONNECTED || mqtt.connected()) return;
  String id = String("sonae-") + NODE_ID + "-" + String((uint32_t)ESP.getEfuseMac(), HEX);
  if (mqtt.connect(id.c_str())) {
    mqtt.subscribe(topic("plan").c_str());
    mqtt.subscribe(topic("cmd").c_str());
  }
}

void publishTelemetry(bool gridOn) {
  JsonDocument doc;
  doc["v"] = 1;
  doc["node"] = NODE_ID;
  doc["seq"] = ++seq;
  doc["ts"] = nowUnix();
  doc["levelPct"] = round(levelPct * 10) / 10.0;
  doc["flowLpm"] = round(flowLpm * 100) / 100.0;
  doc["litres"] = round(litresThisTurn * 10) / 10.0;
  doc["solarW"] = round(solarW * 100) / 100.0;  // watts
  doc["grid"] = gridOn;
  doc["pump"] = pumpOn;
  doc["valve"] = valveOpen ? "open" : "closed";
  doc["mode"] = MODE_NAMES[mode];
  if (prevSig.length()) doc["prev"] = prevSig.substring(0, 16);
  String body;
  serializeJson(doc, body);
  String sig = hmacHex(body);
  prevSig = sig;
  body.remove(body.length() - 1);
  body += ",\"sig\":\"" + sig + "\"}";
  if (mqtt.connected()) mqtt.publish(topic("telemetry").c_str(), body.c_str());
  Serial.println(body);  // offline: the same line is logged (and would be buffered to flash)
}

void drawOled(bool gridOn) {
  if (!oledOk) return;
  oled.clearDisplay();
  oled.setTextColor(SSD1306_WHITE);
  oled.setTextSize(1);
  oled.setCursor(0, 0);
  oled.printf("SONAE  %s\n", gridOn ? "GRID ON" : "STEG CUT");
  oled.setTextSize(2);
  oled.printf("%3.0f%%\n", levelPct);
  oled.setTextSize(1);
  oled.printf("Pump %s  Valve %s\n", pumpOn ? "ON " : "off", valveOpen ? "OPEN" : "shut");
  oled.printf("Flow %.1f L/min\nSun %.1f W\n%s", flowLpm, solarW, MODE_NAMES[mode]);
  oled.display();
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_FLOW, INPUT);
  pinMode(PIN_GRID_SENSE, INPUT);
  pinMode(PIN_PUMP_RELAY, OUTPUT);
  pinMode(PIN_LED_GRID, OUTPUT);
  pinMode(PIN_LED_CUT, OUTPUT);
  pinMode(PIN_LED_PUMP, OUTPUT);
  pinMode(PIN_CUT_BUTTON, INPUT_PULLUP);
  valve.attach(PIN_VALVE_SERVO, 500, 2400);
  setPump(false);
  setValve(false);
#ifndef WOKWI
  attachInterrupt(digitalPinToInterrupt(PIN_FLOW), onFlowPulse, FALLING);
  ina219.begin();
#endif
  Wire.begin(21, 22);
  rtcOk = rtc.begin();
  oledOk = oled.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  configTime(0, 0, "pool.ntp.org");
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMessage);
  mqtt.setBufferSize(1024);
  lastFlowMs = millis();
  mode = IDLE;
}

void loop() {
  static bool lastButton = HIGH;
  bool button = digitalRead(PIN_CUT_BUTTON);
  if (lastButton == HIGH && button == LOW) simulatedCut = !simulatedCut;  // press = toggle the STEG cut
  lastButton = button;

  ensureMqtt();
  mqtt.loop();
  levelPct = readLevelPct();
  readFlowAndSolar();
  bool gridOn = readGridOn();
  digitalWrite(PIN_LED_GRID, gridOn ? HIGH : LOW);
  digitalWrite(PIN_LED_CUT, gridOn ? LOW : HIGH);
  runPlan(gridOn);

  if (millis() - lastTelemetryMs > 5000) {
    lastTelemetryMs = millis();
    publishTelemetry(gridOn);
    drawOled(gridOn);
  }
  delay(50);
}
