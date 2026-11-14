// Cloud IR Remote: ESP32-S3 Wi-Fi bridge
//
//   Website <-> Firebase Realtime Database <-> this ESP32 <-> UART <-> STM32
//
// What it does, in a loop:
//   1. Every second, looks for /commands with status "pending" (oldest first).
//      SEND  -> reads /codes/{codeId}, writes "SEND,<n>,<timings>" to the STM32,
//               waits for ACK,SEND, then marks the command done (or error).
//      LEARN -> writes "LEARN", waits for "CODE,<n>,...", saves it to /codes,
//               then marks the command done with the new codeId.
//   2. "ENV,<temp_x10>,<hum>" lines from the STM32 update /env/latest and,
//      every 5 minutes, /env/history/{ms timestamp}.
//   3. Every 10 s writes /device/lastSeen so the website shows "ESP32 online".
//
// Protocol: docs/uart-protocol.md. Database layout: web/README.md.
//
// Testing without the STM32: type lines into the Serial Monitor (115200, "Newline")
// and they are handled as if the STM32 sent them, e.g. ACK,SEND or CODE,4,9000,4500,560,560
// Lines starting with '>' go to the real STM32 instead, e.g. >PING
// Type ? for status.

#include <ArduinoJson.h>
#include <WiFi.h>
#include <sys/time.h>
#include <time.h>

#include "config.h"
#include "firebase_rest.h"
#include "secrets.h"  // copy secrets.example.h to secrets.h and fill it in

// ---------------------------------------------------------------------------
// Types and state

struct LineReader {
  char buf[UART_LINE_MAX];
  size_t len = 0;
  bool overflow = false;
};

enum class Wait { None, Send, Learn };

FirebaseRest fb;
HardwareSerial& stm = Serial1;
LineReader stmReader;
LineReader usbReader;

Wait waiting = Wait::None;
String activeId;    // Firebase key of the command in progress
String activeName;  // LEARN: name for the new button
unsigned long activeSince = 0;

unsigned long lastPoll = 0;
unsigned long lastBeat = 0;
unsigned long lastWifiTry = 0;
unsigned long lastEnvWrite = 0;
unsigned long lastHistory = 0;
bool envWritten = false;
bool historyWritten = false;
bool warnedIndex = false;
bool stm32Answered = false;
unsigned long sentCount = 0, learnedCount = 0, failedCount = 0;

#if FORWARD_RULE_TO_STM32
unsigned long lastRulePoll = 0;
String ruleSentSig;  // what we last sent, so we only resend on change
#endif

// ---------------------------------------------------------------------------
// Small helpers

// Milliseconds since 1970 from NTP, or 0 if the clock is not set yet.
uint64_t epochMs() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  if (tv.tv_sec < 1700000000) return 0;
  return (uint64_t)tv.tv_sec * 1000ULL + tv.tv_usec / 1000;
}

String u64(uint64_t v) {
  char b[24];
  snprintf(b, sizeof b, "%llu", (unsigned long long)v);
  return String(b);
}

// Prints long lines shortened, e.g. "SEND,319,3480,1740,... (2104 chars)".
void logShort(const char* prefix, const char* text) {
  size_t n = strlen(text);
  if (n <= 90) {
    Serial.printf("%s%s\n", prefix, text);
  } else {
    Serial.printf("%s%.80s... (%u chars)\n", prefix, text, (unsigned)n);
  }
}

// Counts the numbers in "486,403,401". Returns 0 if anything is not a digit.
int countValues(const char* s) {
  if (!s || !*s) return 0;
  int count = 1;
  for (const char* p = s; *p; p++) {
    if (*p == ',') count++;
    else if (*p < '0' || *p > '9') return 0;
  }
  return count;
}

// Writes one line to the STM32: head + tail + "\r\n".
void stmWrite(const String& head, const char* tail) {
  stm.print(head);
  stm.print(tail);
  stm.print("\r\n");
  String shown = head + tail;
  logShort("-> STM32  ", shown.c_str());
}

void stmLine(const String& line) { stmWrite(line, ""); }

// ---------------------------------------------------------------------------
// Firebase writes

// Marks a command done or error. Retries a few times: if this write is lost,
// the command would stay "pending" and be run again.
void finish(String id, bool ok, const String& error, const String& codeId) {
  JsonDocument d;
  d["status"] = ok ? "done" : "error";
  if (!ok) d["error"] = error;
  if (codeId.length()) d["codeId"] = codeId;
  d["doneAt"][".sv"] = "timestamp";
  String body;
  serializeJson(d, body);

  int code = 0;
  for (int attempt = 0; attempt < 3 && code != 200; attempt++) code = fb.patch("/commands/" + id, body);

  Serial.printf("   command %s -> %s%s%s (HTTP %d)\n", id.c_str(), ok ? "done" : "error", ok ? "" : ": ",
                ok ? "" : error.c_str(), code);
  if (ok) {
    if (codeId.length()) learnedCount++;
    else sentCount++;
  } else {
    failedCount++;
  }
  if (id == activeId) {
    waiting = Wait::None;
    activeId = "";
    activeName = "";
  }
}

void finishOk(const String& id) { finish(id, true, "", ""); }
void finishErr(const String& id, const String& error) { finish(id, false, error, ""); }

void writeHeartbeat() {
  int code = fb.put("/device/lastSeen", "{\".sv\":\"timestamp\"}");
  if (code != 200) Serial.printf("!  heartbeat failed: HTTP %d %s\n", code, fb.lastError.c_str());
}

// "285,62" -> temp 28.5 °C, humidity 62 %
void onEnv(const char* s) {
  char* end;
  long t10 = strtol(s, &end, 10);
  if (*end != ',') return;
  long hum = strtol(end + 1, nullptr, 10);
  String temp = String(t10 / 10.0, 1);
  unsigned long now = millis();

  if (!envWritten || now - lastEnvWrite >= ENV_LATEST_MIN_MS) {
    String body = "{\"temp\":" + temp + ",\"hum\":" + String(hum) + ",\"ts\":{\".sv\":\"timestamp\"}}";
    int code = fb.put("/env/latest", body);
    if (code != 200) Serial.printf("!  env/latest failed: HTTP %d %s\n", code, fb.lastError.c_str());
    envWritten = true;
    lastEnvWrite = now;
  }

  uint64_t ms = epochMs();
  if (ms && (!historyWritten || now - lastHistory >= ENV_HISTORY_MS)) {
    String body = "{\"temp\":" + temp + ",\"hum\":" + String(hum) + "}";
    int code = fb.put("/env/history/" + u64(ms), body);
    Serial.printf("   history point %s °C, %ld %% (HTTP %d)\n", temp.c_str(), hum, code);
    historyWritten = true;
    lastHistory = now;
  }
}

// "319,486,403,..." from a CODE line -> new /codes entry, then mark the LEARN done.
void onLearned(const char* s) {
  int n = atoi(s);
  const char* comma = strchr(s, ',');
  const char* timings = comma ? comma + 1 : "";
  if (n <= 0 || n > MAX_DURATIONS || countValues(timings) != n) {
    finishErr(activeId, "Bad CODE line from the STM32");
    return;
  }

  JsonDocument d;
  d["name"] = activeName.substring(0, 40);
  d["n"] = n;
  d["timings"] = timings;
  d["createdAt"][".sv"] = "timestamp";
  String body, response;
  serializeJson(d, body);

  int code = fb.post("/codes", body, response);
  if (code != 200) {
    finishErr(activeId, "Could not save the code to Firebase (HTTP " + String(code) + ")");
    return;
  }
  JsonDocument r;
  deserializeJson(r, response);
  String codeId = r["name"] | "";  // Firebase answers {"name":"<new key>"}
  Serial.printf("   saved \"%s\" (%d durations) as /codes/%s\n", activeName.c_str(), n, codeId.c_str());
  finish(activeId, true, "", codeId);
}

// ---------------------------------------------------------------------------
// Commands from the website

void startCommand(const String& id, JsonObject c) {
  const char* type = c["type"] | "";
  uint64_t createdAt = c["createdAt"] | (uint64_t)0;
  uint64_t now = epochMs();
  Serial.printf("<- Firebase command %s: %s\n", id.c_str(), type);

  // Don't fire an air-con code that someone pressed an hour ago while we were offline.
  if (now && createdAt && now > createdAt + COMMAND_MAX_AGE_MS) {
    finishErr(id, "Expired: the device was offline when this was sent");
    return;
  }

  if (strcmp(type, "SEND") == 0) {
    const char* codeId = c["codeId"] | "";
    if (!*codeId) {
      finishErr(id, "No codeId in the command");
      return;
    }
    String codeJson;
    int http = fb.get(String("/codes/") + codeId, codeJson);
    if (http != 200) {
      Serial.printf("!  could not read /codes/%s: HTTP %d (will retry)\n", codeId, http);
      return;
    }
    JsonDocument code;
    deserializeJson(code, codeJson);
    if (code.isNull()) {
      finishErr(id, "Code not found (was it deleted?)");
      return;
    }
    const char* timings = code["timings"] | "";
    int count = countValues(timings);
    int n = code["n"] | count;
    if (count == 0 || count != n || n > MAX_DURATIONS) {
      finishErr(id, "The saved code is damaged (n does not match timings)");
      return;
    }
    activeId = id;
    waiting = Wait::Send;
    activeSince = millis();
    stmWrite("SEND," + String(n) + ",", timings);
  } else if (strcmp(type, "LEARN") == 0) {
    const char* name = c["name"] | "";
    activeId = id;
    activeName = *name ? name : "New button";
    waiting = Wait::Learn;
    activeSince = millis();
    stmLine("LEARN");
  } else {
    finishErr(id, String("Unknown command type: ") + type);
  }
}

void pollCommands() {
  String body;
  // Needs ".indexOn": ["status"] on /commands (in web/database.rules.json).
  int code = fb.get("/commands", body, "orderBy=%22status%22&equalTo=%22pending%22");
  if (code == 400) {
    if (!warnedIndex) {
      Serial.println("!  Firebase has no index on /commands/status. Deploy web/database.rules.json "
                     "(npm run deploy). Reading all commands for now.");
      warnedIndex = true;
    }
    code = fb.get("/commands", body);
  }
  if (code != 200) {
    Serial.printf("!  poll failed: HTTP %d %s\n", code, fb.lastError.c_str());
    return;
  }

  JsonDocument doc;
  if (deserializeJson(doc, body)) return;
  JsonObject all = doc.as<JsonObject>();
  if (all.isNull()) return;  // "null": nothing pending

  // Run the oldest pending command first.
  const char* bestId = nullptr;
  uint64_t bestAt = 0;
  JsonObject best;
  for (JsonPair kv : all) {
    JsonObject c = kv.value().as<JsonObject>();
    if (strcmp(c["status"] | "", "pending") != 0) continue;
    uint64_t at = c["createdAt"] | (uint64_t)0;
    if (!bestId || at < bestAt) {
      bestId = kv.key().c_str();
      bestAt = at;
      best = c;
    }
  }
  if (bestId) startCommand(String(bestId), best);
}

#if FORWARD_RULE_TO_STM32
// Sends "RULE,<threshold_x10>,<0/1>,<n>,<t1>,...,<tn>" when /rule changes.
void syncRule() {
  String body;
  if (fb.get("/rule", body) != 200) return;
  JsonDocument r;
  deserializeJson(r, body);
  bool enabled = r["enabled"] | false;
  float threshold = r["threshold"] | 30.0f;
  const char* codeId = r["codeId"] | "";
  String sig = String(enabled) + "|" + String(threshold, 1) + "|" + codeId;
  if (sig == ruleSentSig) return;

  String head = "RULE," + String(lroundf(threshold * 10)) + ",";
  if (enabled && *codeId) {
    String codeJson;
    if (fb.get(String("/codes/") + codeId, codeJson) != 200) return;
    JsonDocument code;
    deserializeJson(code, codeJson);
    const char* timings = code["timings"] | "";
    int n = countValues(timings);
    if (!n) return;
    stmWrite(head + "1," + String(n) + ",", timings);
  } else {
    stmLine(head + "0,0");
  }
  ruleSentSig = sig;
}
#endif

// ---------------------------------------------------------------------------
// Lines from the STM32 (or typed in the Serial Monitor)

void handleStmLine(char* line) {
  while (*line == ' ') line++;  // trim
  size_t n = strlen(line);
  while (n && line[n - 1] == ' ') line[--n] = 0;
  if (!n) return;

  if (line[0] == '#') {  // debug line (normally only on the STM32's USB port)
    Serial.printf("   STM32 %s\n", line);
    return;
  }
  logShort("<- STM32  ", line);

  if (strcmp(line, "READY") == 0) {
    stm32Answered = true;
    if (waiting != Wait::None) finishErr(activeId, "The STM32 restarted");
#if FORWARD_RULE_TO_STM32
    ruleSentSig = "";  // send the rule again after a reboot
#endif
  } else if (strcmp(line, "PONG") == 0) {
    stm32Answered = true;
    Serial.println("   UART link to the STM32 is working");
  } else if (strncmp(line, "ENV,", 4) == 0) {
    onEnv(line + 4);
  } else if (strcmp(line, "ACK,SEND") == 0) {
    if (waiting == Wait::Send) finishOk(activeId);
  } else if (strncmp(line, "CODE,", 5) == 0) {
    if (waiting == Wait::Learn) onLearned(line + 5);
    else Serial.println("   (no LEARN in progress, ignored)");
  } else if (strncmp(line, "ERR,", 4) == 0) {
    bool generic = strncmp(line, "ERR,LINE", 8) == 0 || strcmp(line, "ERR,UNKNOWN") == 0;
    if (waiting == Wait::Send && (strncmp(line, "ERR,SEND", 8) == 0 || generic)) finishErr(activeId, line);
    else if (waiting == Wait::Learn && (strncmp(line, "ERR,LEARN", 9) == 0 || generic)) finishErr(activeId, line);
  } else if (strcmp(line, "FIRED") == 0) {
    Serial.println("   the STM32 ran the automation rule");
  }
}

void printStatus() {
  Serial.println("---- status ----");
  Serial.printf("Wi-Fi: %s, IP %s, RSSI %d dBm\n", WiFi.isConnected() ? "connected" : "NOT connected",
                WiFi.localIP().toString().c_str(), WiFi.RSSI());
  uint64_t ms = epochMs();
  Serial.printf("Clock: %s\n", ms ? "set by NTP" : "not set yet");
  Serial.printf("STM32 answered: %s\n", stm32Answered ? "yes" : "not yet (try >PING)");
  Serial.printf("Busy: %s %s\n", waiting == Wait::None ? "no" : (waiting == Wait::Send ? "SEND" : "LEARN"),
                activeId.c_str());
  Serial.printf("Done: %lu sent, %lu learned, %lu failed. Free heap %u bytes\n", sentCount, learnedCount, failedCount,
                (unsigned)ESP.getFreeHeap());
}

// Serial Monitor input: pretend to be the STM32, or forward ">..." to the real one.
void handleUsbLine(char* line) {
  if (line[0] == '>') {
    stmLine(line + 1);
  } else if (strcmp(line, "?") == 0) {
    printStatus();
  } else {
    Serial.println("   (typed in Serial Monitor, handled as if the STM32 sent it)");
    handleStmLine(line);
  }
}

// Reads whatever bytes have arrived and calls onLine for each complete line.
void pump(Stream& port, LineReader& r, void (*onLine)(char*)) {
  while (port.available()) {
    char c = (char)port.read();
    if (c == '\n' || c == '\r') {
      if (r.overflow) Serial.println("!  line longer than UART_LINE_MAX, dropped");
      else if (r.len) {
        r.buf[r.len] = 0;
        onLine(r.buf);
      }
      r.len = 0;
      r.overflow = false;
    } else if (r.len < UART_LINE_MAX - 1) {
      r.buf[r.len++] = c;
    } else {
      r.overflow = true;
    }
  }
}

// ---------------------------------------------------------------------------

void connectWifi() {
  Serial.printf("Wi-Fi: connecting to \"%s\"", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long t0 = millis();
  while (!WiFi.isConnected() && millis() - t0 < 20000) {
    delay(500);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.isConnected()) {
    Serial.printf("Wi-Fi: connected, IP %s, signal %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println("Wi-Fi: FAILED. Check WIFI_SSID / WIFI_PASSWORD in secrets.h (2.4 GHz only). Will keep trying.");
  }
}

void setup() {
  Serial.begin(115200);
  unsigned long t0 = millis();
  while (!Serial && millis() - t0 < 3000) {}
  Serial.println("\n\n=== Cloud IR Remote: ESP32 bridge ===");

  stm.setRxBufferSize(STM32_RX_BUFFER);  // must come before begin()
  stm.begin(STM32_BAUD, SERIAL_8N1, STM32_RX_PIN, STM32_TX_PIN);

  connectWifi();
  configTime(0, 0, "pool.ntp.org", "time.google.com");  // UTC; we only need epoch milliseconds
  fb.begin(FIREBASE_DB_URL, FIREBASE_AUTH);

  if (WiFi.isConnected()) {
    String probe;
    int code = fb.get("/device", probe);
    if (code == 200) Serial.println("Firebase: OK");
    else Serial.printf("Firebase: HTTP %d %s\n  Check FIREBASE_DB_URL in secrets.h and the database rules.\n", code,
                       fb.lastError.c_str());
    writeHeartbeat();
    lastBeat = millis();
  }

  stmLine("PING");
  Serial.println("Ready. Type ? for status, >PING to test the STM32 link, or STM32 lines like ACK,SEND.");
}

void loop() {
  pump(stm, stmReader, handleStmLine);
  pump(Serial, usbReader, handleUsbLine);
  unsigned long now = millis();

  // A command that never got an answer.
  if (waiting != Wait::None) {
    unsigned long limit = waiting == Wait::Send ? SEND_REPLY_TIMEOUT_MS : LEARN_REPLY_TIMEOUT_MS;
    if (now - activeSince > limit) {
      if (waiting == Wait::Learn) stmLine("CANCEL");
      finishErr(activeId, "No reply from the STM32 (check the UART wires and that it is running)");
    }
  }

  if (!WiFi.isConnected()) {
    if (now - lastWifiTry > WIFI_RETRY_MS) {
      Serial.println("Wi-Fi: disconnected, retrying...");
      WiFi.reconnect();
      lastWifiTry = now;
    }
    return;
  }

  if (now - lastBeat >= HEARTBEAT_MS) {
    writeHeartbeat();
    lastBeat = now;
  }

  // One command at a time: only look for new work while idle.
  if (waiting == Wait::None && now - lastPoll >= POLL_INTERVAL_MS) {
    pollCommands();
    lastPoll = millis();
  }

#if FORWARD_RULE_TO_STM32
  if (waiting == Wait::None && now - lastRulePoll >= RULE_POLL_MS) {
    syncRule();
    lastRulePoll = millis();
  }
#endif
}
