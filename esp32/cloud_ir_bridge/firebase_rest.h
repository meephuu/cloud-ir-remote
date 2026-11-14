#pragma once
// Minimal Firebase Realtime Database client over its REST API:
//   GET/PUT/PATCH/POST https://<db>/<path>.json
// One HTTPS connection is kept open and reused, so each request after the
// first takes about 50-150 ms instead of a full TLS handshake.
#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

class FirebaseRest {
 public:
  void begin(const char* databaseUrl, const char* authToken);

  // Each call returns the HTTP status: 200 = OK, 4xx/5xx = Firebase said no,
  // negative = no connection. `path` starts with '/', e.g. "/commands".
  int get(const String& path, String& response, const String& query = "");
  int put(const String& path, const String& json);
  int patch(const String& path, const String& json);
  int post(const String& path, const String& json, String& response);

  String lastError;  // body of the last error, or the connection error text

 private:
  int request(const char* method, const String& path, const String& query, const String& body, String* response);

  String baseUrl_;
  String auth_;
  WiFiClientSecure tls_;
  HTTPClient http_;
};
